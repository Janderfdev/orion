"""V5.2.0: conta do proprietário (ORION_OWNER_EMAIL). O papel vem do e-mail do TOKEN validado no servidor, nunca do site."""
import asyncio, importlib

import pytest

pytest.importorskip("google.oauth2")

DOC_PLUS = {"plan": {"stringValue": "plus"}}


@pytest.fixture
def mk(monkeypatch):
    """Cria um Quota com ORION_OWNER_EMAIL definida e o Firestore simulado (doc = conteúdo de plans/{uid}, ou None)."""
    def make(owner_email="dono@exemplo.com", doc=None, unverified_ok=False):
        monkeypatch.setenv("ORION_OWNER_EMAIL", owner_email)
        monkeypatch.setenv("ORION_OWNER_ALLOW_UNVERIFIED", "1" if unverified_ok else "0")
        import core.quota as q
        q = importlib.reload(q)
        qt = q.Quota()
        qt._admin = type("A", (), {"enabled": True})()
        qt._get = lambda path: doc if path.startswith("plans/") else None
        return qt
    yield make
    monkeypatch.undo()
    import core.quota as q
    importlib.reload(q)


def _plan(qt, uid):
    st = {"plan": "free", "plan_at": 0.0}
    qt._refresh_plan(uid, st, "2026-11-14")
    return st["plan"]


def test_owner_email_gets_owner_role_and_pro_without_plan_doc(mk):
    qt = mk()
    assert qt.note_login("u1", {"email": "Dono@Exemplo.com", "email_verified": True}) is True   # maiúsculas não importam
    assert qt.role("u1") == "owner" and qt.is_owner("u1")
    assert _plan(qt, "u1") == "pro"


def test_other_accounts_stay_user_and_free(mk):
    qt = mk()
    assert qt.note_login("u2", {"email": "outro@exemplo.com", "email_verified": True}) is False
    assert qt.role("u2") == "user" and _plan(qt, "u2") == "free"


def test_unverified_email_is_not_owner_unless_allowed(mk):
    assert mk().note_login("u1", {"email": "dono@exemplo.com", "email_verified": False}) is False
    assert mk(unverified_ok=True).note_login("u1", {"email": "dono@exemplo.com", "email_verified": False}) is True


def test_owner_can_test_other_plans_with_plans_document(mk):
    qt = mk(doc=DOC_PLUS)
    qt.note_login("u1", {"email": "dono@exemplo.com", "email_verified": True})
    assert _plan(qt, "u1") == "plus"        # plans/{uid} tem prioridade sobre o padrão do proprietário


def test_no_owner_configured_means_nobody_is_owner(mk):
    qt = mk(owner_email="")
    for claims in ({"email": "", "email_verified": True}, {"email_verified": True}, {"email": "dono@exemplo.com", "email_verified": True}):
        assert qt.note_login("u1", claims) is False
    assert qt.role("u1") == "user"


def test_owner_without_firestore_still_gets_pro(mk):
    qt = mk()
    qt._admin = type("A", (), {"enabled": False})()
    qt.note_login("u1", {"email": "dono@exemplo.com", "email_verified": True})
    assert _plan(qt, "u1") == "pro"


def test_auth_marks_owner_from_token_claims(mk, monkeypatch):
    pytest.importorskip("httpx")
    qt = mk()
    import main
    monkeypatch.setattr(main, "quota", qt)
    monkeypatch.setattr(main, "ALLOWED", set())
    monkeypatch.setattr(main, "REQUIRE_VERIFIED", False)
    monkeypatch.setattr(main, "_user_ok", lambda uid: True)
    monkeypatch.setattr(main, "verify", lambda tok: {"sub": "uid9", "email": "dono@exemplo.com", "email_verified": True})
    asyncio.run(main._auth("Bearer x"))
    assert qt.role("uid9") == "owner"
