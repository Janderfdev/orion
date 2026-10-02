"""Autenticação do ORION (V4.0 — protótipo).

Usuário/senha vêm de variáveis de ambiente (ORION_USER / ORION_PASSWORD).
O login devolve um token assinado (HMAC) com validade; o /ask exige esse token,
para que ninguém use a sua chave de IA sem passar pelo login.
Futuro: substituir por contas reais + banco de dados.
"""
import base64, hashlib, hmac, os, secrets, time

SECRET = (os.getenv("ORION_SECRET") or secrets.token_hex(32)).encode()
TTL_SECONDS = 12 * 3600


def _norm(user: str) -> bytes:
    return " ".join(user.split()).upper().encode()


def verify_login(user: str, password: str) -> bool:
    ok_user = hmac.compare_digest(_norm(user), _norm(os.getenv("ORION_USER", "ORION AI")))
    ok_pass = hmac.compare_digest(password.encode(), os.getenv("ORION_PASSWORD", "230526").encode())
    return ok_user and ok_pass


def _sign(payload: str) -> str:
    return hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()


def issue_token() -> str:
    payload = str(int(time.time()) + TTL_SECONDS)
    return base64.urlsafe_b64encode(payload.encode()).decode() + "." + _sign(payload)


def check_token(token: str) -> bool:
    try:
        b64, sig = token.split(".", 1)
        payload = base64.urlsafe_b64decode(b64.encode()).decode()
        return hmac.compare_digest(sig, _sign(payload)) and int(payload) > time.time()
    except Exception:
        return False
