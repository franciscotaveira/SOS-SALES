# Especificação Detalhada — Módulo 6: Backend API Fastify, Webhooks & RLS Postgres (`apps/api`)
> **SOS Sales v2.0 | MCT OS**  
> **Arquivos de Referência:** `apps/api/src/server.ts`, `apps/api/src/domain/`, `apps/api/src/application/services/`, `apps/api/src/infrastructure/`

---

## 1. Visão Geral da Arquitetura do Backend

A API do SOS Sales é desenvolvida em **Fastify 4** com **Node.js 20 ESM** e **TypeScript**, organizada em princípios de **Clean Architecture + Domain-Driven Design (DDD)**. Ela responde por todas as rotas operacionais do CRM, pela recepção de webhooks multi-engine, por garantias de idempotência e pelo isolamento multi-tenant seguro via Row-Level Security (RLS) no PostgreSQL.

---

## 2. Camadas da Arquitetura DDD (`apps/api/src`)

```
apps/api/src/
├── domain/               ← Entidades puras e objetos de valor (Journeys, Messages, Contacts, Handoffs)
├── application/
│   ├── ports/            ← Interfaces para repositórios, gateways e conectores de terceiros
│   └── services/         ← Serviços de domínio (PrivateReplyService, NlpEnrichmentService, MmeLinkService)
├── infrastructure/
│   ├── channels/meta/    ← Clientes de API oficiais Meta (WabaClient, MessengerClient, InstagramDmClient, Wit.ai)
│   ├── database/         ← Gateways Postgres (Supabase pooler + SosSalesRuntime RLS)
│   └── redis/            ← Gateway Redis (IdempotencyGate)
└── interfaces/http/      ← Controllers Fastify, Middlewares e Handlers de Webhook
```

---

## 3. Especificação das Rotas da API Fastify

### 3.1. Rotas do Sistema & Health Checks
* `GET /health`: Diagnóstico de saúde básico do serviço API (retorna `{ status: 'ok', timestamp: string }`).
* `GET /ready`: Diagnóstico de prontidão verificando conexão com PostgreSQL Supabase e Redis.

### 3.2. Rotas de Workspace & Contatos
* `GET /api/v1/workspaces/:workspaceId/contacts`:
  - **Query Params:** `q` (busca por nome/telefone), `limit`, `offset`.
  - **Retorno:** Lista de contatos do PostgreSQL salvos na tabela `contacts`.
* `POST /api/v1/workspaces/:workspaceId/client-workspaces`:
  - **Payload:** `{ name, businessType, tagline, ownerEmail, whatsappNumber, provider }`.
  - **Efeito:** Cria novo workspace no banco e adiciona o usuário autenticado como `owner`.

### 3.3. Rotas de Conversas & Jornadas Commercials
* `POST /api/v1/workspaces/:workspaceId/conversations/start`:
  - **Payload:** `{ contactId?, phone?, initialMessage?, templateName? }`.
  - **Efeito:** Cria contato se necessário, abre nova jornada em `commercial_journeys` e envia mensagem inicial via WAHA ou WABA.
* `GET /api/v1/workspaces/:workspaceId/journeys`:
  - **Query Params:** `status`, `stage`, `limit`, `offset`.
  - **Retorno:** Paginação de jornadas com metadados do contato e última mensagem.
* `PATCH /api/v1/workspaces/:workspaceId/journeys/:journeyId/stage`:
  - **Payload:** `{ stage: 'LEAD' | 'QUALIFICADO' | 'PROPOSTA' | 'NEGOCIACAO' | 'GANHO' }`.
  - **Efeito:** Atualiza o estágio da jornada e aciona evento CAPI se configurado.
* `POST /api/v1/workspaces/:workspaceId/journeys/:journeyId/send-message`:
  - **Payload:** `{ textContent?, mediaUrl?, senderType: 'operator' | 'bot' }`.
  - **Efeito:** Grava mensagem em `conversation_messages` e dispara no canal ativo.

### 3.4. Rotas da Meta Cloud API (WABA v20.0)
* `GET /api/v1/workspaces/:workspaceId/channels/whatsapp/status`: Retorna status da conexão (WAHA ou WABA).
* `GET /api/v1/workspaces/:workspaceId/channels/waba/templates`: Consulta lista de modelos HSM salvos na Meta Graph API.
* `POST /api/v1/workspaces/:workspaceId/channels/waba/create-template`: Cria e submete novo template HSM para a Meta.
* `DELETE /api/v1/workspaces/:workspaceId/channels/waba/templates/:templateName`: Solcita exclusão de template na Meta.
* `POST /api/v1/workspaces/:workspaceId/channels/waba/send-template`: Envia mensagem HSM aprovada.
* `POST /api/v1/workspaces/:workspaceId/channels/waba/send-interactive`: Envia mensagens de Botões de Resposta Rápida, Menus de Lista ou Pix Checkout (`order_details`).
* `POST /api/v1/workspaces/:workspaceId/channels/waba/send-flow`: Envia formulário interativo WhatsApp Flow.

### 3.5. Rotas de Tracking & CAPI
* `GET /api/v1/workspaces/:workspaceId/tracking`: Retorna credenciais salvas de Pixel/Dataset Meta CAPI.
* `POST /api/v1/workspaces/:workspaceId/tracking`: Atualiza credenciais CAPI.
* `POST /api/v1/workspaces/:workspaceId/tracking/test-capi`: Envia evento de teste server-side para o Dataset Meta.

---

## 4. Ingestão de Webhooks & Redis Idempotency Gate

### 4.1. Gate de Idempotência (`IdempotencyGate`)
* **Problema Resolvido:** Meta Cloud API e WAHA reenviam webhooks em lote caso a API demore a responder, podendo gerar mensagens ou jornadas duplicadas.
* **Solução Implementada:**
  - Chave de Idempotência: `idempotency:msg:${providerMessageId}`.
  - Guarda a chave no Redis com TTL de 180 segundos.
  - Fallback in-memory LRU caso o Redis esteja indisponível.
  - Se a mensagem já foi processada, responde imediatamente `HTTP 200 OK` ignorando o payload duplicado.

### 4.2. Ingestão de Webhooks WAHA (`POST /api/v1/channels/waha/webhook`)
* Trata eventos de mensagens de entrada/saída, mídias e status da sessão WhatsApp Web.

### 4.3. Ingestão de Webhooks Meta Cloud API (`POST /api/v1/channels/waba/webhook`)
* Trata requisições `GET` de verificação de webhook (challenge da Meta) e `POST` com payloads de mensagens ativas, status de leitura e formulários de WhatsApp Flows.

---

## 5. Segurança Multi-Tenant & Row-Level Security (RLS)

* **Gateway Pattern Soberano:**
  - A API conecta ao pooler do PostgreSQL no Supabase.
  - Executa as transações atribuindo a role restrita: `SET LOCAL ROLE sos_sales_runtime`.
  - Injeta o contexto do usuário autenticado: `SET LOCAL request.jwt.claims = '{ "sub": "user_id", "workspace_ids": ["ws-1"] }'`.
  - Impede que requisições acessem dados de outros workspaces diretamente no nível de banco de dados (`rowsecurity = true`).
