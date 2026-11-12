"""Persistência do faturamento no Firestore, SÓ pelo servidor (service account; o usuário nunca escreve aqui).

Coleções (as regras do Firestore devem BLOQUEAR todas para clientes; a service account ignora as regras):
  plans/{uid}                     plan, until            ← a MESMA coleção que core/quota.py já lê
  billing_state/{uid}             plan, status, provider_id, until, updated
  billing_state/{uid}/tx/{txid}   histórico: kind, status, amount_cents, currency, plan, ref, ts
  billing_index/{chave}           pre_<id da assinatura> → uid, plan, amount_cents ; pay_<id do pagamento> → uid, sub

Valores guardados: texto, inteiro e booleano. Dinheiro sempre em centavos (inteiro).
"""
import logging
from urllib.parse import quote

import requests

log = logging.getLogger("orion.billing.store")
TIMEOUT = 6


def _enc(v) -> dict:
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    return {"stringValue": str(v)}


def _dec(f: dict):
    if "integerValue" in f:
        return int(f["integerValue"])
    if "booleanValue" in f:
        return bool(f["booleanValue"])
    if "nullValue" in f:
        return None
    return f.get("stringValue", "")


def _seg(s: str) -> str:
    return quote(str(s), safe="")


class StoreError(Exception):
    pass


class FirestoreStore:
    def __init__(self, admin, project_id: str):
        self._admin = admin
        self._docs = f"projects/{project_id}/databases/(default)/documents"
        self._base = f"https://firestore.googleapis.com/v1/{self._docs}"

    @property
    def enabled(self) -> bool:
        return bool(getattr(self._admin, "enabled", False))

    # ── primitivas REST ──
    def _get(self, path: str):
        r = requests.get(f"{self._base}/{path}", headers=self._admin.headers(), timeout=TIMEOUT)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return {k: _dec(v) for k, v in (r.json().get("fields") or {}).items()}

    def _patch(self, path: str, data: dict) -> None:
        r = requests.patch(f"{self._base}/{path}", params=[("updateMask.fieldPaths", k) for k in data],
                           headers=self._admin.headers(), timeout=TIMEOUT,
                           json={"fields": {k: _enc(v) for k, v in data.items()}})
        r.raise_for_status()

    def _delete(self, path: str) -> None:
        r = requests.delete(f"{self._base}/{path}", headers=self._admin.headers(), timeout=TIMEOUT)
        if r.status_code not in (200, 404):
            r.raise_for_status()

    def _increment(self, path: str, field: str, n: int) -> None:
        """Soma n a um campo inteiro de forma atômica (cria o documento se preciso)."""
        r = requests.post(f"https://firestore.googleapis.com/v1/{self._docs}:commit",
                          headers=self._admin.headers(), timeout=TIMEOUT,
                          json={"writes": [{"transform": {"document": f"{self._docs}/{path}",
                                "fieldTransforms": [{"fieldPath": field, "increment": {"integerValue": str(n)}}]}}]})
        r.raise_for_status()

    def _create_once(self, collection: str, doc_id: str, data: dict) -> bool:
        """Cria o documento só se ainda não existir. False = já existia (webhook repetido)."""
        r = requests.post(f"{self._base}/{collection}", params={"documentId": doc_id},
                          headers=self._admin.headers(), timeout=TIMEOUT,
                          json={"fields": {k: _enc(v) for k, v in data.items()}})
        if r.status_code == 409:
            return False
        r.raise_for_status()
        return True

    def _list(self, collection: str, limit: int, order_by: str) -> list:
        r = requests.get(f"{self._base}/{collection}", params={"pageSize": limit, "orderBy": order_by},
                         headers=self._admin.headers(), timeout=TIMEOUT)
        if r.status_code == 404:
            return []
        r.raise_for_status()
        out = []
        for d in r.json().get("documents") or []:
            item = {k: _dec(v) for k, v in (d.get("fields") or {}).items()}
            item["id"] = d.get("name", "").rsplit("/", 1)[-1]
            out.append(item)
        return out

    # ── API de domínio ──
    def get_index(self, key: str):           return self._get(f"billing_index/{_seg(key)}")
    def set_index(self, key: str, data: dict): self._patch(f"billing_index/{_seg(key)}", data)
    def get_state(self, uid: str):           return self._get(f"billing_state/{_seg(uid)}")
    def set_state(self, uid: str, data: dict): self._patch(f"billing_state/{_seg(uid)}", data)
    def get_plan(self, uid: str):            return self._get(f"plans/{_seg(uid)}")
    def set_plan(self, uid: str, plan: str, until: str) -> None:
        self._patch(f"plans/{_seg(uid)}", {"plan": plan, "until": until})

    def add_tx(self, uid: str, tx_id: str, data: dict) -> bool:
        return self._create_once(f"billing_state/{_seg(uid)}/tx", tx_id, data)

    def list_tx(self, uid: str, limit: int = 20) -> list:
        return self._list(f"billing_state/{_seg(uid)}/tx", limit, "ts desc")
