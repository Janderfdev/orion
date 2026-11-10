"""Regras do faturamento do ORION (V5.2.0). Fala só com a interface PaymentProvider e com a store: nada de HTTP aqui.

Princípios:
  1. O plano só muda aqui, no servidor, e só depois de CONSULTAR o provedor. O navegador e o corpo do webhook não decidem.
  2. Quanto o usuário paga é o que gravamos no checkout (centavos); se o provedor disser outro valor ou outra moeda, ignoramos.
  3. O acesso dura até a próxima cobrança + carência (ORION_BILLING_GRACE_DAYS, padrão 3). Cada renovação aprovada estende;
     sem renovação o plano vence sozinho (core/quota.py já trata "until"). Cancelar não corta na hora: vale até o fim do período pago.
  4. Tudo é idempotente: o mesmo webhook chegando duas vezes não duplica nada (histórico é criado uma única vez).

Variáveis: ORION_BILLING_GRACE_DAYS (3), ORION_BILLING_RETURN_URL (página para onde o Mercado Pago devolve o usuário).
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
        now = time.time()
        q = self._recent.setdefault(uid, deque())
        while q and q[0] < now - 3600:
            q.popleft()
        if len(q) >= MAX_CHECKOUTS_PER_HOUR:
            raise BillingError(429, "too_many_checkouts")
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
