"""FirestoreStore: formato das chamadas REST (requests simulado, sem rede)."""
import pytest

from billing import store as st


class Admin:
    enabled = True
    def headers(self): return {"Authorization": "Bearer srv"}


class R:
    def __init__(self, status=200, js=None):
        self.status_code, self._js = status, js if js is not None else {}
    def json(self): return self._js
    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"http {self.status_code}")


@pytest.fixture
def fs(monkeypatch):
    calls = []
    resp = {"next": R()}
    def make(name):
        def f(url, **kw):
            calls.append((name, url, kw))
            return resp["next"]
        return f
    for n in ("get", "patch", "post"):
        monkeypatch.setattr(st.requests, n, make(n))
    return st.FirestoreStore(Admin(), "proj"), calls, resp


def test_encode_decode_roundtrip():
    for v in ("texto", 42, True, False, None, ""):
        assert st._dec(st._enc(v)) == v
    assert st._enc(1990) == {"integerValue": "1990"} and st._enc(True) == {"booleanValue": True}


def test_get_returns_none_on_404_and_decodes_fields(fs):
    store, calls, resp = fs
    resp["next"] = R(404)
    assert store.get_state("u1") is None
    resp["next"] = R(200, {"fields": {"plan": {"stringValue": "plus"}, "n": {"integerValue": "3"}}})
    assert store.get_plan("u1") == {"plan": "plus", "n": 3}
    assert calls[-1][1].endswith("/documents/plans/u1") and calls[-1][2]["headers"]["Authorization"] == "Bearer srv"


def test_set_plan_patches_only_plan_and_until(fs):
    store, calls, _ = fs
    store.set_plan("u1", "pro", "2026-12-12")
    name, url, kw = calls[-1]
    assert name == "patch" and url.endswith("/documents/plans/u1")
    assert kw["params"] == [("updateMask.fieldPaths", "plan"), ("updateMask.fieldPaths", "until")]
    assert kw["json"] == {"fields": {"plan": {"stringValue": "pro"}, "until": {"stringValue": "2026-12-12"}}}


def test_uid_cannot_escape_the_document_path(fs):
    store, calls, _ = fs
    store.set_state("../users/outro", {"status": "x"})
    assert "/documents/billing_state/..%2Fusers%2Foutro" in calls[-1][1]
    store.get_index("pre_a/b")
    assert "pre_a%2Fb" in calls[-1][1]


def test_add_tx_is_created_once(fs):
    store, calls, resp = fs
    assert store.add_tx("u1", "ap_1", {"kind": "charge", "amount_cents": 1990}) is True
    name, url, kw = calls[-1]
    assert name == "post" and url.endswith("/documents/billing_state/u1/tx") and kw["params"] == {"documentId": "ap_1"}
    resp["next"] = R(409)
    assert store.add_tx("u1", "ap_1", {"kind": "charge"}) is False          # webhook repetido
    resp["next"] = R(500)
    with pytest.raises(RuntimeError):
        store.add_tx("u1", "ap_2", {"kind": "charge"})                      # erro de verdade sobe (o webhook devolve 5xx e é reenviado)


def test_list_tx_orders_newest_first_and_extracts_ids(fs):
    store, calls, resp = fs
    resp["next"] = R(200, {"documents": [{"name": "projects/p/databases/(default)/documents/billing_state/u1/tx/ap_2",
                                          "fields": {"kind": {"stringValue": "charge"}}}]})
    out = store.list_tx("u1", 5)
    assert out == [{"kind": "charge", "id": "ap_2"}]
    assert calls[-1][2]["params"] == {"pageSize": 5, "orderBy": "ts desc"}
    resp["next"] = R(404)
    assert store.list_tx("u1") == []


def test_enabled_follows_admin():
    class Off: enabled = False
    assert st.FirestoreStore(Admin(), "p").enabled and not st.FirestoreStore(Off(), "p").enabled
