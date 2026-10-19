"""Imagens para as respostas do ORION (V4.5.0).

Busca fotos relacionadas ao assunto da pergunta na Wikipédia/Wikimedia (sem chave de API) e devolve no mesmo formato
que o site já entende: {"url": <artigo>, "title": <título>, "images": [<https://upload.wikimedia.org/...>]}.
Só saem URLs de upload.wikimedia.org (é o único domínio de imagem que o site aceita). Qualquer falha devolve None:
as imagens são um extra e nunca podem derrubar a resposta.
"""
import re, threading
from collections import OrderedDict
from urllib.parse import quote

import requests

API = "https://{lang}.wikipedia.org/w/api.php"
HEADERS = {"User-Agent": "ORION-AI/4.5 (https://janderfdev.github.io/orion)"}   # a Wikimedia pede um User-Agent identificável
TIMEOUT = 3.5
CACHE_MAX = 64
_cache: OrderedDict = OrderedDict()
_lock = threading.Lock()
_IMG = re.compile(r"^https://upload\.wikimedia\.org/")
_LEAD = re.compile(
    r"^(who\s+(is|was|were|are)|what\s+(is|are|was|were|does)|when\s+(was|did|is)|where\s+(is|was|are)|how\s+(does|did|do)|tell\s+me\s+about|explain|"
    r"quem\s+(foi|é|era|são)|o\s+que\s+(é|são|foi|significa)|qual\s+(é|foi|era)|quais\s+(são|foram)|quando\s+(foi|nasceu|morreu)|"
    r"onde\s+(fica|é|nasceu)|como\s+(funciona|surgiu)|me\s+(fale|conte|explique)\s+(sobre|de|do|da))\s+", re.I)
_ART = re.compile(r"^(the|an?|o|a|os|as|um|uma)\s+", re.I)


def topic(question: str) -> str:
    """Assunto da pergunta: tira o início ("quem foi…", "what is…") e a pontuação final."""
    t = re.sub(r"[?!.…\s]+$", "", (question or "").strip())
    t = _ART.sub("", _LEAD.sub("", t)).strip()
    return (t or (question or "").strip())[:120]


def _search(lang: str, term: str, limit: int = 8) -> list[dict]:
    r = requests.get(API.format(lang=lang), headers=HEADERS, timeout=TIMEOUT, params={
        "action": "query", "format": "json", "formatversion": 2, "generator": "search", "gsrsearch": term,
        "gsrnamespace": 0, "gsrlimit": limit, "prop": "pageimages", "piprop": "thumbnail", "pithumbsize": 640, "pilimit": limit,
    })
    if r.status_code != 200:
        return []
    pages = (r.json().get("query") or {}).get("pages") or []
    out = []
    for p in sorted(pages, key=lambda x: x.get("index", 99)):         # na ordem de relevância da busca
        src = ((p.get("thumbnail") or {}).get("source")) or ""
        if _IMG.match(src) and p.get("title"):
            out.append({"title": p["title"], "image": src, "lang": lang})
    return out


def find(question: str, lang: str = "pt", want: int = 3):
    """Até `want` fotos de artigos relacionados à pergunta, ou None. Resultados ficam em cache (pergunta repetida não consulta de novo)."""
    try:
        term = topic(question)
        if len(term) < 3:
            return None
        key = (lang, term.lower(), want)
        with _lock:
            if key in _cache:
                _cache.move_to_end(key)
                return _cache[key]
        hits = _search(lang, term)
        if len(hits) < 2:                                              # pouco resultado: tenta também no outro idioma
            hits += _search("en" if lang == "pt" else "pt", term)
        seen, picked = set(), []
        for h in hits:
            if h["image"] not in seen:
                seen.add(h["image"]); picked.append(h)
            if len(picked) >= want:
                break
        res = None
        if picked:
            first = picked[0]
            res = {"url": f"https://{first['lang']}.wikipedia.org/wiki/{quote(first['title'].replace(' ', '_'), safe='()_,')}",
                   "title": first["title"][:90], "images": [h["image"] for h in picked]}
        with _lock:
            _cache[key] = res
            while len(_cache) > CACHE_MAX:
                _cache.popitem(last=False)
        return res
    except Exception:
        return None
