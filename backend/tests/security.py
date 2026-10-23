import asyncio, datetime

import pytest

from core import tools
from memory import store


def go(coro):
    return asyncio.run(coro)


# ── S8: execute() valida argumentos e não vaza erros internos ──
def test_execute_valid_call():
    assert tools.execute("calcular", {"expressao": "2+2"}) == "4"


@pytest.mark.parametrize("name,args", [
    ("calcular", {"expressao": 5}),             # tipo errado
    ("calcular", {"x": "1"}),                   # argumento inesperado
    ("calcular", {}),                           # falta obrigatório
    ("calcular", {"expressao": "1" * 301}),     # longo demais
    ("clima", ["Fortaleza"]),                   # não é objeto
])
def test_execute_rejects_bad_args(name, args):
    out = tools.execute(name, args)
    assert out.startswith("Erro ao executar")


def test_execute_unknown_tool():
    assert tools.execute("apagar_tudo", {}).startswith("Ferramenta desconhecida")


def test_execute_does_not_leak_internal_errors(monkeypatch):
    def boom(cidade):
        raise RuntimeError("SEGREDO-INTERNO https://x?key=abc")
    monkeypatch.setitem(tools._BY_NAME["clima"], "fn", boom)
    out = tools.execute("clima", {"cidade": "Fortaleza"})
    assert out.startswith("Erro ao executar clima")
    assert "SEGREDO" not in out and "key=abc" not in out


def test_execute_keeps_our_own_messages():
    assert "não suportada" in tools.execute("calcular", {"expressao": "__import__('os')"})


# ── S7: gravações em ordem ──
class FakeResp:
    def raise_for_status(self):
        pass


def test_stale_flush_is_skipped(monkeypatch):
    monkeypatch.setattr(store, "USE_FIRESTORE", True)
    writes = []
    monkeypatch.setattr(store.requests, "patch", lambda *a, **k: writes.append(k["json"]) or FakeResp())
    m = store.Memory()
    v1 = m.stage("u", [{"user": "a", "reply": "b"}])
    v2 = m.stage("u", [])                      # "limpar histórico" logo depois
    m.flush("u", "tok", [{"user": "a", "reply": "b"}], v1)   # gravação antiga terminando depois
    assert writes == []                        # não desfaz a limpeza
    m.flush("u", "tok", [], v2)
    assert len(writes) == 1 and writes[0]["fields"]["history"]["stringValue"] == "[]"


def test_flush_without_version_still_writes(monkeypatch):
    monkeypatch.setattr(store, "USE_FIRESTORE", True)
    writes = []
    monkeypatch.setattr(store.requests, "patch", lambda *a, **k: writes.append(1) or FakeResp())
    m = store.Memory()
    m.stage("u", [])
    m.flush("u", "tok", [])
    assert writes == [1]


def test_flush_failure_does_not_raise(monkeypatch):
    monkeypatch.setattr(store, "USE_FIRESTORE", True)

    def fail(*a, **k):
        raise store.requests.ConnectionError("fora do ar")
    monkeypatch.setattr(store.requests, "patch", fail)
    m = store.Memory()
    v = m.stage("u", [])
    m.flush("u", "tok", [], v)                 # só registra aviso; o cache local segue valendo
    assert m.load("u", "tok") == []


# ── S7: duas perguntas simultâneas do mesmo usuário não se apagam ──
def test_concurrent_asks_same_user_keep_both_turns():
    from core.orchestrator import Orchestrator

    class Mem:
        def __init__(self):
            self.h = {}
        def load(self, uid, token): return list(self.h.get(uid, []))
        def stage(self, uid, h): self.h[uid] = h
        def flush(self, uid, token, h, *a): pass

    class Prov:
        async def generate(self, system, messages, tools=None, execute=None):
            await asyncio.sleep(0.05)
            return "ok " + messages[-1]["content"]

    async def run():
        mem = Mem()
        o = Orchestrator(mem)
        await asyncio.gather(o.ask("um", "u", "t", Prov()), o.ask("dois", "u", "t", Prov()))
        return mem.h["u"]

    hist = go(run())
    assert sorted(t["user"] for t in hist) == ["dois", "um"]


# ── S3: limite de contas diferentes por dia ──
def test_daily_user_cap(monkeypatch):
    import main
    monkeypatch.setattr(main, "MAX_DAILY_USERS", 2)
    monkeypatch.setattr(main, "_seen", {"day": datetime.date.today(), "uids": set()})
    assert main._user_ok("a") and main._user_ok("b")
    assert main._user_ok("a")                  # quem já usou hoje continua passando
    assert not main._user_ok("c")              # terceira conta nova: barrada


def test_daily_user_cap_zero_means_unlimited(monkeypatch):
    import main
    monkeypatch.setattr(main, "MAX_DAILY_USERS", 0)
    monkeypatch.setattr(main, "_seen", {"day": datetime.date.today(), "uids": set()})
    assert all(main._user_ok(f"u{i}") for i in range(50))


def test_rate_map_is_pruned(monkeypatch):
    import main
    from collections import deque
    monkeypatch.setattr(main, "PRUNE_AT", 3)
    monkeypatch.setattr(main, "_hits", {f"old{i}": deque() for i in range(5)})
    assert main._rate_ok("novo")
    assert list(main._hits) == ["novo"]
