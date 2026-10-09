"""GeminiProvider — API do Google (Google AI Studio) com tool calling.

A chave fica SÓ no servidor: GEMINI_API_KEY (ou GOOGLE_API_KEY).
Usa a API REST direto (biblioteca `requests`, que já está no projeto).
"""
import asyncio, os

import requests

from providers.errors import ProviderError

MAX_STEPS = 5  # limite de rodadas de ferramentas por pergunta
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def api_key() -> str:
    return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""


def _declaration(tool: dict) -> dict:
    d = {"name": tool["name"], "description": tool["description"]}
    if tool["input_schema"].get("properties"):   # o Gemini recusa "parameters" vazio
        d["parameters"] = tool["input_schema"]
    return d


class GeminiProvider:
    name = "gemini"

    def __init__(self, model: str):
        self.model = model
        self.max_tokens = int(os.getenv("ORION_MAX_TOKENS", "600"))

    def _post(self, body: dict) -> dict:
        r = requests.post(URL.format(model=self.model), json=body, timeout=40,
                          headers={"x-goog-api-key": api_key(), "Content-Type": "application/json"})
        if r.status_code != 200:
            raise ProviderError(r.status_code, r.text[:300])   # detalhe só vai para o log do servidor
        return r.json()

    async def generate(self, system: str, messages: list[dict], tools: list[dict] | None = None, execute=None) -> str:
        contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                    for m in messages]
        gen_cfg = {"maxOutputTokens": max(self.max_tokens, 1024)}
        # os modelos 2.5 "pensam" antes de responder e isso consome tokens; nos não-Pro desligamos
        if "2.5" in self.model and "pro" not in self.model:
            gen_cfg["thinkingConfig"] = {"thinkingBudget": 0}
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
            # o modelo pediu ferramentas: executa e devolve os resultados
            contents.append(content)   # devolvido sem alterações (inclui as assinaturas internas do modelo)
            results = []
            for c in calls:
                out = await asyncio.to_thread(execute, c["name"], c.get("args") or {})
                results.append({"functionResponse": {"name": c["name"], "response": {"result": out}}})
            contents.append({"role": "user", "parts": results})
        return text or "Não consegui concluir isso agora."
