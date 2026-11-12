"""Persistência do ORION API (só servidor). Coleções (bloqueadas para clientes nas regras do Firestore):
  api_hash/{hash da chave}   uid, key_id            ← autenticação: um GET pelo hash (apagar = revogar)
  api_users/{uid}            keys (texto JSON)      ← lista da pessoa: id, name, prefix, last4, created, hash
  api_usage/{uid}            month ("AAAA-MM"), count
"""
import json

from billing.store import FirestoreStore, _seg


class ApiStore(FirestoreStore):
    def get_hash(self, h: str):            return self._get(f"api_hash/{_seg(h)}")
    def set_hash(self, h: str, data: dict): self._patch(f"api_hash/{_seg(h)}", data)
    def delete_hash(self, h: str):         self._delete(f"api_hash/{_seg(h)}")

    def get_keys(self, uid: str) -> list:
        d = self._get(f"api_users/{_seg(uid)}") or {}
        try:
            keys = json.loads(d.get("keys") or "[]")
        except ValueError:
            return []
        return keys if isinstance(keys, list) else []

    def set_keys(self, uid: str, keys: list) -> None:
        self._patch(f"api_users/{_seg(uid)}", {"keys": json.dumps(keys, ensure_ascii=False)})

    def get_usage(self, uid: str):         return self._get(f"api_usage/{_seg(uid)}")
    def set_usage(self, uid: str, month: str, count: int) -> None:
        self._patch(f"api_usage/{_seg(uid)}", {"month": month, "count": count})
    def bump_usage(self, uid: str, n: int) -> None:
        self._increment(f"api_usage/{_seg(uid)}", "count", n)
