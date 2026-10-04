"""ORION AI — backend V4.0 (ORION ENTENDE).

Rodar local:  uvicorn main:app --reload
Variáveis:
  ANTHROPIC_API_KEY      (obrigatória) chave da API do Claude
  ORION_ALLOWED_EMAILS   (recomendada) e-mails com acesso, separados por vírgula.
                         Vazio = qualquer conta criada no Firebase pode usar (e gastar seu crédito!)
  FIREBASE_PROJECT_ID    padrão: orion-ai-b8d39
  ORION_ALLOWED_ORIGIN   padrão: https://janderfdev.github.io
  ORION_MODEL, ORION_MAX_TOKENS, ORION_PER_MINUTE (15), ORION_PER_DAY (200)
"""
import asyncio, os, time
from collections import deque

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth.firebase import verify
from core.orchestrator import Orchestrator
from providers.claude import ClaudeProvider

ORIGINS = [o.strip() for o in os.getenv("ORION_ALLOWED_ORIGIN", "https://janderfdev.github.io").split(",")]
ALLOWED = {e.strip().lower() for e in os.getenv("ORION_ALLOWED_EMAILS", "").split(",") if e.strip()}
PER_MINUTE = int(os.getenv("ORION_PER_MINUTE", "15"))
PER_DAY = int(os.getenv("ORION_PER_DAY", "200"))

app = FastAPI(title="ORION AI", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"])

orchestrator = Orchestrator(ClaudeProvider())
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


class Turn(BaseModel):
    user: str = Field(default="", max_length=2000)
    reply: str = Field(default="", max_length=2000)


class AskIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=12)


@app.get("/health")
def health():
    return {"status": "ok", "name": "ORION AI"}


@app.post("/ask")
async def ask(body: AskIn, authorization: str = Header(default="")):
    claims = await asyncio.to_thread(verify, authorization.removeprefix("Bearer ").strip())
    if not claims:
        raise HTTPException(401, "Não autorizado.")
    if ALLOWED and (claims.get("email") or "").lower() not in ALLOWED:
        raise HTTPException(403, "Conta sem acesso.")
    if not _rate_ok(claims.get("sub", "?")):
        raise HTTPException(429, "Muitas solicitações. Aguarde um instante.")
    try:
        reply = await orchestrator.ask(body.text, [t.model_dump() for t in body.history])
    except Exception:
        raise HTTPException(502, "Falha ao consultar o modelo.")
    return {"reply": reply}
