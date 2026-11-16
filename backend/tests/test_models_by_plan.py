"""V5.2.0: modelos por plano. FREE usa só o Gemini 3.5 Flash-Lite; Gemini 3.6 e 3.8 Flash a partir do PRO. O servidor decide."""
import importlib

import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient

import main
from billing import plans

LITE, G36, G38 = "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash"


def make_registry(monkeypatch, models=f"{G38}:G38,{LITE}:Lite,{G36}:G36", default=None):
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("ORION_MODELS", models)
    if default:
        monkeypatch.setenv("ORION_DEFAULT_MODEL", default)
    else:
        monkeypatch.delenv("ORION_DEFAULT_MODEL", raising=False)
    import providers.registry as r
    return importlib.reload(r).Registry()


def test_catalog_rules():
    assert plans.model_min_plan(LITE) == "free" and plans.model_min_plan(G36) == "plus" and plans.model_min_plan(G38) == "pro"
    assert plans.model_min_plan("modelo-desconhecido") == "pro"          # o que não está na lista não é de graça
    assert plans.allows_model("free", LITE) and not plans.allows_model("free", G36) and not plans.allows_model("free", G38)
    assert plans.allows_model("plus", LITE) and plans.allows_model("plus", G36) and not plans.allows_model("plus", G38)
    assert all(plans.allows_model("pro", m) for m in (LITE, G36, G38))


def test_env_overrides_plan_of_a_model(monkeypatch):
    monkeypatch.setenv("ORION_MODEL_PLANS", f"{G36}:pro, {G38}:invalido")
    assert plans.model_min_plan(G36) == "pro" and not plans.allows_model("plus", G36)
    assert plans.model_min_plan(G38) == "pro"                            # plano inexistente na lista é ignorado


def test_registry_free_sees_all_but_only_lite_is_unlocked(monkeypatch):
    reg = make_registry(monkeypatch)
    free = {m["id"]: m for m in reg.models_for("free")}
    assert [m for m in free if not free[m]["locked"]] == [LITE] and free[G38]["min_plan"] == "pro" and free[G36]["min_plan"] == "plus"
    plus = {m["id"]: m["locked"] for m in reg.models_for("plus")}
    assert plus == {G38: True, LITE: False, G36: False}
    assert reg.default_for("free") == LITE                               # o padrão do FREE é o único liberado
    assert reg.default_for("pro") == G38 and not any(m["locked"] for m in reg.models_for("pro"))
    assert reg.default_for("plus") == G36                                # PLUS: o mais forte que o plano libera


def test_registry_never_leaves_a_plan_without_a_model(monkeypatch):
    reg = make_registry(monkeypatch, models=f"{G38}:G38,{G36}:G36")        # o Flash-Lite não está configurado
    assert reg.default_for("free") in (G38, G36) and reg.allowed("free", G36)    # os de menor nível ficam liberados


def test_unknown_model_is_never_allowed(monkeypatch):
    reg = make_registry(monkeypatch)
    assert not reg.has("x") and not reg.allowed("pro", "x")


@pytest.fixture
def client(monkeypatch):
    reg = make_registry(monkeypatch)
    state = {"plan": "free", "asked": []}

    async def fake_auth(authorization, count=False, with_email=False):
        return ("uid1", "tok", "a@b.com") if with_email else ("uid1", "tok")
    monkeypatch.setattr(main, "_auth", fake_auth)
    monkeypatch.setattr(main, "registry", reg)
    monkeypatch.setattr(main.quota, "status", lambda uid: {"plan": state["plan"], "used": 0, "limit": 10})
    monkeypatch.setattr(main.quota, "consume", lambda uid: {"ok": True, "used": 1, "limit": 10, "plan": state["plan"]})
    monkeypatch.setattr(main.quota, "refund", lambda uid: None)

    class Prov:
        def __init__(self, mid): self.mid = mid

    for mid in (G38, LITE, G36):
        reg._entries[mid]["provider"] = Prov(mid)

    async def fake_ask(text, uid, token, provider, image=None, file=None):
        state["asked"].append(provider.mid)
        return {"reply": "ok", "sources": [], "understood": text}
    monkeypatch.setattr(main.orchestrator, "ask", fake_ask)
    async def no_images(*a, **k): return []
    monkeypatch.setattr(main.images, "find", lambda text, lang: [])
    return TestClient(main.app, raise_server_exceptions=False), state


def test_models_route_marks_locked_models(client):
    c, st = client
    d = c.get("/models", headers={"Authorization": "Bearer ok"}).json()
    assert d["default"] == LITE and {m["id"]: m["locked"] for m in d["models"]} == {G38: True, LITE: False, G36: True}
    st["plan"] = "pro"
    d = c.get("/models", headers={"Authorization": "Bearer ok"}).json()
    assert d["default"] == G38 and not any(m["locked"] for m in d["models"])


def test_ask_with_locked_model_falls_back_to_the_plan_model(client):
    c, st = client
    r = c.post("/ask", json={"text": "oi", "model": G38}, headers={"Authorization": "Bearer ok"})
    assert r.status_code == 200 and st["asked"] == [LITE]               # FREE pediu o 3.8: o servidor usou o Flash-Lite
    st["plan"] = "pro"
    c.post("/ask", json={"text": "oi", "model": G38}, headers={"Authorization": "Bearer ok"})
    assert st["asked"][-1] == G38


def test_ask_unknown_model_is_still_rejected(client):
    c, _ = client
    assert c.post("/ask", json={"text": "oi", "model": "inventado"}, headers={"Authorization": "Bearer ok"}).status_code == 400
