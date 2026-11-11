"""Catálogo de planos do ORION (V5.2.0) — a ÚNICA fonte de verdade sobre o que cada plano pode.

Planos da V5.2.0: free < plus < pro.  (O ORION ULTRA chega na V5.5.0, junto com o ORION CODE: não existe aqui ainda.)  Tudo aqui é decidido no servidor: o navegador nunca diz qual é o plano de ninguém.
O plano de cada usuário vem do Firestore (plans/{uid}, gravado só pelo servidor; ver core/quota.py e, na próxima etapa,
billing/service.py quando o pagamento for confirmado por webhook).

Números (limites, preços) NÃO são fixos no código: vêm de variáveis de ambiente, com valores PROVISÓRIOS de partida.
Eles precisam ser confirmados por você antes do lançamento. Preço sem variável = plano "ainda não à venda".

Variáveis:
  ORION_LIMIT_FREE|PLUS|PRO              perguntas por dia           (10 · 100 · 500)
  ORION_API_MONTHLY_PLUS|PRO             requisições do ORION API por mês   (1000 · 10000)
  ORION_API_RPM_PLUS|PRO                 requisições por minuto no ORION API (10 · 30)
  ORION_PRICE_PLUS|PRO                   preço mensal em CENTAVOS de real (ex.: 1990). Vazio = sem preço definido
"""
import os
from dataclasses import dataclass

ORDER = ("free", "plus", "pro")
DEFAULT = "free"

# Recursos que existem como NOME de permissão. RELEASED = os que já funcionam nesta versão.
# Um recurso fora de RELEASED nunca é concedido nem anunciado (o ORION CODE e o ULTRA são V5.5.0).
FEATURES = ("chat", "images_basic", "images_advanced", "history", "voices_4", "api", "multitask", "advanced_analysis",
            "orion_code")
RELEASED = frozenset({"chat", "history", "voices_4", "api"})
# Só entra em RELEASED o que o ORION faz DE VERDADE e o servidor controla por plano. Ficam de fora, de propósito:
#   images_basic / images_advanced  o ORION mostra fotos de fontes (Wikipédia/Wikimedia) em respostas, mas ainda NÃO gera imagens
#   multitask / advanced_analysis   sem diferença real entre planos hoje
#   orion_code                      V5.5.0
# Quando um deles passar a existir de verdade, basta incluí-lo aqui (os planos que já têm o direito passam a recebê-lo).


def _int(name: str, default: int) -> int:
    try:
        return max(0, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _price(name: str):
    raw = os.getenv(name, "").strip()
    return int(raw) if raw.isdigit() and int(raw) > 0 else None


@dataclass(frozen=True)
class Plan:
    id: str
    name: str
    rank: int
    daily_questions: int
    voice_slots: tuple          # slots do ElevenLabs liberados (1..4)
    api_monthly: int            # 0 = sem acesso ao ORION API
    api_per_minute: int
    price_cents: int | None     # mensal, em centavos de BRL; None = ainda sem preço (não pode ser assinado)
    features: frozenset

    @property
    def purchasable(self) -> bool:
        return self.price_cents is not None and self.id != "free"


def _build() -> dict:
    base = {"chat", "images_basic", "history"}
    plus = base | {"images_advanced", "voices_4", "api"}
    pro = plus | {"multitask", "advanced_analysis", "orion_code"}
    return {
        "free":  Plan("free", "ORION FREE", 0, _int("ORION_LIMIT_FREE", 10), (1,), 0, 0, None, frozenset(base)),
        "plus":  Plan("plus", "ORION PLUS", 1, _int("ORION_LIMIT_PLUS", 100), (1, 2, 3, 4),
                      _int("ORION_API_MONTHLY_PLUS", 1000), _int("ORION_API_RPM_PLUS", 10),
                      _price("ORION_PRICE_PLUS"), frozenset(plus)),
        "pro":   Plan("pro", "ORION PRO", 2, _int("ORION_LIMIT_PRO", 500), (1, 2, 3, 4),
                      _int("ORION_API_MONTHLY_PRO", 10000), _int("ORION_API_RPM_PRO", 30),
                      _price("ORION_PRICE_PRO"), frozenset(pro)),
    }


PLANS: dict = _build()


def get(plan_id) -> Plan:
    """Plano pelo id; qualquer valor desconhecido vira FREE (nunca dá mais acesso por engano)."""
    key = str(plan_id or "").strip().lower()
    return PLANS.get(key, PLANS[DEFAULT])


def effective_plan(plan_id, until: str = "", today: str = "") -> str:
    """Id do plano que vale HOJE: desconhecido ou vencido ('until' < today, formato AAAA-MM-DD) → free."""
    p = get(plan_id)
    if p.id != DEFAULT and until and today and until < today:
        return DEFAULT
    return p.id


def can(plan_id, feature: str) -> bool:
    """O plano tem esse recurso E o recurso já foi lançado? (recurso futuro é sempre False)"""
    return feature in RELEASED and feature in get(plan_id).features


def allows_voice(plan_id, slot) -> bool:
    return isinstance(slot, int) and not isinstance(slot, bool) and slot in get(plan_id).voice_slots


def daily_limits() -> dict:
    return {p.id: p.daily_questions for p in PLANS.values()}


def public_catalog() -> list:
    """Versão para o site (comparação de planos): só o que o usuário pode ver. Sem segredos, sem decisões do servidor."""
    out = []
    for p in sorted(PLANS.values(), key=lambda x: x.rank):
        out.append({
            "id": p.id, "name": p.name, "price_cents": p.price_cents, "currency": "BRL", "purchasable": p.purchasable,
            "daily_questions": p.daily_questions, "voices": len(p.voice_slots),
            "api": {"monthly": p.api_monthly, "per_minute": p.api_per_minute} if can(p.id, "api") else None,
            "features": sorted(f for f in p.features if f in RELEASED),
        })
    return out
