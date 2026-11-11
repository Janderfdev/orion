"""Resumo do Dia: leitura segura de RSS/Atom, deduplicação, status, falhas de fonte e cache (sem rede)."""
import datetime as dt

import pytest

from news import parse, service as ns
from news import sources as S

NOW = dt.datetime(2026, 11, 10, 15, 0, tzinfo=dt.timezone.utc)


def rfc(d): return d.strftime("%a, %d %b %Y %H:%M:%S GMT")


def rss(*items):
    body = "".join(f"<item><title>{t}</title><link>{l}</link><description>{d}</description><pubDate>{rfc(p)}</pubDate></item>" for t, l, d, p in items)
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>{body}</channel></rss>'.encode()


def ago(**kw): return NOW - dt.timedelta(**kw)


# ── leitura de feeds ──
def test_parse_rss_and_strip_html():
    xml = rss(("Governo <b>anuncia</b> plano &amp; metas", "https://ex.com/a", "<p>Resumo <a href='x'>da</a> notícia</p>", ago(hours=1)))
    [it] = parse.parse_feed(xml)
    assert it["title"] == "Governo anuncia plano & metas" and it["summary"] == "Resumo da notícia" and it["url"] == "https://ex.com/a"
    assert it["published"] == ago(hours=1) and it["published"].tzinfo is not None


def test_parse_atom():
    xml = b"""<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Titulo atom</title>
      <link rel="alternate" href="https://ex.com/atom"/><summary>Resumo atom</summary><updated>2026-11-10T12:00:00Z</updated></entry></feed>"""
    [it] = parse.parse_feed(xml)
    assert it["title"] == "Titulo atom" and it["url"] == "https://ex.com/atom" and it["published"] == dt.datetime(2026, 11, 10, 12, tzinfo=dt.timezone.utc)


def test_items_without_title_link_or_date_are_dropped():
    xml = (b'<rss><channel><item><title>sem data</title><link>https://ex.com/1</link></item>'
           b'<item><link>https://ex.com/2</link><pubDate>Tue, 10 Nov 2026 10:00:00 GMT</pubDate></item>'
           b'<item><title>sem link</title><pubDate>Tue, 10 Nov 2026 10:00:00 GMT</pubDate></item>'
           b'<item><title>ok</title><link>https://ex.com/ok</link><pubDate>Tue, 10 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>')
    assert [i["title"] for i in parse.parse_feed(xml)] == ["ok"]


@pytest.mark.parametrize("url", ["javascript:alert(1)", "data:text/html,x", "ftp://ex.com/a", "https://user:pw@ex.com/a", "//ex.com/a", "https://ex .com/a", "", "https://" + "a" * 600])
def test_unsafe_links_are_dropped(url):
    xml = rss(("titulo", url, "r", ago(hours=1)))
    assert parse.parse_feed(xml) == []


def test_script_and_html_in_feeds_become_plain_text():
    [it] = parse.parse_feed(rss(("&lt;script&gt;alert(1)&lt;/script&gt; Notícia", "https://ex.com/x",
                                 "&lt;img src=x onerror=alert(1)&gt;Texto &lt;b&gt;limpo&lt;/b&gt;", ago(hours=1))))
    for field in (it["title"], it["summary"]):
        assert "<" not in field and ">" not in field
    assert "script" not in it["title"] and it["summary"] == "Texto limpo" and it["title"].endswith("Notícia")


def test_escaped_html_inside_cdata_is_cleaned():
    xml = (b'<rss><channel><item><title><![CDATA[Titulo &lt;em&gt;destacado&lt;/em&gt;]]></title><link>https://ex.com/c</link>'
           b'<description><![CDATA[&lt;p&gt;Texto limpo&lt;/p&gt;&lt;script&gt;x()&lt;/script&gt;]]></description>'
           b'<pubDate>Tue, 10 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>')
    [it] = parse.parse_feed(xml)
    assert it["title"] == "Titulo destacado" and it["summary"] == "Texto limpo x()"


def test_math_in_text_is_not_mangled():
    [it] = parse.parse_feed(rss(("Dolar fecha a 5,10 e 5 &lt; 6 na semana", "https://ex.com/m", "r", ago(hours=1))))
    assert it["title"] == "Dolar fecha a 5,10 e 5 ‹ 6 na semana"


def test_summary_is_truncated_on_a_word_boundary():
    [it] = parse.parse_feed(rss(("t", "https://ex.com/x", "palavra " * 100, ago(hours=1))))
    assert len(it["summary"]) <= parse.SUMMARY_MAX + 1 and it["summary"].endswith("…") and "palavr…" not in it["summary"]


def test_xml_bombs_and_external_entities_are_refused():
    bomb = b'<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><rss><channel><item><title>&b;</title></item></channel></rss>'
    xxe = b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&x;</title><link>https://e.com</link></item></channel></rss>'
    for evil in (bomb, xxe, b"isto nao e xml", b"", b"<rss><channel><item>"):
        with pytest.raises(ValueError):
            parse.parse_feed(evil)


@pytest.mark.parametrize("s,ok", [("Tue, 10 Nov 2026 10:00:00 GMT", True), ("2026-11-10T10:00:00-03:00", True), ("2026-11-10T10:00:00", True),
                                  ("ontem", False), ("", False), ("32/13/2026", False)])
def test_dates(s, ok):
    d = parse.parse_date(s)
    assert (d is not None) == ok and (d is None or d.tzinfo is not None)


# ── deduplicação e status ──
def item(title, source="BBC News", url=None, summary="resumo", published=None, lang="en"):
    return {"title": title, "summary": summary, "url": url or "https://ex.com/" + title.replace(" ", "-"), "source": source, "lang": lang,
            "published": published or ago(hours=5)}


def test_tokens_ignore_accents_stopwords_and_case():
    assert ns.tokens("O Governo ANUNCIA plano de inflação") == ns.tokens("governo anuncia plano inflacao")


def test_same_story_from_two_outlets_is_one_confirmed_item():
    g = ns.cluster([item("Brazil central bank holds interest rate steady", "BBC News"),
                    item("Brazil central bank holds interest rates steady today", "Agência Brasil", url="https://ab.br/x")])
    assert len(g) == 1
    out = ns.make_item(g[0], NOW)
    assert out["status"] == "confirmed" and out["n_sources"] == 2 and {s["name"] for s in out["sources"]} == {"BBC News", "Agência Brasil"}


def test_different_stories_are_not_merged():
    assert len(ns.cluster([item("Brazil central bank holds interest rate"), item("Scientists discover new species in Amazon rainforest")])) == 2


def test_same_link_merges_even_with_different_titles():
    assert len(ns.cluster([item("Titulo um completamente diferente", url="https://ex.com/a?utm=1"), item("Outro titulo sem relacao nenhuma", url="https://ex.com/a/")])) == 1


def test_same_outlet_twice_does_not_count_as_two_sources():
    g = ns.cluster([item("Markets fall sharply after inflation report", "BBC News", url="https://bbc/1"),
                    item("Markets fall sharply after the inflation report", "BBC News", url="https://bbc/2")])
    assert ns.make_item(g[0], NOW)["status"] != "confirmed"


def test_status_rules():
    old = ns.make_item([item("Plano economico aprovado pelo congresso", published=ago(hours=9))], NOW)
    fresh = ns.make_item([item("Plano economico aprovado pelo congresso", published=ago(minutes=30))], NOW)
    live = ns.make_item([item("AO VIVO: acompanhe a votacao no congresso", published=ago(hours=9))], NOW)
    assert (old["status"], fresh["status"], live["status"]) == ("single", "developing", "developing")


def test_ai_filter_matches_whole_words_only():
    yes = [item("OpenAI launches new model"), item("Governo cria comitê de inteligência artificial"), item("Why AI is reshaping jobs"), item("Nova IA do Google")]
    no = [item("Spain wins the final"), item("Retail sales rise"), item("Rain expected in Maia")]
    assert all(ns.is_ai(i) for i in yes) and not any(ns.is_ai(i) for i in no)


# ── serviço completo ──
def fake_fetch(per_feed, fail=()):
    def f(fid):
        if fid in fail:
            raise RuntimeError("fora do ar")
        return per_feed.get(fid, [])
    return f


def svc(per_feed, fail=(), clock=None):
    clock = clock or {"t": NOW.timestamp()}
    return ns.NewsService(fetch=fake_fetch(per_feed, fail), now=lambda: clock["t"]), clock


def raw(title, published, url=None, summary="trecho"):
    return {"title": title, "summary": summary, "url": url or "https://ex.com/" + title.replace(" ", "-"), "published": published}


def test_digest_organizes_by_category_and_dedups_across_feeds():
    s, _ = svc({"bbc_world": [raw("Peace talks resume in Geneva after weeks of fighting", ago(hours=3), "https://bbc/1")],
                "ab_intl": [raw("Peace talks resume in Geneva after weeks fighting", ago(hours=2), "https://ab/1")],
                "bbc_tech": [raw("OpenAI unveils new chatbot model", ago(hours=4)), raw("New smartphone camera sensor announced", ago(hours=4))]})
    d = s.get()
    cats = {c["id"]: c for c in d["categories"]}
    assert [c["id"] for c in d["categories"]] == [c[0] for c in S.CATEGORIES]
    [m] = cats["mundo"]["items"]
    assert m["status"] == "confirmed" and m["n_sources"] == 2
    assert [i["title"] for i in cats["ia"]["items"]] == ["OpenAI unveils new chatbot model"]
    assert len(cats["tecnologia"]["items"]) == 2 and d["cached"] is False and d["date"] == "2026-11-10" and d["unavailable"] == []


def test_old_and_future_items_are_excluded():
    s, _ = svc({"bbc_world": [raw("Recent story about trade deal", ago(hours=5)), raw("Ancient story about trade deal", ago(hours=ns.MAX_AGE_H + 1)),
                              raw("Story from the future about trade", NOW + dt.timedelta(days=2))]})
    titles = [i["title"] for c in s.get()["categories"] if c["id"] == "mundo" for i in c["items"]]
    assert titles == ["Recent story about trade deal"]


def test_failed_feeds_are_reported_and_the_rest_still_works():
    s, _ = svc({"bbc_world": [raw("Story that survives the outage", ago(hours=2))]}, fail=("ab_intl", "bbc_tech"))
    d = s.get()
    assert {u["feed"] for u in d["unavailable"]} == {"ab_intl", "bbc_tech"} and all(set(u) == {"source", "feed"} for u in d["unavailable"])
    assert any(i["title"].startswith("Story that survives") for c in d["categories"] for i in c["items"])


def test_all_feeds_failing_without_cache_raises_and_nothing_is_invented():
    s, _ = svc({}, fail=set(S.FEEDS))
    with pytest.raises(ns.NewsUnavailable):
        s.get()


def test_empty_but_reachable_feeds_also_raise_instead_of_fake_content():
    s, _ = svc({})
    with pytest.raises(ns.NewsUnavailable):
        s.get()


def test_per_category_limit_and_ordering_confirmed_first():
    many = [raw(f"Distinct headline number {chr(97 + i)}{chr(97 + i)}{chr(97 + i)} about topic{i}", ago(hours=3 + i)) for i in range(10)]
    s, _ = svc({"bbc_world": many + [raw("Joint story reported by two outlets today", ago(hours=20), "https://bbc/j")],
                "ab_intl": [raw("Joint story reported by two outlets today", ago(hours=21), "https://ab/j")]})
    items = [c for c in s.get()["categories"] if c["id"] == "mundo"][0]["items"]
    assert len(items) == ns.PER_CATEGORY and items[0]["status"] == "confirmed"


def test_cache_ttl_and_refresh_rate_limit():
    calls = {"n": 0}
    clock = {"t": NOW.timestamp()}

    def f(fid):
        calls["n"] += 1
        return [raw("Cached story about the economy", ago(hours=1))] if fid == "bbc_world" else []
    s = ns.NewsService(fetch=f, now=lambda: clock["t"])
    s.get(); first = calls["n"]
    assert s.get()["cached"] is True and calls["n"] == first                         # dentro do TTL: sem nova busca
    clock["t"] += 30
    assert s.get(refresh=True)["cached"] is True and calls["n"] == first             # "atualizar" cedo demais: cache
    clock["t"] += ns.MIN_REFRESH
    assert s.get(refresh=True)["cached"] is False and calls["n"] > first             # passou o intervalo mínimo: busca de novo
    n2 = calls["n"]
    clock["t"] += ns.CACHE_TTL + 1
    assert s.get()["cached"] is False and calls["n"] > n2                            # TTL venceu


def test_stale_cache_is_served_when_everything_goes_down_and_flagged():
    state = {"down": False}
    clock = {"t": NOW.timestamp()}

    def f(fid):
        if state["down"]:
            raise RuntimeError("fora")
        return [raw("Story before the outage happened", ago(hours=1))] if fid == "bbc_world" else []
    s = ns.NewsService(fetch=f, now=lambda: clock["t"])
    s.get()
    state["down"] = True
    clock["t"] += ns.CACHE_TTL + 1
    d = s.get()
    assert d["stale"] is True and d["cached"] is True and any(c["items"] for c in d["categories"])


def test_output_has_no_internal_fields():
    s, _ = svc({"bbc_world": [raw("Some world story for the digest", ago(hours=3))]})
    it = [c for c in s.get()["categories"] if c["id"] == "mundo"][0]["items"][0]
    assert set(it) == {"title", "summary", "url", "source", "lang", "published", "status", "n_sources", "sources"}


# ── rota ──
def test_news_route_requires_login_and_maps_errors(monkeypatch):
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient
    import main

    async def fake_auth(authorization, count=False, with_email=False):
        if authorization != "Bearer ok":
            raise main.HTTPException(401, "Não autorizado.")
        return ("u", "t")
    monkeypatch.setattr(main, "_auth", fake_auth)

    class Fake:
        def __init__(self): self.args, self.err = [], None
        def get(self, refresh):
            self.args.append(refresh)
            if self.err:
                raise self.err
            return {"categories": []}
    fk = Fake()
    monkeypatch.setattr(main, "news", fk)
    c = TestClient(main.app, raise_server_exceptions=False)
    assert c.get("/news/daily").status_code == 401
    assert c.get("/news/daily", headers={"Authorization": "Bearer ok"}).json() == {"categories": []}
    c.get("/news/daily?refresh=true", headers={"Authorization": "Bearer ok"})
    assert fk.args == [False, True]
    fk.err = ns.NewsUnavailable("x")
    r = c.get("/news/daily", headers={"Authorization": "Bearer ok"})
    assert r.status_code == 503 and r.json()["detail"] == "news:unavailable"
