"""ClaudeProvider — API da Anthropic com tool calling. A chave fica SÓ no servidor (ANTHROPIC_API_KEY)."""
import asyncio, os

MAX_STEPS = 5  # limite de rodadas de ferramentas por pergunta


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
        msgs = list(messages)
        text = ""
        for _ in range(MAX_STEPS):
            kwargs = dict(model=self.model, max_tokens=self.max_tokens, system=system, messages=msgs)
            if tools and execute:
                kwargs["tools"] = tools
            resp = await self._client.messages.create(**kwargs)
            text = "".join(b.text for b in resp.content if b.type == "text")
            if resp.stop_reason != "tool_use" or not execute:
                return text
            # o modelo pediu ferramentas: executa e devolve os resultados
            msgs.append({"role": "assistant", "content": resp.content})
            results = []
            for b in resp.content:
                if b.type == "tool_use":
                    out = await asyncio.to_thread(execute, b.name, b.input)
                    results.append({"type": "tool_result", "tool_use_id": b.id, "content": out})
            msgs.append({"role": "user", "content": results})
        return text or "Não consegui concluir isso agora."
