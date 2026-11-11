"""Erros padronizados do ORION API (V5.2.0). Toda resposta de erro de /v1 e /api tem o MESMO formato:

  {"error": {"code": "<código>", "message": "<texto curto>", "request_id": "req_..."}}

Códigos (estáveis: quem integra pode depender deles):
  invalid_api_key 401 · plan_required 403 · api_unavailable 503 · invalid_request 400 · payload_too_large 413
  model_unavailable 400/503 · rate_limited 429 (+Retry-After) · quota_exceeded 429 · provider_busy 503 · provider_error 502
  key_limit 409 · key_not_found 404 · timeout 504 · internal_error 500
Nunca vai texto interno, caminho de arquivo, chave ou detalhe do provedor.
"""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str = "", retry_after: int | None = None):
        super().__init__(code)
        self.status, self.code, self.message, self.retry_after = status, code, message or code, retry_after


def body(err: "ApiError", request_id: str) -> dict:
    return {"error": {"code": err.code, "message": err.message, "request_id": request_id}}
