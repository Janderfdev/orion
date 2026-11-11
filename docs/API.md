# ORION API (V5.2.0)

Use o ORION nos seus próprios projetos. A API chama o **ORION CORE** (a mesma identidade, ferramentas e orquestração do app),
**sem memória**: cada requisição é independente e não lê nem grava o histórico de ninguém.

- Disponível a partir do plano **ORION PLUS** (cota maior no **ORION PRO**).
- Base: `https://orion-backend-9qk5.onrender.com`
- Tudo em HTTPS e JSON. Autenticação: `Authorization: Bearer <sua chave>`.

## Chaves

Crie e gerencie no site: botão `</>` → **ORION API**.

- A chave completa aparece **uma única vez**, ao criar ou girar. O servidor guarda só uma impressão digital (hash): nem o ORION consegue recuperá-la.
- Até 5 chaves por conta. **Revogar** mata a chave na hora; **Girar** cria uma nova com o mesmo nome e revoga a antiga.
- Se você sair do plano PLUS/PRO, as chaves param de funcionar (não são apagadas); ao voltar, a mesma chave volta a valer.
- **Use a chave só no seu servidor.** Nunca coloque em site, app público ou repositório. Por isso o navegador de terceiros é bloqueado (CORS): a API foi feita para chamadas servidor a servidor.

## `POST /v1/chat`

```bash
curl https://orion-backend-9qk5.onrender.com/v1/chat \
  -H "Authorization: Bearer SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{"message": "Olá, ORION!"}'
```

Corpo: `message` (texto, 1 a 4000 caracteres) e `model` (opcional, um `id` de `GET /v1/models`). Corpo máximo: 32 KB.

```json
{
  "id": "req_1a2b3c4d5e6f",
  "reply": "Olá! Como posso ajudar?",
  "model": "gemini-3.8-flash",
  "sources": [{"title": "Órion", "url": "https://pt.wikipedia.org/wiki/Órion"}],
  "usage": {"used": 12, "limit": 1000}
}
```

`sources` traz as fontes que as ferramentas do ORION consultaram (pode ser vazio). As respostas são pensadas para a tela e para a fala:
texto direto, sem markdown.

## `GET /v1/models`

`{"default": "...", "models": [{"id": "...", "label": "..."}]}`

## `GET /v1/usage`

`{"plan", "plan_name", "api", "month", "used", "limit", "per_minute", "resets_on", "max_keys"}`

## Limites

| | PLUS | PRO |
|---|---|---|
| Requisições por mês | 1.000 | 10.000 |
| Requisições por minuto (por chave) | 10 | 30 |

Os valores vêm do servidor (`ORION_API_MONTHLY_*` e `ORION_API_RPM_*`) e podem mudar; `GET /v1/usage` mostra os seus. A cota do mês é
contada em Brasília (UTC-3) e renova no dia 1º. **Requisição que falha por culpa do modelo não é cobrada** e requisição inválida
(400/401/403/413) também não gasta cota.

## Erros

Sempre o mesmo formato, com o `request_id` (também no cabeçalho `X-Request-Id`; informe-o ao pedir suporte):

```json
{"error": {"code": "rate_limited", "message": "Limite de 10 requisições por minuto.", "request_id": "req_1a2b3c4d5e6f"}}
```

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `invalid_request` | corpo que não é JSON, `message` vazio/longo demais, `model` inválido |
| 400 | `model_unavailable` | `model` que não existe (veja `GET /v1/models`) |
| 401 | `invalid_api_key` | chave ausente, malformada, revogada ou desconhecida |
| 403 | `plan_required` | o plano atual não inclui o ORION API |
| 413 | `payload_too_large` | corpo acima de 32 KB |
| 429 | `rate_limited` | limite por minuto; veja o cabeçalho `Retry-After` (segundos) |
| 429 | `quota_exceeded` | cota do mês esgotada (renova no dia 1º) |
| 502 | `provider_error` | falha ao consultar o modelo |
| 503 | `provider_busy` | o modelo está no limite de uso; tente em instantes (`Retry-After: 10`) |
| 503 | `model_unavailable` / `api_unavailable` | modelo ou serviço indisponível agora |
| 504 | `timeout` | o modelo demorou mais de 45 s |
| 500 | `internal_error` | erro interno (sem detalhes por segurança) |

Os códigos são estáveis: dependa deles, não do texto da `message`.

## Exemplos

**Python**

```python
import requests

r = requests.post(
    "https://orion-backend-9qk5.onrender.com/v1/chat",
    headers={"Authorization": "Bearer SUA_CHAVE"},
    json={"message": "Olá, ORION!"},
    timeout=60,
)
if r.ok:
    print(r.json()["reply"])
else:
    err = r.json()["error"]
    print(err["code"], err["message"], "(", err["request_id"], ")")
```

**Node.js (18+, no servidor)**

```js
const r = await fetch("https://orion-backend-9qk5.onrender.com/v1/chat", {
  method: "POST",
  headers: { "Authorization": "Bearer SUA_CHAVE", "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Olá, ORION!" }),
});
const j = await r.json();
console.log(r.ok ? j.reply : j.error);
```

## Para quem opera o servidor

| Variável | Para quê |
|---|---|
| `ORION_API_KEY_PEPPER` | (recomendado) segredo do servidor usado no hash das chaves. **Trocar invalida todas as chaves.** |
| `ORION_API_MONTHLY_PLUS` / `_PRO` | requisições por mês (1000 · 10000) |
| `ORION_API_RPM_PLUS` / `_PRO` | requisições por minuto, por chave (10 · 30) |

Coleções do Firestore (só o servidor escreve; bloqueie para clientes): `api_hash`, `api_users`, `api_usage`.
O limite **por minuto** fica na memória do servidor (recomeça se ele reiniciar); a **cota mensal** é gravada no Firestore.
O servidor roda em uma instância: se escalar para várias, o limite por minuto passa a ser por instância.
