"""Regras do faturamento do ORION (V5.2.0). Fala só com a interface PaymentProvider e com a store: nada de HTTP aqui.

Princípios:
  1. O plano só muda aqui, no servidor, e só depois de CONSULTAR o provedor. O navegador e o corpo do webhook não decidem.
  2. Quanto o usuário paga é o que gravamos no checkout (centavos); se o provedor disser outro valor ou outra moeda, ignoramos.
  3. O acesso dura até a próxima cobrança + carência (ORION_BILLING_GRACE_DAYS, padrão 3). Cada renovação aprovada estende;
     sem renovação o plano vence sozinho (core/quota.py já trata "until"). Cancelar não corta na hora: vale até o fim do período pago.
  4. Tudo é idempotente: o mesmo webhook chegando duas vezes não duplica nada (histórico é criado uma única vez).

Variáveis: ORION_BILLING_GRACE_DAYS (3), ORION_BILLING_RETURN_URL (página para onde o Mercado Pago devolve o usuário),
ORION_PIX_DAYS (31: quanto o plano dura depois de um pagamento por Pix, que é avulso e NÃO renova sozinho).

V5.5.0: checkout DENTRO do ORION. Cartão: o navegador gera um token de uso único com o formulário do Mercado Pago e o servidor cria a assinatura com ele
(subscribe_card). Pix: pagamento avulso (create_pix / pix_status); o plano só é concedido depois de o provedor confirmar valor e aprovação.
"""
import datetime as dt, logging, os, re, secrets, time
from collections import deque

from billing import plans
from billing.mercadopago import MercadoPago
from billing.provider import InvalidSignature, ProviderError  # noqa: F401  (reexportados para o main.py)
from billing.store import FirestoreStore

log = logging.getLogger("orion.billing")

RETURN_URL = os.getenv("ORION_BILLING_RETURN_URL", "https://janderfdev.github.io/orion/pages/orion.html?checkout=return")
GRACE_DAYS = int(os.getenv("ORION_BILLING_GRACE_DAYS", "3"))
PIX_DAYS = int(os.getenv("ORION_PIX_DAYS", "31"))
_PAY_ID = re.compile(r"^[0-9]{1,20}$")
MAX_CHECKOUTS_PER_HOUR = 5
_DATE = re.compile(r"^(\d{4}-\d{2}-\d{2})")


class BillingError(Exception):
    """Erro para o usuário: status HTTP + código curto (o site traduz o código)."""

    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status, self.code = status, code


def _br_today() -> dt.date:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date()   # Brasília/Fortaleza


def _iso_date(s: str):
    m = _DATE.match(s or "")
    try:
        return dt.date.fromisoformat(m.group(1)) if m else None
    except ValueError:
        return None


class Billing:
    def __init__(self, provider, store, *, on_plan_change=None, today=_br_today, grace_days: int | None = None):
        self.provider, self.store = provider, store
        self._changed = on_plan_change or (lambda uid: None)
        self._today = today
        self.grace = GRACE_DAYS if grace_days is None else grace_days
        self._recent: dict[str, deque] = {}

    @property
    def configured(self) -> bool:
        return bool(self.provider.configured() and self.store.enabled)

    def _rate_ok(self, uid: str):
        """Limite de tentativas de checkout por hora (compartilhado por redirecionamento, cartão e Pix). Devolve (fila, agora)."""
        now = time.time()
        q = self._recent.setdefault(uid, deque())
        while q and q[0] < now - 3600:
            q.popleft()
        if len(q) >= MAX_CHECKOUTS_PER_HOUR:
            raise BillingError(429, "too_many_checkouts")
        return q, now

    def _buyable(self, email: str, plan_id):
        plan = plans.PLANS.get(plan_id) if isinstance(plan_id, str) else None
        if plan is None or not plan.purchasable:
            raise BillingError(400, "plan_unavailable")
        if not email:
            raise BillingError(400, "email_required")
        return plan

    def _need(self) -> None:
        if not self.configured:
            raise BillingError(503, "billing_unavailable")

    def _tx(self, uid: str, tx_id: str, kind: str, status: str, amount, plan: str, ref: str) -> None:
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        self.store.add_tx(uid, tx_id, {"kind": kind, "status": status, "amount_cents": amount if isinstance(amount, int) else 0,
                                      "currency": "BRL", "plan": plan, "ref": ref, "ts": now})

    # ── consulta do usuário ──
    def me(self, uid: str) -> dict:
        """Plano que vale hoje (o mesmo que o quota.py usa), estado da assinatura e histórico recente."""
        self._need()
        today = self._today().isoformat()
        p = self.store.get_plan(uid) or {}
        plan = plans.effective_plan(p.get("plan"), str(p.get("until") or ""), today)
        st = self.store.get_state(uid) or {}
        status = st.get("status") or "none"
        return {"plan": plan, "until": p.get("until") or None, "subscription": status,
                "cancel_at_period_end": status == "cancelled" and plan != plans.DEFAULT,
                "transactions": [{k: t.get(k) for k in ("kind", "status", "amount_cents", "currency", "plan", "ts")}
                                 for t in self.store.list_tx(uid, 20)]}

    # ── começar uma assinatura ──
    def checkout(self, uid: str, email: str, plan_id: str) -> dict:
        self._need()
        plan = plans.PLANS.get(plan_id)
        if plan is None or not plan.purchasable:
            raise BillingError(400, "plan_unavailable")
        if not email:
            raise BillingError(400, "email_required")
        q, now = self._rate_ok(uid)
        cur = self.me(uid)
        if cur["plan"] == plan.id and cur["subscription"] == "authorized":
            raise BillingError(409, "already_subscribed")
        ref = f"orion-{uid[:24]}-{secrets.token_hex(4)}"
        try:
            made = self.provider.create_subscription(
                email=self.provider.payer_email(email),
                reason=f"{plan.name} — assinatura mensal", amount_cents=plan.price_cents,
                external_reference=ref, back_url=RETURN_URL, idempotency_key=ref)
        except ProviderError:
            log.exception("checkout: o provedor recusou a criação da assinatura")
            raise BillingError(502, "provider_error")
        q.append(now)
        # guardamos O QUE o usuário vai pagar; o webhook só vale se o provedor confirmar exatamente isto
        self.store.set_index("pre_" + made["id"], {"uid": uid, "plan": plan.id, "amount_cents": plan.price_cents, "ref": ref})
        return {"checkout_url": made["checkout_url"], "plan": plan.id}

    # ── V5.5.0: checkout dentro do ORION ──
    def config(self) -> dict:
        """O que o site precisa para montar o checkout: a chave PÚBLICA do Mercado Pago (se houver) e quais métodos estão ligados."""
        pk = self.provider.public_key() if hasattr(self.provider, "public_key") else ""
        ok = self.configured
        return {"enabled": ok, "public_key": pk or None, "card": bool(ok and pk), "pix": bool(ok and hasattr(self.provider, "create_pix_payment")),
                "test_mode": bool(getattr(self.provider, "test_mode", False)), "pix_days": PIX_DAYS}

    def subscribe_card(self, uid: str, email: str, plan_id: str, card_token: str) -> dict:
        """Assinatura mensal com o token do cartão. O plano só muda depois de CONSULTAR o provedor (mesma regra do webhook)."""
        self._need()
        plan = self._buyable(email, plan_id)
        if not isinstance(card_token, str) or not 8 <= len(card_token) <= 200 or not re.match(r"^[A-Za-z0-9_\-]+$", card_token):
            raise BillingError(400, "card_token_invalid")
        q, now = self._rate_ok(uid)
        cur = self.me(uid)
        if cur["plan"] == plan.id and cur["subscription"] == "authorized":
            raise BillingError(409, "already_subscribed")
        ref = f"orion-{uid[:24]}-{secrets.token_hex(4)}"
        try:
            made = self.provider.create_card_subscription(
                email=self.provider.payer_email(email), reason=f"{plan.name} — assinatura mensal", amount_cents=plan.price_cents,
                external_reference=ref, back_url=RETURN_URL, card_token=card_token, idempotency_key=ref)
        except ProviderError as e:
            log.warning("cartão: o provedor recusou a assinatura (%s)", getattr(e, "status", None))
            raise BillingError(402 if getattr(e, "status", None) in (400, 402) else 502, "card_refused" if getattr(e, "status", None) in (400, 402) else "provider_error")
        q.append(now)
        self.store.set_index("pre_" + made["id"], {"uid": uid, "plan": plan.id, "amount_cents": plan.price_cents, "ref": ref})
        try:
            self._sync(made["id"])                 # ativa já, se o provedor confirmar; senão o webhook conclui
        except ProviderError:
            log.exception("cartão: não consegui confirmar a assinatura agora (o webhook conclui)")
        active = self.me(uid)["plan"] == plan.id
        return {"plan": plan.id, "status": "active" if active else "pending"}

    def create_pix(self, uid: str, email: str, plan_id: str) -> dict:
        """Pagamento avulso por Pix: libera o plano por PIX_DAYS dias depois da confirmação. Não renova sozinho."""
        self._need()
        plan = self._buyable(email, plan_id)
        if not hasattr(self.provider, "create_pix_payment"):
            raise BillingError(503, "billing_unavailable")
        q, now = self._rate_ok(uid)
        cur = self.me(uid)
        if cur["subscription"] == "authorized" and cur["plan"] != plans.DEFAULT:
            raise BillingError(409, "already_subscribed")                     # com assinatura ativa, não duplicamos a cobrança
        if plans.get(cur["plan"]).rank > plan.rank:
            raise BillingError(409, "plan_downgrade_blocked")                 # Pix de um plano menor não rebaixa quem já tem um maior
        ref = f"orionpix-{uid[:24]}-{secrets.token_hex(4)}"
        try:
            made = self.provider.create_pix_payment(email=self.provider.payer_email(email), description=f"{plan.name} — {PIX_DAYS} dias",
                                                    amount_cents=plan.price_cents, external_reference=ref, idempotency_key=ref)
        except ProviderError:
            log.exception("pix: o provedor recusou a criação do pagamento")
            raise BillingError(502, "provider_error")
        q.append(now)
        self.store.set_index("pix_" + made["id"], {"uid": uid, "plan": plan.id, "amount_cents": plan.price_cents, "ref": ref})
        return {"payment_id": made["id"], "qr_code": made["qr_code"], "qr_code_base64": made["qr_code_base64"], "expires": made["expires"],
                "amount_cents": plan.price_cents, "plan": plan.id, "days": PIX_DAYS}

    def pix_status(self, uid: str, payment_id: str) -> dict:
        """O site pergunta de tempos em tempos. Só o dono do pagamento vê; quem confirma é SEMPRE o provedor."""
        self._need()
        if not isinstance(payment_id, str) or not _PAY_ID.match(payment_id):
            raise BillingError(404, "payment_not_found")
        idx = self.store.get_index("pix_" + payment_id)
        if not idx or idx.get("uid") != uid:
            raise BillingError(404, "payment_not_found")
        try:
            status = self._apply_pix(payment_id, idx)
        except ProviderError:
            status = "pending"
        return {"status": status, "plan": idx["plan"]}

    def _apply_pix(self, payment_id: str, idx: dict) -> str:
        """Lê o pagamento NO PROVEDOR. Aprovado com o valor certo → concede o plano (uma única vez). Devolve approved | pending | failed."""
        pay = self.provider.get_payment(payment_id)
        st = pay["status"]
        if st in ("pending", "in_process", "authorized", ""):
            return "pending"
        if st != "approved":
            return "failed"                                              # rejected, cancelled, expired, refunded…
        if pay["amount_cents"] != idx["amount_cents"]:
            log.error("pix: valor diverge do checkout (esperado %s, veio %s): ignorado", idx["amount_cents"], pay["amount_cents"])
            return "failed"
        uid, plan_id = idx["uid"], idx["plan"]
        today = self._today()
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        first = self.store.add_tx(uid, f"pix_{payment_id}", {"kind": "charge", "status": "approved", "amount_cents": pay["amount_cents"] or 0,
                                                             "currency": "BRL", "plan": plan_id, "ref": idx.get("ref") or "", "ts": now})
        if first:                                                         # idempotente: o mesmo Pix aprovado não estende duas vezes
            cur = self.store.get_plan(uid) or {}
            base = today
            if cur.get("plan") == plan_id:                               # renovar o mesmo plano soma ao tempo que ainda resta
                old = _iso_date(str(cur.get("until") or ""))
                if old and old > today:
                    base = old
            until = (base + dt.timedelta(days=PIX_DAYS)).isoformat()
            self.store.set_plan(uid, plan_id, until)
            self.store.set_index("pay_" + payment_id, {"uid": uid, "sub": "", "plan": plan_id})
            self._changed(uid)
        return "approved"

    # ── cancelar ──
    def cancel(self, uid: str) -> dict:
        self._need()
        st = self.store.get_state(uid) or {}
        sub_id = st.get("provider_id")
        if not sub_id or st.get("status") not in ("authorized", "paused"):
            raise BillingError(409, "no_active_subscription")
        try:
            self.provider.cancel_subscription(sub_id)
        except ProviderError:
            log.exception("cancelar: o provedor recusou")
            raise BillingError(502, "provider_error")
        self.store.set_state(uid, {"status": "cancelled", "updated": self._today().isoformat()})
        self._tx(uid, f"cancel_{sub_id}", "cancel", "ok", 0, st.get("plan") or "", sub_id)
        return {"ok": True, "access_until": (self.store.get_plan(uid) or {}).get("until") or None}

    # ── webhook ──
    def handle_webhook(self, headers: dict, query: dict, body: dict) -> dict:
        """Levanta InvalidSignature (→ 401). Qualquer outra exceção deve virar 5xx: o provedor tenta de novo."""
        ev = self.provider.verify_webhook(headers, query, body)
        self._need()
        topic, data_id = ev["topic"], ev["data_id"]
        if topic == "subscription_preapproval":
            handled = self._sync(data_id)
        elif topic == "subscription_authorized_payment":
            handled = self._authorized_payment(data_id)
        elif topic == "payment":
            handled = self._payment(data_id)
        else:
            handled = False
        return {"topic": topic, "handled": handled}

    def _authorized_payment(self, ap_id: str) -> bool:
        ap = self.provider.get_authorized_payment(ap_id)
        sub_id = ap["subscription_id"]
        idx = self.store.get_index("pre_" + sub_id) if sub_id else None
        if not idx:
            log.warning("cobrança de assinatura desconhecida (ignorada)")
            return False
        uid, plan = idx["uid"], idx["plan"]
        kind = {"approved": "charge", "rejected": "charge_failed", "cancelled": "charge_failed"}.get(ap["payment_status"])
        if kind:
            self._tx(uid, f"ap_{ap_id}", kind, ap["payment_status"], ap["amount_cents"], plan, sub_id)
            if kind == "charge" and ap["payment_id"]:
                self.store.set_index("pay_" + ap["payment_id"], {"uid": uid, "sub": sub_id, "plan": plan})
        self._sync(sub_id)      # renovação aprovada estende o prazo; recusa não estende (o plano vence sozinho)
        return True

    def _payment(self, payment_id: str) -> bool:
        """Só reembolso/estorno: o plano é retirado. Pagamento que nunca registramos é ignorado (sem dono conhecido)."""
        pix = self.store.get_index("pix_" + payment_id)
        if pix:                                                          # V5.5.0: pagamento por Pix feito dentro do ORION
            pay = self.provider.get_payment(payment_id)
            if pay["status"] in ("refunded", "charged_back"):
                uid = pix["uid"]
                self._tx(uid, f"refund_{payment_id}", "refund", pay["status"], pay["amount_cents"], pix.get("plan") or "", "")
                cur = self.store.get_plan(uid) or {}
                if cur.get("plan") == pix.get("plan"):
                    self.store.set_plan(uid, plans.DEFAULT, "")
                    self._changed(uid)
                return True
            return self._apply_pix(payment_id, pix) == "approved"
        pay = self.provider.get_payment(payment_id)
        if pay["status"] not in ("refunded", "charged_back"):
            return False
        idx = self.store.get_index("pay_" + payment_id)
        if not idx:
            log.warning("reembolso de pagamento desconhecido (ignorado)")
            return False
        uid = idx["uid"]
        self._tx(uid, f"refund_{payment_id}", "refund", pay["status"], pay["amount_cents"], idx.get("plan") or "", idx.get("sub") or "")
        try:
            self.provider.cancel_subscription(idx["sub"])
        except ProviderError:
            log.exception("reembolso: não consegui cancelar a assinatura no provedor (o plano será retirado mesmo assim)")
        self.store.set_state(uid, {"status": "cancelled", "updated": self._today().isoformat()})
        self.store.set_plan(uid, plans.DEFAULT, "")
        self._changed(uid)
        return True

    def _sync(self, sub_id: str) -> bool:
        """Lê a assinatura NO PROVEDOR e aplica o que for verdade. Idempotente."""
        idx = self.store.get_index("pre_" + sub_id)
        if not idx:
            log.warning("assinatura desconhecida (ignorada)")
            return False
        uid, plan_id = idx["uid"], idx["plan"]
        sub = self.provider.get_subscription(sub_id)
        if sub["currency"] != "BRL" or sub["amount_cents"] != idx["amount_cents"]:
            log.error("valor/moeda divergem do checkout (esperado %s BRL, veio %s %s): ignorado",
                      idx["amount_cents"], sub["amount_cents"], sub["currency"])
            return False
        today = self._today()
        st = self.store.get_state(uid) or {}
        mine = st.get("provider_id") == sub_id
        if sub["status"] == "authorized":
            nxt = _iso_date(sub["next_payment_date"]) or (today + dt.timedelta(days=31))
            until = (max(nxt, today) + dt.timedelta(days=self.grace)).isoformat()
            if st.get("provider_id") and not mine and st.get("status") in ("authorized", "paused"):
                try:                                         # troca de plano: encerra a assinatura anterior
                    self.provider.cancel_subscription(st["provider_id"])
                except ProviderError:
                    log.exception("troca de plano: não consegui cancelar a assinatura anterior")
            self.store.set_plan(uid, plan_id, until)
            self.store.set_state(uid, {"plan": plan_id, "status": "authorized", "provider_id": sub_id,
                                       "until": until, "updated": today.isoformat()})
            self._changed(uid)
            return True
        if mine and sub["status"] in ("paused", "cancelled"):
            self.store.set_state(uid, {"status": sub["status"], "updated": today.isoformat()})   # o plano segue até o fim do período pago
            return True
        return False


def build(admin, project_id: str, on_plan_change=None) -> Billing:
    """Monta o serviço com o Mercado Pago e o Firestore de servidor. Sem as credenciais, `configured` é False (rotas → 503)."""
    return Billing(MercadoPago(), FirestoreStore(admin, project_id), on_plan_change=on_plan_change)
