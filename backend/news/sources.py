"""Fontes do Resumo do Dia (V5.2.0). Só RSS públicos de veículos reconhecidos; o ORION NÃO escreve notícias, só organiza o que
as fontes publicam (título, trecho do próprio feed, data e link). Para trocar/adicionar uma fonte, edite este arquivo.

Conferidos em 10/11/2026 (listagens públicas de feeds): Agência Brasil (Últimas, Internacional, Economia) e BBC News
(Home, World, Business, Economy, Companies, Technology, Science & Environment). Se um feed sair do ar, ele aparece em
"unavailable" na resposta e o resto continua: nada é inventado para preencher o espaço.
"""
FEEDS = {   # id -> (nome mostrado, url, idioma)
    "ab_ultimas":   ("Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml", "pt"),
    "ab_intl":      ("Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml", "pt"),
    "ab_economia":  ("Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml", "pt"),
    "bbc_home":     ("BBC News", "https://feeds.bbci.co.uk/news/rss.xml", "en"),
    "bbc_world":    ("BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml", "en"),
    "bbc_business": ("BBC News", "https://feeds.bbci.co.uk/news/business/rss.xml", "en"),
    "bbc_economy":  ("BBC News", "https://feeds.bbci.co.uk/news/business/economy/rss.xml", "en"),
    "bbc_company":  ("BBC News", "https://feeds.bbci.co.uk/news/business/companies/rss.xml", "en"),
    "bbc_tech":     ("BBC News", "https://feeds.bbci.co.uk/news/technology/rss.xml", "en"),
    "bbc_science":  ("BBC News", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "en"),
}

# categoria -> (rótulo, feeds, filtro de palavras-chave ou None)
CATEGORIES = [
    ("mundo",       "Mundo",               ["ab_intl", "bbc_world"], None),
    ("tecnologia",  "Tecnologia",          ["bbc_tech"], None),
    ("ia",          "Inteligência artificial", ["bbc_tech", "bbc_business"], "ai"),   # montada por palavras-chave (sem feed próprio)
    ("ciencia",     "Ciência",             ["bbc_science"], None),
    ("economia",    "Economia",            ["ab_economia", "bbc_economy"], None),
    ("negocios",    "Negócios",            ["bbc_company", "bbc_business"], None),
    ("atualidades", "Atualidades",         ["ab_ultimas", "bbc_home"], None),
]

AI_WORDS = ("inteligência artificial", "inteligencia artificial", "artificial intelligence", "chatgpt", "openai", "anthropic",
            "gemini", "claude", "llm", "machine learning", "aprendizado de máquina", "deepmind", "copilot", "generative ai",
            "ia generativa", "chatbot", "nvidia")
AI_WORD_RE = r"(?<![a-z0-9])(?:ai|ia|a\.i\.)(?![a-z0-9])"   # "AI"/"IA" como palavra inteira (não dentro de "Spain", "iaia"…)
