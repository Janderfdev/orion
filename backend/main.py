"""ORION AI — backend V4.2.5.

Rodar local:  uvicorn main:app --reload
Rotas:  GET /health · GET /models · POST /ask · POST /speak · GET /speak/diag · POST /memory/clear
Variáveis:
  GEMINI_API_KEY         chave do Google AI Studio (modelos gemini-*)  — ao menos UMA chave é obrigatória
  ANTHROPIC_API_KEY      chave da API do Claude (modelos claude-*)
  ORION_ALLOWED_EMAILS   (recomendada) e-mails com acesso, separados por vírgula.
                         Vazio = qualquer conta criada no Firebase pode usar (e gastar seu crédito!)
  ORION_MODELS           "id:Rótulo,id2:Rótulo2" (padrão: Gemini e Claude); ORION_DEFAULT_MODEL
  FIREBASE_PROJECT_ID    padrão: orion-ai-b8d39
  ORION_ALLOWED_ORIGIN   padrão: https://janderfdev.github.io
  ORION_MAX_TOKENS, ORION_PER_MINUTE (15), ORION_PER_DAY (200)
  ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID   (opcionais) ligam a voz do ElevenLabs; ELEVENLABS_MODEL (padrão eleven_flash_v2_5),
                         ORION_TTS_DAILY_CHARS (10000 por usuário por dia)
  ORION_THINKING         raciocínio dos modelos Gemini 3.x: off | minimal (padrão) | low | medium | high
  ORION_MEMORY           "firestore" (padrão) ou "local" (memória do processo)
"""
import asyncio, datetime, logging, os, re, time
from collections import deque

from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth.firebase import verify
from core.orchestrator import Orchestrator
from memory.store import Memory
from providers.registry import Registry
from voice import elevenlabs

log = logging.getLogger("orion")
ORIGINS = [o.strip() for o in os.getenv("ORION_ALLOWED_ORIGIN", "https://janderfdev.github.io").split(",")]
ALLOWED = {e.strip().lower() for e in os.getenv("ORION_ALLOWED_EMAILS", "").split(",") if e.strip()}
PER_MINUTE = int(os.getenv("ORION_PER_MINUTE", "15"))
PER_DAY = int(os.getenv("ORION_PER_DAY", "200"))
TTS_DAILY_CHARS = int(os.getenv("ORION_TTS_DAILY_CHARS", "10000"))   # limite de caracteres falados por usuário por dia

app = FastAPI(title="ORION AI", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"])

registry = Registry()
orchestrator = Orchestrator(Memory())
_hits: dict[str, deque] = {}  # limite de uso por usuário (em memória)
_tts_used: dict[str, tuple] = {}  # uid -> (dia, caracteres falados hoje)


def _rate_ok(uid: str) -> bool:
    now = time.time()
    q = _hits.setdefault(uid, deque())
    while q and q[0] < now - 86400:
        q.popleft()
    if len(q) >= PER_DAY or sum(1 for t in q if t > now - 60) >= PER_MINUTE:
        return False
    q.append(now)
    return True


def _tts_ok(uid: str, n: int) -> bool:
    """Controla os créditos do ElevenLabs: cada usuário tem um limite diário de caracteres falados."""
    today = datetime.date.today()
    day, used = _tts_used.get(uid, (today, 0))
    if day != today:
        used = 0
    if used + n > TTS_DAILY_CHARS:
        return False
    _tts_used[uid] = (today, used + n)
    return True


def _tts_refund(uid: str, n: int) -> None:
    """Devolve a cota quando a geração da voz falha (não cobra por áudio que não existiu)."""
    day, used = _tts_used.get(uid, (datetime.date.today(), 0))
    _tts_used[uid] = (day, max(0, used - n))


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class AskIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    model: str | None = Field(default=None, max_length=80)  # id vindo de GET /models


async def _auth(authorization: str, count: bool = False):
    """Valida o login do Firebase e a lista de e-mails. Devolve (uid, token).
    count=True também aplica o limite de uso (perguntas ao modelo)."""
    token = authorization.removeprefix("Bearer ").strip()
    claims = await asyncio.to_thread(verify, token)
    if not claims:
        raise HTTPException(401, "Não autorizado.")
    if ALLOWED and (claims.get("email") or "").lower() not in ALLOWED:
        raise HTTPException(403, "Conta sem acesso.")
    uid = claims.get("sub", "?")
    if count and not _rate_ok(uid):
        raise HTTPException(429, "Muitas solicitações. Aguarde um instante.")
    return uid, token


@app.get("/health")
def health():
    return {"status": "ok", "name": "ORION AI"}


@app.get("/models")
async def models(authorization: str = Header(default="")):
    await _auth(authorization)
    return {"default": registry.default, "models": registry.models(), "tts": elevenlabs.configured()}


@app.post("/ask")
async def ask(body: AskIn, authorization: str = Header(default="")):
    uid, token = await _auth(authorization, count=True)
    if not registry.models():
        raise HTTPException(503, "Nenhum modelo configurado no servidor.")
    model_id, provider = registry.get(body.model)
    if not provider:
        raise HTTPException(400, "Modelo indisponível.")
    try:
        result = await orchestrator.ask(body.text, uid, token, provider)
    except Exception as e:
        log.exception("Falha ao consultar o modelo")  # detalhes só no log do servidor
        status = getattr(e, "status_code", None)
        if status == 429:                              # limite de uso do provedor (ex.: plano gratuito)
            raise HTTPException(429, "O modelo atingiu o limite de uso agora.")
        if status in (403, 404):                       # modelo inexistente/aposentado ou sem permissão para esta chave
            raise HTTPException(503, "Modelo indisponível para esta chave.")
        raise HTTPException(502, "Falha ao consultar o modelo.")
    return {"reply": result["reply"], "model": model_id, "sources": result["sources"], "understood": result["understood"]}


@app.post("/memory/clear")
async def clear_memory(authorization: str = Header(default="")):
    uid, token = await _auth(authorization)
    await orchestrator.clear(uid, token)
    return {"ok": True}


@app.post("/speak")
async def speak(body: SpeakIn, authorization: str = Header(default="")):
    """Fala da resposta com a voz do ElevenLabs. Qualquer falha aqui faz o site voltar à voz do navegador."""
    uid, _ = await _auth(authorization)
    if not elevenlabs.configured():
        raise HTTPException(503, "Voz não configurada.")
    text = elevenlabs.clean(body.text)
    if not _tts_ok(uid, len(text)):
        raise HTTPException(429, "Limite diário de voz atingido.")
    try:
        audio = await asyncio.to_thread(elevenlabs.synthesize, text)
    except Exception as e:
        # o log do servidor (Render → Logs) mostra o status e o motivo exato recusado pelo ElevenLabs
        log.error("Falha ao gerar a voz: status=%s detalhe=%s", getattr(e, "status_code", None), str(e)[:300])
        _tts_refund(uid, len(text))
        raise HTTPException(429 if getattr(e, "status_code", None) == 429 else 502, "Falha ao gerar a voz.")
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@app.get("/speak/diag")
async def speak_diag(authorization: str = Header(default="")):
    """Diagnóstico da voz do ElevenLabs: mostra exatamente por que ela falha (só para contas autorizadas)."""
    await _auth(authorization)
    if not elevenlabs.configured():
        return {"ok": False, "motivo": "ELEVENLABS_API_KEY e/ou ELEVENLABS_VOICE_ID não chegaram ao servidor (confira os nomes no Render e faça redeploy)."}
    vid = os.getenv("ELEVENLABS_VOICE_ID", "").strip().strip("'\"")
    info = {"voice_id_tamanho": len(vid), "modelo": os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5")}
    try:
        audio = await asyncio.to_thread(elevenlabs.synthesize, "Teste de voz do ORION.")
        return {"ok": True, "bytes": len(audio), **info}
    except Exception as e:
        status, det = getattr(e, "status_code", None), str(e)[:400]
        low = det.lower()
        mm = re.search(r'"message"\s*:\s*"([^"]+)', det)
        msg = mm.group(1) if mm else det.split(": ", 1)[-1]   # mensagem real do ElevenLabs
        if status == 401 and ("unusual" in low or "free tier" in low or "abuse" in low or "proxy" in low or "vpn" in low):
            dica = "O ElevenLabs bloqueou o plano gratuito por vir de um servidor em nuvem (Render). Só um plano pago libera."
        elif status == 401:
            dica = "Chave do ElevenLabs inválida ou sem permissão de Text to Speech."
        elif status == 402 or "paid_plan_required" in low or "library" in low:
            dica = "O plano não permite essa voz (voz da Voice Library). Adicione-a em My Voices ou use uma voz padrão (premade)."
        elif status == 403:
            dica = "Sem permissão para essa voz ou recurso. Adicione a voz em My Voices e use o ID de lá."
        elif status == 404:
            dica = "Voice ID não existe. Copie o ID (não o nome) em My Voices."
        elif status == 429:
            dica = "Limite de uso ou créditos do ElevenLabs esgotados."
        elif status == 400 and ("voice" in low or "uid" in low):
            dica = f"Voice ID inválido (o seu tem {len(vid)} caracteres; o normal é 20, sem aspas nem espaços)."
        elif status == 400 and "model" in low:
            dica = "Modelo recusado: apague ELEVENLABS_MODEL no Render ou use eleven_flash_v2_5."
        elif status == 400:
            dica = f"ElevenLabs recusou (400): {msg[:220]}"
        else:
            dica = f"Erro {status}: {msg[:220]}"
        return {"ok": False, "status": status, "dica": dica, "detalhe": det, **info}
