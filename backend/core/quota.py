"""Cota diária de perguntas por plano (free / plus / pro).

Diferente da memória (store.py), que usa o token do PRÓPRIO usuário, a cota é gravada com a
credencial de SERVIDOR (service account do Firebase): assim o usuário não consegue zerar o
contador nem se declarar "pro" pelo navegador. As regras do Firestore devem bloquear as
coleções `usage` e `plans` para os clientes (a service account ignora as regras).

Firestore:
  usage/{uid}  →  day (texto "AAAA-MM-DD", horário de Brasília), count (inteiro)
  plans/{uid}  →  plan ("free" | "plus" | "pro"), until (opcional, "AAAA-MM-DD")
  Sem documento em `plans`, o usuário é "free". Para testar um plano, crie o documento à mão no console.

Variáveis do Render:
  FIREBASE_SERVICE_ACCOUNT   conteúdo COMPLETO do JSON da service account (nunca vai para o GitHub)
  ORION_LIMIT_FREE (10) · ORION_LIMIT_PLUS (100) · ORION_LIMIT_PRO (500)
  FIREBASE_PROJECT_ID        padrão: orion-ai-b8d39

Velocidade: depois da 1ª pergunta do dia o contador fica em cache no processo e a gravação no
Firestore acontece em segundo plano (o usuário não espera). Sem a service account, a cota
continua valendo, mas só na memória do servidor (zera quando ele reinicia).
"""
import datetime as dt, json, logging, os, threading, time
from urllib.parse import quote

import requests
from google.auth.transport import requests as g_requests
from google.oauth2 import service_account

log = logging.getLogger("orion.quota")

PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "orion-ai-b8d39")
LIMITS = {
    "free": int(os.getenv("ORION_LIMIT_FREE", "10")),
    "plus": int(os.getenv("ORION_LIMIT_PLUS", "100")),
    "pro": int(os.getenv("ORION_LIMIT_PRO", "500")),
}
PLAN_TTL = 300   # segundos: de quanto em quanto tempo o plano é relido (mudanças manuais valem sem reiniciar)
TIMEOUT = 6
_DOCS = f"projects/{PROJECT_ID}/databases/(default)/documents"
_BASE = f"https://firestore.googleapis.com/v1/{_DOCS}"


class _Admin:
    """Token de servidor para o Firestore (renovado sozinho)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._req = g_requests.Request()
        self.creds = None
        raw = os.getenv("FIREBASE_SERVICE_ACCOUNT", "").strip()
        if not raw:
            log.warning("FIREBASE_SERVICE_ACCOUNT ausente: a cota diária ficará só na memória do servidor.")
            return
        try:
            self.creds = service_account.Credentials.from_service_account_info(
                json.loads(raw), scopes=["https://www.googleapis.com/auth/datastore"])
        except Exception as e:
            log.error("FIREBASE_SERVICE_ACCOUNT inválida (%s): a cota ficará só na memória do servidor.", e)

    @property
    def enabled(self) -> bool:
        return self.creds is not None

    def headers(self) -> dict:
        with self._lock:
            if not self.creds.valid:
                self.creds.refresh(self._req)
            return {"Authorization": "Bearer " + self.creds.token}


class Quota:
    def __init__(self):
        self._admin = _Admin()
        self._st: dict[str, dict] = {}            # uid -> {day, count, plan, plan_at}
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()

    # ── utilidades ──
    @staticmethod
    def _today() -> str:
        return dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat()   # Brasília/Fortaleza

    def _lock(self, uid: str) -> threading.Lock:
        with self._guard:
            return self._locks.setdefault(uid, threading.Lock())

    def _get(self, path: str):
        r = requests.get(f"{_BASE}/{path}", headers=self._admin.headers(), timeout=TIMEOUT)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json().get("fields", {})

    def _set_usage(self, uid: str, day: str, count: int) -> None:
        r = requests.patch(
            f"{_BASE}/usage/{quote(uid, safe='')}",
            params=[("updateMask.fieldPaths", "day"), ("updateMask.fieldPaths", "count")],
            headers=self._admin.headers(), timeout=TIMEOUT,
            json={"fields": {"day": {"stringValue": day}, "count": {"integerValue": str(count)}}})
        r.raise_for_status()

    def _bump(self, uid: str, n: int) -> None:
        """Soma n ao contador no Firestore (em segundo plano; n negativo devolve uma pergunta)."""
        if not self._admin.enabled:
            return
        try:
            r = requests.post(
                f"https://firestore.googleapis.com/v1/{_DOCS}:commit",
                headers=self._admin.headers(), timeout=TIMEOUT,
                json={"writes": [{"transform": {
                    "document": f"{_DOCS}/usage/{quote(uid, safe='')}",
                    "fieldTransforms": [{"fieldPath": "count", "increment": {"integerValue": str(n)}}]}}]})
            r.raise_for_status()
        except Exception as e:
            log.warning("Não consegui gravar a cota no Firestore (%s); vale só na memória do servidor.", e)

    def _bg(self, fn, *args) -> None:
        threading.Thread(target=fn, args=args, daemon=True).start()

    # ── carregar estado do dia e do plano ──
    def _load(self, uid: str, today: str) -> dict:
        st = {"day": today, "count": 0, "plan": "free", "plan_at": 0.0}
        if self._admin.enabled:
            try:
                f = self._get(f"usage/{quote(uid, safe='')}")
                if f and f.get("day", {}).get("stringValue") == today:
                    st["count"] = int(f.get("count", {}).get("integerValue", "0"))
                else:
                    self._set_usage(uid, today, 0)   # garante que o documento existe e está no dia certo
            except Exception as e:
                log.warning("Não consegui ler a cota no Firestore (%s); começando do zero na memória.", e)
        self._st[uid] = st
        return st

    def _refresh_plan(self, uid: str, st: dict, today: str) -> None:
        st["plan_at"] = time.time()
        if not self._admin.enabled:
            return
        try:
            f = self._get(f"plans/{quote(uid, safe='')}") or {}
            plan = f.get("plan", {}).get("stringValue", "free").strip().lower()
            until = f.get("until", {}).get("stringValue", "").strip()
            if plan not in LIMITS or (plan != "free" and until and until < today):
                plan = "free"   # plano desconhecido ou vencido
            st["plan"] = plan
        except Exception as e:
            log.warning("Não consegui ler o plano no Firestore (%s); mantendo o plano atual.", e)

    # ── API usada pelo main.py (rodar com asyncio.to_thread) ──
    def consume(self, uid: str) -> dict:
        """Tenta gastar 1 pergunta. Devolve {ok, used, limit, plan}."""
        today = self._today()
        with self._lock(uid):
            st = self._st.get(uid)
            if st is None:
                st = self._load(uid, today)
            elif st["day"] != today:                 # virou o dia: zera
                st["day"], st["count"] = today, 0
                if self._admin.enabled:
                    try:
                        self._set_usage(uid, today, 0)
                    except Exception as e:
                        log.warning("Não consegui zerar a cota do dia (%s).", e)
            if time.time() - st["plan_at"] > PLAN_TTL:
                self._refresh_plan(uid, st, today)
            limit = LIMITS[st["plan"]]
            if st["count"] >= limit:
                return {"ok": False, "used": st["count"], "limit": limit, "plan": st["plan"]}
            st["count"] += 1
            self._bg(self._bump, uid, 1)
            return {"ok": True, "used": st["count"], "limit": limit, "plan": st["plan"]}

    def refund(self, uid: str) -> None:
        """Devolve 1 pergunta (quando o modelo falhou: não cobra por resposta que não existiu)."""
        with self._lock(uid):
            st = self._st.get(uid)
            if st and st["count"] > 0:
                st["count"] -= 1
                self._bg(self._bump, uid, -1)
