"""ORION AI — backend (V5.0).

Rodar local:  uvicorn main:app --reload
Anexos (V5.0): POST /ask aceita "image" {mime, data(base64)} e "file" {name, text}; inválidos → 422 "anexo:<código>" sem gastar cota.
Rotas:  GET /health · GET /models · POST /ask · POST /speak · POST /speak/preview · GET /speak/diag · POST /memory/clear
V5.2.0 (Resumo do Dia): GET /news/daily?refresh=1
V5.2.0 (ORION API): POST /v1/chat · GET /v1/models · GET /v1/usage (chave de API) · GET|POST /api/keys · POST /api/keys/{id}/revoke|rotate · GET /api/usage (login)
V5.2.0 (planos e assinaturas): GET /plan · GET /plans · GET /billing/me · POST /billing/checkout · POST /billing/cancel · POST /billing/webhook/mercadopago
Variáveis:
  GEMINI_API_KEY         chave do Google AI Studio (modelos gemini-*)  — ao menos UMA chave é obrigatória
  ANTHROPIC_API_KEY      chave da API do Claude (modelos claude-*)
  ORION_ALLOWED_EMAILS   (recomendada) e-mails com acesso, separados por vírgula.
                         Vazio = qualquer conta criada no Firebase pode usar (e gastar seu crédito!)
  ORION_MAX_DAILY_USERS  (300) máximo de contas DIFERENTES que usam a ORION por dia (freio contra criação em massa
                         de contas). 0 = sem limite. Não vale quando ORION_ALLOWED_EMAILS está preenchida.
  ORION_REQUIRE_VERIFIED "1" exige e-mail verificado no token (padrão: desligado; o login atual não envia verificação)
  ORION_AGENT            "1" liga o Agent Engine (padrão: desligado). O /ask passa a devolver "agent" quando ele respondeu.
  ORION_MODELS           "id:Rótulo,id2:Rótulo2" (padrão: Gemini e Claude); ORION_DEFAULT_MODEL
  FIREBASE_PROJECT_ID    padrão: orion-ai-b8d39
  ORION_ALLOWED_ORIGIN   padrão: https://janderfdev.github.io
  ORION_MAX_TOKENS, ORION_PER_MINUTE (15), ORION_PER_DAY (200)
  Imagens: toda resposta recebe 2–3 fotos da Wikipédia/Wikimedia (core/images.py, sem chave); só upload.wikimedia.org
  ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID_1 … _4   (opcionais) ligam as vozes do ElevenLabs
                         (o slot 1 aceita também o nome antigo ELEVENLABS_VOICE_ID); ELEVENLABS_MODEL (padrão eleven_flash_v2_5),
                         ORION_TTS_DAILY_CHARS (4000 por usuário por dia; a prévia de voz também conta)
  ORION_DIAG             "1" liga o /speak/diag (padrão: desligado; exige ORION_ALLOWED_EMAILS preenchida)
  FIREBASE_SERVICE_ACCOUNT  JSON da service account (cota diária e planos gravados só pelo servidor)
  ORION_LIMIT_FREE (10), ORION_LIMIT_PLUS (100), ORION_LIMIT_PRO (500)   perguntas por dia em cada plano
  ORION_THINKING         raciocínio dos modelos Gemini 3.x: off | minimal (padrão) | low | medium | high
  ORION_MEMORY           "firestore" (padrão) ou "local" (memória do processo)
  V5.2.0: ORION_MP_ACCESS_TOKEN · ORION_MP_WEBHOOK_SECRET · ORION_MP_TEST_PAYER_EMAIL · ORION_PRICE_PLUS|PRO ·
          ORION_API_KEY_PEPPER (opcional: segredo do hash das chaves de API) · ORION_API_MONTHLY_PLUS|PRO · ORION_API_RPM_PLUS|PRO ·
          ORION_BILLING_GRACE_DAYS · ORION_BILLING_RETURN_URL · limites em billing/plans.py (docs/BILLING.md explica tudo)
"""
import asyncio, datetime, logging, os, re, secrets, time
from collections import deque
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Path, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from api import keys as api_keys
from api.errors import ApiError, body as api_error_body
from api.service import ApiService
from api.store import ApiStore
from auth.firebase import verify
from billing import plans, service as billing_service
from core import attachments, images
from core.orchestrator import Orchestrator
from core.quota import Quota, PROJECT_ID as FIREBASE_PROJECT
from memory.store import Memory
from news.service import NewsService, NewsUnavailable
from providers.registry import Registry
from voice import elevenlabs

log = logging.getLogger("orion")
ORIGINS = [o.strip() for o in os.getenv("ORION_ALLOWED_ORIGIN", "https://janderfdev.github.io").split(",")]
ALLOWED = {e.strip().lower() for e in os.getenv("ORION_ALLOWED_EMAILS", "").split(",") if e.strip()}
PER_MINUTE = int(os.getenv("ORION_PER_MINUTE", "15"))
PER_DAY = int(os.getenv("ORION_PER_DAY", "200"))
TTS_DAILY_CHARS = int(os.getenv("ORION_TTS_DAILY_CHARS", "4000"))   # limite de caracteres falados por usuário por dia
DIAG_ENABLED = os.getenv("ORION_DIAG", "0") == "1"                   # diagnóstico de voz: desligado por padrão
DIAG_TEXT = "Teste de voz do ORION."
MAX_DAILY_USERS = int(os.getenv("ORION_MAX_DAILY_USERS", "300"))     # contas diferentes por dia (0 = sem limite)
REQUIRE_VERIFIED = os.getenv("ORION_REQUIRE_VERIFIED", "0") == "1"
PRUNE_AT = 2000                                                       # tamanho a partir do qual os mapas em memória são limpos

# Frase fixa da prévia de voz (o site não envia texto: ninguém usa a prévia para falar o que quiser)
PREVIEW_TEXT = {"en": "Hi, I'm ORION. This is how I sound.", "pt": "Olá, eu sou o ORION. É assim que eu falo."}

if not ALLOWED:
    log.warning("ORION_ALLOWED_EMAILS vazio: qualquer conta Firebase pode usar a ORION (e gastar créditos). Defina a lista no Render.")

app = FastAPI(title="ORION AI", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"])

registry = Registry()
orchestrator = Orchestrator(Memory())
quota = Quota()   # cota diária por plano (free/plus/pro)
billing = billing_service.build(quota._admin, FIREBASE_PROJECT, on_plan_change=quota.invalidate_plan)   # V5.2.0: assinaturas (Mercado Pago)
news = NewsService()   # V5.2.0: Resumo do Dia (RSS de fontes reais, com cache)
orion_api = ApiService(ApiStore(quota._admin, FIREBASE_PROJECT), plan_of=lambda uid: quota.status(uid)["plan"])   # V5.2.0: ORION API
_hits: dict[str, deque] = {}  # limite de uso por usuário (em memória)
_tts_used: dict[str, tuple] = {}  # uid -> (dia, caracteres falados hoje)
_seen: dict = {"day": None, "uids": set()}   # contas que usaram a ORION hoje


def _user_ok(uid: str) -> bool:
    """Freio contra criação em massa de contas: no máximo MAX_DAILY_USERS contas diferentes por dia.
    Quem já usou hoje continua passando. Zera à meia-noite e quando o servidor reinicia."""
    today = datetime.date.today()
    if _seen["day"] != today:
        _seen["day"], _seen["uids"] = today, set()
    if uid in _seen["uids"]:
        return True
    if MAX_DAILY_USERS and len(_seen["uids"]) >= MAX_DAILY_USERS:
        return False
    _seen["uids"].add(uid)
    return True


def _rate_ok(uid: str) -> bool:
    now = time.time()
    if len(_hits) >= PRUNE_AT:   # poda: tira quem não pergunta há mais de um dia
        for k in [k for k, d in _hits.items() if not d or d[-1] < now - 86400]:
            del _hits[k]
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
    if len(_tts_used) >= PRUNE_AT:   # poda: tira registros de dias anteriores
        for k in [k for k, (d, _) in _tts_used.items() if d != today]:
            del _tts_used[k]
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


class VoiceOpts(BaseModel):
    """Escolhas de voz vindas do site. Tudo validado aqui: o site nunca manda Voice ID, só o slot."""
    voice: int = Field(default=1, ge=1, le=4)                                                   # slot da voz (1 a 4)
    pace: float = Field(default=elevenlabs.PACE_DEFAULT, ge=elevenlabs.PACE_MIN, le=elevenlabs.PACE_MAX)
    expressivity: float = Field(default=elevenlabs.EXPR_DEFAULT, ge=elevenlabs.EXPR_MIN, le=elevenlabs.EXPR_MAX)


class SpeakIn(VoiceOpts):
    text: str = Field(min_length=1, max_length=2000)


class PreviewIn(VoiceOpts):
    lang: Literal["en", "pt"] = "en"


class ImageIn(BaseModel):
    mime: Literal["image/jpeg", "image/png", "image/webp"]
    data: str = Field(min_length=100, max_length=attachments.MAX_IMAGE_B64)   # base64; o servidor confere de novo os bytes


class FileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=attachments.MAX_FILE_CHARS)


class AskIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    model: str | None = Field(default=None, max_length=80)  # id vindo de GET /models
    lang: Literal["pt", "en"] = "pt"                          # idioma da conversa (busca das imagens)
    image: ImageIn | None = None                              # V5.0: UMA imagem anexada (jpeg/png/webp)
    file: FileIn | None = None                                # V5.0: UM arquivo de texto anexado


async def _no_images():
    return None


async def _with_images(sources, task):
    """Garante 2 a 3 imagens por resposta: se a resposta já trouxe ao menos 2, não faz nada; senão completa com fotos da Wikipédia."""
    srcs = list(sources) if isinstance(sources, list) else []
    have = 0
    for s in srcs:
        if isinstance(s, dict):
            have += len(s.get("images") or ([s["image"]] if s.get("image") else []))
    if have >= 2:
        task.cancel()
        return srcs
    try:
        extra = await asyncio.wait_for(asyncio.shield(task), timeout=4)
    except Exception:
        return srcs                                    # imagens são um extra: sem elas a resposta segue normal
    if extra and extra.get("images"):
        srcs.append({"url": extra["url"], "title": extra["title"], "images": extra["images"][:max(1, 3 - have)]})
    return srcs


async def _auth(authorization: str, count: bool = False, with_email: bool = False):
    """Valida o login do Firebase, a lista de e-mails e o limite de contas por dia. Devolve (uid, token).
    count=True também aplica o limite de uso (perguntas ao modelo)."""
    token = authorization.removeprefix("Bearer ").strip()
    claims = await asyncio.to_thread(verify, token)
    if not claims:
        raise HTTPException(401, "Não autorizado.")
    if ALLOWED and (claims.get("email") or "").lower() not in ALLOWED:
        raise HTTPException(403, "Conta sem acesso.")
    if REQUIRE_VERIFIED and not claims.get("email_verified"):
        raise HTTPException(403, "Conta sem acesso.")
    uid = claims.get("sub", "?")
    if not ALLOWED and not _user_ok(uid):
        raise HTTPException(429, "Muitos usuários agora. Tente mais tarde.")
    if count and not _rate_ok(uid):
        raise HTTPException(429, "Muitas solicitações. Aguarde um instante.")
    if with_email:                                     # V5.2.0: o checkout precisa do e-mail VERIFICADO PELO TOKEN (nunca do corpo da requisição)
        return uid, token, (claims.get("email") or "").strip()
    return uid, token


@app.get("/health")
def health():
    return {"status": "ok", "name": "ORION AI"}


@app.get("/models")
async def models(authorization: str = Header(default="")):
    uid, _ = await _auth(authorization)
    plan = (await asyncio.to_thread(quota.status, uid))["plan"]
    voices = [dict(v, locked=not plans.allows_voice(plan, v.get("slot"))) for v in elevenlabs.voices()]   # V5.2.0: FREE = 1 voz; PLUS/PRO = 4
    return {"default": registry.default, "models": registry.models(), "tts": elevenlabs.configured(), "plan": plan,
            "voices": voices,   # [{slot, label, locked}] — nunca os Voice IDs
            "voice_limits": {"pace": [elevenlabs.PACE_MIN, elevenlabs.PACE_MAX, elevenlabs.PACE_DEFAULT],
                             "expressivity": [elevenlabs.EXPR_MIN, elevenlabs.EXPR_MAX, elevenlabs.EXPR_DEFAULT]}}


@app.post("/ask")
async def ask(body: AskIn, authorization: str = Header(default="")):
    uid, token = await _auth(authorization, count=True)
    if not registry.models():
        raise HTTPException(503, "Nenhum modelo configurado no servidor.")
    model_id, provider = registry.get(body.model)
    if not provider:
        raise HTTPException(400, "Modelo indisponível.")
    try:                                               # anexo inválido NÃO gasta cota
        image = attachments.check_image(body.image.mime, body.image.data) if body.image else None
        file = attachments.clean_file(body.file.name, body.file.text) if body.file else None
    except attachments.AttachmentError as e:
        raise HTTPException(422, f"anexo:{e}")
    q = await asyncio.to_thread(quota.consume, uid)
    if not q["ok"]:                                    # 402: o site mostra "faça upgrade para continuar"
        raise HTTPException(402, "Limite diário de perguntas atingido.")
    # busca as fotos da Wikipédia enquanto o modelo responde (com anexo do usuário, não: as fotos não combinariam)
    img_task = asyncio.create_task(_no_images() if (image or file) else asyncio.to_thread(images.find, body.text, body.lang))
    try:
        result = await orchestrator.ask(body.text, uid, token, provider, image=image, file=file)
    except Exception as e:
        await asyncio.to_thread(quota.refund, uid)     # a pergunta não deu resposta: devolve a cota
        log.exception("Falha ao consultar o modelo")  # detalhes só no log do servidor
        status = getattr(e, "status_code", None)
        if status == 429:                              # limite de uso do provedor (ex.: plano gratuito)
            raise HTTPException(429, "O modelo atingiu o limite de uso agora.")
        if status in (403, 404):                       # modelo inexistente/aposentado ou sem permissão para esta chave
            raise HTTPException(503, "Modelo indisponível para esta chave.")
        raise HTTPException(502, "Falha ao consultar o modelo.")
    return {"reply": result["reply"], "model": model_id, "sources": await _with_images(result["sources"], img_task), "understood": result["understood"], "agent": result.get("agent"),
            "quota": {"used": q["used"], "limit": q["limit"], "plan": q["plan"]}}


class CheckoutIn(BaseModel):
    plan: Literal["plus", "pro"]               # o preço NÃO vem do site: o servidor usa o do catálogo


def _billing_http(e: "billing_service.BillingError") -> HTTPException:
    return HTTPException(e.status, f"billing:{e.code}")   # o site traduz "billing:<código>"


@app.get("/plan")
async def my_plan(authorization: str = Header(default="")):
    """Plano e uso de hoje (não gasta pergunta). O site usa para o chip do plano e para liberar/travar recursos."""
    uid, _ = await _auth(authorization)
    st = await asyncio.to_thread(quota.status, uid)
    return {"plan": st["plan"], "used": st["used"], "limit": st["limit"],
            "voices": list(plans.get(st["plan"]).voice_slots), "api": plans.can(st["plan"], "api")}


@app.get("/plans")
def plans_catalog():
    """Catálogo público dos planos (sem segredos e sem recursos ainda não lançados)."""
    return {"plans": plans.public_catalog(), "billing": billing.configured}


@app.get("/billing/me")
async def billing_me(authorization: str = Header(default="")):
    uid, _ = await _auth(authorization)
    try:
        return await asyncio.to_thread(billing.me, uid)
    except billing_service.BillingError as e:
        raise _billing_http(e)


@app.post("/billing/checkout")
async def billing_checkout(body: CheckoutIn, authorization: str = Header(default="")):
    uid, _, email = await _auth(authorization, with_email=True)
    try:
        return await asyncio.to_thread(billing.checkout, uid, email, body.plan)
    except billing_service.BillingError as e:
        raise _billing_http(e)


@app.post("/billing/cancel")
async def billing_cancel(authorization: str = Header(default="")):
    uid, _ = await _auth(authorization)
    try:
        return await asyncio.to_thread(billing.cancel, uid)
    except billing_service.BillingError as e:
        raise _billing_http(e)


@app.post("/billing/webhook/mercadopago")
async def mercadopago_webhook(request: Request):
    """Chamado pelo Mercado Pago (não pelo site): sem login; a prova de origem é a assinatura x-signature.
    401 = assinatura inválida · 200 = tratado ou ignorado de propósito · 5xx = falhou de verdade (o Mercado Pago tenta de novo)."""
    try:
        raw = await request.json()
    except Exception:
        raw = {}
    body = raw if isinstance(raw, dict) else {}
    headers = {k.lower(): v for k, v in request.headers.items()}
    try:
        res = await asyncio.to_thread(billing.handle_webhook, headers, dict(request.query_params), body)
    except billing_service.InvalidSignature:
        raise HTTPException(401, "Assinatura inválida.")
    except billing_service.BillingError as e:
        raise _billing_http(e)
    except Exception:
        log.exception("Falha ao processar o webhook do Mercado Pago")
        raise HTTPException(500, "Falha ao processar.")
    return {"ok": True, **res}


# ═══ ORION API (V5.2.0) ═══
# Dois públicos: a pessoa logada gerencia as chaves (/api/*, login do Firebase) e o programa dela usa a chave (/v1/*).
# Todo erro dessas rotas tem o formato {"error": {"code", "message", "request_id"}} (ver api/errors.py).
V1_MAX_BODY = 32_768
V1_TIMEOUT = 45


def _rid() -> str:
    return "req_" + secrets.token_hex(6)


@app.exception_handler(ApiError)
async def _api_error(request: Request, exc: ApiError):
    rid = _rid()
    headers = {"X-Request-Id": rid}
    if exc.retry_after:
        headers["Retry-After"] = str(exc.retry_after)
    return JSONResponse(api_error_body(exc, rid), status_code=exc.status, headers=headers)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception):
    log.exception("Erro não tratado em %s", request.url.path)             # detalhes só no log do servidor
    if request.url.path.startswith(("/v1/", "/api/")):
        rid = _rid()
        return JSONResponse(api_error_body(ApiError(500, "internal_error", "Erro interno."), rid), status_code=500, headers={"X-Request-Id": rid})
    return PlainTextResponse("Internal Server Error", status_code=500)


class KeyIn(BaseModel):
    name: str = Field(default="", max_length=60)


KEY_ID = Path(..., pattern="^[0-9a-f]{8}$")


@app.get("/api/keys")
async def api_list_keys(authorization: str = Header(default="")):
    uid, _ = await _auth(authorization)
    return {"keys": await asyncio.to_thread(orion_api.list_keys, uid)}


@app.post("/api/keys")
async def api_create_key(body: KeyIn, authorization: str = Header(default="")):
    uid, _ = await _auth(authorization)
    return await asyncio.to_thread(orion_api.create_key, uid, body.name)   # a chave completa só vem nesta resposta


@app.post("/api/keys/{key_id}/revoke")
async def api_revoke_key(key_id: str = KEY_ID, authorization: str = Header(default="")):
    uid, _ = await _auth(authorization)
    return await asyncio.to_thread(orion_api.revoke, uid, key_id)


@app.post("/api/keys/{key_id}/rotate")
async def api_rotate_key(key_id: str = KEY_ID, authorization: str = Header(default="")):
    uid, _ = await _auth(authorization)
    return await asyncio.to_thread(orion_api.rotate, uid, key_id)


@app.get("/api/usage")
async def api_usage(authorization: str = Header(default="")):
    uid, _ = await _auth(authorization)
    return await asyncio.to_thread(orion_api.usage, uid)


async def _v1_who(authorization: str) -> dict:
    return await asyncio.to_thread(orion_api.authenticate, api_keys.from_header(authorization))


@app.get("/v1/models")
async def v1_models(response: Response, authorization: str = Header(default="")):
    await _v1_who(authorization)
    response.headers["X-Request-Id"] = _rid()
    return {"default": registry.default, "models": registry.models()}


@app.get("/v1/usage")
async def v1_usage(response: Response, authorization: str = Header(default="")):
    who = await _v1_who(authorization)
    response.headers["X-Request-Id"] = _rid()
    return await asyncio.to_thread(orion_api.usage, who["uid"])


@app.post("/v1/chat")
async def v1_chat(request: Request, response: Response, authorization: str = Header(default="")):
    """Uma pergunta ao ORION. Corpo: {"message": "...", "model": "<id de GET /v1/models>" (opcional)}."""
    rid = _rid()
    response.headers["X-Request-Id"] = rid
    who = await _v1_who(authorization)
    try:
        if int(request.headers.get("content-length") or 0) > V1_MAX_BODY:
            raise ApiError(413, "payload_too_large", "Corpo grande demais.")
    except ValueError:
        raise ApiError(400, "invalid_request", "Cabeçalho Content-Length inválido.")
    raw = await request.body()
    if len(raw) > V1_MAX_BODY:
        raise ApiError(413, "payload_too_large", "Corpo grande demais.")
    try:
        data = await request.json()
    except Exception:
        raise ApiError(400, "invalid_request", "O corpo precisa ser um JSON.")
    msg = data.get("message") if isinstance(data, dict) else None
    mdl = data.get("model") if isinstance(data, dict) else None
    if not isinstance(msg, str) or not msg.strip() or len(msg) > 4000:
        raise ApiError(400, "invalid_request", '"message" deve ser um texto de 1 a 4000 caracteres.')
    if mdl is not None and (not isinstance(mdl, str) or len(mdl) > 80):
        raise ApiError(400, "invalid_request", '"model" deve ser um texto.')
    if not registry.models():
        raise ApiError(503, "model_unavailable", "Nenhum modelo configurado no servidor.")
    model_id, provider = registry.get(mdl)
    if not provider:
        raise ApiError(400, "model_unavailable", "Modelo indisponível. Veja GET /v1/models.")
    use = await asyncio.to_thread(orion_api.begin, who["uid"], who["key_id"])    # plano, limite por minuto e cota do mês
    try:
        result = await asyncio.wait_for(orchestrator.ask_stateless(msg.strip(), provider), timeout=V1_TIMEOUT)
    except asyncio.TimeoutError:
        await asyncio.to_thread(orion_api.refund, who["uid"], who["key_id"])
        raise ApiError(504, "timeout", "O modelo demorou demais.")
    except Exception as e:
        await asyncio.to_thread(orion_api.refund, who["uid"], who["key_id"])     # sem resposta, sem cobrança
        log.exception("ORION API: falha ao consultar o modelo")
        status = getattr(e, "status_code", None)
        if status == 429:
            raise ApiError(503, "provider_busy", "O modelo está no limite de uso agora. Tente em instantes.", retry_after=10)
        if status in (403, 404):
            raise ApiError(503, "model_unavailable", "Modelo indisponível no momento.")
        raise ApiError(502, "provider_error", "Falha ao consultar o modelo.")
    sources = [{"title": s.get("title"), "url": s.get("url")} for s in result["sources"] if isinstance(s, dict) and s.get("url")]
    return {"id": rid, "reply": result["reply"], "model": model_id, "sources": sources, "usage": use}


@app.get("/news/daily")
async def news_daily(refresh: bool = False, authorization: str = Header(default="")):
    """Resumo do Dia: notícias reais (RSS de veículos reconhecidos), por categoria, sem repetição. Ver news/service.py."""
    await _auth(authorization)
    try:
        return await asyncio.to_thread(news.get, refresh)
    except NewsUnavailable:
        raise HTTPException(503, "news:unavailable")


@app.post("/memory/clear")
async def clear_memory(authorization: str = Header(default="")):
    uid, token = await _auth(authorization)
    await orchestrator.clear(uid, token)
    return {"ok": True}


async def _speak(uid: str, text: str, opts: VoiceOpts) -> Response:
    """Gera o áudio (voz + pace + expressividade) respeitando a cota diária. Usado por /speak e /speak/preview."""
    if not elevenlabs.configured():
        raise HTTPException(503, "Voz não configurada.")
    if not elevenlabs.voice_id(opts.voice):
        raise HTTPException(400, "Essa voz não está configurada no servidor.")
    plan = (await asyncio.to_thread(quota.status, uid))["plan"]
    if not plans.allows_voice(plan, opts.voice):       # V5.2.0: voz 2 a 4 só nos planos pagos (validado aqui, não no site)
        raise HTTPException(403, "plan:voice_locked")
    text = elevenlabs.clean(text)
    if not _tts_ok(uid, len(text)):
        raise HTTPException(429, "Limite diário de voz atingido.")
    try:
        audio = await asyncio.to_thread(elevenlabs.synthesize, text, opts.voice, opts.pace, opts.expressivity)
    except Exception as e:
        # o log do servidor (Render → Logs) mostra o status e o motivo exato recusado pelo ElevenLabs
        status = getattr(e, "status_code", None)
        log.error("Falha ao gerar a voz: slot=%s status=%s detalhe=%s", opts.voice, status, str(e)[:300])
        _tts_refund(uid, len(text))
        kw = re.search(r'"status"\s*:\s*"([a-z_]{1,40})"', str(e))
        reason = kw.group(1) if kw else ""
        low = str(e).lower()
        if "exceeds your quota" in low or "credits remaining" in low or "quota_exceeded" in low:
            reason = "quota_exceeded"   # créditos do ElevenLabs esgotados (às vezes vêm como 401, às vezes como 429)
        # "tts:<status do ElevenLabs>:<palavra-chave>" — o site traduz isso numa mensagem clara (sem expor texto bruto nem chaves)
        raise HTTPException(429 if status == 429 else 502, f"tts:{status if isinstance(status, int) else 0}:{reason}")
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@app.post("/speak")
async def speak(body: SpeakIn, authorization: str = Header(default="")):
    """Fala da resposta com a voz escolhida. Qualquer falha aqui faz o site voltar à voz do navegador."""
    uid, _ = await _auth(authorization)
    return await _speak(uid, body.text, body)


@app.post("/speak/preview")
async def speak_preview(body: PreviewIn, authorization: str = Header(default="")):
    """Prévia curta de uma voz (frase fixa). Conta na cota diária de voz, como qualquer fala."""
    uid, _ = await _auth(authorization)
    return await _speak(uid, PREVIEW_TEXT[body.lang], body)


@app.get("/speak/diag")
async def speak_diag(voice: int = 1, authorization: str = Header(default="")):
    """Diagnóstico da voz do ElevenLabs. Desligado por padrão: exige ORION_DIAG=1 e ORION_ALLOWED_EMAILS preenchida.
    Conta na cota de voz e nunca devolve o texto bruto do erro (ele vai só para o log do servidor).
    ?voice=1..4 testa o slot escolhido; 'slots' mostra quais estão configurados."""
    uid, _ = await _auth(authorization)
    if not DIAG_ENABLED or not ALLOWED:
        raise HTTPException(404, "Not found")
    slots = {s: bool(elevenlabs.voice_id(s)) for s in elevenlabs.SLOTS}
    if not os.getenv("ELEVENLABS_API_KEY", "").strip():
        return {"ok": False, "slots": slots, "motivo": "ELEVENLABS_API_KEY não chegou ao servidor (confira o nome no Render e faça redeploy)."}
    if voice not in elevenlabs.SLOTS or not slots[voice]:
        return {"ok": False, "slots": slots, "motivo": f"ELEVENLABS_VOICE_ID_{voice} não chegou ao servidor (confira o nome no Render e faça redeploy)."}
    vid = elevenlabs.voice_id(voice)
    info = {"slot": voice, "slots": slots, "voice_id_tamanho": len(vid), "modelo": os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5")}
    if not _tts_ok(uid, len(DIAG_TEXT)):
        raise HTTPException(429, "Limite diário de voz atingido.")
    try:
        audio = await asyncio.to_thread(elevenlabs.synthesize, DIAG_TEXT, voice)
        return {"ok": True, "bytes": len(audio), **info}
    except Exception as e:
        _tts_refund(uid, len(DIAG_TEXT))
        status, det = getattr(e, "status_code", None), str(e)[:400]
        log.error("Diag de voz: slot=%s status=%s detalhe=%s", voice, status, det)   # detalhe só no log
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
        return {"ok": False, "status": status, "dica": dica, **info}   # sem "detalhe": o texto bruto fica só no log
