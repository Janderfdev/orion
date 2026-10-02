"""ORION AI — backend V4.0 (ORION ENTENDE).

Rodar local:  uvicorn main:app --reload
Variáveis:    ANTHROPIC_API_KEY (obrigatória), ORION_SECRET, ORION_USER, ORION_PASSWORD,
              ORION_ALLOWED_ORIGIN (padrão https://janderfdev.github.io), ORION_MODEL
"""
import os, time
from collections import deque

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from auth.tokens import check_token, issue_token, verify_login
from core.orchestrator import Orchestrator
from providers.claude import ClaudeProvider

ORIGINS = [o.strip() for o in os.getenv("ORION_ALLOWED_ORIGIN", "https://janderfdev.github.io").split(",")]

app = FastAPI(title="ORION AI", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"])

orchestrator = Orchestrator(ClaudeProvider())
_hits: deque = deque()  # limite simples: 30 perguntas por minuto no total


class LoginIn(BaseModel):
    user: str = Field(max_length=60)
    password: str = Field(max_length=60)


class Turn(BaseModel):
    user: str = Field(default="", max_length=2000)
    reply: str = Field(default="", max_length=2000)


class AskIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=12)


@app.get("/health")
def health():
    return {"status": "ok", "name": "ORION AI"}


@app.post("/login")
def login(body: LoginIn):
    if not verify_login(body.user, body.password):
        raise HTTPException(401, "Credenciais inválidas.")
    return {"token": issue_token()}


@app.post("/ask")
async def ask(body: AskIn, authorization: str = Header(default="")):
    if not check_token(authorization.removeprefix("Bearer ").strip()):
        raise HTTPException(401, "Não autorizado.")
    now = time.time()
    while _hits and _hits[0] < now - 60:
        _hits.popleft()
    if len(_hits) >= 30:
        raise HTTPException(429, "Muitas solicitações. Aguarde um instante.")
    _hits.append(now)
    try:
        reply = await orchestrator.ask(body.text, [t.model_dump() for t in body.history])
    except Exception:
        raise HTTPException(502, "Falha ao consultar o modelo.")
    return {"reply": reply}
