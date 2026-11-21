"""Mercado (V5.5.0) — visão geral do mercado financeiro.

REGRA: o ORION não inventa cotações. Hoje NÃO há integração com uma fonte de dados financeiros; por isso overview() devolve
apenas DADOS DEMONSTRATIVOS, marcados com demo=True, ativos FICTÍCIOS ("Índice Demo A", "Ação DEMO1") e sem horário de atualização.
O site mostra o aviso "dados demonstrativos" sempre que demo=True.

As NOTÍCIAS do Mercado não passam por aqui: o site usa as categorias Economia e Negócios de /news/daily (RSS reais, news/service.py).

Para ligar uma fonte real: escreva uma função que devolva o MESMO formato de _demo() com demo=False, "source" (nome da fonte) e "as_of" (ISO UTC),
e registre-a em PROVIDERS. Só então os rótulos de "demonstrativo" saem da tela (o site decide pelo campo demo).
"""
import math

NOTE = "Dados demonstrativos: ativos fictícios, sem relação com o mercado real. Ainda não há uma fonte de cotações conectada."


def _series(seed: int, drift: float, n: int = 24) -> list:
    """Série determinística (sem aleatoriedade em tempo de execução) só para o gráfico de exemplo."""
    v, out = 100.0, []
    for i in range(n):
        v += drift + 1.6 * math.sin(i * 0.9 + seed) + 0.8 * math.cos(i * 0.37 + seed * 2)
        out.append(round(v, 2))
    return out


def _pct(series: list) -> float:
    return round((series[-1] / series[0] - 1) * 100, 2)


def _demo() -> dict:
    idx = [("DEMO-A", "Índice Demo A", 1, 0.35), ("DEMO-B", "Índice Demo B", 2, -0.25), ("DEMO-C", "Índice Demo C", 3, 0.2)]
    indices = []
    for sym, name, seed, drift in idx:
        s = _series(seed, drift)
        indices.append({"symbol": sym, "name": name, "value": s[-1], "change_pct": _pct(s), "series": s})
    stocks = []
    for i, (drift) in enumerate((0.9, 0.6, 0.3, -0.2, -0.5, -0.8), start=1):
        s = _series(i + 10, drift)
        stocks.append({"symbol": f"DEMO{i}", "name": f"Ação DEMO{i}", "value": s[-1], "change_pct": _pct(s), "series": s})
    stocks.sort(key=lambda x: x["change_pct"], reverse=True)
    return {"demo": True, "source": None, "as_of": None, "note": NOTE, "indices": indices,
            "gainers": [x for x in stocks if x["change_pct"] > 0][:5], "losers": [x for x in reversed(stocks) if x["change_pct"] < 0][:5]}


PROVIDERS: dict = {}   # nome -> função() que devolve o formato de _demo() com demo=False. Vazio hoje: nenhuma fonte real conectada.


class MarketService:
    def overview(self) -> dict:
        for fn in PROVIDERS.values():
            try:
                d = fn()
                if isinstance(d, dict) and d.get("demo") is False and d.get("source") and d.get("as_of"):
                    return d
            except Exception:
                continue            # fonte fora do ar: tenta a próxima; no fim, mostra o demonstrativo (nunca um número antigo como se fosse atual)
        return _demo()
