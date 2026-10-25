"""ClaudeProvider — API da Anthropic com tool calling. A chave fica SÓ no servidor (ANTHROPIC_API_KEY).
V5.0: uma mensagem do usuário pode trazer "images": [{"mime", "data"(base64)}], enviadas como blocos de imagem."""
import asyncio, os

MAX_STEPS = 5  # limite de rodadas de ferramentas por pergunta


def _content(m: dict):
    """Texto simples, ou lista de blocos (imagens primeiro, depois o texto) quando a mensagem tem imagens."""
    imgs = m.get("images") or []
    if not imgs:
        return m["content"]
    blocks = [{"type": "image", "source": {"type": "base64", "media_type": i["mime"], "data": i["data"]}} for i in imgs]
    blocks.append({"type": "text", "text": m["content"]})
    return blocks


class ClaudeProvider:
    name = "claude"

    def __init__(self, model: str | None = None):
        self.model = model or os.getenv("ORION_MODEL", "claude-sonnet-5-5")
        self.max_tokens = int(os.getenv("ORION_MAX_TOKENS", "600"))
        self._client = None

    async def generate(self, system: str, messages: list[dict], tools: list[dict] | None = None, execute=None) -> str:
        if self._client is None:
            from anthropic import AsyncAnthropic  # lê ANTHROPIC_API_KEY do ambiente
            self._client = AsyncAnthropic()
        msgs = [{"role": m["role"], "content": _content(m)} for m in messages]
        text = ""
        for _ in range(MAX_STEPS):
            kwargs = dict(model=self.model, max_tokens=self.max_tokens, system=system, messages=msgs)
            if tools and execute:
                kwargs["tools"] = tools
            resp = await self._client.messages.create(**kwargs)
            text = "".join(b.text for b in resp.content if b.type == "text")
            if resp.stop_reason != "tool_use" or not execute:
                return text
            # o modelo pediu ferramentas: executa TODAS ao mesmo tempo e devolve os resultados
            msgs.append({"role": "assistant", "content": resp.content})
            uses = [b for b in resp.content if b.type == "tool_use"]
            outs = await asyncio.gather(*[asyncio.to_thread(execute, b.name, b.input) for b in uses])
            results = [{"type": "tool_result", "tool_use_id": b.id, "content": o} for b, o in zip(uses, outs)]
            msgs.append({"role": "user", "content": results})
        return text or "Não consegui concluir isso agora."
