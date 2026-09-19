# Architecture Map

## Topologia alvo

```text
React Web/AppShell
       ↓
Fastify API ───────────────→ PostgreSQL + FORCE RLS
       │                             ↑
       ├→ Redis                      │
       └→ Public Ingress → Inbox → Worker Runtime
                                      ├→ Commercial Core
                                      ├→ Outbox → WABA Adapter
                                      ├→ Outbox → WAHA Adapter
                                      ├→ AI Operations
                                      └→ CAPI Outbox → Meta
```

## Contextos delimitados

| Contexto | Responsabilidade | Não pode conhecer |
|---|---|---|
| Identity & Tenancy | organizações, workspaces, usuários, RBAC/RLS | credenciais de provider em claro |
| Channel Control Plane | onboarding, configuração e saúde de canais | lógica comercial |
| Messaging Data Plane | ingress, inbox, mensagens, outbox, status | UI e decisões de funil |
| Commercial Core | contatos, threads, oportunidades, outcomes | SDK específico de provider |
| Cockpit | operação humana e estados honestos | acesso direto ao banco |
| AI Operations | políticas, conhecimento, tools e handoff | SQL, chaves ou ações não permitidas |
| Acquisition & Attribution | ativos Meta, touchpoints e evidências | declarar venda sem outcome |
| Conversion Feedback | elegibilidade, CAPI, recibos e diagnóstico | conversa como conversão implícita |
| Platform Operations | auditoria, flags, suporte, retenção e SRE | bypass de tenancy |
| Migration Layer | export, staging, normalização e cutover | queries runtime na V2 |

CH-00 é uma fundação compartilhada de persistência: Messaging Data Plane possui `messages`; Commercial Core possui `contacts` e `commercial_threads`. O pacote coordena migrations e FKs, mas canais não passam a controlar regras comerciais, ownership, funil ou outcomes.

## Invariantes arquiteturais

- domínio depende de portas, não de WAHA/Meta SDK;
- toda entidade tenant-owned contém `workspace_id`;
- ausência de contexto tenant resulta em zero acesso;
- claim global ocorre apenas em função mínima e retorna IDs necessários;
- todo efeito externo nasce de outbox transacional;
- todo efeito ambíguo exige reconciliação antes de repetição;
- credenciais são resolvidas dentro de callback delimitado;
- API Graph é versionada por configuração e contrato;
- V2 e V3 não compartilham banco em runtime;
- produção não aceita defaults de laboratório.

## Serviços Docker alvo

```text
postgres
redis
api
worker
web
waha                 # profile opcional
minio                # quando mídia for armazenada
otel-collector       # observabilidade
prometheus/grafana   # profile operacional
```

Somente Web/API podem ser publicados. Banco, Redis, WAHA e observabilidade ficam em rede privada.
