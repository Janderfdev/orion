"""Mercado Pago — assinaturas recorrentes (API /preapproval) e validação de webhooks.

Variáveis do Render:
  ORION_MP_ACCESS_TOKEN      Access Token da aplicação. "TEST-..." = ambiente de testes; "APP_USR-..." = produção.
  ORION_MP_WEBHOOK_SECRET    "assinatura secreta" mostrada no painel do Mercado Pago, em Webhooks.
  ORION_MP_TEST_PAYER_EMAIL  (só vale com token TEST-) e-mail do COMPRADOR DE TESTE: em testes o Mercado Pago só aceita
                             usuários de teste como pagador.

Documentação usada (conferida em 09/11/2026):
  criar assinatura   POST /preapproval  (payer_email obrigatório; sem card_token_id, a resposta traz init_point)
  cancelar           PUT  /preapproval/{id}  {"status": "cancelled"}
  webhook            header x-signature "ts=...,v1=..."; v1 = HMAC-SHA256(segredo, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;")
                     em hexadecimal; o par que não vier na notificação é omitido do manifest.

NÃO CONFIRMADO ATÉ HOJE (precisa de credenciais de teste): nomes exatos dos campos de GET /authorized_payments/{id}.
O código lê esses campos de forma defensiva (.get) e ignora o que não entender; veja docs/BILLING.md, seção "Verificar".
"""
import hashlib, hmac, logging, os, re
from decimal import Decimal, InvalidOperation

import requests

from billing.provider import InvalidSignature, PaymentProvider, ProviderError

log = logging.getLogger("orion.billing.mp")

API = "https://api.mercadopago.com"
TIMEOUT = 10
_CHECKOUT_HOST = re.compile(r"^https://([a-z0-9-]+\.)*mercadopago\.com(\.[a-z]{2})?/")   # nunca mandamos o usuário a outro site
_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_STATUS = {"pending", "authorized", "paused", "cancelled"}


def _cents(value) -> int | None:
    try:
        return int((Decimal(str(value)) * 100).to_integral_value())
    except (InvalidOperation, ValueError, TypeError):
        return None


def _safe_id(value) -> str:
    s = str(value or "").strip()
    if not _ID.match(s):
        raise ProviderError("identificador inválido")
    return s


class MercadoPago(PaymentProvider):
    name = "mercadopago"

    def __init__(self, access_token: str | None = None, webhook_secret: str | None = None, session=None):
        self._token = (access_token if access_token is not None else os.getenv("ORION_MP_ACCESS_TOKEN", "")).strip()
        self._secret = (webhook_secret if webhook_secret is not None else os.getenv("ORION_MP_WEBHOOK_SECRET", "")).strip()
        self._s = session or requests.Session()

    # ── configuração ──
    def configured(self) -> bool:
        return bool(self._token and self._secret)

    @property
    def test_mode(self) -> bool:
        return self._token.startswith("TEST-")

    def payer_email(self, real_email: str) -> str:
        """Em testes, o pagador precisa ser o comprador de teste do Mercado Pago."""
        override = os.getenv("ORION_MP_TEST_PAYER_EMAIL", "").strip()
        return override if (self.test_mode and override) else real_email

    # ── HTTP ──
    def _call(self, method: str, path: str, body: dict | None = None, idem: str | None = None) -> dict:
        headers = {"Authorization": "Bearer " + self._token, "Content-Type": "application/json"}
        if idem:
            headers["X-Idempotency-Key"] = idem
        try:
            r = self._s.request(method, API + path, json=body, headers=headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            raise ProviderError("o Mercado Pago não respondeu") from None   # sem detalhes (podem trazer URL/cabeçalhos)
        if r.status_code >= 400:
            log.warning("MP %s %s -> %s %s", method, path.split("?")[0], r.status_code, r.text[:200].replace(self._token, "***"))
            raise ProviderError(f"o Mercado Pago recusou a operação ({r.status_code})", r.status_code)
        try:
            data = r.json()
        except ValueError:
            raise ProviderError("resposta inválida do Mercado Pago", r.status_code)
        return data if isinstance(data, dict) else {}

    # ── assinaturas ──
    def create_subscription(self, *, email, reason, amount_cents, external_reference, back_url, idempotency_key):
        body = {
            "reason": reason[:200],
            "external_reference": external_reference[:256],
            "payer_email": email,
            "back_url": back_url,
            "status": "pending",
            "auto_recurring": {"frequency": 1, "frequency_type": "months", "currency_id": "BRL",
                               "transaction_amount": float(Decimal(amount_cents) / 100)},
        }
        d = self._call("POST", "/preapproval", body, idem=idempotency_key)
        sid, url = d.get("id"), str(d.get("init_point") or "")
        if not sid or not _CHECKOUT_HOST.match(url):
            raise ProviderError("resposta do Mercado Pago sem página de pagamento válida")
        return {"id": _safe_id(sid), "checkout_url": url}

    def get_subscription(self, sub_id):
        d = self._call("GET", "/preapproval/" + _safe_id(sub_id))
        rec = d.get("auto_recurring") if isinstance(d.get("auto_recurring"), dict) else {}
        status = str(d.get("status") or "").lower()
        return {"id": str(d.get("id") or ""), "status": status if status in _STATUS else "other",
                "amount_cents": _cents(rec.get("transaction_amount")), "currency": str(rec.get("currency_id") or ""),
                "next_payment_date": str(d.get("next_payment_date") or ""),
                "external_reference": str(d.get("external_reference") or ""), "payer_email": str(d.get("payer_email") or "")}

    def cancel_subscription(self, sub_id):
        self._call("PUT", "/preapproval/" + _safe_id(sub_id), {"status": "cancelled"})

    def get_authorized_payment(self, ap_id):
        d = self._call("GET", "/authorized_payments/" + _safe_id(ap_id))
        pay = d.get("payment") if isinstance(d.get("payment"), dict) else {}
        return {"id": str(d.get("id") or ""), "subscription_id": str(d.get("preapproval_id") or ""),
                "status": str(d.get("status") or "").lower(), "amount_cents": _cents(d.get("transaction_amount")),
                "payment_id": str(pay.get("id") or ""), "payment_status": str(pay.get("status") or "").lower()}

    def get_payment(self, payment_id):
        d = self._call("GET", "/v1/payments/" + _safe_id(payment_id))
        return {"id": str(d.get("id") or ""), "status": str(d.get("status") or "").lower(),
                "amount_cents": _cents(d.get("transaction_amount"))}

    # ── webhook ──
    def verify_webhook(self, headers, query, body):
        """Confere x-signature. `headers` com chaves em minúsculas; `query` = parâmetros da URL (ex.: data.id, type)."""
        if not self._secret:
            raise InvalidSignature("segredo do webhook não configurado")
        sig = headers.get("x-signature", "")
        parts = dict(p.strip().split("=", 1) for p in sig.split(",") if "=" in p)
        ts, v1 = parts.get("ts", ""), parts.get("v1", "")
        data_id = str(query.get("data.id") or "").strip().lower()
        if not ts or not v1 or not data_id:
            raise InvalidSignature("cabeçalho ou data.id ausente")
        manifest = f"id:{data_id};"
        req_id = headers.get("x-request-id", "")
        if req_id:
            manifest += f"request-id:{req_id};"
        manifest += f"ts:{ts};"
        calc = hmac.new(self._secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(calc, v1.lower()):
            raise InvalidSignature("assinatura não confere")
        topic = str(query.get("type") or query.get("topic") or (body or {}).get("type") or "").lower()
        return {"topic": topic, "data_id": data_id, "event_id": str((body or {}).get("id") or f"{topic}:{data_id}")}
