"""Testes do catálogo de planos V5.2.0 e da integração com a cota (sem rede)."""
import importlib

import pytest

from billing import plans


# ── catálogo ──
def test_order_and_ranks():
    assert plans.ORDER == ("free", "plus", "pro")                 # o ULTRA é da V5.5.0: não existe na V5.2.0
    assert [plans.PLANS[i].rank for i in plans.ORDER] == [0, 1, 2]
    assert "ultra" not in plans.PLANS and plans.get("ultra").id == "free"   # plano que não existe = free


def test_unknown_or_bad_plan_is_free():
    for bad in (None, "", "   ", "admin", "ultra", "PRO ", 5, ["pro"], {"plan": "pro"}):
        got = plans.get(bad).id
        assert got in ("free", "pro"), bad          # "PRO " é normalizado de propósito; o resto vira free
        if bad != "PRO ":
            assert got == "free"
    assert plans.get("PRO ").id == "pro"


def test_daily_limits_grow_with_plan():
    lim = plans.daily_limits()
    assert lim["free"] < lim["plus"] < lim["pro"]


def test_each_plan_includes_the_previous_one():
    for a, b in zip(plans.ORDER, plans.ORDER[1:]):
        assert plans.PLANS[a].features <= plans.PLANS[b].features, f"{b} deve ter tudo de {a}"


def test_voices_free_one_paid_four():
    assert plans.PLANS["free"].voice_slots == (1,)
    for p in ("plus", "pro"):
        assert plans.PLANS[p].voice_slots == (1, 2, 3, 4)
    assert plans.allows_voice("free", 1) and not plans.allows_voice("free", 2)
    assert plans.allows_voice("plus", 4) and not plans.allows_voice("plus", 5)
    assert not plans.allows_voice("plus", True)      # bool não é número de slot
    assert not plans.allows_voice("plus", "2")


def test_every_plan_has_api_with_growing_quota_and_keys():
    # FREE tem ORION API com cota reduzida; PLUS e PRO têm mais
    assert all(plans.can(p, "api") for p in plans.ORDER)
    m = [plans.PLANS[p].api_monthly for p in plans.ORDER]
    r = [plans.PLANS[p].api_per_minute for p in plans.ORDER]
    k = [plans.PLANS[p].api_max_keys for p in plans.ORDER]
    assert 0 < m[0] < m[1] < m[2] and 0 < r[0] < r[1] < r[2] and 1 == k[0] < k[1] <= k[2]


def test_unreleased_features_are_never_granted():
    # ORION CODE é V5.5.0: não antecipar versões futuras
    for p in plans.ORDER:
        assert not plans.can(p, "orion_code")
    assert "orion_code" in plans.PLANS["pro"].features      # o direito existe; só não está liberado


def test_catalog_only_claims_what_exists_today():
    # o ORION ainda não gera imagens e não tem multitarefa/análises por plano: nada disso pode aparecer como recurso do plano
    for p in plans.ORDER:
        for f in ("images_basic", "images_advanced", "multitask", "advanced_analysis", "orion_code"):
            assert not plans.can(p, f), (p, f)
    shown = {f for c in plans.public_catalog() for f in c["features"]}
    assert shown == {"chat", "history", "voices_4", "api"}
    assert "voices_4" not in plans.public_catalog()[0]["features"]            # FREE não tem as 4 vozes
    assert "api" in plans.public_catalog()[0]["features"]                     # mas tem ORION API (reduzido)


def test_unknown_feature_is_denied():
    assert not plans.can("pro", "teletransporte")


def test_free_is_never_purchasable_and_no_price_means_not_for_sale(monkeypatch):
    assert not plans.PLANS["free"].purchasable
    for v in ("ORION_PRICE_PLUS", "ORION_PRICE_PRO"):
        monkeypatch.delenv(v, raising=False)
    fresh = plans._build()
    assert all(p.price_cents is None and not p.purchasable for p in fresh.values())


def test_price_from_env_and_garbage_is_ignored(monkeypatch):
    monkeypatch.setenv("ORION_PRICE_PLUS", "1990")
    monkeypatch.setenv("ORION_PRICE_PRO", "-5")
    fresh = plans._build()
    assert fresh["plus"].price_cents == 1990 and fresh["plus"].purchasable
    assert fresh["pro"].price_cents is None


def test_free_api_numbers_come_from_env(monkeypatch):
    monkeypatch.setenv("ORION_API_MONTHLY_FREE", "50")
    monkeypatch.setenv("ORION_API_RPM_FREE", "2")
    fresh = plans._build()
    assert (fresh["free"].api_monthly, fresh["free"].api_per_minute) == (50, 2)


def test_limits_from_env_and_bad_values_fall_back(monkeypatch):
    monkeypatch.setenv("ORION_LIMIT_PLUS", "250")
    monkeypatch.setenv("ORION_LIMIT_PRO", "muitos")
    monkeypatch.setenv("ORION_LIMIT_FREE", "-3")
    fresh = plans._build()
    assert fresh["plus"].daily_questions == 250
    assert fresh["pro"].daily_questions == 500            # inválido -> padrão
    assert fresh["free"].daily_questions == 0             # negativo vira 0 (nunca "ilimitado" por engano)


# ── plano vencido ──
def test_effective_plan_expiry():
    assert plans.effective_plan("plus", "2026-11-30", "2026-11-09") == "plus"
    assert plans.effective_plan("plus", "2026-11-09", "2026-11-09") == "plus"     # vence no fim do dia 'until'
    assert plans.effective_plan("plus", "2026-11-08", "2026-11-09") == "free"
    assert plans.effective_plan("pro", "", "2026-11-09") == "pro"                 # sem 'until' = sem vencimento
    assert plans.effective_plan("free", "2000-01-01", "2026-11-09") == "free"
    assert plans.effective_plan("inventado", "", "2026-11-09") == "free"


# ── catálogo público (o site) ──
def test_public_catalog_has_no_internal_fields_and_hides_unreleased():
    cat = plans.public_catalog()
    assert [c["id"] for c in cat] == list(plans.ORDER)
    allowed = {"id", "name", "price_cents", "currency", "purchasable", "daily_questions", "voices", "api", "features"}
    for c in cat:
        assert set(c) == allowed
        assert "orion_code" not in c["features"]
    assert 0 < cat[0]["api"]["monthly"] < cat[1]["api"]["monthly"] < cat[2]["api"]["monthly"] and cat[0]["api"]["keys"] == 1


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
    assert quota_mod.LIMITS == plans.daily_limits() and "ultra" not in quota_mod.LIMITS


def test_quota_reads_pro_plan_and_ignores_ultra(quota_mod):
    qt = _fake_quota(quota_mod, {"plan": {"stringValue": "pro"}})
    st = {"plan": "free", "plan_at": 0.0}
    qt._refresh_plan("u", st, "2026-11-09")
    assert st["plan"] == "pro"
    qt = _fake_quota(quota_mod, {"plan": {"stringValue": "ultra"}})   # ULTRA só na V5.5.0: documento antigo/manual vira free
    st = {"plan": "pro", "plan_at": 0.0}
    qt._refresh_plan("u", st, "2026-11-09")
    assert st["plan"] == "free"


def test_quota_expired_or_unknown_plan_is_free(quota_mod):
    for doc in ({"plan": {"stringValue": "pro"}, "until": {"stringValue": "2026-01-01"}},
                {"plan": {"stringValue": "supremo"}},
                {"plan": {"stringValue": "  PRO  "}, "until": {"stringValue": "2026-01-01"}}):
        qt = _fake_quota(quota_mod, doc)
        st = {"plan": "free", "plan_at": 0.0}
        qt._refresh_plan("u", st, "2026-11-09")
        assert st["plan"] == "free", doc


def test_quota_consume_respects_plan_limit(quota_mod, monkeypatch):
    monkeypatch.setitem(quota_mod.LIMITS, "pro", 2)
    qt = _fake_quota(quota_mod, {"plan": {"stringValue": "pro"}})
    qt._bg = lambda *a, **k: None
    qt._load = lambda uid, today: qt._st.setdefault(uid, {"day": today, "count": 0, "plan": "free", "plan_at": 0.0})
    assert qt.consume("u")["ok"] and qt.consume("u")["ok"]
    r = qt.consume("u")
    assert not r["ok"] and r["plan"] == "pro" and r["limit"] == 2


def test_quota_status_does_not_spend_a_question(quota_mod):
    qt = _fake_quota(quota_mod, {"plan": {"stringValue": "plus"}})
    qt._bg = lambda *a, **k: None
    qt._load = lambda uid, today: qt._st.setdefault(uid, {"day": today, "count": 0, "plan": "free", "plan_at": 0.0})
    a = qt.status("u")
    b = qt.status("u")
    assert a == b == {"plan": "plus", "used": 0, "limit": plans.PLANS["plus"].daily_questions}
    qt.consume("u")
    assert qt.status("u")["used"] == 1
