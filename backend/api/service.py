"""Resumo do Dia (V5.2.0): busca os feeds RSS de news/sources.py, junta as notícias repetidas e organiza por categoria.

O que é e o que NÃO é:
  - Todo título, trecho, data e link vem do próprio feed da fonte. O ORION não escreve nem "resume com IA": nada é inventado.
  - Item sem data, sem título ou sem link http(s) é descartado. Só entram notícias das últimas ORION_NEWS_MAX_AGE_H horas (48).
  - Deduplicação: títulos muito parecidos (ou o mesmo link) viram UMA notícia com várias fontes.
  - Status (é uma regra simples, NÃO uma checagem de fatos):
      confirmed   2 ou mais veículos diferentes publicaram a mesma notícia
      developing  só uma fonte, mas o título/trecho indica acontecimento em curso ("ao vivo", "urgente", "breaking"…)
                  ou foi publicada há menos de 2 horas
      single      uma única fonte
  - Se um feed falha, ele vai em "unavailable" e o resto segue. Se TODOS falham e não há cache, levanta NewsUnavailable.

Cache em memória por 15 min. "Atualizar" pode forçar nova busca, no máximo uma a cada 2 min por servidor (protege as fontes).
"""
import datetime as dt, logging, os, re, threading, time, unicodedata
from concurrent.futures import ThreadPoolExecutor

import requests

from news import sources as S
from news.parse import parse_feed

log = logging.getLogger("orion.news")

MAX_AGE_H = int(os.getenv("ORION_NEWS_MAX_AGE_H", "48"))
CACHE_TTL = 900
MIN_REFRESH = 120
MAX_BYTES = 2_000_000
FETCH_TIMEOUT = 6
PER_CATEGORY = 6
SIMILARITY = 0.55
HEADERS = {"User-Agent": "ORION-AI/5.2 (https://janderfdev.github.io/orion)", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml"}

_STOP = frozenset("""a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sobre entre e ou que se ao aos
the an of in on at to for from with by and or is are was were be as its it this that after over into about says say said new""".split())
_LIVE = re.compile(r"\b(ao vivo|última hora|ultima hora|urgente|live|breaking|developing|em andamento)\b", re.I)
_AI_RE = re.compile(S.AI_WORD_RE)


class NewsUnavailable(Exception):
    pass


def tokens(title: str) -> frozenset:
    t = unicodedata.normalize("NFKD", title.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return frozenset(w for w in re.findall(r"[a-z0-9]+", t) if len(w) >= 3 and w not in _STOP)


def similar(a: frozenset, b: frozenset) -> bool:
    inter = len(a & b)
    return inter >= 2 and inter / len(a | b) >= SIMILARITY


def _norm_url(u: str) -> str:
    return re.sub(r"[?#].*$", "", u).rstrip("/").lower()


def is_ai(item: dict) -> bool:
    text = (item["title"] + " " + item["summary"]).lower()
    return any(w in text for w in S.AI_WORDS) or bool(_AI_RE.search(text))


def cluster(items: list) -> list:
    """Agrupa itens da mesma notícia. Cada grupo é uma lista de itens (mais recentes primeiro)."""
    groups: list = []
    for it in sorted(items, key=lambda x: x["published"], reverse=True):
        tok = tokens(it["title"])
        for g in groups:
            if _norm_url(g[0]["url"]) == _norm_url(it["url"]) or similar(g[0]["_tok"], tok):
                g.append(it); break
        else:
            it["_tok"] = tok
            groups.append([it])
    return groups


def _iso(d: dt.datetime) -> str:
    return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_item(group: list, now: dt.datetime) -> dict:
    rep = max(group, key=lambda x: (len(x["summary"]), x["published"]))
    names, srcs = [], []
    for g in group:
        if g["source"] not in names:
            names.append(g["source"]); srcs.append({"name": g["source"], "url": g["url"]})
    published = max(g["published"] for g in group)
    n = len(names)
    live = bool(_LIVE.search(rep["title"] + " " + rep["summary"])) or (now - published) < dt.timedelta(hours=2)
    status = "confirmed" if n >= 2 else ("developing" if live else "single")
    return {"title": rep["title"], "summary": rep["summary"], "url": rep["url"], "source": rep["source"], "lang": rep["lang"],
            "published": _iso(published), "status": status, "n_sources": n, "sources": srcs}


def default_fetch(feed_id: str) -> list:
    name, url, lang = S.FEEDS[feed_id]
    r = requests.get(url, headers=HEADERS, timeout=FETCH_TIMEOUT, stream=True)
    try:
        if r.status_code != 200:
            raise ValueError(f"http {r.status_code}")
        raw, size = [], 0
        for chunk in r.iter_content(65536):
            size += len(chunk)
            if size > MAX_BYTES:
                raise ValueError("feed grande demais")
            raw.append(chunk)
    finally:
        r.close()
    return parse_feed(b"".join(raw))


class NewsService:
    def __init__(self, fetch=default_fetch, now=time.time):
        self._fetch, self._now = fetch, now
        self._lock = threading.Lock()
        self._data, self._at = None, 0.0

    def _build(self) -> dict:
        now_ts = self._now()
        now = dt.datetime.fromtimestamp(now_ts, dt.timezone.utc)
        oldest, newest = now - dt.timedelta(hours=MAX_AGE_H), now + dt.timedelta(hours=1)
        wanted = sorted({f for _, _, feeds, _ in S.CATEGORIES for f in feeds})
        raw: dict = {}
        failed: list = []                                   # [{"source", "feed"}]: quais feeds não responderam

        def job(fid):
            try:
                return fid, self._fetch(fid)
            except Exception as e:
                log.warning("news: feed %s indisponível (%s)", fid, type(e).__name__)
                return fid, None

        with ThreadPoolExecutor(max_workers=8) as ex:
            for fid, items in ex.map(job, wanted):
                if items is None:
                    failed.append({"source": S.FEEDS[fid][0], "feed": fid})
                    raw[fid] = []
                else:
                    raw[fid] = [dict(i, source=S.FEEDS[fid][0], lang=S.FEEDS[fid][2]) for i in items if oldest <= i["published"] <= newest]
        if not any(raw.values()):
            raise NewsUnavailable("nenhum feed respondeu com notícias recentes")
        cats = []
        for cid, label, feeds, kw in S.CATEGORIES:
            items = [dict(i) for f in feeds for i in raw[f]]
            if kw == "ai":
                items = [i for i in items if is_ai(i)]
            groups = cluster(items)
            built = [make_item(g, now) for g in groups]
            built.sort(key=lambda x: (min(x["n_sources"], 3), x["published"]), reverse=True)
            cats.append({"id": cid, "label": label, "items": built[:PER_CATEGORY]})
        br = now.astimezone(dt.timezone(dt.timedelta(hours=-3)))
        return {"generated_at": _iso(now), "date": br.date().isoformat(), "categories": cats, "unavailable": failed,
                "note": "Títulos, trechos e datas vêm das próprias fontes. 'Confirmado' = mais de um veículo publicou; não é checagem de fatos."}

    def get(self, refresh: bool = False) -> dict:
        with self._lock:
            age = self._now() - self._at
            if self._data is not None and (age < MIN_REFRESH or (age < CACHE_TTL and not refresh)):
                return dict(self._data, cached=True, stale=False)
            try:
                self._data, self._at = self._build(), self._now()
                return dict(self._data, cached=False, stale=False)
            except NewsUnavailable:
                if self._data is not None:                      # sem rede agora: devolve o último resumo, dizendo que é antigo
                    return dict(self._data, cached=True, stale=True)
                raise
