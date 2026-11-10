"""Rotas HTTP do faturamento (FastAPI TestClient; login e serviço simulados)."""
import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient

import main
from billing import service
from billing.provider import InvalidSignature


class FakeBilling:
    configured = True
    def __init__(self): self.calls = []
    def me(self, uid): self.calls.append(("me", uid)); return {"plan": "free"}
    def checkout(self, uid, email, plan): self.calls.append(("checkout", uid, email, plan)); return {"checkout_url": "https://www.mercadopago.com.br/x", "plan": plan}
    def cancel(self, uid): raise service.BillingError(409, "no_active_subscription")
    def handle_webhook(self, headers, query, body):
        self.calls.append(("webhook", headers, query, body))
        if headers.get("x-signature") == "ruim":
            raise InvalidSignature("x")
        if headers.get("x-signature") == "quebra":
            raise RuntimeError("segredo-interno")
        return {"topic": query.get("type", ""), "handled": True}


@pytest.fixture
def client(monkeypatch):
    fb = FakeBilling()
    monkeypatch.setattr(main, "billing", fb)
    async def fake_auth(authorization, count=False, with_email=False):
        if authorization != "Bearer ok":
            raise main.HTTPException(401, "Não autorizado.")
        return ("uid1", "tok", "user@x.com") if with_email else ("uid1", "tok")
    monkeypatch.setattr(main, "_auth", fake_auth)
    return TestClient(main.app), fb


OK = {"Authorization": "Bearer ok"}


def test_plans_catalog_is_public_and_has_no_secrets(client):
    c, _ = client
    r = c.get("/plans")
    assert r.status_code == 200 and [p["id"] for p in r.json()["plans"]] == ["free", "plus", "pro", "ultra"]
    assert "orion_code" not in r.text and "token" not in r.text.lower()


def test_billing_routes_require_login(client):
    c, _ = client
    assert c.get("/billing/me").status_code == 401
    assert c.post("/billing/checkout", json={"plan": "plus"}).status_code == 401
    assert c.post("/billing/cancel").status_code == 401


def test_checkout_uses_email_from_token_and_validates_plan(client):
    c, fb = client
    r = c.post("/billing/checkout", json={"plan": "plus", "email": "hacker@x.com", "price": 1}, headers=OK)
    assert r.status_code == 200 and fb.calls[-1] == ("checkout", "uid1", "user@x.com", "plus")      # e-mail do token; preço ignorado
    for bad in ("free", "admin", "", None, 5):
        assert c.post("/billing/checkout", json={"plan": bad}, headers=OK).status_code == 422


def test_billing_errors_become_coded_http_errors(client):
    c, _ = client
    r = c.post("/billing/cancel", headers=OK)
    assert r.status_code == 409 and r.json()["detail"] == "billing:no_active_subscription"


def test_webhook_invalid_signature_is_401(client):
    c, _ = client
    r = c.post("/billing/webhook/mercadopago?data.id=1&type=payment", json={}, headers={"x-signature": "ruim"})
    assert r.status_code == 401


def test_webhook_passes_query_headers_and_body_and_needs_no_login(client):
    c, fb = client
    r = c.post("/billing/webhook/mercadopago?data.id=77&type=payment", json={"id": 5}, headers={"X-Signature": "ts=1,v1=a", "X-Request-Id": "r1"})
    assert r.status_code == 200 and r.json() == {"ok": True, "topic": "payment", "handled": True}
    _, headers, query, body = fb.calls[-1]
    assert headers["x-signature"] == "ts=1,v1=a" and headers["x-request-id"] == "r1"          # cabeçalhos em minúsculas
    assert query == {"data.id": "77", "type": "payment"} and body == {"id": 5}


def test_webhook_internal_failure_is_500_without_details(client):
    c, _ = client
    r = c.post("/billing/webhook/mercadopago?data.id=1&type=payment", json={}, headers={"x-signature": "quebra"})
    assert r.status_code == 500 and "segredo-interno" not in r.text


def test_webhook_tolerates_non_json_body(client):
    c, fb = client
    r = c.post("/billing/webhook/mercadopago?data.id=1&type=payment", content=b"nao-e-json", headers={"x-signature": "ts=1,v1=a"})
    assert r.status_code == 200 and fb.calls[-1][3] == {}


def test_unconfigured_billing_answers_503(monkeypatch):
    class Off:
        configured = False
    real = service.build(main.quota._admin, "p")
    monkeypatch.setattr(main, "billing", real)
    async def fake_auth(authorization, count=False, with_email=False):
        return ("uid1", "tok", "a@b.com") if with_email else ("uid1", "tok")
    monkeypatch.setattr(main, "_auth", fake_auth)
    monkeypatch.delenv("ORION_MP_ACCESS_TOKEN", raising=False)
    c = TestClient(main.app)
    r = c.post("/billing/checkout", json={"plan": "plus"}, headers=OK)
    assert r.status_code == 503 and r.json()["detail"] == "billing:billing_unavailable"
    assert c.get("/plans").json()["billing"] is False
