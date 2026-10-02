"""ORION CORE — identidade + contexto. O modelo é a inteligência; o ORION é quem ele é.

Fluxo: pergunta + histórico -> mensagens -> MODEL PROVIDER -> resposta.
Futuro: ferramentas e permissões entram aqui.
"""

FALLBACK = "Desculpe, não entendi..."
MAX_TURNS = 6
MAX_REPLY_CHARS = 1000

SYSTEM_PROMPT = (
    "Você é o ORION, uma inteligência artificial criada por Jander. "
    "Responda no idioma do usuário (padrão: português do Brasil). "
    "Suas respostas são FALADAS em voz alta: seja direto e natural, sem markdown, sem listas, "
    "sem emojis e sem símbolos de formatação; normalmente 1 a 4 frases. "
    "Para código, explique o essencial em palavras e ofereça mais detalhes se a pessoa quiser. "
    "Você entende programação, tecnologia, matemática, conceitos, perguntas gerais, "
    "perguntas com várias etapas e usa o contexto da conversa. "
    "Não invente fatos: se não souber, diga que não sabe. "
    "Você não tem acesso à internet, aos arquivos do usuário nem ao horário atual. "
    "Se a solicitação for ininteligível ou você realmente não conseguir compreendê-la, "
    f"responda exatamente: {FALLBACK}"
)


class Orchestrator:
    def __init__(self, provider):
        self.provider = provider

    def _messages(self, text: str, history: list[dict]) -> list[dict]:
        msgs: list[dict] = []
        for turn in history[-MAX_TURNS:]:
            u, r = (turn.get("user") or "").strip(), (turn.get("reply") or "").strip()
            if u and r:
                msgs += [{"role": "user", "content": u}, {"role": "assistant", "content": r[:MAX_REPLY_CHARS]}]
        msgs.append({"role": "user", "content": text})
        return msgs

    async def ask(self, text: str, history: list[dict]) -> str:
        reply = await self.provider.generate(SYSTEM_PROMPT, self._messages(text, history))
        return reply.strip() or FALLBACK
