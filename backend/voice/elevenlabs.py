"""Voz do ORION via ElevenLabs (V4.5.5 — etapa 1: backend)

A chave (ELEVENLABS_API_KEY) e os IDs das vozes ficam SÓ no servidor. O site nunca vê um Voice ID:
ele só conhece o "slot" da voz (1 a 4).

Variáveis de ambiente:
  ELEVENLABS_API_KEY
  ELEVENLABS_VOICE_ID_1 … ELEVENLABS_VOICE_ID_4   (o slot 1 também aceita o nome antigo ELEVENLABS_VOICE_ID)
  ELEVENLABS_MODEL                                (padrão eleven_flash_v2_5)
  ELEVENLABS_MAX_CHARS                            (padrão 280: máximo de caracteres falados por resposta)

Sem a chave e ao menos uma voz, o recurso fica desligado e o site usa a voz do navegador.
Para economizar créditos: texto limitado a MAX_CHARS e áudios repetidos ficam em cache na memória.
"""
import os, threading
from collections import OrderedDict
from urllib.parse import quote

import requests

from providers.errors import ProviderError

URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
MAX_CHARS = int(os.getenv("ELEVENLABS_MAX_CHARS", "280"))   # só a fala é limitada; o texto escrito sai completo
CACHE_MAX = 48
SLOTS = (1, 2, 3, 4)

# Limites aceitos pelo servidor (o main.py valida com os mesmos valores)
PACE_MIN, PACE_MAX, PACE_DEFAULT = 0.8, 1.2, 1.0
EXPR_MIN, EXPR_MAX, EXPR_DEFAULT = 0.0, 1.0, 0.5

_tls = threading.local()
_cache: OrderedDict = OrderedDict()
_lock = threading.Lock()


def _env(name: str) -> str:
    return os.getenv(name, "").strip().strip("'\"")   # tira espaços/aspas coladas por engano


def voice_id(slot: int = 1) -> str:
    """Voice ID real do slot (1 a 4). Vazio se o slot não estiver configurado. NUNCA devolver isto ao site."""
    if slot not in SLOTS:
        return ""
    vid = _env(f"ELEVENLABS_VOICE_ID_{slot}")
    if not vid and slot == 1:
        vid = _env("ELEVENLABS_VOICE_ID")   # compatibilidade com o nome antigo
    return vid


def voices() -> list[dict]:
    """Vozes disponíveis para o site: só slot e rótulo provisório (nunca o ID)."""
    return [{"slot": s, "label": f"Voice {s:02d}"} for s in SLOTS if voice_id(s)]


def configured() -> bool:
    return bool(_env("ELEVENLABS_API_KEY") and voices())


def _session():
    s = getattr(_tls, "s", None)
    if s is None:
        s = _tls.s = requests.Session()
    return s


def clean(text: str) -> str:
    """Texto que será realmente falado (e cobrado): espaços normalizados e no máximo MAX_CHARS.
    Se passar do limite, corta no fim da última frase (ou na última palavra), nunca no meio de uma palavra."""
    t = " ".join(text.split())
    if len(t) <= MAX_CHARS:
        return t
    head = t[:MAX_CHARS + 1]
    end = max(head.rfind(". "), head.rfind("! "), head.rfind("? "))
    if end >= MAX_CHARS * 0.4:
        return t[:end + 1]
    sp = t[:MAX_CHARS].rfind(" ")
    return t[:sp] if sp > 0 else t[:MAX_CHARS]


def voice_settings(pace: float, expressivity: float) -> dict:
    """Converte os dois controles do site nos parâmetros reais da ElevenLabs.
      Pace         → speed (velocidade da fala)
      Expressivity → stability (cai quando a expressividade sobe) + style (sobe com ela)
    No centro (0.5) dá stability 0.50 e style 0.25. style alto pode aumentar a latência, por isso o teto é 0.5."""
    pace = min(PACE_MAX, max(PACE_MIN, float(pace)))
    e = min(EXPR_MAX, max(EXPR_MIN, float(expressivity)))
    return {"speed": round(pace, 2), "stability": round(0.75 - 0.5 * e, 2), "style": round(0.5 * e, 2)}


def synthesize(text: str, slot: int = 1, pace: float = PACE_DEFAULT, expressivity: float = EXPR_DEFAULT) -> bytes:
    """Devolve o áudio (mp3) da fala. Levanta ProviderError se o ElevenLabs recusar."""
    text = clean(text)
    vid = voice_id(slot)
    if not vid:
        raise ProviderError(404, "Voz não configurada.")
    model = os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5")   # Flash: o mais rápido e o mais barato
    vs = voice_settings(pace, expressivity)
    key = (model, vid, text, vs["speed"], vs["stability"], vs["style"])   # voz e ajustes fazem parte da chave
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]

    def _post(params):
        return _session().post(
            URL.format(voice_id=quote(vid, safe="")), timeout=30, params=params,
            json={"text": text, "model_id": model, "voice_settings": vs},
            headers={"xi-api-key": _env("ELEVENLABS_API_KEY"), "Accept": "audio/mpeg", "Content-Type": "application/json"},
        )
    r = _post({"output_format": "mp3_22050_32"})   # mp3 menor = baixa e começa a tocar mais rápido
    if r.status_code == 400:                        # se o formato pequeno for recusado, tenta o padrão do ElevenLabs
        r = _post(None)
    if r.status_code != 200:
        raise ProviderError(r.status_code, r.text[:300])   # detalhe só vai para o log do servidor
    audio = r.content
    with _lock:
        _cache[key] = audio
        while len(_cache) > CACHE_MAX:
            _cache.popitem(last=False)
    return audio
