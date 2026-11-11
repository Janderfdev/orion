"""V5.2.0: /plan, vozes travadas por plano em /models, /speak e /speak/preview (login, ElevenLabs e plano simulados)."""
from types import SimpleNamespace

import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient

import main

OK = {"Authorization": "Bearer ok"}


@pytest.fixture
def ctx(monkeypatch):
    plan = {"v": "free"}
    synth = []

    async def fake_auth(authorization, count=False, with_email=False):
        if authorization != "Bearer ok":
            raise main.HTTPException(401, "Não autorizado.")
        return ("uid1", "tok", "a@b.com") if with_email else ("uid1", "tok")
    monkeypatch.setattr(main, "_auth", fake_auth)
    monkeypatch.setattr(main.quota, "status", lambda uid: {"plan": plan["v"], "used": 3, "limit": 10})
    fake_el = SimpleNamespace(
        configured=lambda: True, voices=lambda: [{"slot": s, "label": f"Voz {s}"} for s in (1, 2, 3, 4)],
        voice_id=lambda s: f"vid{s}", clean=lambda t: t, SLOTS=(1, 2, 3, 4),
        synthesize=lambda text, voice, pace, expr: synth.append(voice) or b"MP3",
        PACE_MIN=0.8, PACE_MAX=1.2, PACE_DEFAULT=1.0, EXPR_MIN=0.0, EXPR_MAX=1.0, EXPR_DEFAULT=0.5)
    monkeypatch.setattr(main, "elevenlabs", fake_el)
    monkeypatch.setattr(main, "_tts_ok", lambda uid, n: True)
    monkeypatch.setattr(main, "registry", SimpleNamespace(default="m", models=lambda: [{"id": "m", "label": "M"}]))
    return TestClient(main.app, raise_server_exceptions=False), plan, synth


def test_plan_endpoint_free_and_plus(ctx):
    c, plan, _ = ctx
    assert c.get("/plan").status_code == 401
    assert c.get("/plan", headers=OK).json() == {"plan": "free", "used": 3, "limit": 10, "voices": [1], "api": False}
    plan["v"] = "plus"
    assert c.get("/plan", headers=OK).json() == {"plan": "plus", "used": 3, "limit": 10, "voices": [1, 2, 3, 4], "api": True}


def test_plan_endpoint_does_not_spend_a_question(ctx, monkeypatch):
    c, *_ = ctx
    monkeypatch.setattr(main.quota, "consume", lambda uid: (_ for _ in ()).throw(AssertionError("não pode gastar pergunta")))
    assert c.get("/plan", headers=OK).status_code == 200


def test_models_marks_locked_voices_by_plan(ctx):
    c, plan, _ = ctx
    v = c.get("/models", headers=OK).json()
    assert v["plan"] == "free" and [(x["slot"], x["locked"]) for x in v["voices"]] == [(1, False), (2, True), (3, True), (4, True)]
    plan["v"] = "pro"
    assert not any(x["locked"] for x in c.get("/models", headers=OK).json()["voices"])
    assert "vid" not in c.get("/models", headers=OK).text                         # Voice IDs nunca saem do servidor


def test_free_cannot_speak_with_locked_voices_and_nothing_is_synthesized(ctx):
    c, plan, synth = ctx
    for path, body in (("/speak", {"text": "oi", "voice": 2}), ("/speak/preview", {"voice": 3, "lang": "pt"})):
        r = c.post(path, json=body, headers=OK)
        assert r.status_code == 403 and r.json()["detail"] == "plan:voice_locked"
    assert synth == []                                                            # o servidor barra ANTES de gastar o ElevenLabs
    ok = c.post("/speak", json={"text": "oi", "voice": 1}, headers=OK)
    assert ok.status_code == 200 and ok.content == b"MP3" and synth == [1]


def test_paid_plans_can_use_all_four_voices(ctx):
    c, plan, synth = ctx
    plan["v"] = "plus"
    for slot in (1, 2, 3, 4):
        assert c.post("/speak", json={"text": "oi", "voice": slot}, headers=OK).status_code == 200
    assert synth == [1, 2, 3, 4]


def test_downgrade_locks_voices_again(ctx):
    c, plan, _ = ctx
    plan["v"] = "plus"
    assert c.post("/speak", json={"text": "oi", "voice": 4}, headers=OK).status_code == 200
    plan["v"] = "free"
    assert c.post("/speak", json={"text": "oi", "voice": 4}, headers=OK).status_code == 403
