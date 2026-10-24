"""ORION CORE — identidade + memória + ferramentas. O modelo é a inteligência; o ORION é quem ele é.

Ciclo (Request → Execute → Respond):
  1. carrega o histórico do usuário (memória persistente)
  2. envia histórico + pergunta + ferramentas ao modelo
  3. o modelo decide se chama ferramentas (o provedor executa e devolve o resultado)
  4. resposta final -> salva no histórico -> volta ao usuário (com as fontes e imagens que as ferramentas coletaram)

V5.0: com ORION_AGENT=1, perguntas de várias etapas passam antes pelo Agent Engine (core/agent.py).
Se o Agent não assumir a tarefa, o fluxo abaixo roda exatamente como antes.
V5.0 (S7): perguntas do MESMO usuário rodam uma de cada vez (senão duas perguntas simultâneas leem o mesmo
histórico e uma apaga a outra), e as gravações levam número de versão (ver memory/store.py).
V5.0 (fase C): o resultado traz "agent": {state, steps, degraded} quando o Agent respondeu (senão None),
para o site refletir o que realmente aconteceu.
"""
import asyncio, re, weakref

from core import tools
from core.agent import Agent, enabled as agent_enabled, should_use as agent_should_use

FALLBACK = "Desculpe, não entendi..."

def is_fallback(reply: str) -> bool:
    """True se a resposta é o aviso padrão de que o ORION não entendeu (aceita '...' ou '…')."""
    return re.sub(r"[.…\s]+$", "", reply.strip()).lower() == "desculpe, não entendi"


MODEL_TURNS = 4       # trocas reenviadas ao modelo a cada mensagem (menos = resposta mais rápida)
STORED_TURNS = 20     # trocas guardadas na memória
MAX_REPLY_CHARS = 1000

SYSTEM_PROMPT = (
    "Você é o ORION, uma inteligência artificial criada por Jander. "
    "Responda no idioma do usuário (padrão: português do Brasil). "
    "Suas respostas aparecem na tela e podem ser faladas em voz alta: seja direto e natural, sem markdown, sem listas, "
    "sem emojis e sem símbolos de formatação. Seja BREVE: normalmente 1 a 3 frases curtas (uns 50 palavras), "
    "e só vá além disso se a pessoa pedir detalhes ou uma explicação longa. "
    "Para código, explique o essencial em palavras e ofereça mais detalhes se a pessoa quiser. "
    "Você entende programação, tecnologia, matemática, conceitos, perguntas gerais, "
    "perguntas com várias etapas e usa o contexto da conversa. "
    "Ferramentas: calcular (contas exatas), data_hora, clima (clima atual de uma cidade), "
    "buscar_imagem (mostra fotos na tela; use quando pedirem para ver, mostrar ou como é algo) e pesquisar_wikipedia "
    "(traz o resumo e até 3 imagens do assunto, exibidas na tela). Use pesquisar_wikipedia para perguntas sobre pessoas, lugares, obras, "
    "eventos e conceitos específicos; use calcular, data_hora e clima quando a resposta depender deles. "
    "Quando as imagens já foram exibidas na tela, não descreva cada foto: apenas responda a pergunta. "
    "Para conversa, opiniões e coisas simples, responda direto, sem ferramenta. "
    "Se precisar de mais de uma ferramenta, chame todas ao mesmo tempo. "
    "Depois de usar uma ferramenta, responda de forma natural, sem citar o nome da ferramenta. "
    "Não invente fatos: se não souber e as ferramentas não ajudarem, diga que não sabe. "
    "Fora das ferramentas você não tem acesso à internet nem aos arquivos do usuário. "
    "Se a solicitação for ininteligível ou você realmente não conseguir compreendê-la, "
    f"responda exatamente: {FALLBACK}"
)


class Orchestrator:
    def __init__(self, memory):
        self.memory = memory
        self.agent = Agent()
        self._bg: set = set()   # referências às gravações em segundo plano
        self._locks: "weakref.WeakValueDictionary[str, asyncio.Lock]" = weakref.WeakValueDictionary()

    def _lock(self, uid: str) -> asyncio.Lock:
        """Uma trava por usuário. Some sozinha quando ninguém a usa (não cresce com o tempo)."""
        lk = self._locks.get(uid)
        if lk is None:
            lk = asyncio.Lock()
            self._locks[uid] = lk
        return lk

    @staticmethod
    def _messages(text: str, history: list[dict]) -> list[dict]:
        msgs: list[dict] = []
        for turn in history[-MODEL_TURNS:]:
            u, r = (turn.get("user") or "").strip(), (turn.get("reply") or "").strip()
            if u and r:
                msgs += [{"role": "user", "content": u}, {"role": "assistant", "content": r}]
        msgs.append({"role": "user", "content": text})
        return msgs

    def _persist_later(self, uid: str, token: str, history: list[dict]) -> None:
        """Grava no Firestore sem fazer o usuário esperar."""
        ver = self.memory.stage(uid, history)
        args = (uid, token, history) if ver is None else (uid, token, history, ver)
        task = asyncio.create_task(asyncio.to_thread(self.memory.flush, *args))
        self._bg.add(task)
        task.add_done_callback(self._bg.discard)

    async def ask(self, text: str, uid: str, token: str, provider) -> dict:
        async with self._lock(uid):
            sources = tools.collect_sources()          # fontes/imagens que as ferramentas usarem nesta pergunta
            history = await asyncio.to_thread(self.memory.load, uid, token)
            reply = None
            agent_info = None
            if agent_enabled() and agent_should_use(text):
                out = await self.agent.run(text, provider, SYSTEM_PROMPT, history)
                if out:                                # None = não era tarefa de agente: segue o fluxo normal
                    reply = out["reply"]
                    agent_info = {"state": out["state"], "degraded": bool(out.get("degraded")),
                                  "steps": [{"tool": t, "status": s} for t, s in out["steps"]]}
            if reply is None:
                reply = await provider.generate(
                    SYSTEM_PROMPT, self._messages(text, history), tools.specs(), tools.execute
                )
            reply = reply.strip() or FALLBACK
            history = (history + [{"user": text[:2000], "reply": reply[:MAX_REPLY_CHARS]}])[-STORED_TURNS:]
            self._persist_later(uid, token, history)
            return {"reply": reply, "sources": sources, "understood": not is_fallback(reply), "agent": agent_info}

    async def clear(self, uid: str, token: str) -> None:
        async with self._lock(uid):
            self._persist_later(uid, token, [])
