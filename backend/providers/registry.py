"""Testes do Tool Registry V5.0 (sem rede: nenhuma ferramenta externa é chamada de verdade)."""
import pytest

from core import tools


# ── validate_args ──
@pytest.mark.parametrize("name,args", [
    ("calcular", {"expressao": "2+2"}),
    ("data_hora", {}),
    ("clima", {"cidade": "Fortaleza"}),
    ("pesquisar_wikipedia", {"consulta": "Órion"}),
])
def test_validate_accepts_good_args(name, args):
    assert tools.validate_args(name, args) is None


@pytest.mark.parametrize("name,args", [
    ("calcular", {"expressao": 5}),              # tipo errado
    ("calcular", {"expressao": True}),           # bool não é texto
    ("calcular", {"x": "1"}),                    # inesperado
    ("calcular", {}),                            # falta obrigatório
    ("calcular", {"expressao": "   "}),          # vazio
    ("calcular", {"expressao": "1" * 201}),      # acima do limite da ferramenta
    ("clima", {"cidade": "a" * 121}),
    ("clima", ["Fortaleza"]),                    # não é objeto
    ("data_hora", {"extra": 1}),                 # ferramenta sem parâmetros
    ("apagar_tudo", {}),                         # não existe
])
def test_validate_rejects_bad_args(name, args):
    assert isinstance(tools.validate_args(name, args), str)


# ── execute: validação, mensagens seguras ──
def test_execute_valid():
    assert tools.execute("calcular", {"expressao": "2+2"}) == "4"
    assert tools.execute("calcular", {"expressao": "10/4"}) == "2.5"
    assert tools.execute("calcular", {"expressao": "4/2"}) == "2"


def test_execute_none_args_means_empty():
    assert "horário de Brasília" in tools.execute("data_hora", None)


@pytest.mark.parametrize("name,args", [
    ("calcular", {"expressao": 5}), ("calcular", {"x": "1"}), ("calcular", {}),
    ("calcular", {"expressao": "1" * 301}), ("clima", ["Fortaleza"]),
])
def test_execute_rejects_bad_args(name, args):
    assert tools.execute(name, args).startswith("Erro ao executar")


def test_execute_unknown_tool():
    assert tools.execute("apagar_tudo", {}).startswith("Ferramenta desconhecida")


@pytest.mark.parametrize("expr,frag", [
    ("__import__('os')", "não suportada"),
    ("1/0", "Divisão por zero"),
    ("sqrt(-1)", "inválida"),
    ("2+", "inválida"),
    ("9**9**9", "grande"),
    ("sqrt(1,2)", "inválida"),
    pytest.param("(" * 500 + "1" + ")" * 500, "Erro ao executar", id="aninhamento-profundo"),   # nunca levanta exceção
])
def test_calculator_errors_are_safe_messages(expr, frag):
    out = tools.execute("calcular", {"expressao": expr})
    assert out.startswith("Erro ao executar calcular") and frag in out


def test_execute_does_not_leak_internal_errors(monkeypatch):
    def boom(cidade):
        raise RuntimeError("SEGREDO-INTERNO https://x?key=abc")
    monkeypatch.setitem(tools._BY_NAME["clima"], "fn", boom)
    out = tools.execute("clima", {"cidade": "Fortaleza"})
    assert out == "Erro ao executar clima: falha interna."
    assert "SEGREDO" not in out and "key=abc" not in out


def test_execute_network_error_is_generic(monkeypatch):
    def down(cidade):
        raise tools.requests.ConnectionError("https://api?key=SECRET")
    monkeypatch.setitem(tools._BY_NAME["clima"], "fn", down)
    out = tools.execute("clima", {"cidade": "Fortaleza"})
    assert "SECRET" not in out and "não respondeu" in out


# ── metadados e especificação enviada ao modelo ──
def test_every_tool_has_safe_metadata():
    for t in tools.TOOLS:
        m = tools.meta(t["name"])
        assert m["permission"] == "read" and m["sensitive"] is False and m["timeout"] > 0


def test_meta_unknown_is_none():
    assert tools.meta("nao_existe") is None


def test_specs_expose_only_name_description_schema():
    # Gemini/Claude só devem receber estes 3 campos (metadados internos não vão ao provedor)
    for s in tools.specs():
        assert set(s) == {"name", "description", "input_schema"}
