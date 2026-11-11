"""Leitura segura de feeds RSS/Atom. XML de fora é entrada NÃO confiável: usa defusedxml (bloqueia entidades e bombas de XML).
Tudo que sai daqui é texto simples (sem HTML) e link http(s); o site mostra com textContent."""
import datetime as dt, html, re, unicodedata
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

from defusedxml import ElementTree as ET

MAX_ITEMS_PER_FEED = 30
TITLE_MAX, SUMMARY_MAX = 160, 240
_TAGS = re.compile(r"</?[A-Za-z!][^>]*>")          # só o que parece marcação (não corta "5 < 6")
_WS = re.compile(r"\s+")
_ATOM = "{http://www.w3.org/2005/Atom}"


def clean_text(s, limit: int) -> str:
    s = html.unescape(str(s or ""))                      # 1º decodifica (feeds mandam HTML escapado: &lt;p&gt;)…
    s = _TAGS.sub(" ", s).replace("<", "‹").replace(">", "›")   # …2º tira a marcação; < > soltos viram ‹ › (inertes, sentido preservado)
    s = _WS.sub(" ", unicodedata.normalize("NFC", s)).strip()
    s = "".join(ch for ch in s if ch == " " or unicodedata.category(ch)[0] != "C")
    if len(s) <= limit:
        return s
    cut = s[:limit].rsplit(" ", 1)[0].rstrip(" ,;:-–—")
    return cut + "…"


def safe_url(u) -> str:
    u = str(u or "").strip()
    p = urlparse(u)
    if p.scheme not in ("http", "https") or not p.netloc or p.username or p.password or len(u) > 500 or any(c.isspace() for c in u):
        return ""
    return u


def parse_date(s):
    """Data em UTC, ou None se não houver/for inválida (item sem data não entra: não inventamos data)."""
    s = str(s or "").strip()
    if not s:
        return None
    d = None
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError, IndexError):
        try:
            d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    if d is None:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(dt.timezone.utc)


def _text(el, *names):
    for n in names:
        found = el.find(n)
        if found is not None:
            txt = "".join(found.itertext()).strip()      # inclui texto dentro de marcação aninhada (ex.: <title>a <b>b</b></title>)
            if txt:
                return txt
    return ""


def parse_feed(xml_bytes: bytes) -> list:
    """Devolve [{title, summary, url, published(datetime UTC)}]. Levanta ValueError se não for um feed legível."""
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        raise ValueError("feed ilegível")
    out = []
    entries = root.findall(".//item") or root.findall(f".//{_ATOM}entry")
    for e in entries[:MAX_ITEMS_PER_FEED]:
        if e.tag.endswith("entry"):                                   # Atom
            link = ""
            for l in e.findall(f"{_ATOM}link"):
                if l.get("rel", "alternate") == "alternate" and l.get("href"):
                    link = l.get("href"); break
            title = _text(e, f"{_ATOM}title")
            summary = _text(e, f"{_ATOM}summary", f"{_ATOM}content")
            when = _text(e, f"{_ATOM}published", f"{_ATOM}updated")
        else:                                                         # RSS 2.0
            link = _text(e, "link") or _text(e, "guid")
            title, summary, when = _text(e, "title"), _text(e, "description"), _text(e, "pubDate")
        title, url, published = clean_text(title, TITLE_MAX), safe_url(link), parse_date(when)
        if title and url and published:
            out.append({"title": title, "summary": clean_text(summary, SUMMARY_MAX), "url": url, "published": published})
    return out
