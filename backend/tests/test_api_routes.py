"""ORION API — rotas HTTP ponta a ponta (login, modelo e banco simulados; service e rotas REAIS)."""
import asyncio
from dataclasses import replace
from types import SimpleNamespace

import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient

import main
from api import service as svc
from billing import plans

import datetime as dt
TODAY = dt.date(2026, 11, 10)


class MemApiStore:
    enabled = True

    def __init__(self):
        self.hashes, self.keys, self.usage = {}, {}, {}
    def get_hash(self, h): return self.hashes.get(h)
    def set_hash(self, h, d): self.hashes[h] = d
    def delete_hash(self, h): self.hashes.pop(h, None)
    def get_keys(self, uid): return [dict(k) for k in self.keys.get(uid, [])]
    def set_keys(self, uid, ks): self.keys[uid] = [dict(k) for k in ks]
    def get_usage(self, uid): return self.usage.get(uid)
    def set_usage(self, uid, month, count): self.usage[uid] = {"month": month, "count": count}
    def bump_usage(self, uid, n):
        d = self.usage.setdefault(uid, {"count": 0})
        d["count"] = d.get("count", 0) + n

OK = {"Authorization": "Bearer login"}


class FakeProvider:
    def __init__(self): self.fail = None; self.delay = 0; self.seen = []
    async def generate(self, system, messages, tools=None, execute=None):
        self.seen.append(messages[-1]["content"])
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.fail:
            raise self.fail
        return "  Olá, eu sou o ORION.  "


class FakeRegistry:
    default = "m1"
    def __init__(self, prov): self.prov = prov
    def models(self): return [{"id": "m1", "label": "Modelo 1"}]
    def get(self, mid): return ("m1", self.prov) if mid in (None, "m1") else (None, None)


class HttpErr(Exception):
    def __init__(self, status): super().__init__("segredo-do-provedor sk-123"); self.status_code = status


@pytest.fixture
def ctx(monkeypatch):
    monkeypatch.setitem(plans.PLANS, "plus", replace(plans.PLANS["plus"], api_per_minute=3, api_monthly=4))
    plan, prov, store = {"v": "plus"}, FakeProvider(), MemApiStore()
    api = svc.ApiService(store, lambda uid: plan["v"], today=lambda: TODAY, pepper="", bg=lambda fn, *a: fn(*a))
    monkeypatch.setattr(main, "orion_api", api)
    monkeypatch.setattr(main, "registry", FakeRegistry(prov))
    async def fake_auth(authorization, count=False, with_email=False):
        if authorization != "Bearer login":
            raise main.HTTPException(401, "Não autorizado.")
        return ("uid1", "tok", "a@b.com") if with_email else ("uid1", "tok")
    monkeypatch.setattr(main, "_auth", fake_auth)
    return TestClient(main.app, raise_server_exceptions=False), plan, prov, api


def make_key(c, name="app"):
    r = c.post("/api/keys", json={"name": name}, headers=OK)
    assert r.status_code == 200, r.text
    return r.json()


def bearer(key): return {"Authorization": f"Bearer {key}"}


def err(r, status, code):
    assert r.status_code == status, r.text
    e = r.json()["error"]
    assert e["code"] == code and e["message"] and e["request_id"].startswith("req_")
    assert set(e) == {"code", "message", "request_id"} and r.headers["x-request-id"] == e["request_id"]
    return e


# ── fluxo feliz ──
def test_create_key_then_chat(ctx):
    c, _, prov, _ = ctx
    k = make_key(c)
    r = c.post("/v1/chat", json={"message": "  oi  "}, headers=bearer(k["key"]))
    assert r.status_code == 200
    j = r.json()
    assert j["reply"] == "Olá, eu sou o ORION." and j["model"] == "m1" and j["usage"] == {"used": 1, "limit": 4}
    assert j["id"].startswith("req_") and j["id"] == r.headers["x-request-id"] and j["sources"] == []
    assert prov.seen == ["oi"]


def test_models_and_usage_endpoints_with_key(ctx):
    c, *_ = ctx
    k = make_key(c)["key"]
    assert c.get("/v1/models", headers=bearer(k)).json() == {"default": "m1", "models": [{"id": "m1", "label": "Modelo 1"}]}
    c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k))
    u = c.get("/v1/usage", headers=bearer(k)).json()
    assert u["used"] == 1 and u["limit"] == 4 and u["plan"] == "plus"


def test_management_list_usage_revoke_rotate(ctx):
    c, *_ = ctx
    a, b = make_key(c, "a"), make_key(c, "b")
    listing = c.get("/api/keys", headers=OK).json()["keys"]
    assert [k["name"] for k in listing] == ["a", "b"] and "key" not in listing[0] and "hash" not in listing[0]
    assert c.get("/api/usage", headers=OK).json()["max_keys"] == plans.PLANS["plus"].api_max_keys
    assert c.post(f"/api/keys/{a['id']}/revoke", headers=OK).json() == {"ok": True}
    err(c.post("/v1/chat", json={"message": "oi"}, headers=bearer(a["key"])), 401, "invalid_api_key")
    n = c.post(f"/api/keys/{b['id']}/rotate", headers=OK).json()
    assert c.post("/v1/chat", json={"message": "oi"}, headers=bearer(n["key"])).status_code == 200
    err(c.post("/v1/chat", json={"message": "oi"}, headers=bearer(b["key"])), 401, "invalid_api_key")


def test_management_requires_login_and_valid_ids(ctx):
    c, *_ = ctx
    assert c.get("/api/keys").status_code == 401 and c.post("/api/keys", json={}).status_code == 401
    for bad in ("../x", "ZZZZZZZZ", "123"):
        assert c.post(f"/api/keys/{bad}/revoke", headers=OK).status_code in (404, 422)
    err(c.post("/api/keys/deadbeef/revoke", headers=OK), 404, "key_not_found")


# ── autenticação e plano ──
def test_free_plan_gets_a_reduced_api_end_to_end(ctx):
    c, plan, *_ = ctx
    plan["v"] = "free"
    k = make_key(c)                                                                  # 1 chave
    err(c.post("/api/keys", json={"name": "outra"}, headers=OK), 409, "key_limit")
    r = c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k["key"]))
    assert r.status_code == 200 and r.json()["usage"]["limit"] == plans.PLANS["free"].api_monthly
    u = c.get("/api/usage", headers=OK).json()
    assert u["api"] is True and u["plan"] == "free" and u["max_keys"] == 1


def test_missing_or_bad_key_is_401_in_the_standard_format(ctx):
    c, *_ = ctx
    for h in ({}, {"Authorization": ""}, {"Authorization": "Bearer lixo"}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer login"}):
        err(c.post("/v1/chat", json={"message": "oi"}, headers=h), 401, "invalid_api_key")
    err(c.get("/v1/models"), 401, "invalid_api_key")
    err(c.get("/v1/usage"), 401, "invalid_api_key")


def test_plan_without_api_cannot_create_or_use(ctx, monkeypatch):
    c, plan, *_ = ctx
    k = make_key(c)["key"]
    monkeypatch.setitem(plans.PLANS, "free", replace(plans.PLANS["free"], features=frozenset(plans.PLANS["free"].features - {"api"})))
    plan["v"] = "free"
    err(c.post("/api/keys", json={"name": "x"}, headers=OK), 403, "plan_required")
    err(c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k)), 403, "plan_required")


# ── validação do corpo (nada disso gasta cota) ──
@pytest.mark.parametrize("payload", [{}, {"message": ""}, {"message": "   "}, {"message": 5}, {"message": "x" * 4001}, {"message": "oi", "model": 5},
                                     {"message": "oi", "model": "m" * 81}, [], "texto", None])
def test_invalid_bodies_are_400_and_free(ctx, payload):
    c, *_ = ctx
    k = make_key(c)["key"]
    err(c.post("/v1/chat", json=payload, headers=bearer(k)), 400, "invalid_request")
    assert c.get("/v1/usage", headers=bearer(k)).json()["used"] == 0


def test_non_json_and_oversized_bodies(ctx):
    c, *_ = ctx
    k = make_key(c)["key"]
    err(c.post("/v1/chat", content=b"nao e json", headers=bearer(k)), 400, "invalid_request")
    err(c.post("/v1/chat", content=b"x" * 40_000, headers=bearer(k)), 413, "payload_too_large")
    assert c.get("/v1/usage", headers=bearer(k)).json()["used"] == 0


def test_unknown_model_is_400_and_free(ctx):
    c, *_ = ctx
    k = make_key(c)["key"]
    err(c.post("/v1/chat", json={"message": "oi", "model": "inexistente"}, headers=bearer(k)), 400, "model_unavailable")
    assert c.get("/v1/usage", headers=bearer(k)).json()["used"] == 0


# ── limites ──
def test_per_minute_limit_sends_retry_after(ctx):
    c, *_ = ctx
    k = make_key(c)["key"]
    for _ in range(3):
        assert c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k)).status_code == 200
    r = c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k))
    err(r, 429, "rate_limited")
    assert int(r.headers["retry-after"]) >= 1


def test_monthly_quota_exceeded(ctx, monkeypatch):
    c, _, _, api = ctx
    monkeypatch.setitem(plans.PLANS, "plus", replace(plans.PLANS["plus"], api_per_minute=100, api_monthly=2))
    k = make_key(c)["key"]
    for _ in range(2):
        assert c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k)).status_code == 200
    err(c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k)), 429, "quota_exceeded")


# ── falhas do modelo: erro limpo e a requisição é devolvida ──
def test_provider_errors_are_clean_and_refunded(ctx):
    c, _, prov, _ = ctx
    k = make_key(c)["key"]
    cases = [(HttpErr(429), 503, "provider_busy"), (HttpErr(404), 503, "model_unavailable"), (RuntimeError("sk-123 vazou"), 502, "provider_error")]
    for exc, status, code in cases:
        prov.fail = exc
        r = c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k))
        err(r, status, code)
        assert "sk-123" not in r.text and "segredo" not in r.text                    # nada do provedor chega ao cliente
    assert c.get("/v1/usage", headers=bearer(k)).json()["used"] == 0                # nenhuma falha foi cobrada
    prov.fail = HttpErr(429)
    assert c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k)).headers["retry-after"] == "10"


def test_model_timeout_is_504_and_refunded(ctx, monkeypatch):
    c, _, prov, _ = ctx
    monkeypatch.setattr(main, "V1_TIMEOUT", 0.05)
    prov.delay = 1
    k = make_key(c)["key"]
    err(c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k)), 504, "timeout")
    assert c.get("/v1/usage", headers=bearer(k)).json()["used"] == 0


def test_unexpected_crash_is_500_internal_error_without_details(ctx, monkeypatch):
    c, _, _, api = ctx
    k = make_key(c)["key"]
    monkeypatch.setattr(api, "usage", lambda uid: (_ for _ in ()).throw(RuntimeError("SEGREDO-INTERNO")))
    r = c.get("/v1/usage", headers=bearer(k))
    err(r, 500, "internal_error")
    assert "SEGREDO" not in r.text


def test_api_does_not_touch_the_app_memory_or_daily_quota(ctx, monkeypatch):
    c, *_ = ctx
    def boom(*a, **k): raise AssertionError("a API não pode usar memória nem a cota diária do app")
    monkeypatch.setattr(main.orchestrator.memory, "load", boom)
    monkeypatch.setattr(main.orchestrator.memory, "stage", boom)
    monkeypatch.setattr(main.quota, "consume", boom)
    k = make_key(c)["key"]
    assert c.post("/v1/chat", json={"message": "oi"}, headers=bearer(k)).status_code == 200
