# Arquitetura e Modelo de Dados

## 1. Visão de contexto

```mermaid
flowchart TB
  U[Operadores e Gestores] --> WEB[React Web]
  WEB --> API[Fastify API]
  META[Meta WABA] --> ING[Ingress público]
  WAHA[WAHA] --> ING
  ING --> DB[(PostgreSQL + FORCE RLS)]
  API --> DB
  API --> REDIS[(Redis)]
  WORKER[Worker] --> DB
  WORKER --> REDIS
  WORKER --> META
  WORKER --> WAHA
  WORKER --> NIM[NVIDIA NIM / Provider IA]
  N8N[n8n] --> API
  API --> EXT[Webhooks externos]
```

## 2. Componentes

| Componente | Responsabilidade |
|---|---|
| `apps/web` | navegação, Cockpit, CRM e configurações |
| `apps/api` | contratos HTTP, autenticação, RBAC e orquestração |
| `apps/worker` | filas, envio, retry, reconciliação e tarefas assíncronas |
| `packages/domain` | entidades e invariantes independentes de provider |
| `packages/application` | casos de uso e portas |
| `packages/database` | migrations, transações tenant-safe e repositórios |
| `packages/contracts` | schemas e tipos compartilhados |
| `packages/auth` | identidade e autorização |
| `packages/observability` | logs, métricas e correlação |
| `packages/ui` | componentes e tokens reutilizáveis |

## 3. Contextos delimitados

- **Identity & Tenancy:** organizações, workspaces, usuários e memberships.
- **Channel Control Plane:** credenciais, instâncias e saúde de WABA/WAHA.
- **Messaging Data Plane:** ingress, inbox, mensagens, status e outbound.
- **Commercial Core:** contatos, threads, jornadas, oportunidades e outcomes.
- **Commercial Enablement:** catálogo, propostas, Pix e próximas ações.
- **Intelligence:** Radar, IA assistida, regras e evidências.
- **Acquisition Feedback:** atribuição e CAPI.
- **Integration Platform:** tokens, webhooks e n8n.
- **Operations:** auditoria, métricas, backup e suporte.

## 4. Entidades principais

```mermaid
erDiagram
  ORGANIZATION ||--o{ WORKSPACE : possui
  WORKSPACE ||--o{ MEMBERSHIP : autoriza
  USER ||--o{ MEMBERSHIP : participa
  WORKSPACE ||--o{ CHANNEL_INSTANCE : configura
  WORKSPACE ||--o{ CONTACT : possui
  CONTACT ||--o{ COMMERCIAL_THREAD : conversa
  COMMERCIAL_THREAD ||--o{ MESSAGE : contem
  COMMERCIAL_THREAD ||--o{ COMMERCIAL_JOURNEY : acompanha
  COMMERCIAL_JOURNEY ||--o{ COMMERCIAL_OUTCOME : conclui
  COMMERCIAL_THREAD ||--o{ COMMERCIAL_ACTION : agenda
  COMMERCIAL_THREAD ||--o{ COMMERCIAL_PROPOSAL : recebe
  WORKSPACE ||--o{ PRODUCT : cataloga
  COMMERCIAL_THREAD ||--o{ PIX_CHARGE : cobra
  COMMERCIAL_THREAD ||--o{ INTEGRATION_SUGGESTION : recomenda
  CHANNEL_INSTANCE ||--o{ WEBHOOK_INBOX : recebe
  MESSAGE ||--o{ OUTBOUND_COMMAND : envia
```

## 5. Invariantes

1. Toda entidade pertencente ao cliente contém `workspace_id`.
2. A transação define contexto tenant antes de qualquer query protegida.
3. `FORCE ROW LEVEL SECURITY` protege dados mesmo contra erro de repositório.
4. Webhook aceito é persistido antes do processamento.
5. Efeito externo nasce de registro transacional em outbox.
6. Timeout ambíguo vai para reconciliação; não é repetido cegamente.
7. Segredo é resolvido no limite do adapter e nunca volta no DTO.
8. Provider WhatsApp, IA ou pagamento não entra na regra central.
9. Recurso global é habilitado no provisionamento; configuração e dados são por tenant.

## 6. Fluxo de mensagem

```mermaid
sequenceDiagram
  participant P as Provider WhatsApp
  participant I as Ingress
  participant D as PostgreSQL
  participant W as Worker
  participant C as Cockpit
  P->>I: webhook assinado
  I->>D: persistir inbox idempotente
  I-->>P: 2xx
  W->>D: claim com lease/fencing
  W->>D: normalizar contato, thread e mensagem
  C->>D: consultar via API tenant-safe
  C->>D: criar mensagem + outbound command
  W->>P: enviar pelo adapter
  W->>D: registrar external id/status
```

## 7. Estratégia de escala

- escala inicial vertical no VPS;
- API e worker stateless sempre que possível;
- concorrência por fila, lease e `SKIP LOCKED`;
- armazenamento de mídia fora do banco quando volume justificar;
- particionamento por data para inbox, mensagens e auditoria quando necessário;
- réplica de leitura somente após medir gargalo;
- um WAHA compartilhado pode hospedar múltiplas sessões isoladas; WABA permanece por credencial/tenant.
