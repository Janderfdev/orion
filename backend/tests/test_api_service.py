"""ORION API — serviço (chaves, autenticação, limite por minuto, cota mensal) com store em memória."""
import datetime as dt
from dataclasses import replace

import pytest

from api import keys as keylib
from api import service as svc
from api.errors import ApiError
from billing import plans

TODAY = dt.date(2026, 11, 10)


class MemApiStore:
    enabled = True

    def __init__(self):
        self.hashes, self.keys, self.usage, self.fail_get_hash = {}, {}, {}, False

    def get_hash(self, h):
        if self.fail_get_hash:
            raise RuntimeError("firestore fora do ar")
        return self.hashes.get(h)
    def set_hash(self, h, d): self.hashes[h] = d
    def delete_hash(self, h): self.hashes.pop(h, None)
    def get_keys(self, uid): return [dict(k) for k in self.keys.get(uid, [])]
    def set_keys(self, uid, ks): self.keys[uid] = [dict(k) for k in ks]
    def get_usage(self, uid): return self.usage.get(uid)
    def set_usage(self, uid, month, count): self.usage[uid] = {"month": month, "count": count}
    def bump_usage(self, uid, n):
        d = self.usage.setdefault(uid, {"count": 0})
        d["count"] = d.get("count", 0) + n


class Clock:
    def __init__(self): self.t = 1_000_000.0
    def __call__(self): return self.t


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setitem(plans.PLANS, "plus", replace(plans.PLANS["plus"], api_per_minute=3, api_monthly=5))
    store, clock, plan, today = MemApiStore(), Clock(), {"v": "plus"}, {"d": TODAY}
    s = svc.ApiService(store, lambda uid: plan["v"], today=lambda: today["d"], now=clock, pepper="", bg=lambda fn, *a: fn(*a))
    return s, store, clock, plan, today


def code(excinfo): return excinfo.value.code


@pytest.fixture
def no_api_plan(monkeypatch):
    """Um plano SEM o recurso ORION API (o FREE hoje tem; a trava continua existindo para planos futuros)."""
    monkeypatch.setitem(plans.PLANS, "free", replace(plans.PLANS["free"], features=frozenset(plans.PLANS["free"].features - {"api"}), api_monthly=0, api_per_minute=0, api_max_keys=0))


# ── chaves ──
def test_key_format_and_only_the_hash_is_stored(env):
    s, store, *_ = env
    k = s.create_key("u1", "Meu app")
    assert keylib.well_formed(k["key"]) and k["key"].startswith("orion_") and len(k["key"]) == 49
    assert k["prefix"] == k["key"][:10] and k["last4"] == k["key"][-4:] and k["name"] == "Meu app"
    blob = repr(store.keys) + repr(store.hashes)
    assert k["key"] not in blob and keylib.digest(k["key"], "") in store.hashes     # só o hash vai ao banco


def test_keys_are_unique_and_list_never_shows_secrets(env):
    s, *_ = env
    a, b = s.create_key("u1", "a"), s.create_key("u1", "b")
    assert a["key"] != b["key"] and a["id"] != b["id"]
    listing = s.list_keys("u1")
    assert [k["name"] for k in listing] == ["a", "b"]
    for item in listing:
        assert set(item) == {"id", "name", "prefix", "last4", "created"}
        assert a["key"] not in repr(item) and b["key"] not in repr(item)


def test_plan_without_api_cannot_create_keys(env, no_api_plan):
    s, _, _, plan, _ = env
    plan["v"] = "free"
    with pytest.raises(ApiError) as e:
        s.create_key("u1", "x")
    assert e.value.status == 403 and code(e) == "plan_required"


def test_free_plan_can_use_the_api_with_one_key_and_a_small_quota(env):
    s, _, clock, plan, _ = env
    plan["v"] = "free"
    k = s.create_key("u1", "meu app")
    with pytest.raises(ApiError) as e:
        s.create_key("u1", "outra")
    assert e.value.status == 409 and code(e) == "key_limit" and "1 chave" in e.value.message
    who = s.authenticate(k["key"])
    for _ in range(plans.PLANS["free"].api_per_minute):
        s.begin(who["uid"], who["key_id"])
    with pytest.raises(ApiError) as e:
        s.begin(who["uid"], who["key_id"])
    assert code(e) == "rate_limited"
    n = s.rotate("u1", k["id"])                                                    # girar funciona mesmo no limite de 1 chave
    assert len(s.list_keys("u1")) == 1 and s.authenticate(n["key"])



def test_key_limit_and_name_sanitizing(env):
    s, *_ = env
    k = s.create_key("u1", "  nome\x00 com\n\n espaços  " + "x" * 80)
    assert "\x00" not in k["name"] and "\n" not in k["name"] and len(k["name"]) <= 40
    assert s.create_key("u1", "")["name"] == "Minha chave"
    for _ in range(plans.PLANS["plus"].api_max_keys - 2):
        s.create_key("u1", "k")
    with pytest.raises(ApiError) as e:
        s.create_key("u1", "k")
    assert e.value.status == 409 and code(e) == "key_limit"
    s.create_key("u2", "outra pessoa")                                              # o limite é por pessoa


# ── autenticação ──
def test_authenticate_valid_and_invalid_keys(env):
    s, *_ = env
    k = s.create_key("u1", "a")
    assert s.authenticate(k["key"]) == {"uid": "u1", "key_id": k["id"]}
    for bad in ("", None, "orion_curta", "x" * 49, keylib.generate(), k["key"][:-1] + ("A" if k["key"][-1] != "A" else "B"), 5):
        with pytest.raises(ApiError) as e:
            s.authenticate(bad)
        assert e.value.status == 401 and code(e) == "invalid_api_key"


def test_header_parsing():
    assert keylib.from_header("Bearer orion_abc") == "orion_abc" and keylib.from_header("bearer  orion_abc ") == "orion_abc"
    for bad in ("", "Basic abc", "orion_abc", None, 5):
        assert keylib.from_header(bad) == ""


def test_pepper_changes_the_hash_and_invalidates_keys(env):
    s, store, *_ = env
    k = s.create_key("u1", "a")
    assert keylib.digest(k["key"], "") != keylib.digest(k["key"], "segredo")
    s2 = svc.ApiService(store, lambda uid: "plus", pepper="segredo", today=lambda: TODAY)
    with pytest.raises(ApiError):
        s2.authenticate(k["key"])


def test_store_failure_on_auth_is_503_not_500(env):
    s, store, *_ = env
    k = s.create_key("u1", "a")
    s._cache.clear()
    store.fail_get_hash = True
    with pytest.raises(ApiError) as e:
        s.authenticate(k["key"])
    assert e.value.status == 503 and code(e) == "api_unavailable"


def test_unconfigured_service_is_503(env):
    s, store, *_ = env
    store.enabled = False
    for fn in (lambda: s.list_keys("u1"), lambda: s.create_key("u1", "a"), lambda: s.authenticate(keylib.generate()), lambda: s.usage("u1")):
        with pytest.raises(ApiError) as e:
            fn()
        assert e.value.status == 503


# ── revogar e rotacionar ──
def test_revoke_kills_the_key_immediately_even_when_cached(env):
    s, *_ = env
    k = s.create_key("u1", "a")
    s.authenticate(k["key"])                                                         # entra no cache
    assert s.revoke("u1", k["id"]) == {"ok": True}
    with pytest.raises(ApiError) as e:
        s.authenticate(k["key"])
    assert e.value.status == 401 and s.list_keys("u1") == []


def test_cannot_revoke_someone_elses_key(env):
    s, *_ = env
    k = s.create_key("u1", "a")
    with pytest.raises(ApiError) as e:
        s.revoke("u2", k["id"])
    assert e.value.status == 404 and code(e) == "key_not_found"
    assert s.authenticate(k["key"])["uid"] == "u1"
    with pytest.raises(ApiError):
        s.rotate("u2", k["id"])


def test_rotate_replaces_the_key_and_keeps_the_name_and_slot(env):
    s, *_ = env
    k = s.create_key("u1", "Produção")
    s.authenticate(k["key"])
    n = s.rotate("u1", k["id"])
    assert n["key"] != k["key"] and n["name"] == "Produção" and n["id"] != k["id"]
    assert s.authenticate(n["key"])["uid"] == "u1"
    with pytest.raises(ApiError):
        s.authenticate(k["key"])                                                     # a antiga morreu
    assert len(s.list_keys("u1")) == 1


def test_rotate_works_even_at_the_key_limit(env):
    s, *_ = env
    cap = plans.PLANS["plus"].api_max_keys
    made = [s.create_key("u1", f"k{i}") for i in range(cap)]
    n = s.rotate("u1", made[0]["id"])
    assert len(s.list_keys("u1")) == cap and s.authenticate(n["key"])


# ── plano ──
def test_leaving_the_plan_stops_the_keys_without_deleting_them(env, no_api_plan):
    s, _, _, plan, _ = env
    k = s.create_key("u1", "a")
    who = s.authenticate(k["key"])
    plan["v"] = "free"
    with pytest.raises(ApiError) as e:
        s.begin(who["uid"], who["key_id"])
    assert e.value.status == 403 and code(e) == "plan_required"
    plan["v"] = "plus"
    assert s.begin(who["uid"], who["key_id"])["used"] == 1                           # voltou: a mesma chave volta a valer


# ── limite por minuto ──
def test_rate_limit_per_minute_with_retry_after_and_window_slides(env):
    s, _, clock, *_ = env
    for i in range(3):
        assert s.begin("u1", "kA")["used"] == i + 1
    with pytest.raises(ApiError) as e:
        s.begin("u1", "kA")
    assert e.value.status == 429 and code(e) == "rate_limited" and 1 <= e.value.retry_after <= 61
    assert s.usage("u1")["used"] == 3                                                # a recusada não gasta cota
    clock.t += 61
    assert s.begin("u1", "kA")["used"] == 4


def test_rate_limit_is_per_key(env):
    s, *_ = env
    for _ in range(3):
        s.begin("u1", "kA")
    assert s.begin("u1", "kB")["used"] == 4


# ── cota mensal ──
def test_monthly_quota_blocks_then_resets_next_month(env):
    s, store, clock, _, today = env
    for i in range(5):
        s.begin("u1", "k"); clock.t += 61                                           # fora da janela de 1 min
    with pytest.raises(ApiError) as e:
        s.begin("u1", "k")
    assert e.value.status == 429 and code(e) == "quota_exceeded"
    today["d"] = dt.date(2026, 12, 1)
    assert s.begin("u1", "k")["used"] == 1
    assert store.usage["u1"]["month"] == "2026-12"


def test_refund_returns_one_request(env):
    s, store, *_ = env
    s.begin("u1", "k"); s.begin("u1", "k")
    s.refund("u1", "k")
    assert s.usage("u1")["used"] == 1 and store.usage["u1"]["count"] == 1
    s.refund("u1", "k"); s.refund("u1", "k")                                         # nunca fica negativo
    assert s.usage("u1")["used"] == 0 and store.usage["u1"]["count"] >= 0


def test_monthly_count_survives_a_restart(env):
    s, store, *_ = env
    s.begin("u1", "k"); s.begin("u1", "k")
    s2 = svc.ApiService(store, lambda uid: "plus", today=lambda: TODAY, pepper="")
    assert s2.usage("u1")["used"] == 2


def test_first_use_creates_the_usage_document_with_the_month(env):
    s, store, *_ = env
    s.begin("u1", "k")
    assert store.usage["u1"] == {"month": "2026-11", "count": 1}


def test_usage_for_a_plan_without_api_shows_no_api(env, no_api_plan):
    s, _, _, plan, _ = env
    plan["v"] = "free"
    u = s.usage("u1")
    assert u["api"] is False and u["limit"] == 0 and u["used"] == 0 and u["max_keys"] == 0 and u["plan"] == "free"


def test_usage_for_free_shows_its_small_quota(env):
    s, _, _, plan, _ = env
    plan["v"] = "free"
    f = plans.PLANS["free"]
    u = s.usage("u1")
    assert u["api"] is True and u["limit"] == f.api_monthly and u["per_minute"] == f.api_per_minute and u["max_keys"] == 1


def test_usage_fields(env):
    s, *_ = env
    s.begin("u1", "k")
    assert s.usage("u1") == {"plan": "plus", "plan_name": "ORION PLUS", "api": True, "month": "2026-11", "used": 1, "limit": 5,
                             "per_minute": 3, "resets_on": "2026-12-01", "max_keys": plans.PLANS["plus"].api_max_keys}
