"""Verifica o token de login do Firebase enviado pelo site.

Não precisa de chave secreta: o token é assinado pelo Google e conferido com os
certificados públicos. Só aceita tokens do SEU projeto (FIREBASE_PROJECT_ID).
"""
import os

from google.auth.transport import requests as g_requests
from google.oauth2 import id_token

PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "orion-ai-b8d39")
_request = g_requests.Request()


def verify(token: str) -> dict | None:
    """Devolve os dados do usuário (sub, email...) ou None se o token for inválido."""
    if not token:
        return None
    try:
        return id_token.verify_firebase_token(
            token, _request, audience=PROJECT_ID, clock_skew_in_seconds=10
        )
    except Exception:
        return None
