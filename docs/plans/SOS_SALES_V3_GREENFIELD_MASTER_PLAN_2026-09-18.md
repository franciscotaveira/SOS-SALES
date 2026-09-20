# SOS Sales V3 — Plano Mestre Greenfield com Migração Segura

> Data: 18 de setembro de 2026  
> Status: plano executivo e técnico para aprovação  
> Ambiente inicial: Docker local, isolado da V2 e da produção  
> Estratégia: novo núcleo em paralelo, migração progressiva e desligamento controlado da V2

## 0. Decisão executiva

### Recomendação

Construir o **SOS Sales V3 como um novo núcleo em um novo repositório Git**, provisoriamente em `/Users/franciscotaveira.ads/Projetos/SOS-SALES-V3`, usando a V2 somente como fonte de requisitos, evidências e componentes validados. Não continuar remodelando a V2 e não copiar o sistema inteiro para uma nova pasta.

A abordagem é um **greenfield governado com migração por estrangulamento**:

1. A V2 continua atendendo produção.
2. A V3 nasce com arquitetura, contratos, design system, telemetria e testes definidos antes das features.
3. Cada capacidade da V2 é classificada como `REUSAR`, `ADAPTAR`, `REESCREVER` ou `DESCARTAR`.
4. A V3 só substitui um fluxo quando comprovar o mesmo fluxo ponta a ponta em Docker.
5. Clientes são migrados individualmente, com rollback e reconciliação.

### Por que não remodelar novamente

O repositório atual tem aproximadamente 81 mil linhas TypeScript/TSX. Há componentes e rotas grandes que concentram responsabilidades demais:

- `LiveCockpitView.tsx`: 3.743 linhas;
- `whatsapp-channel-routes.ts`: 2.924 linhas;
- `receptionist-agent.ts`: 1.807 linhas;
- `salesOsGateway.ts`: 1.751 linhas;
- `AppShell.tsx`: 1.533 linhas;
- 56 migrações SQL e 25 arquivos de rota;
- `public_config` usado por 16 módulos, com chaves históricas diferentes;
- acesso direto a pools de banco presente em 11 arquivos de rota.

Esse estado não prova que o produto inteiro está incorreto. Ele indica que novas remodelagens terão custo crescente, risco de regressão e dificuldade para provar isolamento de responsabilidades.

### Por que não fazer um rewrite cego

Reescrever tudo sem reaproveitar conhecimento descartaria decisões valiosas: isolamento multi-tenant, outbox, idempotência, assinatura de webhooks, dual-engine, cockpit, funil, CAPI, agente supervisionado e operação Docker. A V3 deve reaproveitar **contratos e comportamento comprovado**, não o acoplamento histórico.

### Verdade operacional

“Sem bugs” não é uma promessa tecnicamente honesta. O objetivo da V3 é:

- reduzir a superfície onde bugs podem existir;
- detectar falhas antes da produção;
- impedir que uma falha atravesse tenants ou provedores;
- tornar cada erro observável, reproduzível e reversível;
- impedir que uma tela verde represente uma integração quebrada.

## 1. Visão do produto

O SOS Sales V3 será o sistema operacional comercial que fecha este ciclo:

```text
Aquisição Meta/Google
        ↓
Identificação e atribuição
        ↓
Conversa WhatsApp/Instagram/Messenger
        ↓
Atendimento humano + IA supervisionada
        ↓
Qualificação, agenda, proposta e venda
        ↓
Conversão com prova
        ↓
Feedback CAPI para otimização da mídia
```

### Promessa central

Transformar conversas em um processo comercial mensurável e devolver à mídia sinais reais de qualidade e receita.

### Diferenciais preservados da V2

- cockpit de atendimento com contexto comercial;
- WhatsApp dual-engine: Meta oficial e WAHA;
- funil comercial integrado à conversa;
- dossiê e copiloto de IA;
- handoff humano e autonomia governada;
- atribuição de campanhas e criativos;
- CAPI ligada ao resultado comercial;
- agenda integrada;
- isolamento multi-tenant;
- outbox, retries, idempotência e auditoria;
- Docker Lab e promoção atômica.

## 2. Princípios arquiteturais

1. **Domínio antes de provedor:** Meta, WAHA, Supabase e modelos de IA entram por adapters.
2. **Workspace como fronteira:** toda leitura, escrita, job, segredo e log operacional possui `workspace_id`.
3. **Fail-closed:** falta de identidade, permissão ou ownership interrompe a operação.
4. **Sem fallback silencioso:** troca de WABA para WAHA exige política explícita e registro.
5. **Configuração tipada:** nenhuma lógica de negócio depende de chaves soltas em JSON.
6. **Inbox/outbox:** webhooks são persistidos antes do processamento; efeitos externos saem por fila.
7. **Idempotência de ponta a ponta:** evento do provedor, comando interno e despacho externo têm chaves estáveis.
8. **Estado comprovável:** `configurado`, `conectado`, `saudável`, `testado` e `homologado` são estados distintos.
9. **Segredos fora do domínio público:** tokens nunca ficam em `public_config`, logs, frontend ou payloads analíticos.
10. **Observabilidade como feature:** correlation ID, métricas, traces e recibos fazem parte do contrato.
11. **IA sem autoridade implícita:** modelos sugerem; políticas determinísticas autorizam.
12. **Acessibilidade e mobile desde o primeiro componente.**

## 3. Estrutura do monorepo

```text
sos-sales-v3/
├── apps/
│   ├── web/                 # React, navegação e composição de produto
│   ├── api/                 # Fastify, autenticação e casos de uso síncronos
│   ├── worker/              # BullMQ: inbound, outbound, CAPI, IA e reconciliação
│   └── storybook/           # catálogo visual e estados dos componentes
├── packages/
│   ├── domain/              # entidades, value objects, políticas e eventos puros
│   ├── application/         # casos de uso e ports
│   ├── contracts/           # schemas Zod, OpenAPI e tipos gerados
│   ├── database/            # schema, migrations, RLS e gateways PostgreSQL
│   ├── ui/                  # tokens, primitives e componentes compostos
│   ├── auth/                # provider de identidade e autorização
│   ├── observability/       # logs, métricas, traces e auditoria
│   ├── integrations-meta/   # Graph, OAuth, Ads, WABA, Lead Ads e CAPI
│   ├── integrations-waha/   # sessões, webhooks e mídia
│   ├── integrations-ai/     # modelos, prompts, políticas e avaliações
│   └── test-kit/            # builders, fakes, fixtures sintéticas e contract tests
├── infra/
│   ├── docker/
│   ├── caddy/
│   ├── monitoring/
│   └── scripts/
├── docs/
│   ├── adr/                 # decisões arquiteturais numeradas
│   ├── product/             # requisitos e jornadas
│   ├── runbooks/            # operação e incidentes
│   └── evidence/            # evidências E2E por release
├── docker-compose.yml
├── docker-compose.integration.yml
└── pnpm-workspace.yaml
```

### Regras de dependência

```text
UI → contracts → application → domain
API/worker → application ports
adapters Meta/WAHA/DB/IA → application ports
domain → nenhuma dependência externa
```

É proibido:

- rota HTTP consultar tabela diretamente;
- componente React conhecer payload bruto de provedor;
- adapter importar UI;
- domínio importar SDK Meta, Supabase, Redis ou biblioteca de IA;
- segredo atravessar o contrato de resposta;
- uma feature acessar tabela de outro contexto sem um port explícito.

## 4. Stack recomendada

| Camada | Escolha | Motivo |
|---|---|---|
| Runtime | Node.js LTS + TypeScript strict | ecossistema atual e tipagem compartilhada |
| Monorepo | pnpm workspaces + Turborepo | builds reproduzíveis e fronteiras de pacote |
| Web | React + Vite | continuidade tecnológica sem copiar a UI atual |
| Server state | TanStack Query | cache, invalidação e estados de erro explícitos |
| Estado local | Zustand somente quando necessário | evitar stores globais excessivas |
| API | Fastify + Zod + OpenAPI | contrato rápido, tipado e validável |
| Banco | PostgreSQL 16 | fonte de verdade transacional |
| Migrations | SQL versionado e forward-only | RLS e constraints visíveis |
| Fila | Redis + BullMQ | retries, leases e jobs observáveis |
| Objetos/mídia | S3 compatível; MinIO no Docker | mídia fora do banco |
| Auth | port de autenticação; Supabase Auth como adapter inicial | desacoplamento e continuidade |
| Logs | Pino JSON com redaction | logs estruturados sem credenciais/PII |
| Tracing | OpenTelemetry | webhook → job → provedor rastreável |
| Métricas | Prometheus + Grafana | operação local e produção |
| Erros | Sentry ou OpenTelemetry collector | agrupamento e regressão |
| Testes | Vitest + Testcontainers + Playwright + MSW | unidade, integração, contrato e E2E |
| UI docs | Storybook + axe | componentes e acessibilidade verificáveis |

## 5. Docker como primeira plataforma

### Serviços do ambiente base

```yaml
services:
  web:
  api:
  worker:
  postgres:
  redis:
  minio:
  mailpit:
  prometheus:
  grafana:
  otel-collector:
```

### Perfil de integrações

```yaml
profiles:
  mock:
    - meta-mock
    - waha-mock
  waha:
    - waha
  e2e:
    - playwright
```

### Requisitos do Docker Lab

- `docker compose up --build` inicia todo o núcleo sem dependência do VPS;
- migrations executam em job único e idempotente;
- seed contém apenas dados sintéticos;
- health checks distinguem `live`, `ready` e `degraded`;
- Meta mock simula OAuth, ativos, webhooks, rate limit e erros Graph;
- WAHA mock simula sessão, mensagem, mídia e perda de conexão;
- nenhum token real é necessário para a suíte padrão;
- testes reais de Meta ficam em perfil de homologação e conta de teste;
- volumes têm nomes exclusivos para não tocar a V2;
- uma execução limpa deve funcionar em máquina nova a partir de `.env.example`.

### Portas sugeridas

| Serviço | Porta local |
|---|---:|
| Web | 3400 |
| API | 4400 |
| PostgreSQL | 55440 |
| Redis | 6389 |
| MinIO | 9008/9009 |
| Grafana | 3101 |
| Prometheus | 9091 |

## 6. Design system antes das telas

### Fundamentos

1. **Tokens primitivos:** cor, tipografia, espaço, raio, sombra, duração e elevação.
2. **Tokens semânticos:** superfície, texto, borda, ação, sucesso, alerta, perigo, IA e operação.
3. **Modos:** claro, escuro e alto contraste.
4. **Escala responsiva:** mobile, tablet, desktop e cockpit amplo.
5. **Densidade:** confortável e compacta para operação intensa.

### Tokens iniciais

```text
color.action        #00A884
color.operational   #2563EB
color.ai            #7C3AED
color.warning       #D97706
color.danger        #DC2626
color.ink           #0B132B
```

As cores existentes podem ser preservadas após validação WCAG. Nenhuma feature usa hexadecimal direto.

### Camadas de componentes

```text
Tokens
  ↓
Primitives: Button, Input, Select, Dialog, Drawer, Tooltip, Badge
  ↓
Patterns: DataTable, EmptyState, ErrorState, ConnectionStatus, Timeline
  ↓
Domain UI: ConversationCard, LeadStage, MetaAssetPicker, ConversionReceipt
  ↓
Screens: Cockpit, Funil, Meta Hub, Agenda, Resultados
```

### Contratos obrigatórios de UI

- navegação completa por teclado;
- foco visível;
- contraste WCAG AA;
- tamanho táctil mínimo de 44px;
- estados `loading`, `empty`, `error`, `partial`, `offline` e `forbidden` em Storybook;
- nenhuma tela depende apenas de cor para comunicar estado;
- mobile com uma região principal por vez;
- desktop com fila, conversa e contexto quando houver largura;
- skeleton somente quando existe carregamento real;
- mensagens de erro informam causa, impacto e ação possível;
- design review visual em 390px, 768px, 1280px e 1440px.

### Fluxos a prototipar antes do desenvolvimento

1. criação do workspace;
2. conexão Meta;
3. conexão WhatsApp;
4. primeiro lead;
5. atendimento e handoff;
6. agendamento;
7. fechamento;
8. recibo CAPI;
9. diagnóstico de falha;
10. reconexão/rotação de credencial.

## 7. Contextos funcionais

### 7.1 Identity & Workspace

- usuários, organizações, workspaces, equipes e papéis;
- convites com expiração;
- RBAC na aplicação e RLS no banco;
- sessão, revogação e auditoria;
- impersonation somente com autorização, prazo e trilha.

### 7.2 Provisionamento do cliente

- wizard de criação;
- nicho, horário, moeda, fuso e políticas;
- checklist de ativação baseado em evidências;
- nenhum workspace nasce com fixtures operacionais;
- importação da V2 com preview e relatório de divergência.

### 7.3 Meta Integration Hub

Entidade central independente do canal de mensagens:

```text
meta_connection
├── identity_grant
├── businesses
├── ad_accounts
├── pages
├── instagram_accounts
├── wabas
├── phone_numbers
├── datasets
├── webhook_subscriptions
└── capability_checks
```

Funções:

- OAuth por workspace com `state` assinado, PKCE quando suportado e callback único;
- descoberta automática de ativos;
- seleção explícita e confirmação de ownership;
- validação das permissões efetivamente concedidas;
- introspecção, expiração e rotação de token;
- leitura de campanhas, conjuntos, anúncios e insights;
- assinatura e teste de webhooks;
- dataset e CAPI configurados como capacidade independente;
- matriz de capacidades com evidência e timestamp;
- reconciliação periódica entre Meta e banco;
- estados: `DRAFT`, `AUTHENTICATED`, `ASSETS_SELECTED`, `DEGRADED`, `READY`, `REVOKED`.

### 7.4 Channel Hub

Cada canal é uma conexão separada:

- Meta Cloud API/WABA;
- WAHA;
- Instagram Direct;
- Messenger;
- futuros adapters.

Estados:

```text
CREATED → AUTH_PENDING → CONNECTING → CONNECTED → VERIFIED
                                  ↘ DEGRADED ↔ RECONNECTING
                                               ↘ REVOKED
```

O estado `CONNECTED` exige consulta atual ao provedor. `VERIFIED` exige mensagem real de entrada e saída.

### 7.5 Inbound Gateway

- endpoint mínimo por provedor;
- verificação de assinatura antes de qualquer processamento;
- persistência do envelope bruto com criptografia e retenção;
- chave de idempotência;
- normalização para `InboundMessageReceived`;
- resolução de workspace fail-closed;
- download de mídia assíncrono;
- dead-letter queue para envelopes inválidos;
- replay supervisionado.

### 7.6 Conversas e Cockpit

- contatos, jornadas, threads e mensagens são entidades separadas;
- fila por SLA e prioridade explicável;
- chat em tempo real;
- ownership humano/IA explícito;
- rascunhos isolados por usuário, workspace e jornada;
- dossiê derivado de fatos com proveniência;
- ações rápidas: assumir, transferir, concluir, agendar e registrar resultado;
- busca e paginação server-side;
- mídia segura com URL assinada.

### 7.7 Funil comercial

- múltiplos funis por workspace;
- estágios configuráveis com tipos canônicos;
- transição via comando, nunca update direto;
- histórico imutável de transições;
- resultado ganho/perdido separado da etapa visual;
- receita em unidade monetária inteira;
- motivos de perda estruturados;
- automações disparadas por eventos de domínio.

### 7.8 Attribution Engine

Hierarquia de evidência:

1. `ctwa_clid`: Meta CTWA determinístico;
2. `lead_id`: Meta Lead Ads determinístico;
3. `fbclid/fbc/fbp`: link/website rastreado;
4. código de tracking na mensagem;
5. correspondência por campanha/hook;
6. declaração manual.

Cada atribuição guarda:

- origem e nível de confiança;
- campanha, conjunto, anúncio e criativo;
- identificadores de clique;
- evidência bruta referenciada;
- timestamp;
- regra/versão do algoritmo;
- se pode ou não ser usada para CAPI business messaging.

É proibido promover atribuição probabilística a determinística.

### 7.9 Conversion Engine/CAPI

Eventos canônicos:

- `LeadCaptured`;
- `LeadQualified`;
- `AppointmentScheduled`;
- `ProposalAccepted`;
- `PurchaseCompleted`;
- `PurchaseRefunded`.

Pipeline:

```text
Domain event
  → Conversion policy
  → Consent/identity check
  → Conversion outbox
  → Meta adapter
  → Provider receipt
  → retry/dead letter
  → UI evidence
```

Modos:

- `business_messaging`: exige `ctwa_clid` + WABA correspondente;
- `website/system_generated`: usa identificadores permitidos e hash normalizado;
- `offline/physical_store`: exige política e origem compatíveis;
- `disabled`: nenhum evento sai.

O usuário vê `QUEUED`, `ACCEPTED`, `FAILED`, `NOT_APPLICABLE` e a razão. HTTP 200 sozinho não significa atribuição ou otimização comprovada.

### 7.10 Meta Lead Ads

- assinatura `leadgen` por página;
- recuperação segura do lead pela Graph API;
- deduplicação por `leadgen_id`;
- mapeamento de campos por formulário;
- criação de contato e jornada;
- campanha/conjunto/anúncio preservados;
- consentimento e política de contato;
- abertura de atendimento WAHA/WABA conforme política;
- evento de qualidade devolvido à Meta.

Esse fluxo é a alternativa oficial quando o número WhatsApp não pode ser conectado.

### 7.11 Agenda

- adapter por provedor externo;
- cache curto de disponibilidade;
- reserva idempotente;
- prevenção de double-booking;
- fuso horário obrigatório;
- confirmação e cancelamento auditáveis;
- sugestão da IA nunca representa reserva concluída.

### 7.12 AI Operations

- agentes pequenos e especializados;
- prompt e política versionados;
- ferramentas com allowlist por workspace;
- saída estruturada e validada;
- proteção contra prompt injection;
- PII minimizada;
- handoff determinístico;
- orçamento, latência e qualidade medidos;
- shadow mode antes da autonomia;
- botão global de suspensão por workspace;
- avaliações com conversas sintéticas e red team.

### 7.13 Billing e Entitlements

- plano, assinatura, período, estado e direitos separados;
- webhook de cobrança assinado e idempotente;
- grace period explícito;
- cobrança nunca altera dados comerciais;
- feature flags server-side;
- limites por workspace observáveis.

### 7.14 Administração e suporte

- auditoria por workspace;
- diagnóstico sem exposição de segredo;
- reprocessamento supervisionado;
- exportação LGPD;
- exclusão com política de retenção;
- runbooks acessíveis a operadores autorizados.

## 8. Modelo de dados essencial

### Núcleo

- `organizations`
- `workspaces`
- `users`
- `workspace_memberships`
- `roles`
- `audit_events`

### Integrações

- `provider_connections`
- `provider_credentials`
- `provider_assets`
- `provider_capability_checks`
- `webhook_subscriptions`
- `inbound_envelopes`
- `outbound_deliveries`

### Comercial

- `contacts`
- `contact_identities`
- `commercial_journeys`
- `conversation_threads`
- `messages`
- `message_status_events`
- `pipelines`
- `pipeline_stages`
- `journey_stage_events`
- `commercial_outcomes`
- `appointments`

### Aquisição e conversão

- `acquisition_touches`
- `attribution_decisions`
- `campaign_snapshots`
- `conversion_events`
- `conversion_deliveries`
- `provider_receipts`

### IA

- `agent_profiles`
- `prompt_versions`
- `knowledge_documents`
- `agent_runs`
- `tool_invocations`
- `handoff_events`
- `ai_evaluations`

### Invariantes

- tabelas tenant-owned têm `workspace_id NOT NULL`;
- FKs compostas impedem referência entre workspaces;
- RLS habilitada e testada por papel real;
- telefone é normalizado E.164 e protegido;
- valores financeiros usam inteiros;
- timestamps são UTC;
- eventos imutáveis não aceitam update/delete;
- tokens ficam criptografados e referenciados por versão;
- JSONB só armazena payload de provedor ou extensão versionada, não configuração central.

## 9. Contratos de API

- OpenAPI gerado a partir dos schemas do código;
- cliente web gerado, sem tipos duplicados;
- erros no formato RFC 9457/problem details;
- paginação cursor-based;
- comandos de escrita aceitam `Idempotency-Key`;
- respostas de mutação incluem versão e receipt;
- optimistic concurrency em recursos críticos;
- webhooks possuem versão e assinatura;
- rotas administrativas separadas das operacionais;
- nenhuma rota retorna payload bruto por padrão.

## 10. Segurança e privacidade

### Obrigatório desde o primeiro commit

- threat model por integração;
- RLS e RBAC com testes negativos;
- secrets via Docker secrets/local vault e provider de produção;
- criptografia de campos sensíveis;
- redaction de logs;
- rate limit por IP, workspace e credencial;
- CSRF/state/nonce nos fluxos OAuth;
- HMAC e proteção contra replay nos webhooks;
- SSRF protection para mídia e callbacks;
- política de retenção;
- trilha imutável de ações administrativas;
- dependabot/renovate e lockfile obrigatório;
- SBOM e scan de container;
- imagens Docker fixadas por digest;
- usuário não-root e filesystem read-only onde possível;
- backup e restore testados.

### Matriz de autorização

Papéis mínimos:

- `owner`;
- `admin`;
- `manager`;
- `operator`;
- `analyst`;
- `integration_service`;
- `support_auditor`.

Cada caso de uso possui permissão própria; esconder botão não é autorização.

## 11. Observabilidade e operação

### Sinais obrigatórios

- latência e erro por rota;
- profundidade e atraso de filas;
- taxa de webhooks inválidos/duplicados;
- mensagens recebidas/enviadas/falhas;
- estado do canal por workspace;
- tokens próximos de expirar;
- erros e receipts CAPI;
- latência e custo da IA;
- handoffs e respostas fora do SLA;
- falhas de RLS/autorização;
- versão/commit de cada container.

### Correlation chain

```text
provider_event_id
→ inbound_envelope_id
→ domain_event_id
→ job_id
→ outbound_delivery_id
→ provider_receipt_id
```

### SLOs iniciais

- API disponível: 99,9%;
- ingestão de webhook aceita: p95 < 500 ms;
- mensagem normalizada no cockpit: p95 < 3 s;
- perda silenciosa de evento: zero;
- duplicidade com efeito externo: zero;
- isolamento cross-tenant: zero tolerância;
- rollback operacional: < 10 min.

## 12. Estratégia de testes

### Pirâmide

1. **Unidade:** domínio, políticas, normalizadores e mapeamentos.
2. **Contrato:** Graph/WAHA/CAPI mocks contra schemas versionados.
3. **Integração:** PostgreSQL/Redis reais via Testcontainers.
4. **RLS:** usuários e papéis reais tentando acesso permitido e proibido.
5. **E2E:** Playwright do onboarding ao resultado.
6. **Resiliência:** timeout, duplicidade, reorder, rate limit, token expirado e indisponibilidade.
7. **Segurança:** assinatura, replay, IDOR, SSRF, injection e segredo em log.
8. **Migração:** amostras anonimizadas e reconciliação de totais.

### Jornadas E2E obrigatórias

1. criar workspace e convidar operador;
2. conectar Meta e descobrir ativos;
3. conectar WABA oficial;
4. conectar WAHA em workspace separado;
5. receber primeiro lead CTWA;
6. receber Lead Ads;
7. responder e comprovar status;
8. handoff IA → humano;
9. agendar;
10. fechar venda;
11. enviar e comprovar CAPI;
12. expirar token e recuperar;
13. receber webhook duplicado;
14. tentar cruzar tenants e ser bloqueado;
15. restaurar backup e reconciliar.

### Definition of Done

Uma feature só está concluída quando possui:

- requisito e critério de aceite;
- contrato de API;
- migration e rollback operacional quando aplicável;
- logs/métricas;
- tratamento de erros;
- testes necessários;
- estados de UI;
- documentação de operação;
- evidência no Docker;
- revisão de segurança quando toca dados ou integração.

## 13. Reaproveitamento da V2

### REUSAR como conceito/contrato

- modelo de workspace e isolamento;
- inbox/outbox e idempotência;
- estados de mensagens;
- políticas de handoff;
- eventos de resultado comercial;
- CAPI com receipts;
- health/readiness;
- release manifest e promoção atômica;
- tokens semânticos do design após auditoria.

### ADAPTAR com testes de contrato

- clients Meta/WABA;
- assinatura de webhooks;
- normalizadores WAHA/WABA;
- regras de atribuição;
- gateways PostgreSQL;
- scripts de deploy/rollback;
- playbooks e avaliações da IA;
- componentes visuais pequenos já acessíveis.

### REESCREVER

- rotas monolíticas;
- `LiveCockpitView`;
- `AppShell`;
- gateway frontend único;
- tela de canais e configurações fragmentadas;
- Embedded Signup duplicado;
- configuração Meta baseada em `public_config`;
- pipeline CAPI amarrado ao canal;
- agente recepcionista monolítico;
- fixtures incorporadas à aplicação.

### DESCARTAR

- mocks exibidos como dados reais;
- fallbacks silenciosos;
- chaves legadas duplicadas;
- endpoints sem ownership comprovado;
- UI que indica “conectado” apenas porque há credenciais salvas;
- módulos sem evidência de uso e sem relação com o núcleo comercial.

## 14. Migração sem interromper a produção

### Anti-corruption layer

A V3 não consulta tabelas da V2 durante operação normal. A migração ocorre por jobs versionados:

```text
V2 export read-only
→ staging schema
→ validação e transformação
→ preview de divergências
→ import V3 idempotente
→ reconciliação
→ aceite
```

### Ordem de migração de dados

1. organizações/workspaces;
2. usuários e memberships;
3. contatos e identidades;
4. configurações sem segredo;
5. canais e ativos externos;
6. jornadas abertas;
7. histórico necessário;
8. agenda e outcomes;
9. credenciais com rotação, nunca cópia cega;
10. eventos analíticos agregados.

### Cutover por cliente

1. snapshot e inventário V2;
2. dry-run de importação;
3. validação de contagens;
4. conexão dos provedores na V3;
5. shadow ingest sem efeitos externos;
6. teste real controlado;
7. congelamento curto de escrita V2;
8. delta import;
9. troca de webhook/rota;
10. monitoramento reforçado;
11. rollback disponível;
12. V2 passa a read-only para o cliente.

Haven é o primeiro piloto somente depois do ambiente sintético e da conta Meta de homologação.

## 15. Roadmap de construção

### Fase 0 — Charter e fronteiras

Entregas:

- visão, escopo, personas e jornadas;
- mapa de contextos;
- ADRs iniciais;
- matriz V2 `REUSAR/ADAPTAR/REESCREVER/DESCARTAR`;
- threat model inicial;
- métricas de sucesso.

Gate: nenhuma feature antes da aprovação dessas fronteiras.

### Fase 1 — Fundação Docker e engenharia

Entregas:

- monorepo;
- Docker Compose base;
- CI;
- migrations;
- auth adapter;
- logging, tracing e métricas;
- contratos Zod/OpenAPI;
- test-kit;
- release manifest.

Gate: máquina limpa sobe o sistema e executa checks com um comando.

### Fase 2 — Design system e shell

Entregas:

- tokens;
- primitives;
- patterns;
- Storybook;
- acessibilidade;
- AppShell responsivo;
- estados globais de erro e conexão.

Gate: revisão visual e axe nos quatro breakpoints.

### Fase 3 — Identity, workspace e provisionamento

Entregas:

- login;
- memberships/RBAC/RLS;
- criação do workspace;
- convites;
- auditoria;
- wizard de onboarding.

Gate: testes cross-tenant e papéis reais aprovados.

### Fase 4 — Meta Integration Hub

Entregas:

- OAuth;
- descoberta de ativos;
- seleção e ownership;
- token lifecycle;
- capability matrix;
- conexão de dataset/CAPI;
- leitura de campanhas;
- Meta mock completo.

Gate: onboarding Meta reproduzível em mock e conta de homologação.

### Fase 5 — Channel Hub e mensagens

Entregas:

- WABA;
- WAHA;
- inbox;
- normalização;
- outbound outbox;
- status e receipts;
- mídia;
- health por workspace.

Gate: mensagem real entra e sai com idempotência e correlação.

### Fase 6 — Cockpit e funil

Entregas:

- fila;
- chat;
- dossiê;
- ownership;
- handoff;
- pipeline;
- outcomes;
- real-time.

Gate: lead percorre entrada → atendimento → fechamento após reload.

### Fase 7 — Atribuição, Lead Ads e CAPI

Entregas:

- attribution engine;
- CTWA;
- Lead Ads;
- tracking links;
- conversion policies;
- dispatcher CAPI;
- receipts e reconciliação;
- dashboard de qualidade.

Gate: Meta aceita evento e a UI mostra prova, limites e vínculo correto.

### Fase 8 — Agenda e IA

Entregas:

- agenda adapter;
- copiloto;
- recepcionista;
- knowledge base;
- handoff;
- avaliações e shadow mode.

Gate: IA não envia fora da política e agenda não gera reserva fictícia.

### Fase 9 — Billing, administração e suporte

Entregas:

- planos e entitlements;
- cobrança;
- suporte auditável;
- exportação/retention;
- runbooks;
- painéis operacionais.

Gate: suspensão/cobrança não corrompe nem cruza dados comerciais.

### Fase 10 — Migração piloto e produção

Entregas:

- migrador V2 → V3;
- reconciliação;
- piloto Haven;
- canary;
- rollback;
- documentação de operação;
- plano de desativação V2.

Gate: sete dias de operação assistida sem perda, cruzamento ou duplicidade externa.

## 16. Sequência das primeiras quatro iterações

### Iteração 1 — Repositório confiável

- criar monorepo V3 isolado;
- configurar TypeScript strict, lint, format e boundaries;
- criar Docker base;
- adicionar PostgreSQL, Redis, API, worker e web;
- criar health/readiness;
- configurar CI e test-kit;
- registrar ADR-001 a ADR-006.

### Iteração 2 — Segurança tenant-first

- schema identity/workspace;
- auth adapter;
- RBAC/RLS;
- audit log;
- testes negativos cross-tenant;
- secrets provider;
- redaction de logs.

### Iteração 3 — Design system operacional

- tokens e temas;
- 15 primitives essenciais;
- patterns de estado;
- Storybook/axe;
- shell mobile/desktop;
- protótipos dos dez fluxos críticos.

### Iteração 4 — Meta Hub vertical slice

- mock OAuth;
- descoberta de business/ad account/WABA/dataset;
- seleção de ativos;
- persistência tipada;
- capability check;
- tela única de diagnóstico;
- teste E2E no Docker.

Ao final da Iteração 4, deve existir uma fatia real: login → workspace → conectar Meta mock → selecionar ativos → diagnóstico persistido → reload.

## 17. Governança de desenvolvimento

### Pull requests

- pequenas e verticais;
- uma decisão arquitetural por ADR;
- migrations separadas de backfill;
- descrição com comportamento antes/depois;
- evidência de teste;
- sem merge com contrato quebrado ou teste ignorado sem prazo.

### Branches e releases

- trunk-based com branches curtas;
- feature flags server-side;
- builds imutáveis;
- ambiente preview quando necessário;
- promoção do mesmo artefato;
- canary por workspace;
- rollback de aplicação separado de migração de dados.

### Gates de CI

1. format/lint;
2. TypeScript strict;
3. unit tests;
4. contract tests;
5. integration/RLS;
6. build;
7. container scan/SBOM;
8. Playwright crítico;
9. migration lint;
10. artifact manifest.

## 18. Métricas de sucesso

### Produto

- tempo até primeiro lead real;
- percentual de workspaces homologados sem suporte manual;
- taxa de conexão Meta concluída;
- percentual de leads com nível de atribuição conhecido;
- percentual de conversões com receipt;
- tempo de resposta e conversão por origem.

### Engenharia

- change failure rate;
- tempo médio de recuperação;
- cobertura de contratos críticos;
- falhas cross-tenant;
- jobs mortos e reprocessados;
- incidentes por segredo/configuração;
- tempo para reproduzir um incidente localmente.

### Operação

- mensagens sem jornada;
- envelopes sem ownership;
- duplicidades externas;
- canais degradados;
- tokens expirando;
- CAPI rejeitada;
- divergências Meta ↔ banco.

## 19. Riscos e contenções

| Risco | Contenção |
|---|---|
| Rewrite crescer indefinidamente | núcleo comercial fechado e backlog pós-MVP separado |
| Copiar dívida da V2 | matriz de reaproveitamento e contract tests antes de portar |
| Perder comportamento útil | golden flows e gravações/evidências da V2 |
| Divergir dados durante migração | shadow mode, delta import e reconciliação |
| Meta mudar APIs | versão centralizada, capability checks e changelog monitorado |
| WABA bloquear onboarding | Lead Ads e WAHA compatível como modos explícitos |
| IA agir incorretamente | shadow mode, policies e handoff determinístico |
| Nova UI ficar pesada | design system, limites de densidade e testes de tarefa |
| Docker diferir da produção | mesmas imagens, config por ambiente e promoção do artefato |
| Big-bang cutover | canary por workspace e rollback |

## 20. Critério de lançamento comercial

A V3 pode ser vendida quando um cliente novo, sem intervenção no banco, consegue:

1. criar conta e workspace;
2. convidar equipe;
3. conectar pelo menos um canal;
4. conectar Meta ou escolher alternativa oficial;
5. receber um lead real;
6. responder;
7. mover no funil;
8. agendar ou fechar;
9. produzir conversão com receipt ou razão clara de não aplicabilidade;
10. consultar resultado;
11. recuperar conexão degradada;
12. completar tudo sem acessar o workspace de outro cliente.

## 21. Próxima decisão e primeiro movimento

### Decisão proposta

Nome técnico provisório: `sos-sales-v3`. A V2 continua congelada para correções críticas e operação. Nenhuma nova feature estrutural entra na V2.

### Primeiro movimento executável

Criar o esqueleto V3 isolado e entregar a Iteração 1 no Docker. Antes disso, fechar quatro ADRs:

1. fronteira do MVP V3;
2. estratégia de autenticação;
3. estratégia de armazenamento de segredos;
4. estratégia de migração e coexistência V2/V3.

## GSTACK REVIEW REPORT

### CEO review

- Direção: greenfield governado com migração progressiva.
- Escopo protegido: aquisição → conversa → resultado → CAPI.
- Principal corte: features periféricas não entram antes do ciclo comercial E2E.
- Risco evitado: novo sistema virar outra remodelagem sem fronteiras.

### Design review

- Design system precede telas.
- Dez fluxos críticos são prototipados antes das features.
- Estados degradados e evidências fazem parte da experiência.
- Mobile e acessibilidade são contratos, não refinamentos posteriores.

### Engineering review

- Fronteiras de pacote impedem acoplamento de UI, domínio e provedores.
- Meta Hub é separado de canais e da CAPI.
- Inbox/outbox, idempotência, RLS e observabilidade entram na fundação.
- Migração é por workspace, com shadow mode, reconciliação e rollback.

### DX review

- Um comando sobe o ambiente base.
- Mocks eliminam dependência de tokens reais no ciclo diário.
- contratos geram OpenAPI e cliente web;
- test-kit e fixtures sintéticas evitam setup artesanal.

### Pontuação

| Área | Nota | Condição para 10 |
|---|---:|---|
| Estratégia | 9/10 | aprovar fronteira exata do MVP |
| Produto/UX | 9/10 | protótipos testados com tarefas reais |
| Arquitetura | 9/10 | ADRs e prova do vertical slice |
| Segurança | 9/10 | threat model e testes RLS executados |
| Migração | 8/10 | inventário completo de dados V2 |
| Operação | 9/10 | restore e canary exercitados |

### Decisões assumidas no plano

| Decisão | Escolha | Motivo |
|---|---|---|
| Remodelar ou reconstruir | reconstruir núcleo em paralelo | reduz acoplamento sem arriscar produção |
| Reuso | contratos e comportamento validados | evita copiar dívida estrutural |
| Ambiente inicial | Docker isolado | reprodutibilidade e segurança |
| Migração | por workspace | canary e rollback viáveis |
| Meta | conexão central por workspace | remove configuração artesanal por tela/canal |
| V2 | manutenção crítica apenas | impede duas arquiteturas novas concorrentes |
