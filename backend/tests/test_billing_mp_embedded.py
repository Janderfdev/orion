"""V5.5.0: corpo das requisições do Mercado Pago para cartão (token) e Pix, e leitura da resposta (sessão falsa, sem rede)."""
import pytest

from billing.mercadopago import MercadoPago
from billing.provider import ProviderError


class Resp:
    def __init__(self, data, code=200): self._d, self.status_code, self.text = data, code, str(data)
    def json(self): return self._d


class Sess:
    def __init__(self, data, code=200): self.data, self.code, self.calls = data, code, []
    def request(self, method, url, json=None, headers=None, timeout=None):
        self.calls.append((method, url, json, headers)); return Resp(self.data, self.code)


def mp(data, code=200):
    s = Sess(data, code)
    return MercadoPago("TEST-token", "secret", session=s), s


def test_card_subscription_body_uses_token_and_authorized_status():
    m, s = mp({"id": "2c93", "status": "authorized"})
    out = m.create_card_subscription(email="a@b.com", reason="ORION PLUS", amount_cents=1990, external_reference="ref", back_url="https://x.test",
                                     card_token="tok123456", idempotency_key="idem")
    method, url, body, headers = s.calls[0]
    assert (method, url.endswith("/preapproval")) == ("POST", True) and out == {"id": "2c93", "status": "authorized"}
    assert body["card_token_id"] == "tok123456" and body["status"] == "authorized" and body["auto_recurring"]["transaction_amount"] == 19.9
    assert body["auto_recurring"]["currency_id"] == "BRL" and headers["X-Idempotency-Key"] == "idem" and "TEST-token" not in str(body)


def test_card_subscription_without_id_is_an_error_and_http_errors_carry_status():
    m, _ = mp({"status": "authorized"})
    with pytest.raises(ProviderError):
        m.create_card_subscription(email="a@b.com", reason="x", amount_cents=100, external_reference="r", back_url="https://x.test", card_token="tok123456", idempotency_key="i")
    m, _ = mp({"message": "bad"}, 400)
    with pytest.raises(ProviderError) as e:
        m.create_card_subscription(email="a@b.com", reason="x", amount_cents=100, external_reference="r", back_url="https://x.test", card_token="tok123456", idempotency_key="i")
    assert e.value.status == 400


def test_pix_payment_body_and_response():
    m, s = mp({"id": 123456789, "point_of_interaction": {"transaction_data": {"qr_code": "000201PIX", "qr_code_base64": "QUJD"}}})
    out = m.create_pix_payment(email="a@b.com", description="ORION PRO", amount_cents=4990, external_reference="ref", idempotency_key="idem")
    method, url, body, _ = s.calls[0]
    assert url.endswith("/v1/payments") and body["payment_method_id"] == "pix" and body["transaction_amount"] == 49.9 and body["payer"] == {"email": "a@b.com"}
    assert body["date_of_expiration"].endswith("+00:00") and out["id"] == "123456789" and out["qr_code"] == "000201PIX" and out["qr_code_base64"] == "QUJD"


def test_pix_without_code_is_an_error():
    m, _ = mp({"id": 1, "point_of_interaction": {}})
    with pytest.raises(ProviderError):
        m.create_pix_payment(email="a@b.com", description="x", amount_cents=100, external_reference="r", idempotency_key="i")


def test_public_key_comes_from_env(monkeypatch):
    monkeypatch.setenv("ORION_MP_PUBLIC_KEY", " APP_USR-pub ")
    assert MercadoPago("t", "s").public_key() == "APP_USR-pub"
    monkeypatch.delenv("ORION_MP_PUBLIC_KEY")
    assert MercadoPago("t", "s").public_key() == ""
