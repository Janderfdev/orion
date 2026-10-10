"""ORION AI — backend V4.2.0.

Rodar local:  uvicorn main:app --reload
Rotas:  GET /health · GET /models · POST /ask · POST /memory/clear
Variáveis:
  GEMINI_API_KEY         chave do Google AI Studio (modelos gemini-*)  — ao menos UMA chave é obrigatória
  ANTHROPIC_API_KEY      chave da API do Claude (modelos claude-*)
  ORION_ALLOWED_EMAILS   (recomendada) e-mails com acesso, separados por vírgula.
                         Vazio = qualquer conta criada no Firebase pode usar (e gastar seu crédito!)
  ORION_MODELS           "id:Rótulo,id2:Rótulo2" (padrão: Gemini e Claude); ORION_DEFAULT_MODEL
  FIREBASE_PROJECT_ID    padrão: orion-ai-b8d39
  ORION_ALLOWED_ORIGIN   padrão: https://janderfdev.github.io
  ORION_MAX_TOKENS, ORION_PER_MINUTE (15), ORION_PER_DAY (200)
  ORION_MEMORY           "firestore" (padrão) ou "local" (memória do processo)
"""
import asyncio, logging, os, time
from collections import deque

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth.firebase import verify
from core.orchestrator import Orchestrator
from memory.store import Memory
from providers.registry import Registry

log = logging.getLogger("orion")
ORIGINS = [o.strip() for o in os.getenv("ORION_ALLOWED_ORIGIN", "https://janderfdev.github.io").split(",")]
ALLOWED = {e.strip().lower() for e in os.getenv("ORION_ALLOWED_EMAILS", "").split(",") if e.strip()}
PER_MINUTE = int(os.getenv("ORION_PER_MINUTE", "15"))
PER_DAY = int(os.getenv("ORION_PER_DAY", "200"))

app = FastAPI(title="ORION AI", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"])

registry = Registry()
orchestrator = Orchestrator(Memory())
_hits: dict[str, deque] = {}  # limite de uso por usuário (em memória)


def _rate_ok(uid: str) -> bool:
    now = time.time()
    q = _hits.setdefault(uid, deque())
    while q and q[0] < now - 86400:
        q.popleft()
    if len(q) >= PER_DAY or sum(1 for t in q if t > now - 60) >= PER_MINUTE:
        return False
    q.append(now)
    return True


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
    return {"default": registry.default, "models": registry.models()}


@app.post("/ask")
async def ask(body: AskIn, authorization: str = Header(default="")):
    uid, token = await _auth(authorization, count=True)
    if not registry.models():
        raise HTTPException(503, "Nenhum modelo configurado no servidor.")
    model_id, provider = registry.get(body.model)
    if not provider:
        raise HTTPException(400, "Modelo indisponível.")
    try:
        reply = await orchestrator.ask(body.text, uid, token, provider)
    except Exception as e:
        log.exception("Falha ao consultar o modelo")  # detalhes só no log do servidor
        status = getattr(e, "status_code", None)
        if status == 429:                              # limite de uso do provedor (ex.: plano gratuito)
            raise HTTPException(429, "O modelo atingiu o limite de uso agora.")
        if status in (403, 404):                       # modelo inexistente/aposentado ou sem permissão para esta chave
            raise HTTPException(503, "Modelo indisponível para esta chave.")
        raise HTTPException(502, "Falha ao consultar o modelo.")
    return {"reply": reply, "model": model_id}


@app.post("/memory/clear")
async def clear_memory(authorization: str = Header(default="")):
    uid, token = await _auth(authorization)
    await orchestrator.clear(uid, token)
    return {"ok": True}
