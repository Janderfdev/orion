# ORION — Planos e assinaturas (V5.2.0)

Planos da V5.2.0: **FREE, PLUS e PRO**. O **ORION ULTRA chega na V5.5.0**, junto com o ORION CODE, e por isso não existe no código ainda
(um documento `plans/{uid}` com `"ultra"` é tratado como FREE).

Provedor: **Mercado Pago**, assinatura recorrente mensal (API `/preapproval`). O usuário digita o cartão na página do
Mercado Pago; o ORION nunca vê nem guarda dados de cartão.

## Fluxo

1. O site chama `POST /billing/checkout {"plan": "plus"}` (com o login). O servidor usa o **preço do catálogo** e o **e-mail do token**.
2. O servidor cria a assinatura no Mercado Pago, grava `billing_index/pre_<id>` (quem, qual plano, quantos centavos) e devolve a `checkout_url`.
3. O site leva o usuário a essa página. Voltar dela **não ativa nada**.
4. O Mercado Pago avisa o webhook `POST /billing/webhook/mercadopago`. O servidor valida a assinatura `x-signature`,
   **consulta a API do Mercado Pago** e só então grava `plans/{uid}` (plano + `until`). O corpo do webhook nunca decide nada.
5. `core/quota.py` lê `plans/{uid}`; `invalidate_plan` faz o plano novo valer na pergunta seguinte.

Acesso = próxima cobrança + carência (`ORION_BILLING_GRACE_DAYS`, padrão 3). Renovação aprovada estende; sem renovação o
plano vence sozinho. Cancelar mantém o acesso até o fim do período já pago. Reembolso/estorno retira o plano na hora.

## Rotas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /plans` | público | catálogo (sem segredos, sem recursos não lançados) |
| `GET /billing/me` | login | plano que vale hoje, estado da assinatura, últimos 20 lançamentos |
| `GET /plan` | login | plano e uso de hoje (não gasta pergunta); vozes liberadas |
| `POST /billing/checkout` | login | `{"plan": "plus"\|"pro"}` → `{checkout_url}` |
| `POST /billing/cancel` | login | cancela a renovação (acesso segue até o fim do período) |
| `POST /billing/webhook/mercadopago` | Mercado Pago | 401 assinatura inválida · 200 tratado/ignorado · 5xx tenta de novo |

Erros do faturamento chegam como `billing:<código>`: `billing_unavailable`, `plan_unavailable`, `email_required`,
`too_many_checkouts`, `already_subscribed`, `no_active_subscription`, `provider_error`.

## Variáveis (Render)

| Variável | Para quê |
|---|---|
| `ORION_MP_ACCESS_TOKEN` | Access Token. `TEST-...` = testes, `APP_USR-...` = produção |
| `ORION_MP_WEBHOOK_SECRET` | "assinatura secreta" do painel (Webhooks) |
| `ORION_MP_TEST_PAYER_EMAIL` | só com token TEST: e-mail do **comprador de teste** |
| `ORION_PRICE_PLUS` / `_PRO` | preço mensal em **centavos** (ex.: `1990`). Sem preço = plano não assinável |
| `ORION_BILLING_GRACE_DAYS` | carência após a data da cobrança (3) |
| `ORION_BILLING_RETURN_URL` | para onde o Mercado Pago devolve o usuário (https) |
| `FIREBASE_SERVICE_ACCOUNT` | já existe; o faturamento só funciona com ele |

Sem token, segredo ou service account, as rotas de checkout respondem 503 e nada é simulado.

## Painel do Mercado Pago (uma vez)

1. Suas integrações → criar a aplicação → copiar o **Access Token de teste**.
2. Webhooks → modo de teste → URL: `https://orion-backend-9qk5.onrender.com/billing/webhook/mercadopago`
   → tópicos: **`subscription_preapproval`**, **`subscription_authorized_payment`** e **`payment`**.
3. Copiar a **assinatura secreta** para `ORION_MP_WEBHOOK_SECRET`.
4. Criar um **usuário vendedor de teste** e um **comprador de teste**; o e-mail do comprador vai em `ORION_MP_TEST_PAYER_EMAIL`.
   Pagar com os cartões de teste do Mercado Pago. Só depois de tudo verde repetir com credenciais de produção.

## Regras do Firestore (obrigatório)

As coleções abaixo só podem ser escritas pelo servidor. Acrescente às regras (a service account ignora as regras):

```
match /plans/{d=**}          { allow read, write: if false; }
match /usage/{d=**}          { allow read, write: if false; }
match /billing_state/{d=**}  { allow read, write: if false; }
match /billing_index/{d=**}  { allow read, write: if false; }
match /api_hash/{d=**}       { allow read, write: if false; }   // ORION API: hash das chaves
match /api_users/{d=**}      { allow read, write: if false; }   // ORION API: lista de chaves de cada pessoa
match /api_usage/{d=**}      { allow read, write: if false; }   // ORION API: cota mensal
```

## Verificar com credenciais de teste (ainda NÃO foi possível)

Os testes automáticos usam o Mercado Pago simulado. Estes pontos só se confirmam com uma compra de teste de verdade:

- [ ] `POST /preapproval` sem cartão devolve `init_point` e o checkout abre.
- [ ] O webhook chega assinado e a assinatura confere (tópico + `data.id` na URL).
- [ ] `GET /authorized_payments/{id}` traz `preapproval_id`, `transaction_amount` e `payment.{id,status}` (nomes lidos de forma defensiva).
- [ ] A primeira cobrança gera `subscription_authorized_payment` (senão o plano ativa só pelo status `authorized`, com carência).
- [ ] Cancelar pelo ORION muda o status para `cancelled` no painel.
- [ ] Reembolso no painel chega como `payment` com status `refunded` e retira o plano.

## Limites conhecidos

- Assinatura recorrente aceita os meios que o Mercado Pago liberar para a conta; **não prometa Pix, boleto ou PayPal** na tela até conferir (os do mockup são só desenho).
- Reembolso só é reconhecido para cobranças que o ORION já registrou (`pay_<id>`).
- Reembolso parcial não retira o plano.
- O webhook é processado na própria requisição (rápido); se o Render estiver dormindo, o Mercado Pago reenvia.

## O que cada plano libera (e o que NÃO é anunciado)

O catálogo (`billing/plans.py`) só anuncia o que o ORION faz de verdade **e** o servidor controla por plano:
perguntas por dia, histórico, opções de voz (FREE 1; PLUS/PRO 4, travadas no servidor em `/speak`) e ORION API (a partir do PLUS).
Ficam fora, de propósito, até existirem: geração de imagens (hoje o ORION só mostra fotos de fontes), multitarefa e análises avançadas por plano,
ORION CODE (V5.5.0) e ULTRA (V5.5.0).
