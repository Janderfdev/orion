"""Regras do faturamento (billing/service.py) com provedor e store FALSOS: nada de rede, nada de Firestore."""
import datetime as dt
from dataclasses import replace

import pytest

from billing import plans, service
from billing.provider import InvalidSignature, PaymentProvider, ProviderError

TODAY = dt.date(2026, 11, 9)


class FakeProvider(PaymentProvider):
    """Faz o papel do Mercado Pago. `subs`, `aps` e `pays` são o 'estado real' no provedor."""
    name = "fake"

    def __init__(self):
        self.subs, self.aps, self.pays = {}, {}, {}
        self.created, self.cancelled, self.fail_create, self.fail_cancel = [], [], False, False
        self.valid = True

    def configured(self): return True

    def create_subscription(self, *, email, reason, amount_cents, external_reference, back_url, idempotency_key):
        if self.fail_create:
            raise ProviderError("recusou", 400)
        sid = f"sub{len(self.created) + 1}"
        self.created.append({"id": sid, "email": email, "amount_cents": amount_cents, "ref": external_reference, "back_url": back_url})
        return {"id": sid, "checkout_url": f"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id={sid}"}

    def get_subscription(self, sid): return self.subs[sid]
    def get_authorized_payment(self, i): return self.aps[i]
    def get_payment(self, i): return self.pays[i]

    def cancel_subscription(self, sid):
        if self.fail_cancel:
            raise ProviderError("falhou")
        self.cancelled.append(sid)

    def verify_webhook(self, headers, query, body):
        if not self.valid:
            raise InvalidSignature("x")
        return {"topic": query["type"], "data_id": query["data.id"], "event_id": "e"}


class MemStore:
    enabled = True

    def __init__(self):
        self.idx, self.state, self.plan, self.tx = {}, {}, {}, {}

    def get_index(self, k): return self.idx.get(k)
    def set_index(self, k, d): self.idx.setdefault(k, {}).update(d)
    def get_state(self, u): return self.state.get(u)
    def set_state(self, u, d): self.state.setdefault(u, {}).update(d)
    def get_plan(self, u): return self.plan.get(u)
    def set_plan(self, u, p, until): self.plan[u] = {"plan": p, "until": until}

    def add_tx(self, u, i, d):
        if (u, i) in self.tx:
            return False
        self.tx[(u, i)] = d
        return True

    def list_tx(self, u, limit=20):
        return [dict(v, id=k[1]) for k, v in self.tx.items() if k[0] == u][:limit]


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setitem(plans.PLANS, "plus", replace(plans.PLANS["plus"], price_cents=1990))
    monkeypatch.setitem(plans.PLANS, "pro", replace(plans.PLANS["pro"], price_cents=4990))
    prov, store, changed = FakeProvider(), MemStore(), []
    b = service.Billing(prov, store, on_plan_change=changed.append, today=lambda: TODAY, grace_days=3)
    return b, prov, store, changed


def sub(status="authorized", cents=1990, nxt="2026-12-09T10:00:00.000-03:00", cur="BRL"):
    return {"id": "x", "status": status, "amount_cents": cents, "currency": cur, "next_payment_date": nxt,
            "external_reference": "", "payer_email": ""}


def checkout(b, uid="u1", plan="plus", email="a@b.com"):
    return b.checkout(uid, email, plan)


def webhook(b, topic, data_id):
    return b.handle_webhook({}, {"type": topic, "data.id": data_id}, {})


# ── checkout ──
def test_checkout_records_expected_amount_and_returns_provider_url(env):
    b, prov, store, _ = env
    out = checkout(b)
    assert out["plan"] == "plus" and out["checkout_url"].startswith("https://www.mercadopago.com.br/")
    assert prov.created[0]["amount_cents"] == 1990 and prov.created[0]["email"] == "a@b.com"
    assert store.idx["pre_sub1"] == {"uid": "u1", "plan": "plus", "amount_cents": 1990, "ref": prov.created[0]["ref"]}
    assert store.plan == {}                                   # NADA muda de plano só por abrir o checkout


@pytest.mark.parametrize("plan", ["free", "ultra", "admin", "", None])
def test_checkout_rejects_free_unpriced_and_unknown_plans(env, plan):
    b, *_ = env                                               # ultra não tem preço no fixture
    with pytest.raises(service.BillingError) as e:
        b.checkout("u1", "a@b.com", plan)
    assert e.value.status == 400 and e.value.code == "plan_unavailable"


def test_checkout_needs_email_and_configuration(env):
    b, prov, store, _ = env
    with pytest.raises(service.BillingError) as e:
        b.checkout("u1", "", "plus")
    assert e.value.code == "email_required"
    store.enabled = False
    with pytest.raises(service.BillingError) as e:
        checkout(b)
    assert e.value.status == 503


def test_provider_failure_becomes_502_and_leaves_no_trace(env):
    b, prov, store, _ = env
    prov.fail_create = True
    with pytest.raises(service.BillingError) as e:
        checkout(b)
    assert e.value.status == 502 and store.idx == {}


def test_checkout_rate_limit(env):
    b, *_ = env
    for _ in range(service.MAX_CHECKOUTS_PER_HOUR):
        checkout(b)
    with pytest.raises(service.BillingError) as e:
        checkout(b)
    assert e.value.status == 429
    checkout(b, uid="outro")                                  # o limite é por usuário


def test_cannot_resubscribe_to_the_same_active_plan(env):
    b, prov, store, _ = env
    checkout(b)
    prov.subs["sub1"] = sub()
    webhook(b, "subscription_preapproval", "sub1")
    with pytest.raises(service.BillingError) as e:
        checkout(b)
    assert e.value.status == 409 and e.value.code == "already_subscribed"


# ── ativação ──
def test_activation_requires_provider_confirmation_and_extends_until(env):
    b, prov, store, changed = env
    checkout(b)
    prov.subs["sub1"] = sub("authorized")
    res = webhook(b, "subscription_preapproval", "sub1")
    assert res == {"topic": "subscription_preapproval", "handled": True}
    assert store.plan["u1"] == {"plan": "plus", "until": "2026-12-12"}       # próxima cobrança 09/12 + 3 dias de carência
    assert store.state["u1"]["status"] == "authorized" and store.state["u1"]["provider_id"] == "sub1"
    assert changed == ["u1"]


def test_pending_subscription_does_not_activate(env):
    b, prov, store, changed = env
    checkout(b)
    prov.subs["sub1"] = sub("pending")
    assert webhook(b, "subscription_preapproval", "sub1")["handled"] is False
    assert store.plan == {} and changed == []


@pytest.mark.parametrize("bad", [dict(cents=1), dict(cents=0), dict(cents=199000), dict(cents=None), dict(cur="USD"), dict(cur="")])
def test_amount_or_currency_mismatch_never_activates(env, bad):
    b, prov, store, changed = env
    checkout(b)
    prov.subs["sub1"] = sub(**bad)
    assert webhook(b, "subscription_preapproval", "sub1")["handled"] is False
    assert store.plan == {} and changed == []


def test_unknown_subscription_is_ignored(env):
    b, prov, store, changed = env
    prov.subs["zzz"] = sub()
    assert webhook(b, "subscription_preapproval", "zzz")["handled"] is False
    assert store.plan == {} and changed == []


def test_webhook_body_cannot_choose_the_plan(env):
    b, prov, store, _ = env
    checkout(b, plan="plus")
    prov.subs["sub1"] = sub()
    b.handle_webhook({}, {"type": "subscription_preapproval", "data.id": "sub1"}, {"plan": "ultra", "uid": "hacker", "status": "authorized"})
    assert store.plan == {"u1": {"plan": "plus", "until": "2026-12-12"}}


def test_missing_next_payment_date_uses_a_month_plus_grace(env):
    b, prov, store, _ = env
    checkout(b)
    prov.subs["sub1"] = sub(nxt="")
    webhook(b, "subscription_preapproval", "sub1")
    assert store.plan["u1"]["until"] == (TODAY + dt.timedelta(days=31 + 3)).isoformat()


def test_same_webhook_twice_is_harmless(env):
    b, prov, store, _ = env
    checkout(b)
    prov.subs["sub1"] = sub()
    webhook(b, "subscription_preapproval", "sub1")
    first = dict(store.plan["u1"])
    webhook(b, "subscription_preapproval", "sub1")
    assert store.plan["u1"] == first


# ── cobranças: renovação e recusa ──
def authorize(b, prov):
    checkout(b)
    prov.subs["sub1"] = sub()
    webhook(b, "subscription_preapproval", "sub1")


def test_approved_charge_is_recorded_once_and_renewal_extends(env):
    b, prov, store, _ = env
    authorize(b, prov)
    prov.aps["ap1"] = {"id": "ap1", "subscription_id": "sub1", "status": "processed", "amount_cents": 1990, "payment_id": "pay1", "payment_status": "approved"}
    prov.subs["sub1"] = sub(nxt="2027-01-09T10:00:00.000-03:00")             # o provedor já agendou a cobrança seguinte
    webhook(b, "subscription_authorized_payment", "ap1")
    webhook(b, "subscription_authorized_payment", "ap1")                     # repetido
    assert store.plan["u1"]["until"] == "2027-01-12"
    charges = [t for t in store.tx.values() if t["kind"] == "charge"]
    assert len(charges) == 1 and charges[0]["amount_cents"] == 1990 and charges[0]["status"] == "approved"
    assert store.idx["pay_pay1"]["uid"] == "u1"


def test_rejected_charge_is_recorded_and_does_not_extend(env):
    b, prov, store, _ = env
    authorize(b, prov)
    prov.aps["ap2"] = {"id": "ap2", "subscription_id": "sub1", "status": "processed", "amount_cents": 1990, "payment_id": "", "payment_status": "rejected"}
    webhook(b, "subscription_authorized_payment", "ap2")
    assert store.plan["u1"]["until"] == "2026-12-12"                          # igual a antes: sem renovação o plano vai vencer
    assert [t["kind"] for t in store.tx.values()] == ["charge_failed"]


def test_charge_of_unknown_subscription_is_ignored(env):
    b, prov, store, _ = env
    prov.aps["ap9"] = {"id": "ap9", "subscription_id": "naoexiste", "status": "processed", "amount_cents": 1, "payment_id": "p", "payment_status": "approved"}
    assert webhook(b, "subscription_authorized_payment", "ap9")["handled"] is False
    assert store.tx == {} and store.plan == {}


def test_expired_plan_falls_back_to_free_in_me(env):
    b, prov, store, _ = env
    authorize(b, prov)
    assert b.me("u1")["plan"] == "plus"
    b2 = service.Billing(prov, store, today=lambda: dt.date(2026, 12, 13))     # um dia depois do 'until'
    assert b2.me("u1")["plan"] == "free"


# ── cancelamento ──
def test_cancel_keeps_access_until_period_end(env):
    b, prov, store, _ = env
    authorize(b, prov)
    out = b.cancel("u1")
    assert prov.cancelled == ["sub1"] and out == {"ok": True, "access_until": "2026-12-12"}
    me = b.me("u1")
    assert me["plan"] == "plus" and me["cancel_at_period_end"] is True and me["subscription"] == "cancelled"


def test_cancel_without_subscription_or_twice(env):
    b, prov, store, _ = env
    with pytest.raises(service.BillingError) as e:
        b.cancel("u1")
    assert e.value.status == 409
    authorize(b, prov)
    b.cancel("u1")
    with pytest.raises(service.BillingError):
        b.cancel("u1")


def test_cancel_provider_failure_keeps_subscription_state(env):
    b, prov, store, _ = env
    authorize(b, prov)
    prov.fail_cancel = True
    with pytest.raises(service.BillingError) as e:
        b.cancel("u1")
    assert e.value.status == 502 and store.state["u1"]["status"] == "authorized"


def test_cancelled_webhook_updates_state_but_not_the_paid_period(env):
    b, prov, store, _ = env
    authorize(b, prov)
    prov.subs["sub1"] = sub("cancelled")
    webhook(b, "subscription_preapproval", "sub1")
    assert store.state["u1"]["status"] == "cancelled" and store.plan["u1"]["until"] == "2026-12-12"


# ── troca de plano ──
def test_changing_plan_cancels_the_old_subscription(env):
    b, prov, store, _ = env
    authorize(b, prov)                                                         # plus (sub1)
    checkout(b, plan="pro")                                                    # sub2
    prov.subs["sub2"] = sub(cents=4990)
    webhook(b, "subscription_preapproval", "sub2")
    assert prov.cancelled == ["sub1"]
    assert store.plan["u1"]["plan"] == "pro" and store.state["u1"]["provider_id"] == "sub2"
    prov.subs["sub1"] = sub("cancelled")                                       # o webhook do cancelamento antigo chega depois
    webhook(b, "subscription_preapproval", "sub1")
    assert store.state["u1"]["status"] == "authorized" and store.plan["u1"]["plan"] == "pro"


# ── reembolso ──
def test_refund_removes_plan_and_cancels_subscription(env):
    b, prov, store, changed = env
    authorize(b, prov)
    prov.aps["ap1"] = {"id": "ap1", "subscription_id": "sub1", "status": "processed", "amount_cents": 1990, "payment_id": "pay1", "payment_status": "approved"}
    webhook(b, "subscription_authorized_payment", "ap1")
    changed.clear()
    prov.pays["pay1"] = {"id": "pay1", "status": "refunded", "amount_cents": 1990}
    assert webhook(b, "payment", "pay1")["handled"] is True
    assert store.plan["u1"] == {"plan": "free", "until": ""} and prov.cancelled == ["sub1"] and changed == ["u1"]
    assert any(t["kind"] == "refund" for t in store.tx.values())


def test_refund_still_revokes_when_cancel_at_provider_fails(env):
    b, prov, store, _ = env
    authorize(b, prov)
    prov.aps["ap1"] = {"id": "ap1", "subscription_id": "sub1", "status": "processed", "amount_cents": 1990, "payment_id": "pay1", "payment_status": "approved"}
    webhook(b, "subscription_authorized_payment", "ap1")
    prov.fail_cancel = True
    prov.pays["pay1"] = {"id": "pay1", "status": "charged_back", "amount_cents": 1990}
    webhook(b, "payment", "pay1")
    assert store.plan["u1"]["plan"] == "free"


def test_approved_or_unknown_payment_does_not_touch_plans(env):
    b, prov, store, _ = env
    authorize(b, prov)
    before = dict(store.plan["u1"])
    prov.pays["p1"] = {"id": "p1", "status": "approved", "amount_cents": 1990}
    prov.pays["p2"] = {"id": "p2", "status": "refunded", "amount_cents": 1990}      # nunca registramos esse pagamento
    assert webhook(b, "payment", "p1")["handled"] is False
    assert webhook(b, "payment", "p2")["handled"] is False
    assert store.plan["u1"] == before


# ── segurança do webhook ──
def test_invalid_signature_changes_nothing(env):
    b, prov, store, changed = env
    checkout(b)
    prov.subs["sub1"] = sub()
    prov.valid = False
    with pytest.raises(InvalidSignature):
        webhook(b, "subscription_preapproval", "sub1")
    assert store.plan == {} and changed == []


def test_unknown_topics_are_ignored(env):
    b, *_ = env
    assert webhook(b, "merchant_order", "1") == {"topic": "merchant_order", "handled": False}


def test_provider_error_while_processing_propagates_so_mp_retries(env):
    b, prov, store, _ = env
    checkout(b)                                                                  # sub1 existe no índice, mas não no provedor
    with pytest.raises(KeyError):
        webhook(b, "subscription_preapproval", "sub1")


# ── histórico ──
def test_me_lists_history_without_internal_fields(env):
    b, prov, store, _ = env
    authorize(b, prov)
    prov.aps["ap1"] = {"id": "ap1", "subscription_id": "sub1", "status": "processed", "amount_cents": 1990, "payment_id": "pay1", "payment_status": "approved"}
    webhook(b, "subscription_authorized_payment", "ap1")
    me = b.me("u1")
    assert set(me["transactions"][0]) == {"kind", "status", "amount_cents", "currency", "plan", "ts"}
    assert b.me("quem-nunca-pagou")["plan"] == "free" and b.me("quem-nunca-pagou")["subscription"] == "none"
