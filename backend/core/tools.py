"""Ferramentas do ORION (tool calling).

São funções Python comuns. O modelo recebe a lista (nome + descrição + parâmetros)
e DECIDE sozinho quando chamar cada uma. Todas são somente-leitura.
Para criar uma ferramenta nova: escreva a função e adicione-a em TOOLS.
"""
import ast, contextvars, datetime as dt, math, operator
from urllib.parse import quote

import requests

HEADERS = {"User-Agent": "ORION-AI/4.0 (https://janderfdev.github.io/orion)"}
TIMEOUT = 8

# ── fontes consultadas nesta pergunta (cada pergunta tem a sua lista, mesmo com várias ao mesmo tempo) ──
_sources: contextvars.ContextVar = contextvars.ContextVar("orion_sources", default=None)


def collect_sources() -> list:
    """Começa a coletar as fontes desta pergunta e devolve a lista (preenchida pelas ferramentas)."""
    lst: list = []
    _sources.set(lst)
    return lst


def _add_source(title: str, url: str) -> None:
    lst = _sources.get()
    if lst is not None and all(x["url"] != url for x in lst):
        lst.append({"title": title, "url": url})


# ── calculadora (sem eval: percorre a árvore da expressão) ──
_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: operator.pow}
_UN = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_FN = {"sqrt": math.sqrt, "sin": math.sin, "cos": math.cos, "tan": math.tan,
       "log": math.log, "log10": math.log10, "abs": abs, "round": round}
_CONST = {"pi": math.pi, "e": math.e}


def _eval(n):
    if isinstance(n, ast.Constant) and type(n.value) in (int, float):
        return n.value
    if isinstance(n, ast.BinOp) and type(n.op) in _BIN:
        a, b = _eval(n.left), _eval(n.right)
        if isinstance(n.op, ast.Pow) and (abs(b) > 1000 or abs(a) > 1e6):
            raise ValueError("Potência grande demais.")
        return _BIN[type(n.op)](a, b)
    if isinstance(n, ast.UnaryOp) and type(n.op) in _UN:
        return _UN[type(n.op)](_eval(n.operand))
    if isinstance(n, ast.Name) and n.id in _CONST:
        return _CONST[n.id]
    if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in _FN and not n.keywords:
        return _FN[n.func.id](*[_eval(a) for a in n.args])
    raise ValueError("Expressão não suportada.")


def calcular(expressao: str) -> str:
    if len(expressao) > 200:
        raise ValueError("Expressão longa demais.")
    r = _eval(ast.parse(expressao.strip(), mode="eval").body)
    if isinstance(r, float):
        r = round(r, 10)
        r = int(r) if r == int(r) and abs(r) < 1e15 else r
    return str(r)


# ── data e hora ──
_DIAS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]
_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
          "agosto", "setembro", "outubro", "novembro", "dezembro"]


def data_hora() -> str:
    n = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3)))  # Brasília/Fortaleza (UTC-3, sem horário de verão)
    return f"{_DIAS[n.weekday()]}, {n.day} de {_MESES[n.month - 1]} de {n.year}, {n:%H:%M} (horário de Brasília)"


# ── clima atual (Open-Meteo, sem chave) ──
_WMO = {0: "céu limpo", 1: "predominantemente limpo", 2: "parcialmente nublado", 3: "nublado",
        45: "neblina", 48: "neblina", 51: "garoa fraca", 53: "garoa", 55: "garoa forte",
        61: "chuva fraca", 63: "chuva", 65: "chuva forte", 71: "neve fraca", 73: "neve", 75: "neve forte",
        80: "pancadas de chuva fracas", 81: "pancadas de chuva", 82: "pancadas de chuva fortes",
        95: "trovoadas", 96: "trovoadas com granizo", 99: "trovoadas com granizo forte"}


def clima(cidade: str) -> str:
    g = requests.get("https://geocoding-api.open-meteo.com/v1/search",
                     params={"name": cidade, "count": 1, "language": "pt"}, headers=HEADERS, timeout=TIMEOUT).json()
    if not g.get("results"):
        return f"Não encontrei a cidade '{cidade}'."
    c = g["results"][0]
    w = requests.get("https://api.open-meteo.com/v1/forecast", params={
        "latitude": c["latitude"], "longitude": c["longitude"], "timezone": "auto",
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code",
    }, headers=HEADERS, timeout=TIMEOUT).json()["current"]
    return (f"{c['name']} ({c.get('country', '')}): {_WMO.get(w['weather_code'], 'condição desconhecida')}, "
            f"{w['temperature_2m']:.0f} °C (sensação {w['apparent_temperature']:.0f} °C), "
            f"umidade {w['relative_humidity_2m']}%, vento {w['wind_speed_10m']:.0f} km/h.")


# ── consulta factual (Wikipédia em português) ──
def pesquisar_wikipedia(consulta: str) -> str:
    s = requests.get("https://pt.wikipedia.org/w/api.php", params={
        "action": "query", "list": "search", "srsearch": consulta, "srlimit": 1, "format": "json"},
        headers=HEADERS, timeout=TIMEOUT).json()
    hits = s.get("query", {}).get("search", [])
    if not hits:
        return "Nada encontrado na Wikipédia."
    title = hits[0]["title"]
    r = requests.get("https://pt.wikipedia.org/api/rest_v1/page/summary/" + requests.utils.quote(title.replace(" ", "_"), safe=""),
                     headers=HEADERS, timeout=TIMEOUT).json()
    _add_source(title, "https://pt.wikipedia.org/wiki/" + quote(title.replace(" ", "_"), safe="_(),"))
    return f"{title}: {(r.get('extract') or 'sem resumo disponível.')[:900]}"


TOOLS = [
    {"name": "calcular", "fn": calcular,
     "description": "Calcula expressões matemáticas com exatidão (+ - * / // % ** , parênteses, sqrt, sin, cos, tan, log, log10, abs, round, pi, e). Use sempre que a resposta depender de uma conta.",
     "input_schema": {"type": "object", "properties": {"expressao": {"type": "string", "description": "Ex.: 12*(3+4)/5"}}, "required": ["expressao"]}},
    {"name": "data_hora", "fn": data_hora,
     "description": "Retorna a data e a hora atuais (horário de Brasília).",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "clima", "fn": clima,
     "description": "Retorna o clima ATUAL (temperatura, umidade, vento) de uma cidade.",
     "input_schema": {"type": "object", "properties": {"cidade": {"type": "string", "description": "Ex.: Fortaleza"}}, "required": ["cidade"]}},
    {"name": "pesquisar_wikipedia", "fn": pesquisar_wikipedia,
     "description": "Busca um resumo factual na Wikipédia em português. Use para fatos, pessoas, lugares e conceitos quando precisar de uma fonte.",
     "input_schema": {"type": "object", "properties": {"consulta": {"type": "string"}}, "required": ["consulta"]}},
]
_BY_NAME = {t["name"]: t for t in TOOLS}


def specs() -> list[dict]:
    """Descrição das ferramentas no formato que o modelo recebe."""
    return [{k: t[k] for k in ("name", "description", "input_schema")} for t in TOOLS]


def execute(name: str, args: dict) -> str:
    """Executa uma ferramenta; nunca levanta exceção (o modelo recebe o erro como texto)."""
    tool = _BY_NAME.get(name)
    if not tool:
        return f"Ferramenta desconhecida: {name}."
    try:
        return str(tool["fn"](**(args or {})))
    except Exception as e:
        return f"Erro ao executar {name}: {e}"
