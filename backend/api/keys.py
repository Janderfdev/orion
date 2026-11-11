"""Chaves do ORION API: geração e hash. A chave inteira só existe em dois lugares: na resposta que a cria (uma única vez) e
na mão de quem a recebeu. O servidor guarda apenas o hash.

Formato: "orion_" + 43 caracteres (token_urlsafe(32) = 256 bits aleatórios). Como a chave já é aleatória e longa, um hash
rápido é adequado (não há senha fraca para adivinhar). Com ORION_API_KEY_PEPPER definida, o hash vira HMAC-SHA256 com esse
segredo do servidor (um vazamento do banco, sozinho, não permite conferir chaves). Trocar a pepper invalida todas as chaves.
"""
import hashlib, hmac, os, re, secrets

PREFIX = "orion_"
_FORMAT = re.compile(r"^orion_[A-Za-z0-9_-]{43}$")


def generate() -> str:
    return PREFIX + secrets.token_urlsafe(32)


def well_formed(key) -> bool:
    return isinstance(key, str) and bool(_FORMAT.match(key))


def digest(key: str, pepper: str | None = None) -> str:
    pepper = os.getenv("ORION_API_KEY_PEPPER", "") if pepper is None else pepper
    if pepper:
        return hmac.new(pepper.encode(), key.encode(), hashlib.sha256).hexdigest()
    return hashlib.sha256(key.encode()).hexdigest()


def hint(key: str) -> dict:
    """O que pode ser mostrado depois da criação (nunca a chave): começo e fim."""
    return {"prefix": key[:10], "last4": key[-4:]}


def from_header(authorization: str) -> str:
    """Extrai a chave de 'Authorization: Bearer orion_...'. Devolve '' se não houver."""
    if not isinstance(authorization, str):
        return ""
    scheme, _, rest = authorization.strip().partition(" ")
    return rest.strip() if scheme.lower() == "bearer" else ""
