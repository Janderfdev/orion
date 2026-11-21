"""V5.5.0: checkout DENTRO do ORION: cartão por token e Pix (provedor e store falsos: nada de rede)."""
import datetime as dt
from dataclasses import replace

import pytest

from billing import plans, service
from billing.provider import ProviderError
from test_billing_service import FakeProvider, MemStore, TODAY, sub, webhook


class Prov(FakeProvider):
    def __init__(self):
        super().__init__()
        self.cards, self.pix, self.fail_card = [], [], None
        self.pk = "TEST-pk"

    def public_key(self): return self.pk

    def create_card_subscription(self, *, email, reason, amount_cents, external_reference, back_url, card_token, idempotency_key):
        if self.fail_card:
            raise ProviderError("recusou", self.fail_card)
        sid = f"sub{len(self.cards) + 1}"
        self.cards.append({"id": sid, "email": email, "amount_cents": amount_cents, "token": card_token})
        return {"id": sid, "status": "authorized"}

    def create_pix_payment(self, *, email, description, amount_cents, external_reference, idempotency_key, expires_minutes=30):
        pid = str(1000 + len(self.pix))
        self.pix.append({"id": pid, "email": email, "amount_cents": amount_cents})
        return {"id": pid, "qr_code": "000201PIX", "qr_code_base64": "QUJD", "expires": "2026-11-09T12:30:00.000+00:00"}


@pytest.fixture
def env(monkeypatch):
    for p, c in (("plus", 1990), ("pro", 4990), ("ultra", 9990)):
        monkeypatch.setitem(plans.PLANS, p, replace(plans.PLANS[p], price_cents=c))
    prov, store, changed = Prov(), MemStore(), []
    return service.Billing(prov, store, on_plan_change=changed.append, today=lambda: TODAY, grace_days=3), prov, store, changed


TOKEN = "e3ed6f098462036dd2cbabe314b9de2a"


def pay(status="approved", cents=1990): return {"id": "1000", "status": status, "amount_cents": cents}


# ── config ──
def test_config_exposes_only_the_public_key_and_methods(env):
    b, prov, *_ = env
    c = b.config()
    assert c["public_key"] == "TEST-pk" and c["card"] and c["pix"] and c["enabled"] and "token" not in str(c).lower().replace("public", "")
    prov.pk = ""
    assert b.config()["card"] is False and b.config()["public_key"] is None          # sem chave pública, só redirecionamento/Pix


# ── cartão ──
def test_card_subscription_activates_only_after_provider_confirms(env):
    b, prov, store, changed = env
    prov.subs["sub1"] = sub("authorized", 1990)
    out = b.subscribe_card("u1", "a@b.com", "plus", TOKEN)
    assert out == {"plan": "plus", "status": "active"} and prov.cards[0]["token"] == TOKEN and prov.cards[0]["amount_cents"] == 1990
    assert store.plan["u1"]["plan"] == "plus" and store.idx["pre_sub1"]["amount_cents"] == 1990 and changed == ["u1"]


def test_card_pending_does_not_grant_the_plan(env):
    b, prov, store, _ = env
    prov.subs["sub1"] = sub("pending", 1990)
    assert b.subscribe_card("u1", "a@b.com", "plus", TOKEN) == {"plan": "plus", "status": "pending"}
    assert store.plan == {}


def test_card_amount_mismatch_never_grants(env):
    b, prov, store, _ = env
    prov.subs["sub1"] = sub("authorized", 1)                                          # o provedor diz outro valor: ignorado
    assert b.subscribe_card("u1", "a@b.com", "plus", TOKEN)["status"] == "pending" and store.plan == {}


def test_card_refused_is_402_and_leaves_no_trace(env):
    b, prov, store, _ = env
    prov.fail_card = 400
    with pytest.raises(service.BillingError) as e:
        b.subscribe_card("u1", "a@b.com", "plus", TOKEN)
    assert (e.value.status, e.value.code) == (402, "card_refused") and store.idx == {} and store.plan == {}
    prov.fail_card = 500
    with pytest.raises(service.BillingError) as e:
        b.subscribe_card("u1", "a@b.com", "plus", TOKEN)
    assert (e.value.status, e.value.code) == (502, "provider_error")


def test_card_input_validation(env):
    b, *_ = env
    for bad in ("", "curto", "x" * 201, "com espaço aqui", None, 5):
        with pytest.raises(service.BillingError) as e:
            b.subscribe_card("u1", "a@b.com", "plus", bad)
        assert e.value.code == "card_token_invalid"
    for plan in ("free", "admin", None):
        with pytest.raises(service.BillingError) as e:
            b.subscribe_card("u1", "a@b.com", plan, TOKEN)
        assert e.value.code == "plan_unavailable"
    with pytest.raises(service.BillingError) as e:
        b.subscribe_card("u1", "", "plus", TOKEN)
    assert e.value.code == "email_required"


def test_ultra_can_be_subscribed_by_card(env):
    b, prov, store, _ = env
    prov.subs["sub1"] = sub("authorized", 9990)
    assert b.subscribe_card("u1", "a@b.com", "ultra", TOKEN)["status"] == "active" and store.plan["u1"]["plan"] == "ultra"


def test_card_attempts_are_rate_limited(env):
    b, prov, store, _ = env
    prov.fail_card = None
    for i in range(service.MAX_CHECKOUTS_PER_HOUR):
        prov.subs[f"sub{i + 1}"] = sub("pending", 1990)
        b.subscribe_card("u1", "a@b.com", "plus", TOKEN)
    with pytest.raises(service.BillingError) as e:
        b.subscribe_card("u1", "a@b.com", "plus", TOKEN)
    assert e.value.status == 429


# ── Pix ──
def test_pix_creation_records_expected_amount_and_changes_nothing(env):
    b, prov, store, changed = env
    out = b.create_pix("u1", "a@b.com", "pro")
    assert out["qr_code"] == "000201PIX" and out["amount_cents"] == 4990 and out["plan"] == "pro" and out["days"] == service.PIX_DAYS
    assert store.idx["pix_1000"]["amount_cents"] == 4990 and store.plan == {} and changed == []


def test_pix_approved_grants_plan_once_for_31_days(env):
    b, prov, store, changed = env
    b.create_pix("u1", "a@b.com", "plus")
    prov.pays["1000"] = pay("pending")
    assert b.pix_status("u1", "1000") == {"status": "pending", "plan": "plus"} and store.plan == {}
    prov.pays["1000"] = pay("approved")
    assert b.pix_status("u1", "1000")["status"] == "approved"
    assert store.plan["u1"] == {"plan": "plus", "until": (TODAY + dt.timedelta(days=service.PIX_DAYS)).isoformat()}
    b.pix_status("u1", "1000"); webhook(b, "payment", "1000")                         # repetições (site + webhook) não estendem nem duplicam
    assert changed == ["u1"] and len([k for k in store.tx if k[1] == "pix_1000"]) == 1
    assert store.plan["u1"]["until"] == (TODAY + dt.timedelta(days=service.PIX_DAYS)).isoformat()


def test_pix_wrong_amount_or_failed_never_grants(env):
    b, prov, store, _ = env
    b.create_pix("u1", "a@b.com", "plus")
    prov.pays["1000"] = pay("approved", 1)
    assert b.pix_status("u1", "1000")["status"] == "failed" and store.plan == {}
    for st in ("rejected", "cancelled", "expired"):
        prov.pays["1000"] = pay(st)
        assert b.pix_status("u1", "1000")["status"] == "failed"
    assert store.plan == {}


def test_pix_status_is_private_and_validated(env):
    b, prov, *_ = env
    b.create_pix("u1", "a@b.com", "plus")
    prov.pays["1000"] = pay("approved")
    for uid, pid in (("u2", "1000"), ("u1", "9999"), ("u1", "abc"), ("u1", "../x"), ("u1", None)):
        with pytest.raises(service.BillingError) as e:
            b.pix_status(uid, pid)
        assert e.value.status == 404


def test_pix_provider_down_reports_pending_not_failure(env):
    b, prov, *_ = env
    b.create_pix("u1", "a@b.com", "plus")                                             # prov.pays vazio -> KeyError seria erro; simulamos queda real:
    prov.get_payment = lambda i: (_ for _ in ()).throw(ProviderError("fora do ar"))
    assert b.pix_status("u1", "1000")["status"] == "pending"


def test_pix_same_plan_renewal_adds_to_remaining_time(env):
    b, prov, store, _ = env
    left = TODAY + dt.timedelta(days=10)
    store.plan["u1"] = {"plan": "plus", "until": left.isoformat()}
    b.create_pix("u1", "a@b.com", "plus")
    prov.pays["1000"] = pay("approved")
    b.pix_status("u1", "1000")
    assert store.plan["u1"]["until"] == (left + dt.timedelta(days=service.PIX_DAYS)).isoformat()


def test_pix_blocked_with_active_subscription_or_lower_plan(env):
    b, prov, store, _ = env
    store.plan["u1"] = {"plan": "pro", "until": (TODAY + dt.timedelta(days=20)).isoformat()}
    with pytest.raises(service.BillingError) as e:
        b.create_pix("u1", "a@b.com", "plus")
    assert e.value.code == "plan_downgrade_blocked"
    store.state["u1"] = {"status": "authorized"}
    with pytest.raises(service.BillingError) as e:
        b.create_pix("u1", "a@b.com", "ultra")
    assert e.value.code == "already_subscribed"


def test_pix_refund_by_webhook_removes_the_plan(env):
    b, prov, store, changed = env
    b.create_pix("u1", "a@b.com", "plus")
    prov.pays["1000"] = pay("approved")
    webhook(b, "payment", "1000")
    assert store.plan["u1"]["plan"] == "plus"
    prov.pays["1000"] = pay("refunded")
    assert webhook(b, "payment", "1000")["handled"] and store.plan["u1"] == {"plan": "free", "until": ""} and changed[-1] == "u1"


def test_unknown_pix_payment_in_webhook_is_ignored(env):
    b, prov, store, _ = env
    prov.pays["777"] = pay("approved")
    assert webhook(b, "payment", "777")["handled"] is False and store.plan == {}
