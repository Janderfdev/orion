"""Voz do ORION via ElevenLabs

A chave (ELEVENLABS_API_KEY) e a voz (ELEVENLABS_VOICE_ID) ficam SÓ no servidor.
Sem as duas, o recurso fica desligado e o site usa a voz do navegador.
Para economizar créditos: texto limitado a MAX_CHARS e áudios repetidos ficam em cache na memória.
"""
import os, threading
from collections import OrderedDict
from urllib.parse import quote

import requests

from providers.errors import ProviderError

URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
MAX_CHARS = 600
CACHE_MAX = 24
_tls = threading.local()
_cache: OrderedDict = OrderedDict()
_lock = threading.Lock()


def configured() -> bool:
    return bool(os.getenv("ELEVENLABS_API_KEY") and os.getenv("ELEVENLABS_VOICE_ID"))


def _session():
    s = getattr(_tls, "s", None)
    if s is None:
        s = _tls.s = requests.Session()
    return s


def clean(text: str) -> str:
    """Texto que será realmente falado (e cobrado): espaços normalizados e no máximo MAX_CHARS."""
    return " ".join(text.split())[:MAX_CHARS]


def synthesize(text: str) -> bytes:
    """Devolve o áudio (mp3) da fala. Levanta ProviderError se o ElevenLabs recusar."""
    text = clean(text)
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "").strip().strip("'\"")   # tira espaços/aspas coladas por engano
    model = os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5")   # Flash: o mais rápido e o mais barato
    key = (model, voice_id, text)
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return _cache[key]
    def _post(params):
        return _session().post(
            URL.format(voice_id=quote(voice_id, safe="")), timeout=30, params=params,
            json={"text": text, "model_id": model},
            headers={"xi-api-key": os.getenv("ELEVENLABS_API_KEY", "").strip().strip("'\""), "Accept": "audio/mpeg", "Content-Type": "application/json"},
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
