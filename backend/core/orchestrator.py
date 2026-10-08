"""ORION CORE — identidade + memória + ferramentas. O modelo é a inteligência; o ORION é quem ele é.

Ciclo (Request → Execute → Respond):
  1. carrega o histórico do usuário (memória persistente)
  2. envia histórico + pergunta + ferramentas ao modelo
  3. o modelo decide se chama ferramentas (o provedor executa e devolve o resultado)
  4. resposta final -> salva no histórico -> volta ao usuário
"""
import asyncio

from core import tools

FALLBACK = "Desculpe, não entendi..."
MODEL_TURNS = 10      # trocas reenviadas ao modelo a cada mensagem
STORED_TURNS = 20     # trocas guardadas na memória
MAX_REPLY_CHARS = 1000

SYSTEM_PROMPT = (
    "Você é o ORION, uma inteligência artificial criada por Jander. "
    "Responda no idioma do usuário (padrão: português do Brasil). "
    "Suas respostas são FALADAS em voz alta: seja direto e natural, sem markdown, sem listas, "
    "sem emojis e sem símbolos de formatação; normalmente 1 a 4 frases. "
    "Para código, explique o essencial em palavras e ofereça mais detalhes se a pessoa quiser. "
    "Você entende programação, tecnologia, matemática, conceitos, perguntas gerais, "
    "perguntas com várias etapas e usa o contexto da conversa. "
    "Você tem ferramentas: calcular (contas exatas), data_hora, clima (clima atual de uma cidade) "
    "e pesquisar_wikipedia (fatos). Decida sozinho quando usá-las: use para contas, data e hora, "
    "clima atual e fatos que você não tenha certeza; não use em conversa simples. "
    "Depois de usar uma ferramenta, responda de forma natural, sem citar o nome da ferramenta. "
    "Não invente fatos: se não souber e as ferramentas não ajudarem, diga que não sabe. "
    "Fora das ferramentas você não tem acesso à internet nem aos arquivos do usuário. "
    "Se a solicitação for ininteligível ou você realmente não conseguir compreendê-la, "
    f"responda exatamente: {FALLBACK}"
)


class Orchestrator:
    def __init__(self, provider, memory):
        self.provider = provider
        self.memory = memory

    @staticmethod
    def _messages(text: str, history: list[dict]) -> list[dict]:
        msgs: list[dict] = []
        for turn in history[-MODEL_TURNS:]:
            u, r = (turn.get("user") or "").strip(), (turn.get("reply") or "").strip()
            if u and r:
                msgs += [{"role": "user", "content": u}, {"role": "assistant", "content": r}]
        msgs.append({"role": "user", "content": text})
        return msgs

    async def ask(self, text: str, uid: str, token: str) -> str:
        history = await asyncio.to_thread(self.memory.load, uid, token)
        reply = await self.provider.generate(
            SYSTEM_PROMPT, self._messages(text, history), tools.specs(), tools.execute
        )
        reply = reply.strip() or FALLBACK
        history = (history + [{"user": text[:2000], "reply": reply[:MAX_REPLY_CHARS]}])[-STORED_TURNS:]
        await asyncio.to_thread(self.memory.save, uid, token, history)
        return reply

    async def clear(self, uid: str, token: str) -> None:
        await asyncio.to_thread(self.memory.save, uid, token, [])
