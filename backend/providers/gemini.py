"""GeminiProvider — API do Google (Google AI Studio) com tool calling.

A chave fica SÓ no servidor: GEMINI_API_KEY (ou GOOGLE_API_KEY).
Usa a API REST direto (biblioteca `requests`, que já está no projeto).
V5.0: uma mensagem do usuário pode trazer "images": [{"mime", "data"(base64)}], enviadas ao modelo como inlineData.
"""
import asyncio, os, threading

import requests

from providers.errors import ProviderError

MAX_STEPS = 5  # limite de rodadas de ferramentas por pergunta
THINKING = os.getenv("ORION_THINKING", "minimal").lower()   # off | minimal | low | medium | high
_NEXT_LEVEL = {"minimal": "low", "medium": "low", "high": "low", "low": None}   # se o modelo recusar um nível, tenta o próximo
_tls = threading.local()


def _session():
    """Uma sessão por thread: reaproveita a conexão segura com o Google em vez de refazê-la a cada chamada."""
    s = getattr(_tls, "s", None)
    if s is None:
        s = _tls.s = requests.Session()
    return s
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def api_key() -> str:
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""


def _declaration(tool: dict) -> dict:
    d = {"name": tool["name"], "description": tool["description"]}
    if tool["input_schema"].get("properties"):   # o Gemini recusa "parameters" vazio
        d["parameters"] = tool["input_schema"]
    return d


def _parts(m: dict) -> list:
    """Partes da mensagem: imagens (se houver) primeiro, depois o texto."""
    parts = [{"inlineData": {"mimeType": i["mime"], "data": i["data"]}} for i in (m.get("images") or [])]
    parts.append({"text": m["content"]})
    return parts


class GeminiProvider:
    name = "gemini"

    def __init__(self, model: str):
        self.model = model
        self.max_tokens = int(os.getenv("ORION_MAX_TOKENS", "600"))
        self._is25 = "2.5" in model
        self._think = None if THINKING == "off" else THINKING   # nível de raciocínio dos modelos 3.x
        self._think25 = True                                     # ajuste de raciocínio dos modelos 2.5

    def _send(self, body: dict):
        headers = {"x-goog-api-key": api_key(), "Content-Type": "application/json"}
        return _session().post(URL.format(model=self.model), json=body, timeout=40, headers=headers)

    def _post(self, body: dict) -> dict:
        r = self._send(body)
        # 400 com ajuste de raciocínio no pedido: o modelo não aceita esse ajuste -> tenta o próximo nível, até ficar sem
        while r.status_code == 400 and "thinkingConfig" in body["generationConfig"]:
            if self._is25:
                self._think25 = False
                body["generationConfig"].pop("thinkingConfig", None)
            else:
                self._think = _NEXT_LEVEL.get(self._think)
                if self._think:
                    body["generationConfig"]["thinkingConfig"] = {"thinkingLevel": self._think}
                else:
                    body["generationConfig"].pop("thinkingConfig", None)
            r = self._send(body)
        if r.status_code != 200:
            raise ProviderError(r.status_code, r.text[:300])   # detalhe só vai para o log do servidor
        return r.json()

    async def generate(self, system: str, messages: list[dict], tools: list[dict] | None = None, execute=None) -> str:
        contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": _parts(m)}
                    for m in messages]
        is_25 = self._is25
        # o raciocínio interno do modelo consome tokens de saída: damos mais espaço para a resposta não ser cortada
        gen_cfg = {"maxOutputTokens": max(self.max_tokens, 1024 if is_25 else 4096)}
        if is_25 and "pro" not in self.model and self._think25:   # só nos 2.5 não-Pro dá para desligar o raciocínio
            gen_cfg["thinkingConfig"] = {"thinkingBudget": 0}
        elif not is_25 and self._think:
            # modelos 3.x: raciocínio mínimo = respostas bem mais rápidas (ORION_THINKING: off|minimal|low|medium|high)
            gen_cfg["thinkingConfig"] = {"thinkingLevel": self._think}
        body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": contents, "generationConfig": gen_cfg}
        if tools and execute:
            body["tools"] = [{"functionDeclarations": [_declaration(t) for t in tools]}]

        text = ""
        for _ in range(MAX_STEPS):
            data = await asyncio.to_thread(self._post, body)
            cands = data.get("candidates") or []
            if not cands:
                raise ProviderError(502, "resposta sem candidatos (possível bloqueio de segurança)")
            content = cands[0].get("content") or {}
            parts = content.get("parts") or []
            calls = [p["functionCall"] for p in parts if "functionCall" in p]
            text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
            if not calls or not execute:
                return text
            # o modelo pediu ferramentas: executa TODAS ao mesmo tempo e devolve os resultados
            contents.append(content)   # devolvido sem alterações (inclui as assinaturas internas do modelo)
            outs = await asyncio.gather(*[asyncio.to_thread(execute, c["name"], c.get("args") or {}) for c in calls])
            results = [{"functionResponse": {"name": c["name"], "response": {"result": o}}} for c, o in zip(calls, outs)]
            contents.append({"role": "user", "parts": results})
        return text or "Não consegui concluir isso agora."
