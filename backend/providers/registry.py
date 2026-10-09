"""Registro de modelos disponíveis. O site só vê ids e rótulos; quem decide e valida é o backend.

Configure com ORION_MODELS="id:Rótulo,id2:Rótulo2" (o primeiro é o padrão, a menos que
ORION_DEFAULT_MODEL seja definido). Para adicionar OpenAI/Gemini no futuro: crie o provedor
em providers/ e registre-o aqui.
"""
import os

from providers.claude import ClaudeProvider

DEFAULT_MODELS = (
    "claude-sonnet-5-5:Claude Sonnet (equilibrado),"
    "claude-haiku-4-5-20251001:Claude Haiku (rápido),"
    "claude-opus-5-5:Claude Opus (avançado)"
)


class Registry:
    def __init__(self):
        self._entries: dict[str, dict] = {}
        for item in os.getenv("ORION_MODELS", DEFAULT_MODELS).split(","):
            mid, _, label = item.strip().partition(":")
            if mid:
                self._entries[mid] = {"label": label.strip() or mid, "provider": ClaudeProvider(mid)}
        self.default = os.getenv("ORION_DEFAULT_MODEL") or next(iter(self._entries), None)
        if self.default not in self._entries:
            self.default = next(iter(self._entries), None)

    def models(self) -> list[dict]:
        return [{"id": k, "label": v["label"]} for k, v in self._entries.items()]

    def get(self, model_id: str | None):
        """Devolve (id, provider). id vazio = padrão; id desconhecido = None."""
        mid = model_id or self.default
        e = self._entries.get(mid)
        return (mid, e["provider"]) if e else (None, None)
