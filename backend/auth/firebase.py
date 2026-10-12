"""Verifica o token de login do Firebase enviado pelo site.

Não precisa de chave secreta: o token é assinado pelo Google e conferido com os
certificados públicos. Só aceita tokens do SEU projeto (FIREBASE_PROJECT_ID).

Velocidade: os certificados públicos do Google ficam em cache por 1 hora. Sem isso, cada
pergunta fazia uma ida à internet só para buscá-los.
"""
import os, time

from google.auth.transport import requests as g_requests
from google.oauth2 import id_token

PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "orion-ai-b8d39")
CERTS_TTL = 3600
_base = g_requests.Request()
_certs: dict = {}   # url -> (vale até, resposta)


def _request(url, method="GET", body=None, headers=None, timeout=None, **kwargs):
    """Igual ao Request normal, mas guarda a resposta dos certificados por CERTS_TTL segundos."""
    if method == "GET" and url in _certs and _certs[url][0] > time.time():
        return _certs[url][1]
    if timeout is not None:
        kwargs["timeout"] = timeout
    resp = _base(url, method=method, body=body, headers=headers, **kwargs)
    if method == "GET" and getattr(resp, "status", 0) == 200:
        _certs[url] = (time.time() + CERTS_TTL, resp)
    return resp


def verify(token: str) -> dict | None:
    """Devolve os dados do usuário (sub, email...) ou None se o token for inválido."""
    if not token:
        return None
    for attempt in (1, 2):
        try:
            return id_token.verify_firebase_token(
                token, _request, audience=PROJECT_ID, clock_skew_in_seconds=10
            )
        except Exception:
            # pode ser troca de chaves do Google: limpa o cache e tenta uma vez de novo
            if attempt == 1 and _certs:
                _certs.clear()
                continue
            return None
