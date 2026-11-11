"""ORION API (V5.2.0) — regras: chaves, autenticação, limite por minuto e cota mensal. Sem HTTP aqui.

Quem pode usar: planos com o recurso "api" (PLUS e PRO). O plano é lido NO SERVIDOR a cada uso (cache curto): se a pessoa
sair do plano, as chaves dela deixam de funcionar na hora, sem precisar apagá-las.

  create_key / list_keys / revoke / rotate   gerenciamento (chamado com o login do Firebase)
  authenticate(chave)                        chave de API → {uid, key_id}   (confere o HASH; a chave nunca é guardada)
  begin(uid, key_id) / refund(uid)           gasta / devolve 1 requisição (limite por minuto + cota do mês)
  usage(uid)                                 consumo e limites

Estado em memória (por processo): janela de 1 minuto por chave e cache de autenticação (30 s). A cota mensal é PERSISTIDA
no Firestore (api_usage/{uid}); se o servidor reiniciar, o limite por minuto recomeça, o do mês não.
"""
import datetime as dt, logging, re, secrets, threading, time
from collections import deque

from api import keys as keylib
from api.errors import ApiError
from billing import plans

log = logging.getLogger("orion.api")

MAX_KEYS = 5
CACHE_TTL = 30            # segundos que uma chave válida fica em cache (revogar leva até isso em OUTRO processo; neste, é na hora)
CACHE_MAX = 2000
WINDOW_MAX_KEYS = 5000    # limite de chaves com janela em memória antes de limpar
_CTRL = re.compile(r"[\x00-\x1f\x7f]")


def _br_today() -> dt.date:
    return dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date()   # Brasília/Fortaleza


def clean_name(name) -> str:
    s = _CTRL.sub("", str(name or "")).strip()
    return re.sub(r"\s+", " ", s)[:40]


def _public(k: dict) -> dict:
    return {f: k.get(f) for f in ("id", "name", "prefix", "last4", "created")}


class ApiService:
    def __init__(self, store, plan_of, *, today=_br_today, now=time.time, pepper: str | None = None, bg=None):
        self.store, self._plan_of, self._today, self._now, self._pepper = store, plan_of, today, now, pepper
        self._bg = bg or (lambda fn, *a: threading.Thread(target=fn, args=a, daemon=True).start())
        self._guard = threading.Lock()
        self._locks: dict[str, threading.Lock] = {}
        self._cache: dict[str, tuple] = {}
        self._win: dict[str, deque] = {}
        self._usage: dict[str, dict] = {}

    # ── utilidades ──
    @property
    def configured(self) -> bool:
        return bool(self.store.enabled)

    def _need(self) -> None:
        if not self.configured:
            raise ApiError(503, "api_unavailable", "O ORION API não está disponível agora.")

    def _lock(self, uid: str) -> threading.Lock:
        with self._guard:
            return self._locks.setdefault(uid, threading.Lock())

    def _need_plan(self, uid: str) -> str:
        plan = self._plan_of(uid)
        if not plans.can(plan, "api"):
            raise ApiError(403, "plan_required", "O ORION API está disponível a partir do plano ORION PLUS.")
        return plan

    def _month(self) -> str:
        return self._today().strftime("%Y-%m")

    # ── gerenciamento de chaves ──
    def list_keys(self, uid: str) -> list:
        self._need()
        return [_public(k) for k in self.store.get_keys(uid)]

    def _new_item(self, name: str):
        key = keylib.generate()
        item = {"id": secrets.token_hex(4), "name": name, "created": self._today().isoformat(),
                "hash": keylib.digest(key, self._pepper), **keylib.hint(key)}
        return key, item

    def create_key(self, uid: str, name: str) -> dict:
        self._need()
        self._need_plan(uid)
        with self._lock(uid):
            ks = self.store.get_keys(uid)
            if len(ks) >= MAX_KEYS:
                raise ApiError(409, "key_limit", f"Limite de {MAX_KEYS} chaves. Revogue uma para criar outra.")
            key, item = self._new_item(clean_name(name) or "Minha chave")
            ks.append(item)
            self.store.set_keys(uid, ks)
            self.store.set_hash(item["hash"], {"uid": uid, "key_id": item["id"]})
        return {"key": key, **_public(item)}        # a chave inteira aparece SÓ aqui

    def revoke(self, uid: str, key_id: str) -> dict:
        self._need()
        with self._lock(uid):
            ks = self.store.get_keys(uid)
            hit = next((k for k in ks if k.get("id") == key_id), None)
            if not hit:
                raise ApiError(404, "key_not_found", "Chave não encontrada.")
            self.store.delete_hash(hit["hash"])      # 1º corta o acesso; se a gravação da lista falhar, a chave já está morta
            self._cache.pop(hit["hash"], None)
            self.store.set_keys(uid, [k for k in ks if k.get("id") != key_id])
        return {"ok": True}

    def rotate(self, uid: str, key_id: str) -> dict:
        self._need()
        self._need_plan(uid)
        with self._lock(uid):
            ks = self.store.get_keys(uid)
            old = next((k for k in ks if k.get("id") == key_id), None)
            if not old:
                raise ApiError(404, "key_not_found", "Chave não encontrada.")
            key, item = self._new_item(old.get("name") or "Minha chave")
            self.store.set_keys(uid, [item if k.get("id") == key_id else k for k in ks])
            self.store.set_hash(item["hash"], {"uid": uid, "key_id": item["id"]})
            self.store.delete_hash(old["hash"])      # a chave antiga morre quando a nova já existe
            self._cache.pop(old["hash"], None)
        return {"key": key, **_public(item)}

    # ── uso da chave ──
    def authenticate(self, raw_key: str) -> dict:
        self._need()
        if not keylib.well_formed(raw_key):
            raise ApiError(401, "invalid_api_key", "Chave de API inválida.")
        h = keylib.digest(raw_key, self._pepper)
        hit = self._cache.get(h)
        if hit and hit[0] > self._now():
            return hit[1]
        try:
            doc = self.store.get_hash(h)
        except Exception:
            log.exception("api: falha ao consultar a chave")
            raise ApiError(503, "api_unavailable", "O ORION API não está disponível agora.")
        if not doc or not doc.get("uid"):
            raise ApiError(401, "invalid_api_key", "Chave de API inválida.")
        who = {"uid": doc["uid"], "key_id": doc.get("key_id", "")}
        if len(self._cache) >= CACHE_MAX:
            self._cache.clear()
        self._cache[h] = (self._now() + CACHE_TTL, who)
        return who

    def _load_usage(self, uid: str, month: str) -> dict:
        st = self._usage.get(uid)
        if st is None:
            count = 0
            try:
                d = self.store.get_usage(uid)
                if d and d.get("month") == month:
                    count = int(d.get("count") or 0)
                else:
                    self.store.set_usage(uid, month, 0)       # garante o documento e o mês certo
            except Exception:
                log.exception("api: não consegui ler a cota do mês; começando do zero na memória")
            st = self._usage[uid] = {"month": month, "count": count}
        elif st["month"] != month:                            # virou o mês
            st["month"], st["count"] = month, 0
            self._bg(self._safe, self.store.set_usage, uid, month, 0)
        return st

    @staticmethod
    def _safe(fn, *a):
        try:
            fn(*a)
        except Exception:
            log.warning("api: falha ao gravar a cota (vale só na memória até o próximo ajuste)")

    def begin(self, uid: str, key_id: str) -> dict:
        """Gasta 1 requisição. Levanta plan_required / rate_limited / quota_exceeded."""
        self._need()
        p = plans.get(self._need_plan(uid))
        now = self._now()
        with self._lock(uid):
            win = self._win.setdefault(key_id, deque())
            while win and win[0] <= now - 60:
                win.popleft()
            if len(win) >= p.api_per_minute:
                wait = max(1, int(60 - (now - win[0])) + 1)
                raise ApiError(429, "rate_limited", f"Limite de {p.api_per_minute} requisições por minuto.", retry_after=wait)
            st = self._load_usage(uid, self._month())
            if st["count"] >= p.api_monthly:
                raise ApiError(429, "quota_exceeded", "A cota mensal do seu plano acabou.")
            st["count"] += 1
            win.append(now)
            self._bg(self._safe, self.store.bump_usage, uid, 1)
            if len(self._win) > WINDOW_MAX_KEYS:
                self._win = {k: v for k, v in self._win.items() if v and v[-1] > now - 60}
            return {"used": st["count"], "limit": p.api_monthly}

    def refund(self, uid: str, key_id: str = "") -> None:
        """Devolve 1 requisição (o modelo falhou: não se cobra resposta que não existiu)."""
        with self._lock(uid):
            st = self._usage.get(uid)
            if st and st["count"] > 0:
                st["count"] -= 1
                self._bg(self._safe, self.store.bump_usage, uid, -1)
            win = self._win.get(key_id)
            if win:
                win.pop()

    def usage(self, uid: str) -> dict:
        self._need()
        plan_id = self._plan_of(uid)
        p, ok = plans.get(plan_id), plans.can(plan_id, "api")
        today = self._today()
        with self._lock(uid):
            used = self._load_usage(uid, self._month())["count"] if ok else 0
        nxt = (today.replace(day=1) + dt.timedelta(days=32)).replace(day=1)
        return {"plan": p.id, "plan_name": p.name, "api": ok, "month": self._month(),
                "used": used, "limit": p.api_monthly if ok else 0, "per_minute": p.api_per_minute if ok else 0,
                "resets_on": nxt.isoformat(), "max_keys": MAX_KEYS}
