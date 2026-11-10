"""Contrato de um provedor de pagamentos (V5.2.0). O Mercado Pago é a 1ª implementação; Stripe poderia ser outra,
sem mexer em billing/service.py.

Todo valor que sai de um provedor é NORMALIZADO para estes formatos (dicts simples):

  subscription:       {"id", "status", "amount_cents", "currency", "next_payment_date", "external_reference", "payer_email"}
                      status ∈ pending | authorized | paused | cancelled | other
  authorized_payment: {"id", "subscription_id", "status", "amount_cents", "payment_id", "payment_status"}
  payment:            {"id", "status", "amount_cents"}
  webhook event:      {"topic", "data_id", "event_id"}

Regra de ouro: o conteúdo de um webhook NUNCA decide nada sozinho. Ele só diz "algo mudou em X"; o serviço consulta o
provedor (com a credencial do servidor) para saber o que realmente aconteceu.
"""


class ProviderError(Exception):
    """Falha ao falar com o provedor. Mensagem segura (sem token, sem corpo bruto)."""

    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


class InvalidSignature(Exception):
    """Webhook que não prova ter vindo do provedor."""


class PaymentProvider:
    name = "base"

    def configured(self) -> bool:
        raise NotImplementedError

    def payer_email(self, real_email: str) -> str:
        """E-mail enviado como pagador (em ambiente de testes, um provedor pode exigir um comprador de teste)."""
        return real_email

    def create_subscription(self, *, email: str, reason: str, amount_cents: int, external_reference: str,
                            back_url: str, idempotency_key: str) -> dict:
        """Devolve {"id", "checkout_url"}. O usuário digita o cartão na página do provedor, nunca no ORION."""
        raise NotImplementedError

    def get_subscription(self, sub_id: str) -> dict: raise NotImplementedError
    def cancel_subscription(self, sub_id: str) -> None: raise NotImplementedError
    def get_authorized_payment(self, ap_id: str) -> dict: raise NotImplementedError
    def get_payment(self, payment_id: str) -> dict: raise NotImplementedError

    def verify_webhook(self, headers: dict, query: dict, body: dict) -> dict:
        """Valida a autenticidade e devolve o evento normalizado. Levanta InvalidSignature."""
        raise NotImplementedError
