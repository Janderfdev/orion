"""Mercado Pago: validação do webhook e cliente HTTP (resposta simulada: nenhuma chamada real)."""
import hashlib, hmac

import pytest
import requests

from billing.mercadopago import MercadoPago
from billing.provider import InvalidSignature, ProviderError

SECRET = "segredo-de-teste"


def sign(data_id, req_id, ts, secret=SECRET):
    m = f"id:{data_id};"
    if req_id:
        m += f"request-id:{req_id};"
    m += f"ts:{ts};"
    return hmac.new(secret.encode(), m.encode(), hashlib.sha256).hexdigest()


def mp(**kw):
    return MercadoPago(access_token=kw.pop("token", "TEST-abc"), webhook_secret=kw.pop("secret", SECRET), **kw)


def headers(data_id="123", req_id="req-1", ts="1704908010", secret=SECRET):
    return {"x-signature": f"ts={ts},v1={sign(data_id, req_id, ts, secret)}", "x-request-id": req_id}


# ── webhook ──
def test_valid_signature_returns_normalized_event():
    ev = mp().verify_webhook(headers(), {"data.id": "123", "type": "subscription_preapproval"}, {"id": 77})
    assert ev == {"topic": "subscription_preapproval", "data_id": "123", "event_id": "77"}


def test_topic_falls_back_to_body_and_event_id_to_topic_and_id():
    ev = mp().verify_webhook(headers(), {"data.id": "123"}, {"type": "payment"})
    assert ev["topic"] == "payment" and ev["event_id"] == "payment:123"


def test_data_id_is_lowercased_like_the_docs_say():
    ev = mp().verify_webhook(headers("abc123def"), {"data.id": "ABC123DEF", "type": "payment"}, {})
    assert ev["data_id"] == "abc123def"


def test_manifest_omits_request_id_when_absent():
    h = {"x-signature": f"ts=1,v1={sign('9', '', '1')}"}
    assert mp().verify_webhook(h, {"data.id": "9", "type": "payment"}, {})["data_id"] == "9"


@pytest.mark.parametrize("case", ["wrong_secret", "tampered_id", "tampered_ts", "no_header", "no_v1", "no_ts", "no_data_id", "garbage", "empty_v1"])
def test_bad_signatures_are_rejected(case):
    h, q = headers(), {"data.id": "123", "type": "payment"}
    if case == "wrong_secret":   h = headers(secret="outro")
    if case == "tampered_id":    q = {"data.id": "124", "type": "payment"}
    if case == "tampered_ts":    h["x-signature"] = h["x-signature"].replace("ts=1704908010", "ts=1704908011")
    if case == "no_header":      h = {}
    if case == "no_v1":          h["x-signature"] = "ts=1704908010"
    if case == "no_ts":          h["x-signature"] = "v1=" + h["x-signature"].split("v1=")[1]
    if case == "no_data_id":     q = {"type": "payment"}
    if case == "garbage":        h["x-signature"] = "lixo,,=,"
    if case == "empty_v1":       h["x-signature"] = "ts=1704908010,v1="
    with pytest.raises(InvalidSignature):
        mp().verify_webhook(h, q, {})


def test_missing_server_secret_rejects_everything():
    with pytest.raises(InvalidSignature):
        mp(secret="").verify_webhook(headers(), {"data.id": "123", "type": "payment"}, {})


def test_configured_needs_token_and_secret():
    assert mp().configured()
    assert not mp(token="").configured() and not mp(secret="").configured()


# ── cliente HTTP ──
class Resp:
    def __init__(self, status=200, data=None, text="{}"):
        self.status_code, self._d, self.text = status, data if data is not None else {}, text
    def json(self):
        if self._d is None:
            raise ValueError
        return self._d


class Sess:
    def __init__(self, resp):
        self.resp, self.calls = resp, []
    def request(self, method, url, json=None, headers=None, timeout=None):
        self.calls.append({"method": method, "url": url, "json": json, "headers": headers, "timeout": timeout})
        if isinstance(self.resp, Exception):
            raise self.resp
        return self.resp


def test_create_subscription_request_and_response():
    s = Sess(Resp(201, {"id": "2c93808400aa", "init_point": "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=2c93808400aa"}))
    out = mp(session=s).create_subscription(email="a@b.com", reason="ORION PLUS", amount_cents=1990,
                                            external_reference="orion-u-1", back_url="https://x.io/b", idempotency_key="k1")
    c = s.calls[0]
    assert c["method"] == "POST" and c["url"] == "https://api.mercadopago.com/preapproval" and c["timeout"] == 10
    assert c["headers"]["Authorization"] == "Bearer TEST-abc" and c["headers"]["X-Idempotency-Key"] == "k1"
    assert c["json"]["payer_email"] == "a@b.com" and c["json"]["status"] == "pending"
    assert c["json"]["auto_recurring"] == {"frequency": 1, "frequency_type": "months", "currency_id": "BRL", "transaction_amount": 19.9}
    assert out == {"id": "2c93808400aa", "checkout_url": "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=2c93808400aa"}


@pytest.mark.parametrize("url", ["http://www.mercadopago.com.br/x", "https://evil.com/mercadopago.com/x",
                                 "https://mercadopago.com.evil.com/x", "", "javascript:alert(1)"])
def test_checkout_url_must_be_mercadopago_https(url):
    s = Sess(Resp(201, {"id": "abc", "init_point": url}))
    with pytest.raises(ProviderError):
        mp(session=s).create_subscription(email="a@b.com", reason="r", amount_cents=100, external_reference="r",
                                          back_url="https://x.io", idempotency_key="k")


def test_get_subscription_is_normalized():
    d = {"id": "s1", "status": "AUTHORIZED", "next_payment_date": "2026-12-09T10:00:00.000-03:00", "external_reference": "r",
         "payer_email": "a@b.com", "auto_recurring": {"transaction_amount": 19.9, "currency_id": "BRL"}}
    got = mp(session=Sess(Resp(200, d))).get_subscription("s1")
    assert got["status"] == "authorized" and got["amount_cents"] == 1990 and got["currency"] == "BRL"
    assert got["next_payment_date"].startswith("2026-12-09")


def test_money_is_exact_in_cents():
    for v, c in ((19.9, 1990), (0.1, 10), (29.99, 2999), ("49.90", 4990), (100, 10000)):
        d = {"id": "s", "status": "authorized", "auto_recurring": {"transaction_amount": v, "currency_id": "BRL"}}
        assert mp(session=Sess(Resp(200, d))).get_subscription("s")["amount_cents"] == c


def test_unknown_status_and_missing_fields_are_safe():
    got = mp(session=Sess(Resp(200, {"id": "s", "status": "inventado"}))).get_subscription("s")
    assert got["status"] == "other" and got["amount_cents"] is None and got["currency"] == ""


def test_authorized_payment_and_payment_normalization_is_defensive():
    ap = mp(session=Sess(Resp(200, {"id": 5, "preapproval_id": "s1", "status": "processed", "transaction_amount": 19.9,
                                    "payment": {"id": 99, "status": "approved"}}))).get_authorized_payment("5")
    assert ap == {"id": "5", "subscription_id": "s1", "status": "processed", "amount_cents": 1990,
                  "payment_id": "99", "payment_status": "approved"}
    empty = mp(session=Sess(Resp(200, {}))).get_authorized_payment("5")
    assert empty["subscription_id"] == "" and empty["payment_status"] == ""
    p = mp(session=Sess(Resp(200, {"id": 99, "status": "refunded", "transaction_amount": 19.9}))).get_payment("99")
    assert p == {"id": "99", "status": "refunded", "amount_cents": 1990}


def test_cancel_sends_cancelled_status():
    s = Sess(Resp(200, {"id": "s1", "status": "cancelled"}))
    mp(session=s).cancel_subscription("s1")
    assert s.calls[0]["method"] == "PUT" and s.calls[0]["url"].endswith("/preapproval/s1") and s.calls[0]["json"] == {"status": "cancelled"}


@pytest.mark.parametrize("bad", ["../x", "a/b", "a b", "", "x" * 65, "a?b=1"])
def test_ids_cannot_inject_paths(bad):
    with pytest.raises(ProviderError):
        mp(session=Sess(Resp(200, {}))).get_subscription(bad)


def test_http_error_does_not_leak_token_or_body():
    s = Sess(Resp(401, {}, text='{"message":"invalid token TEST-abc"}'))
    with pytest.raises(ProviderError) as e:
        mp(session=s).get_subscription("s1")
    assert "TEST-abc" not in str(e.value) and e.value.status == 401


def test_network_error_is_generic():
    with pytest.raises(ProviderError) as e:
        mp(session=Sess(requests.ConnectionError("https://api?token=TEST-abc"))).get_subscription("s1")
    assert "TEST-abc" not in str(e.value)


def test_test_mode_payer_override(monkeypatch):
    monkeypatch.setenv("ORION_MP_TEST_PAYER_EMAIL", "comprador@testuser.com")
    assert mp(token="TEST-1").payer_email("real@x.com") == "comprador@testuser.com"
    assert mp(token="APP_USR-1").payer_email("real@x.com") == "real@x.com"      # produção nunca troca o e-mail
