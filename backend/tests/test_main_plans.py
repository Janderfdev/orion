"""Testes do catálogo de planos V5.2.0 e da integração com a cota (sem rede)."""
import importlib

import pytest

from billing import plans


# ── catálogo ──
def test_order_and_ranks():
    assert plans.ORDER == ("free", "plus", "pro", "ultra")
    assert [plans.PLANS[i].rank for i in plans.ORDER] == [0, 1, 2, 3]


def test_unknown_or_bad_plan_is_free():
    for bad in (None, "", "   ", "admin", "PRO ", 5, ["pro"], {"plan": "ultra"}):
        got = plans.get(bad).id
        assert got in ("free", "pro"), bad          # "PRO " é normalizado de propósito; o resto vira free
        if bad != "PRO ":
            assert got == "free"
    assert plans.get("PRO ").id == "pro"


def test_daily_limits_grow_with_plan():
    lim = plans.daily_limits()
    assert lim["free"] < lim["plus"] < lim["pro"] < lim["ultra"]


def test_each_plan_includes_the_previous_one():
    for a, b in zip(plans.ORDER, plans.ORDER[1:]):
        assert plans.PLANS[a].features <= plans.PLANS[b].features, f"{b} deve ter tudo de {a}"


def test_voices_free_one_paid_four():
    assert plans.PLANS["free"].voice_slots == (1,)
    for p in ("plus", "pro", "ultra"):
        assert plans.PLANS[p].voice_slots == (1, 2, 3, 4)
    assert plans.allows_voice("free", 1) and not plans.allows_voice("free", 2)
    assert plans.allows_voice("plus", 4) and not plans.allows_voice("plus", 5)
    assert not plans.allows_voice("plus", True)      # bool não é número de slot
    assert not plans.allows_voice("plus", "2")


def test_api_access_starts_at_plus_with_growing_quota():
    assert not plans.can("free", "api") and plans.PLANS["free"].api_monthly == 0
    m = [plans.PLANS[p].api_monthly for p in ("plus", "pro", "ultra")]
    assert all(plans.can(p, "api") for p in ("plus", "pro", "ultra"))
    assert 0 < m[0] < m[1] < m[2]


def test_unreleased_features_are_never_granted_even_to_ultra():
    # ORION CODE é V5.5.0 e early_access ainda não tem nada para liberar: não antecipar versões futuras
    for p in plans.ORDER:
        assert not plans.can(p, "orion_code")
        assert not plans.can(p, "early_access")
    assert "orion_code" in plans.PLANS["pro"].features      # o direito existe; só não está liberado


def test_unknown_feature_is_denied():
    assert not plans.can("ultra", "teletransporte")


def test_free_is_never_purchasable_and_no_price_means_not_for_sale(monkeypatch):
    assert not plans.PLANS["free"].purchasable
    for v in ("ORION_PRICE_PLUS", "ORION_PRICE_PRO", "ORION_PRICE_ULTRA"):
        monkeypatch.delenv(v, raising=False)
    fresh = plans._build()
    assert all(p.price_cents is None and not p.purchasable for p in fresh.values())


def test_price_from_env_and_garbage_is_ignored(monkeypatch):
    monkeypatch.setenv("ORION_PRICE_PLUS", "1990")
    monkeypatch.setenv("ORION_PRICE_PRO", "abc")
    monkeypatch.setenv("ORION_PRICE_ULTRA", "-5")
    fresh = plans._build()
    assert fresh["plus"].price_cents == 1990 and fresh["plus"].purchasable
    assert fresh["pro"].price_cents is None and fresh["ultra"].price_cents is None


def test_limits_from_env_and_bad_values_fall_back(monkeypatch):
    monkeypatch.setenv("ORION_LIMIT_PLUS", "250")
    monkeypatch.setenv("ORION_LIMIT_PRO", "muitos")
    monkeypatch.setenv("ORION_LIMIT_ULTRA", "-3")
    fresh = plans._build()
    assert fresh["plus"].daily_questions == 250
    assert fresh["pro"].daily_questions == 500            # inválido -> padrão
    assert fresh["ultra"].daily_questions == 0            # negativo vira 0 (nunca "ilimitado" por engano)


# ── plano vencido ──
def test_effective_plan_expiry():
    assert plans.effective_plan("plus", "2026-11-30", "2026-11-09") == "plus"
    assert plans.effective_plan("plus", "2026-11-09", "2026-11-09") == "plus"     # vence no fim do dia 'until'
    assert plans.effective_plan("plus", "2026-11-08", "2026-11-09") == "free"
    assert plans.effective_plan("ultra", "", "2026-11-09") == "ultra"             # sem 'until' = sem vencimento
    assert plans.effective_plan("free", "2000-01-01", "2026-11-09") == "free"
    assert plans.effective_plan("inventado", "", "2026-11-09") == "free"


# ── catálogo público (o site) ──
def test_public_catalog_has_no_internal_fields_and_hides_unreleased():
    cat = plans.public_catalog()
    assert [c["id"] for c in cat] == list(plans.ORDER)
    allowed = {"id", "name", "price_cents", "currency", "purchasable", "daily_questions", "voices", "api", "features"}
    for c in cat:
        assert set(c) == allowed
        assert "orion_code" not in c["features"] and "early_access" not in c["features"]
    assert cat[0]["api"] is None and cat[1]["api"]["monthly"] > 0


# ── integração com core/quota.py ──
@pytest.fixture
def quota_mod():
    pytest.importorskip("google.oauth2")
    import core.quota as q
    return importlib.reload(q)


def _fake_quota(quota_mod, doc):
    qt = quota_mod.Quota()
    qt._admin = type("A", (), {"enabled": True})()
    qt._get = lambda path: doc if path.startswith("plans/") else None
    return qt


def test_quota_limits_come_from_catalog(quota_mod):
    assert quota_mod.LIMITS == plans.daily_limits() and "ultra" in quota_mod.LIMITS


def test_quota_reads_ultra_plan(quota_mod):
    qt = _fake_quota(quota_mod, {"plan": {"stringValue": "ultra"}})
    st = {"plan": "free", "plan_at": 0.0}
    qt._refresh_plan("u", st, "2026-11-09")
    assert st["plan"] == "ultra"


def test_quota_expired_or_unknown_plan_is_free(quota_mod):
    for doc in ({"plan": {"stringValue": "pro"}, "until": {"stringValue": "2026-01-01"}},
                {"plan": {"stringValue": "supremo"}},
                {"plan": {"stringValue": "  PRO  "}, "until": {"stringValue": "2026-01-01"}}):
        qt = _fake_quota(quota_mod, doc)
        st = {"plan": "free", "plan_at": 0.0}
        qt._refresh_plan("u", st, "2026-11-09")
        assert st["plan"] == "free", doc


def test_quota_consume_respects_ultra_limit(quota_mod, monkeypatch):
    monkeypatch.setitem(quota_mod.LIMITS, "ultra", 2)
    qt = _fake_quota(quota_mod, {"plan": {"stringValue": "ultra"}})
    qt._bg = lambda *a, **k: None
    qt._load = lambda uid, today: qt._st.setdefault(uid, {"day": today, "count": 0, "plan": "free", "plan_at": 0.0})
    assert qt.consume("u")["ok"] and qt.consume("u")["ok"]
    r = qt.consume("u")
    assert not r["ok"] and r["plan"] == "ultra" and r["limit"] == 2
