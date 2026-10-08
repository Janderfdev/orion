"""Memória persistente do ORION — um histórico por usuário.

Guarda no Firestore do SEU projeto Firebase, usando o próprio token do usuário
(as regras do Firestore garantem que cada um só acessa o próprio histórico;
não é preciso nenhuma chave secreta). Se o Firestore não estiver configurado ou
falhar, cai para a memória do processo: o ORION continua funcionando, mas o
histórico se perde quando o servidor reinicia.
"""
import json, logging, os

import requests

log = logging.getLogger("orion.memory")
PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "orion-ai-b8d39")
USE_FIRESTORE = os.getenv("ORION_MEMORY", "firestore").lower() == "firestore"
TIMEOUT = 6


def _url(uid: str) -> str:
    return f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/users/{uid}"


class Memory:
    def __init__(self):
        self._local: dict[str, list] = {}

    def load(self, uid: str, token: str) -> list[dict]:
        if USE_FIRESTORE:
            try:
                r = requests.get(_url(uid), headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT)
                if r.status_code == 404:
                    hist = []
                else:
                    r.raise_for_status()
                    hist = json.loads(r.json().get("fields", {}).get("history", {}).get("stringValue", "[]"))
                self._local[uid] = hist
                return hist
            except Exception as e:
                log.warning("Firestore indisponível ao ler (%s); usando memória local.", e)
        return list(self._local.get(uid, []))

    def save(self, uid: str, token: str, history: list[dict]) -> None:
        self._local[uid] = history
        if not USE_FIRESTORE:
            return
        try:
            r = requests.patch(
                _url(uid), params={"updateMask.fieldPaths": "history"},
                headers={"Authorization": f"Bearer {token}"}, timeout=TIMEOUT,
                json={"fields": {"history": {"stringValue": json.dumps(history, ensure_ascii=False)}}},
            )
            r.raise_for_status()
        except Exception as e:
            log.warning("Firestore indisponível ao gravar (%s); histórico só na memória local.", e)
