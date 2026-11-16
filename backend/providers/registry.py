"""Registro de modelos disponíveis. O site só vê ids e rótulos; quem decide e valida é o backend.

Só aparecem modelos cuja chave está configurada no servidor:
  GEMINI_API_KEY (ou GOOGLE_API_KEY) → modelos "gemini-*"
  ANTHROPIC_API_KEY                  → modelos "claude-*"
Configure a lista com ORION_MODELS="id:Rótulo,id2:Rótulo2" (o primeiro disponível é o padrão,
a menos que ORION_DEFAULT_MODEL seja definido). Se um nome de modelo deixar de existir,
troque-o por ORION_MODELS sem mexer no código.
"""
import os

from billing import plans
from providers.claude import ClaudeProvider
from providers.gemini import GeminiProvider, api_key as gemini_key

DEFAULT_MODELS = (
    "gemini-3.8-flash:Gemini 3.8 Flash (rápido),"
    "gemini-3.5-flash-lite:Gemini 3.5 Flash-Lite (leve),"
    "gemini-3.6-flash:Gemini 3.6 Flash,"
    "claude-sonnet-5-5:Claude Sonnet (equilibrado),"
    "claude-haiku-4-5-20251001:Claude Haiku (rápido),"
    "claude-opus-5-5:Claude Opus (avançado)"
)


def _build(model_id: str):
    """Cria o provedor do modelo, ou None se a chave dele não estiver configurada."""
    if model_id.startswith("gemini"):
        return GeminiProvider(model_id) if gemini_key() else None
    return ClaudeProvider(model_id) if os.getenv("ANTHROPIC_API_KEY") else None


class Registry:
    def __init__(self):
        self._entries: dict[str, dict] = {}
        for item in os.getenv("ORION_MODELS", DEFAULT_MODELS).split(","):
            mid, _, label = item.strip().partition(":")
            provider = _build(mid) if mid else None
            if provider:
                self._entries[mid] = {"label": label.strip() or mid, "provider": provider}
        self.default = os.getenv("ORION_DEFAULT_MODEL")
        if self.default not in self._entries:
            self.default = next(iter(self._entries), None)

    def models(self) -> list[dict]:
        return [{"id": k, "label": v["label"]} for k, v in self._entries.items()]

    # ── V5.2.0: modelos por plano (a regra está em billing/plans.py; o servidor decide, o site só mostra) ──
    def has(self, model_id) -> bool:
        return model_id in self._entries

    def _floor(self) -> int:
        return min((plans.get(plans.model_min_plan(k)).rank for k in self._entries), default=0)

    def allowed(self, plan_id, model_id) -> bool:
        """O plano pode usar esse modelo? Os modelos de menor nível configurados ficam sempre liberados (o serviço nunca fica sem modelo)."""
        if model_id not in self._entries:
            return False
        return plans.allows_model(plan_id, model_id) or plans.get(plans.model_min_plan(model_id)).rank == self._floor()

    def default_for(self, plan_id):
        """Padrão do plano: ORION_DEFAULT_MODEL (ou o 1º da lista) se o plano pode usá-lo; senão, o mais forte que o plano libera."""
        if self.default and self.allowed(plan_id, self.default):
            return self.default
        ok = [k for k in self._entries if self.allowed(plan_id, k)]
        return max(ok, key=lambda k: plans.get(plans.model_min_plan(k)).rank, default=None)   # empate: o primeiro da lista

    def models_for(self, plan_id) -> list[dict]:
        return [{"id": k, "label": v["label"], "locked": not self.allowed(plan_id, k), "min_plan": plans.model_min_plan(k)}
                for k, v in self._entries.items()]

    def get(self, model_id: str | None):
        """Devolve (id, provider). id vazio = padrão; id desconhecido = (None, None)."""
        mid = model_id or self.default
        e = self._entries.get(mid)
        return (mid, e["provider"]) if e else (None, None)
