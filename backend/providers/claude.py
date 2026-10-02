"""ClaudeProvider — usa a API da Anthropic. A chave fica SÓ no servidor (ANTHROPIC_API_KEY)."""
import os


class ClaudeProvider:
    name = "claude"

    def __init__(self):
        self.model = os.getenv("ORION_MODEL", "claude-sonnet-5-5")
        self.max_tokens = int(os.getenv("ORION_MAX_TOKENS", "600"))
        self._client = None

    async def generate(self, system: str, messages: list[dict]) -> str:
        if self._client is None:
            from anthropic import AsyncAnthropic  # lê ANTHROPIC_API_KEY do ambiente
            self._client = AsyncAnthropic()
        resp = await self._client.messages.create(
            model=self.model, max_tokens=self.max_tokens, system=system, messages=messages,
        )
        return "".join(b.text for b in resp.content if b.type == "text")
