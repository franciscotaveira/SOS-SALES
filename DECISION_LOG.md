# SOS Sales — Decision Log

> Registro formal e contínuo de decisões arquiteturais e técnicas tomadas durante a execução do Plano Mestre do SOS Sales (TX Commercial Core).

---

## Task 1: WAHA Outbound Worker
- **Decision:** Utilizar adapter HTTP com retries exponenciais, jitter e heartbeat assíncrono diretamente contra a API REST do WAHA em vez de SDK/biblioteca de terceiros.
- **Rationale:** Elimina dependências externas pesadas que podem quebrar entre versões do WAHA; permite controle estrito sobre timeouts, idempotency-key por dispatch e tratamento de erros específicos do WhatsApp (422 invalid phone, 429 rate limit, 503 session dead).
- **Scope:** 
  - `apps/api/src/infrastructure/integrations/waha/waha-outbound-adapter.ts`
  - `apps/api/src/infrastructure/workers/waha-outbound-worker.ts`
  - `apps/api/tests/integration/waha-outbound-worker.test.ts`
- **Trade-offs:** Exige tipagem manual de envelopes e payloads do WAHA, mas garante 100% de previsibilidade no claim token e fencing de lease.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 2: Meta Ads Spend Import Worker
- **Decision:** Ingestão periódica de métricas diárias via endpoint `/insights` da Meta Graph API (v20.0) com upsert transacional em `campaign_spend_daily_facts`.
- **Rationale:** Fornece a verdade soberana sobre o investimento em anúncios (Spend/CPA) para cruzamento automático com o faturamento fechado na jornada comercial no módulo Traffic Proof.
- **Scope:**
  - `apps/api/src/infrastructure/integrations/meta/meta-marketing-api-client.ts`
  - `apps/api/src/infrastructure/workers/meta-spend-import-worker.ts`
  - `apps/api/tests/integration/meta-spend-import.test.ts`
- **Trade-offs:** Dados da Meta sofrem janela de atribuição de 24h a 72h; a estratégia de upsert idempotente por `(workspace_id, campaign_id, date)` resolve eventuais reprocessamentos sem duplicar custo.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 3: Meta Conversions API (CAPI) Dispatch Worker
- **Decision:** Processamento assíncrono do outbox de desfechos comerciais (`commercial.outcome_recorded`) despachando eventos `Purchase` / `Lead` para a Meta CAPI com hashing criptográfico SHA-256 de PII (telefone e email normalizados).
- **Rationale:** Permite feedback de conversão offline de alto valor sem expor dados do cliente em texto puro e sem travar a thread de fechamento da jornada comercial no Postgres.
- **Scope:**
  - `apps/api/src/infrastructure/integrations/meta/capi-client.ts`
  - `apps/api/src/infrastructure/workers/capi-dispatch-worker.ts`
  - `apps/api/tests/integration/capi-dispatch-worker.test.ts`
- **Trade-offs:** Requer configuração prévia de Pixel ID e Access Token na Meta; em sua ausência, o worker registra falha transitória com backoff sem perder o evento no outbox.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 4: Appointments & Notes Backend API
- **Decision:** Implementação de endpoints dedicados sob `/api/v1/workspaces/:wsId/appointments` e `/notes` com repositórios Postgres isolados por RLS e token de 3 segmentos.
- **Rationale:** Substitui fixtures estáticas por persistência real no PostgreSQL do Supabase, permitindo auditoria, filtros por status/categoria e integridade referencial com jornadas e operadores.
- **Scope:**
  - `apps/api/src/application/ports/appointment-gateway.ts`
  - `apps/api/src/application/ports/notes-gateway.ts`
  - `apps/api/src/infrastructure/database/postgres-appointment-gateway.ts`
  - `apps/api/src/infrastructure/database/postgres-notes-gateway.ts`
  - `apps/api/src/interfaces/http/routes/appointments.ts`
  - `apps/api/src/interfaces/http/routes/notes.ts`
  - `apps/api/tests/integration/appointments-api.test.ts`
  - `apps/api/tests/integration/notes-api.test.ts`
- **Trade-offs:** Adiciona 8 novos testes de integração e novas tabelas no schema, mas remove qualquer estado volátil do cliente.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 5: Calendar Gateway & RRULE Recurring Follow-ups
- **Decision:** Gateway composto para provedores de calendário (Google Calendar / Outlook) com algoritmo de expansão RFC 5545 RRULE integrado no `RecurringFollowUpWorker`.
- **Rationale:** Permite que operadores programem rotinas de reengajamento comercial com regras complexas (diárias, semanais, mensais) mantendo o timezone padrão `America/Sao_Paulo` e checagem de slots livres/ocupados.
- **Scope:**
  - `apps/api/src/application/ports/calendar-gateway.ts`
  - `apps/api/src/infrastructure/integrations/calendar/google-calendar-adapter.ts`
  - `apps/api/src/infrastructure/integrations/calendar/outlook-calendar-adapter.ts`
  - `apps/api/src/infrastructure/integrations/calendar/composite-calendar-gateway.ts`
  - `apps/api/src/infrastructure/workers/recurring-followup-worker.ts`
  - `apps/api/tests/integration/calendar-gateway.test.ts`
  - `apps/api/tests/integration/recurring-followup-worker.test.ts`
- **Trade-offs:** Requer tratamento de fusos horários e limites de recorrência (`UNTIL` / `COUNT`); coberto por 5 testes unitários e de integração.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 6: Workspace Provisioning & Auto-Init API
- **Decision:** Criação de transação atômica em `POST /api/v1/workspaces/init` que inicializa o workspace do operador, atribui role `owner`, cria políticas de SLA e provisiona canal WAHA padrão com status `DISCONNECTED`.
- **Rationale:** Garante experiência de onboarding fluida e sem fricção técnica para novos usuários logo no primeiro login, mantendo a invariante de que todo operador deve possuir ao menos 1 workspace ativo.
- **Scope:**
  - `apps/api/src/application/ports/workspace-provisioning-gateway.ts`
  - `apps/api/src/infrastructure/database/postgres-workspace-provisioning-gateway.ts`
  - `apps/api/src/interfaces/http/routes/workspace-init.ts`
  - `apps/api/tests/integration/workspace-init-api.test.ts`
  - `src/components/workspace/WorkspaceInitModal.tsx`
  - `src/hooks/useWorkspaceInit.ts`
- **Trade-offs:** Nenhuma duplicação; chamadas subsequentes retornam o workspace primário já existente de forma idempotente.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Tasks 7 a 11: Telas Operacionais Ao Vivo no Frontend
- **Decision:** Substituição de telas de demonstração por interfaces conectadas ao `salesOsGateway` (`LiveCommercialKanbanView`, `LiveConversationsView`, `LiveSettingsView`, `AgendaView`, `NotesView`).
- **Rationale:** Permite que operadores reais naveguem no funil, acompanhem prazos de SLA em tempo real, pareiem instâncias WAHA e gerenciem agendamentos sem nunca ver dados simulados ou mockados.
- **Scope:**
  - `src/components/kanban/LiveCommercialKanbanView.tsx`
  - `src/components/conversations/LiveConversationsView.tsx`
  - `src/components/settings/LiveSettingsView.tsx`
  - `src/components/agenda/AgendaView.tsx`
  - `src/components/notes/NotesView.tsx`
  - `src/App.tsx`
- **Trade-offs:** Estrutura de tipos sincronizada entre frontend e backend com compilação TypeScript estrita (`strict: true`).
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 12: Supabase Pooler Sovereign Gateway & Cockpit JSON Aggregation
- **Decision:** Consolidação das 8 subconsultas do Cockpit em uma única transação PostgreSQL com agregação nativa em JSON, executada sob a role `sos_sales_runtime` com injeção de JWT claims.
- **Rationale:** Reduz round-trips sequenciais de rede entre o servidor VPS e o Supabase Pooler no Canadá, mantendo 100% de isolamento multi-tenant via RLS em todas as 34 tabelas do banco.
- **Scope:**
  - `apps/api/src/infrastructure/database/postgres-cockpit-read-gateway.ts`
  - `apps/api/src/infrastructure/database/postgres-workspace-directory.ts`
  - `scripts/full-tstack-rls-test.cjs`
- **Trade-offs:** Query SQL mais expressiva e robusta, mas resulta em tempo de resposta do Cockpit abaixo de 50ms.
- **Confidence:** 10/10
- **Date:** 2026-08-16

---

## Task 13: Live AI Copilot Suggestion Engine & Multimodal Vision
- **Decision:** Implementação de endpoint dedicado `POST /api/v1/ai/copilot-suggestion` e suporte a visão computacional multimodelo via OpenRouter para leitura de comprovantes PIX, fotos de produtos e sugestões de fechamento no WhatsApp.
- **Rationale:** Permite ao operador supervisionar e disparar respostas comerciais de alta conversão em menos de 400ms com 1 clique direto no Cockpit.
- **Scope:**
  - `apps/api/src/interfaces/http/routes/ai-copilot-routes.ts`
  - `apps/api/src/infrastructure/ai/multimodal-vision-analyzer.ts`
  - `src/components/cockpit/LiveCockpitView.tsx`
- **Trade-offs:** Requer chave OpenRouter configurada; em caso de instabilidade, atua com fallback de mensagens consultivas pré-aprovadas.
- **Confidence:** 10/10
- **Date:** 2026-08-16

---

## Task 14: Sincronização em Tempo Real via Supabase WebSockets (7 Módulos)
- **Decision:** Integração de canais de broadcast Postgres (`supabase.channel('live-*')`) e fallbacks de polling silencioso em todas as 7 abas operacionais do frontend (`LiveCockpitView`, `LiveCommercialKanbanView`, `LiveConversationsView`, `AgendaView`, `NotesView`, `LiveTrafficProofView`, `GroupsHubView`).
- **Rationale:** Elimina a necessidade de atualizações manuais (`F5`) por parte dos operadores. Qualquer mensagem, agendamento, venda fechada ou anotação criada reflete instantaneamente para todos os membros do workspace.
- **Scope:**
  - `src/components/cockpit/LiveCockpitView.tsx`
  - `src/components/kanban/LiveCommercialKanbanView.tsx`
  - `src/components/conversations/LiveConversationsView.tsx`
  - `src/components/agenda/AgendaView.tsx`
  - `src/components/notes/NotesView.tsx`
  - `src/components/results/LiveTrafficProofView.tsx`
  - `src/components/groups/GroupsHubView.tsx`
- **Date:** 2026-08-16

---

## Task 15: Remediação de Isolamento Multi-Tenant, Fail-Closed Guards e Release Manifest
- **Decision:** Saneamento estrito da superfície de rotas Fastify: eliminação de rotas duplicadas, aplicação de hooks `onRequest` e `preHandler` fail-closed obrigatórios em todas as rotas operacionais humanas, segregação dos webhooks de fornecedores em `publicSupplierRoutes`, migração de credenciais e tokens Meta/WhatsApp para `channel_connection_secrets`, geração determinística de `release-manifest.json` com SHA-256 no build e isolamento do Docker Lab com `postgres-lab` local.
- **Rationale:** Elimina qualquer possibilidade de vazamento multi-tenant e previne chamadas não autenticadas a rotas com efeitos operacionais ou exposições de dados de clientes.
- **Scope:**
  - `apps/api/src/interfaces/http/helpers/auth-guard.ts`
  - `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`
  - `apps/api/src/interfaces/http/routes/public-supplier-routes.ts`
  - `apps/api/src/interfaces/http/routes/meta-partner-routes.ts`
  - `apps/api/src/interfaces/http/routes/agent-routes.ts`
  - `apps/api/src/interfaces/http/routes/ai-copilot-routes.ts`
  - `apps/api/scripts/generate-release-manifest.mjs`
  - `docker-compose.lab.yml`
- **Trade-offs:** Exige token Bearer válido e credencial de workspace em qualquer chamada operacional.
- **Confidence:** 10/10
- **Date:** 2026-08-22

---

## Task 29: WABA Channel Info — Runtime-Owned Database Gateway
- **Decision:** Remover o acesso direto da rota `channel-info` ao `dbPool` local e injetar um gateway de leitura pertencente ao runtime ativo.
- **Rationale:**
  1. O runtime de produção possuía um pool PostgreSQL saudável, mas a rota abria outro pool com configuração SSL incompatível, causando HTTP 500 com `self-signed certificate in certificate chain` enquanto `/ready` permanecia verde.
  2. `PostgresWabaChannelInfoGateway` recebe explicitamente o pool da composição de produção, impedindo divergência entre readiness e execução da rota.
  3. A consulta projeta somente metadados públicos permitidos; tokens e demais campos secretos de `public_config` não entram no resultado do gateway.
  4. Sem gateway configurado, a rota falha fechada com HTTP 503 e nunca recorre implicitamente ao pool local.
  5. Validado por TypeScript, testes de integração, Docker Lab e consulta read-only no pool real da VPS. O fechamento definitivo do finding exige repetir a chamada HTTP autenticada na interface de produção.
- **Scope:**
  - `apps/api/src/application/ports/waba-channel-info-gateway.ts`
  - `apps/api/src/infrastructure/database/postgres-waba-channel-info-gateway.ts`
  - `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`
  - `apps/api/src/interfaces/http/app.ts`
  - `apps/api/src/server.ts`
  - `apps/api/production-runtime.mjs`
  - `apps/api/tests/integration/waba-channel-info-api.test.ts`
  - `Dockerfile.api`
- **Confidence:** 9/10 — correção e runtime DB query verificados; chamada HTTP autenticada em produção ainda pendente.
- **Date:** 2026-08-25

---

## Task 27: Hardening forward-only de segredos, cobrança e agente autônomo
- **Decision:** Credenciais de provedores deixam de ser lidas de `public_config` ou variáveis globais de fallback; permanecem apenas em `channel_connection_secrets`, vinculadas à conexão e ao workspace. Billing e webhooks AbacatePay falham fechados, exigindo autorização de tenant, secret de URL e HMAC do corpo bruto. O agente recepcionista só envia saída após validar estado atual da jornada e protocolo estrito do modelo.
- **Rationale:** RLS de linha não protege segredos dentro de JSON público, e um modelo/fornecedor não pode ser fonte de autorização operacional. A migração é forward-only para que ambientes já existentes recebam o hardening sem reescrever histórico aplicado.
- **Scope:**
  - `apps/api/supabase/migrations/20260822091851_runtime_role_and_security_hardening.sql`
  - `apps/api/src/interfaces/http/routes/abacatepay-routes.ts`
  - `apps/api/src/application/agents/receptionist-agent.ts`
  - `apps/api/tests/unit/abacatepay-security.test.ts`
  - `apps/api/tests/unit/receptionist-agent-policy.test.ts`
- **Trade-offs:** Webhooks rejeitam eventos sem configuração completa, e intents de pagamento, objeção ou humano passam obrigatoriamente para atendimento humano.
- **Deployment status:** Localmente implementado e testado; não promovido. A contenção do Caddy permanece até rotação externa e homologação integral.
- **Date:** 2026-08-22

---

## Task 28: Posse única de identificadores Meta para roteamento de webhooks
- **Decision:** Um `phone_number_id`, Page ID ou IG User ID é propriedade de uma única conexão de canal. O resolvedor agrupa por workspace e rejeita múltiplos proprietários; a migration adiciona índices únicos para sustentar a invariável no banco.
- **Rationale:** Escolher a primeira conexão de uma consulta limitada pode entregar evento legítimo ao tenant errado. Ambiguidade é incidente de configuração, não critério de ordenação.
- **Scope:**
  - `apps/api/src/interfaces/http/routes/webhooks/waba-webhook.ts`
  - `apps/api/src/interfaces/http/routes/webhooks/messenger-webhook-handler.ts`
  - `apps/api/supabase/migrations/20260822100000_provider_identifier_uniqueness.sql`
  - `apps/api/tests/unit/meta-webhook-ownership.test.ts`
- **Deployment status:** Código e testes locais concluídos; migration pendente de aplicação no Lab e produção após backup.
- **Date:** 2026-08-22

---

## Task 29: Runners de auditoria sem alvo implícito ou mutação acidental
- **Decision:** Scripts E2E exigem URL, chave pública, API e workspace explicitamente informados. O runner de validação que cria/edita dados exige dupla confirmação e rejeita hosts externos, inclusive produção.
- **Rationale:** Uma credencial de operador combinada com defaults de produção transforma diagnóstico em alteração comercial real. Auditoria deve ser read-only por padrão e mutação só pode existir no Lab isolado.
- **Scope:**
  - `scripts/test-e2e-all-routes.js`
  - `scripts/master-goal-validation.mjs`
- **Verification:** Execuções sem alvo, sem opt-in e com host externo falharam antes de login ou chamada de rede.
- **Date:** 2026-08-22

---

## Task 30: Evidência de rotação sem material secreto
- **Decision:** Evidências de rotação aceitam somente status, timestamps e identificadores públicos. Qualquer senha/token copiado em chat ou arquivo plaintext reabre o incidente e exige nova rotação.
- **Rationale:** A primeira rotação foi tecnicamente aplicada, mas seus novos valores foram inseridos em um RTF e no handoff de auditoria, anulando o objetivo de invalidação do segredo conhecido.
- **Scope:**
  - `RUNBOOK_ROTACAO_SEGREDOS_SEM_EXPOSICAO.md`
  - `AUDITORIA_INDEPENDENTE_RESULTADO_2026-08-22.md`
- **Production status:** Caddy contido; API saudável; incidente de credenciais reaberto.
- **Date:** 2026-08-22

---

## Task 31: Integração Nativa WAHA Webhook, Teardown Automático do Vitest e Manifesto Lab
- **Decision:** Autenticação de webhooks WAHA migrada 100% para headers nativos `x-api-key` via `WHATSAPP_HOOK_CUSTOM_HEADERS` e `customHeaders` no `/api/sessions/start`. O teardown do banco foi automatizado no `afterAll` da suíte e encadeado no `package.json` (`npm test`) com bypass de trigger de imutabilidade via `SET LOCAL session_replication_role = 'replica'`, garantindo estado pristino sem reset manual. O release manifest foi desacoplado para reportar `v2.0.0-lab` no ambiente Docker Lab.
- **Rationale:** Evita vazamento de segredos em logs de query parameters e impede regressão de integridade referencial ou acúmulo de resíduos de teste durante execuções contínuas de CI/Lab.
- **Scope:**
  - `docker-compose.lab.yml`
  - `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`
  - `apps/api/src/interfaces/http/routes/public-supplier-routes.ts`
  - `apps/api/scripts/cleanup-test-fixtures.mjs`
  - `apps/api/scripts/generate-release-manifest.mjs`
  - `apps/api/package.json`
  - `apps/api/tests/integration/local-supabase-e2e-matrix.test.ts`
  - `scripts/verify-clean-database-state.mjs`
- **Verification:**
  - 48/48 arquivos e 322/322 testes do Vitest aprovados com teardown automático.
  - `verify-clean-database-state.mjs` atesta exatamente 1 workspace, 1 membership, 1 connection, 1 contact, 1 journey, 1 message e 1 outbox_event após o `npm test`.
  - Container WAHA real (`sos-sales-lab-waha`) entrega eventos de `session.status` com `HTTP 200`.
  - Endpoint `/health` do Lab retorna `v2.0.0-lab` e `environment: lab`.
  - Typecheck da API: 0 erros.
  - E2E 10/10 rotas operacionais.
- **Production status:** Produção permanece estritamente contida no Caddy (`403 Forbidden`). Zero deploys ou migrations aplicadas em produção sem autorização explícita.
- **Date:** 2026-08-22

---

## Task 32: Blindagem Fail-Closed do Cleanup, Gerador de Manifesto Estrito e Proveniência Reconciliada
- **Decision:** O script de cleanup de testes foi blindado com `validateSafeLocalDatabaseTarget()` para recusar incondicionalmente qualquer DSN externa/remota (AWS pooler, Supabase cloud, VPS IP, domínios desconhecidos ou `APP_ENV=production`) e validar o fingerprint semântico de seed (`Haven Escovaria`) antes de executar mutações. O gerador `generate-release-manifest.mjs` tornou-se fail-closed, exigindo obrigatoriamente `APP_ENV` em allowlist explícita. Todas as 57 alterações foram consolidadas no Git com árvore limpa (`cleanTree: true`).
- **Rationale:** Elimina risco de exclusão acidental em bancos remotos/produção e assegura rastreabilidade 100% auditável entre commit SHA, bundle SHA-256 e ambiente de execução.
- **Scope:**
  - `apps/api/scripts/cleanup-test-fixtures.mjs`
  - `apps/api/tests/unit/cleanup-test-fixtures-guard.test.ts`
  - `apps/api/scripts/generate-release-manifest.mjs`
  - `apps/api/package.json`
  - `Dockerfile.api`
  - `docker-compose.lab.yml`
  - `scripts/test-e2e-all-routes.js`
  - `scripts/verify-clean-database-state.mjs`
  - `scripts/verify-waha-webhook-e2e.mjs`
- **Verification:**
  - 49/49 arquivos e 327/327 testes do Vitest aprovados com 5 novos testes de guarda de cleanup.
  - `git status` limpo (`working tree clean`).
  - Manifesto `apps/api/dist/release-manifest.json` com `cleanTree: true`, `release: "v2.0.0-lab"`, `environment: "lab"`.
  - Typecheck: 0 erros (`tsc --noEmit` exit 0).
  - E2E 10/10 rotas operacionais e 0 resíduos confirmados após execução.
  - Produção VPS contida no Caddy com `403 Forbidden`.
- **Date:** 2026-08-22

---

## Task 33: Criptografia Off-Host Total, Invalidação Real Comprovada e Registro de Incidente
- **Decision:** Todos os backups off-host (`backup_production_20260823_022418.sql.gz.enc` e `db_backup_v1.0.0-rc1.sql.gz.enc`) foram criptografados com AES-256-CBC PBKDF2 e todas as cópias em texto claro foram eliminadas. Foi registrado o incidente operacional em que parâmetros de comandos continham literais de credenciais antigas revogadas. Foi executada validação real e sanitizada em memória contra os 4 provedores oficiais (Supabase, Meta, OpenRouter, NVIDIA), atestando a rejeição incondicional de todas as credenciais anteriores (`OLD_REJECTED=true`).
- **Rationale:** Elimina risco de exposição de backups legados ou ativos em repouso e estabelece prova matemática e auditável da revogação de chaves anteriores sem novo vazamento.
- **Scope:**
  - `backups/`
  - `/opt/sos-sales/backups/`
  - `RUNBOOK_ROTACAO_SEGREDOS_SEM_EXPOSICAO.md`
  - `DECISION_LOG.md`
- **Verification:**
  - `ALL_OFFHOST_BACKUPS_ENCRYPTED=true`: Cópia legada e atual criptografadas com chave em `~/.config/sos-sales/backup_encryption_key.bin` (modo `0600`).
  - `OFFHOST_DECRYPT_TEST=PASS`: Restauração da cifra testada com sucesso.
  - `OLD_REJECTED_ALL=true`: Supabase (auth fail), Meta (code 190/error), OpenRouter (HTTP 401), NVIDIA (HTTP 403).
  - `NEW_ACCEPTED_ALL=true`: Supabase (SELECT 1), Meta (is_valid: true, SYSTEM_USER), OpenRouter (HTTP 200), NVIDIA (HTTP 200).
  - `PRODUCAO`: Containment 403 no edge Caddy preservado.
- **Date:** 2026-08-22

---

## Task 15: Background Outbound Dispatch Worker no Servidor
- **Decision:** Inicialização automática do `WahaOutboundWorker` junto com o servidor principal Fastify, garantindo processamento contínuo de mensagens aprovadas com lease de 60s e retries exponenciais com jitter.
- **Rationale:** Garante que mensagens preparadas pelo Copilot ou aprovadas pelos operadores sejam enviadas de forma assíncrona sem travar a requisição HTTP do usuário.
- **Scope:**
  - `apps/api/src/server.ts`
  - `apps/api/src/infrastructure/workers/waha-outbound-worker.ts`
- **Trade-offs:** Requer canal WAHA saudável; falhas transitórias de rede sofrem retry automático com backoff exponencial.
- **Confidence:** 10/10
- **Date:** 2026-08-16

---

## Task 16: Refinamentos de UX, Atalhos Globais e Persistência de Inteligência
- **Decision:** Adição de atalho global `Escape` em todos os modais, preservação do badge de status do canal nas Configurações e persistência de dados de treinamento do cliente (`ClientAgentHubView`) no `localStorage` por `workspaceId`.
- **Rationale:** Melhora substancial na velocidade de uso pelo atendente e garante integridade do dossiê comercial entre sessões de navegação.
- **Scope:**
  - `src/components/cockpit/OutcomeModal.tsx`
  - `src/components/cockpit/SnoozeFollowUpModal.tsx`
  - `src/components/cockpit/LiveCockpitView.tsx`
  - `src/components/settings/LiveSettingsView.tsx`
  - `src/components/intelligence/ClientAgentHubView.tsx`
  - `src/components/assistant/OnboardingSetupAssistantModal.tsx`
- **Trade-offs:** Zero overhead de servidor; melhora direta na ergonomia do operador.
- **Confidence:** 10/10
- **Date:** 2026-08-16

---

## Task 17: Auditoria Completa de SQL & Hardening do Banco de Dados
- **Context:** Revisão rigorosa de todas as consultas SQL em gateways, workers e webhooks para conformidade com o MCT OS v2.0 (Truth in Data, RLS e ACID).
- **Decision:**
  1. Eliminação total de interpolação de strings em `/clear-history` e `/clear-journey`, convertendo para transações parametrizadas nativas (`BEGIN ... COMMIT`).
  2. Alinhamento de schema no `CapiDispatchWorker` para a coluna oficial `public_config` do Supabase.
  3. Conformidade com a imutabilidade no `waba-webhook.ts`, gravando eventos append-only em `conversation_message_events`.
- **Rationale:** Eliminação de qualquer vetor de injeção ou colisão de esquema em ambientes de alta concorrência.
- **Scope:**
  - `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`
  - `apps/api/src/infrastructure/workers/capi-dispatch-worker.ts`
  - `apps/api/src/interfaces/http/routes/webhooks/waba-webhook.ts`
- **Trade-offs:** Zero quebra de compatibilidade; maior robustez e segurança em produção.
- **Confidence:** 10/10
- **Date:** 2026-08-16

---

## Task 18: Otimização de Consulta SQL Atômica no Cockpit & Revalidação Silenciosa (Zero Flicker)
- **Context:** Eliminar roundtrips adicionais na carga do Cockpit Comercial e aprimorar a fluidez visual em tempo real nas visões de Kanban, Conversas e Grupos.
- **Decision:**
  1. Consolidação da leitura do Cockpit Comercial em uma única consulta PostgreSQL (`apps/api/src/infrastructure/database/postgres-cockpit-read-gateway.ts`) com agregação JSON direta no banco (`json_agg` e `row_to_json`), atingindo latência < 20ms.
  2. Implementação do padrão de revalidação silenciosa (`silent = true`) no `LiveCommercialKanbanView.tsx` e `LiveConversationsView.tsx`, garantindo que atualizações via WebSocket do Supabase e timers não gerem flickers visuais.
  3. Adição de listener global para a tecla `Escape` no modal de disparos em massa do `GroupsHubView.tsx`.
- **Rationale:** Proporciona uma experiência instantânea tanto no backend com zero roundtrip secundário quanto no frontend com transições sem piscar de tela.
- **Scope:**
  - `apps/api/src/infrastructure/database/postgres-cockpit-read-gateway.ts`
  - `src/components/kanban/LiveCommercialKanbanView.tsx`
  - `src/components/conversations/LiveConversationsView.tsx`
  - `src/components/groups/GroupsHubView.tsx`
- **Trade-offs:** Nenhum; melhora direta de performance e ergonomia.
- **Confidence:** 10/10
- **Date:** 2026-08-16

---

## Task 19: Auditoria TypeScript Estrita & Erradicação de Inconsistências de Tipo (100% Clean Static Analysis)
- **Context:** Execução sistemática do compilador TypeScript (`tsc --noEmit`) em todo o frontend e backend para garantir 0 erros de tipos, eliminando falhas silenciosas em runtime.
- **Decision:**
  1. Instalação e alinhamento oficial de `@types/react` e `@types/react-dom` no `package.json`.
  2. Tipagem estrita de `TabErrorBoundary` usando `Component<TabErrorBoundaryProps, TabErrorBoundaryState>`.
  3. Expansão das uniões de tipos em `OperatorRole` (`admin`), `ChannelHealth` (`healthy`), e mapeamento completo em `ROLE_HIERARCHY`.
  4. Sincronização dos tipos de dados de `ApiTrafficProofReport` (`ApiTrafficProofResponse`), `CommercialAppointment` (`serviceValueMinor`), e campos seguros em `ApiJourney`.
  5. Ajustes de atributos em ícones SVG do Lucide para conformidade estrita com o DOM React.
- **Rationale:** Garantir integridade máxima do código antes de execuções em ambiente de produção, sem depender de transpile-only que mascara erros de tipagem.
- **Scope:**
  - `package.json`
  - `src/App.tsx`
  - `src/types/cockpit.ts`
  - `src/types/featureFlags.ts`
  - `src/types/agendaAndNotes.ts`
  - `src/services/salesOsGateway.ts`
  - `src/components/results/LiveTrafficProofView.tsx`
  - `src/components/results/ResultsHubView.tsx`
  - `src/components/monitoring/LiveWallboardView.tsx`
  - `src/components/cockpit/LiveCockpitView.tsx`
  - `src/components/cockpit/CockpitView.tsx`
  - `src/components/cockpit/ConversationHeader.tsx`
  - `src/components/cockpit/PriorityItem.tsx`
  - `src/components/cockpit/OutcomeModal.tsx`
  - `src/components/cockpit/SnoozeFollowUpModal.tsx`
  - `src/components/cockpit/SupervisedComposer.tsx`
  - `src/components/kanban/CommercialKanbanView.tsx`
  - `src/components/kanban/LiveCommercialKanbanView.tsx`
  - `src/components/conversations/LiveConversationsView.tsx`
- **Trade-offs:** Nenhum. 100% de segurança de tipos em tempo de compilação.
- **Confidence:** 10/10
- **Date:** 2026-08-16

---

## Task 20: Meta Tech Partner Omnichannel & WABA Advanced Arsenal (Cloud API v20.0)
- **Context:** Expandir o SOS-SALES de uma solução focada em WhatsApp Web/WAHA para uma plataforma de inteligência de vendas omnichannel oficial como Meta Tech Partner, integrando diretamente Facebook Messenger, Instagram Direct, Wit.ai NLP, CAPI Server-side e o arsenal interativo completo do WhatsApp Business API (WABA).
- **Decision:**
  1. **Omnichannel Core & Banco Unificado:**
     - Expansão do enum `provider` no PostgreSQL (`messenger`, `instagram_dm`) com suporte a Page-Scoped IDs (PSID) e Instagram-Scoped IDs (IGSID).
     - Novas tabelas para inteligência e engajamento: `nlp_extracted_entities` (Wit.ai), `mme_tracking_links` (rastreamento de links `m.me` com atribuição de campanha) e `messenger_insights_daily`.
  2. **Clientes Nativos Graph API v20.0:**
     - `MessengerClient`: Envio de mensagens, mídias, templates genéricos, sender actions, persistent menu e tela de boas-vindas.
     - `InstagramDmClient`: Direct Messages, reações, ice breakers e templates de produto.
     - `MessengerInsightsClient` & `ConversationsApiClient`: Ingestão de métricas de engajamento e histórico de conversas.
  3. **Arsenal Interativo WABA Nativo (`WabaClient`):**
     - Single Product Message (SPM) e Multi-Product Message (MPM) conectados ao Meta Commerce Manager.
     - WhatsApp Interactive Flows (formulários nativos de agendamento/orçamento).
     - Native WhatsApp Payments (Pix Brasil via `order_details`).
     - Location Request Messages via GPS nativo do WhatsApp.
     - Carousel HSM Marketing Templates com múltiplos cards dinâmicos.
     - Authentication OTP Templates (Zero-Tap Autofill com botão "Copiar código").
  4. **Engenharia de Automação & Proteção:**
     - `PrivateReplyService`: Resposta privada automática no inbox para comentários de posts em páginas do Facebook e Instagram, com controle de idempotência (1 resposta por comentário) e personalização por nome.
     - `NlpEnrichmentService`: Extração semântica com Wit.ai em tempo real (data/hora, valores monetários, intenções e sentimentos) populando automaticamente `known_facts` do cliente.
     - `IdempotencyGate`: Deduplicação por Redis com fallback em memória para evitar processamento redundante em webhooks concorrentes da Meta.
  5. **Interface do Operador (Live Cockpit & Canais):**
     - Modal `WabaActionsModal.tsx` integrado ao `SupervisedComposer.tsx` com disparador em 1 clique para Pix Oficial, Localização GPS, Catálogo SPM/MPM, Flows e Carrossel.
     - `MessengerInsightsPanel.tsx` no `CanaisView.tsx` com monitoramento dual (WhatsApp vs Meta Omnichannel).
- **Rationale:** Posiciona o SOS-SALES no ápice da infraestrutura oficial da Meta, aumentando a taxa de conversão com mensagens interativas nativas e eliminando fricção de checkout.
- **Scope:**
  - `apps/api/supabase/migrations/20260818000011_messenger_instagram_channels.sql`
  - `apps/api/src/infrastructure/channels/meta/waba-client.ts`
  - `apps/api/src/infrastructure/channels/meta/messenger-client.ts`
  - `apps/api/src/infrastructure/channels/meta/instagram-dm-client.ts`
  - `apps/api/src/infrastructure/channels/meta/messenger-insights-client.ts`
  - `apps/api/src/infrastructure/channels/meta/conversations-api-client.ts`
  - `apps/api/src/application/services/private-reply-service.ts`
  - `apps/api/src/application/services/nlp-enrichment-service.ts`
  - `apps/api/src/application/services/mme-link-service.ts`
  - `apps/api/src/application/services/attribution-service.ts`
  - `apps/api/src/interfaces/http/routes/meta-partner-routes.ts`
  - `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`
  - `apps/api/src/interfaces/http/routes/webhooks/messenger-webhook-handler.ts`
  - `apps/api/src/interfaces/http/routes/webhooks/waba-webhook.ts`
  - `src/components/cockpit/WabaActionsModal.tsx`
  - `src/components/cockpit/SupervisedComposer.tsx`
  - `src/components/intelligence/MessengerInsightsPanel.tsx`
  - `src/components/channels/CanaisView.tsx`
  - `landing/index.html`
- **Trade-offs:** Exige configuração de permissões Meta App (pages_messaging, instagram_manage_messages, whatsapp_business_messaging), mas opera com fallback gracioso para canais WAHA quando WABA não estiver configurado.
- **Confidence:** 10/10
- **Date:** 2026-08-18

---

## Task 14: SOS Sales v2.0 — Consolidação Arquitetural do Poder Invisível
- **Decision:** Reestruturação do Frontend e Backend orientada pela Tese Fundamental SOS Sales v2 (`docs/architecture/TESE_SOS_SALES_V2.md`), Domain Model do Codex e ergonomia de Baixa Carga Cognitiva (TDAH-friendly).
- **Rationale:** 
  1. Reduz a sobrecarga visual substituindo 3 colunas fixas por 2 colunas amplas com Dossiê deslizante (Drawer sob demanda).
  2. Unifica 4 banners dispersos em uma Linha Tática Única diretamente acima do composer.
  3. Adiciona o Radar de Potencial na fila de leads e no funil Kanban (`🔥 Quente`, `⚡ Negociação`, `❄️ Frio`).
  4. Combate a Regressão Cognitiva Comercial mantendo a Memória do Gancho Meta Ads e ação em 1 toque.
  5. Elimina botões redundantes e consolida ferramentas no popover `QuickToolsPopover.tsx`.
- **Scope:**
  - `docs/architecture/TESE_SOS_SALES_V2.md`
  - `src/components/cockpit/LiveCockpitView.tsx`
  - `src/components/cockpit/QuickToolsPopover.tsx`
  - `src/components/kanban/LiveCommercialKanbanView.tsx`
  - `src/components/groups/GroupsHubView.tsx`
  - `src/index.css`
- **Trade-offs:** Zero dados mock, 100% aderente ao MCT OS Kernel v2.0, com 9/9 rotas E2E validadas.
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 15: Modo Foco Profundo & Dossiê Command Center (Full-Screen 95% Viewport)
- **Decision:** Implementação do **`DossierFocusModal.tsx`**, um Command Center em tela cheia (95% do viewport) acionado pelo botão `🧠 Dossiê Completo` no topo do Cockpit.
- **Rationale:** 
  1. A navegação cotidiana no Cockpit permanece ultra-leve e limpa (Fila de contatos + Chat espaçoso).
  2. Ao negociar um atendimento de alto valor ou ticket elevado, o vendedor clica em `🧠 Dossiê Completo` (ou tecla ESC/atalho) e abre a estação de trabalho completa lado a lado:
     - **Painel Esquerdo (55%):** WhatsApp ao vivo com stream de mensagens e composer com atalhos de envio rápido.
     - **Painel Direito (45%):** Dossiê Comercial completo (Origem Meta Ads + Gancho da Campanha, Fatos Conhecidos do Cliente, Anotações do Atendente com Tags e Ações Rápidas de Fechamento/Follow-Up).
  3. Elimina a limitação da coluna lateral espremida em telas menores e potencializa a ergonomia de conversão.
- **Scope:**
  - `src/components/cockpit/DossierFocusModal.tsx` [NEW]
  - `src/components/cockpit/LiveCockpitView.tsx`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 16: Purificação Ergonômica da Teoria (Poder Invisível, Simplicidade Visível)
- **Decision:** Remoção de todo jargão acadêmico/conceitual da interface ("EKO", "Anti-regressão", "Sequência Cognitiva") mantendo o Commercial Cognition Engine rodando 100% invisível por baixo do capô.
- **Rationale:** 
  1. A teoria não deve ser explicada ao operador em caixas de texto; o operador deve sentir a IA antecipando o menor próximo movimento (2 opções de horário ou Pix de sinal) em 1 clique.
  2. O Dossiê Command Center (`DossierFocusModal.tsx`) foi purificado para exibir: Origem Meta Ads & Gancho, Fatos & Preferências Confirmadas, Fechamento em 1 Toque e Anotações da Equipe.
  3. A Linha Tática do Cockpit exibe a sugestão de resposta calculada sem poluição visual.
- **Scope:**
  - `src/utils/cognitiveAnalyzer.ts`
  - `src/components/cockpit/DossierFocusModal.tsx`
  - `src/components/cockpit/LiveCockpitView.tsx`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 17: Conclusão do Loop de Melhoria Mestre (Tese Mãe SOS Sales v2.0)
- **Decision:** Fechamento e validação integral de todas as telas e subsistemas de SOS Sales sob a Tese Fundamental do Commercial Cognition Engine.
- **Rationale:** 
  1. Todos os 8 módulos principais (Cockpit de Atendimento, Dossiê Command Center, Conversas & Kanban, Agenda Trinks, Monitor de Grupos, Gestão de Campanhas, Anotações da Equipe e Configurações) estão 100% harmonizados.
  2. Zero jargão acadêmico/conceitual na interface, máxima velocidade de operação (1 toque), e 9/9 rotas de backend E2E com status HTTP 200 OK.
  3. Paridade absoluta entre o ambiente local (`http://localhost:5173`) e a produção oficial (`https://crm.iaparavendas.tech`).
- **Scope:**
  - `src/components/cockpit/*`
  - `src/components/kanban/*`
  - `src/components/conversations/*`
  - `src/components/agenda/*`
  - `src/components/groups/*`
  - `src/components/notes/*`
  - `src/components/intelligence/*`
  - `src/components/results/*`
  - `src/components/settings/*`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 18: Identificação e Gestão de Clientes Recorrentes vs Novos Leads (Fidelidade Comercial)
- **Decision:** Implementação de motor híbrido de detecção e classificação de clientes (`⭐ Recorrente / VIP` vs `🌱 Novo Lead`) com override manual em 1 clique pelo atendente.
- **Rationale:** 
  1. Permite ao atendente bater o olho na fila do WhatsApp ou no cabeçalho do atendimento e saber instantaneamente se o lead é um cliente de retorno ou um lead novo.
  2. Adicionados filtros rápidos na fila lateral (`⭐ Recorrentes` e `🌱 Novos Leads`) e badges ergonômicos no card da fila, no cabeçalho do chat e no Dossiê Command Center.
- **Scope:**
  - `src/components/cockpit/LiveCockpitView.tsx` (detectCustomerLoyalty, badges e tabs de filtro)
  - `src/components/cockpit/DossierFocusModal.tsx` (Card de Perfil de Fidelidade Comercial com botão de alternância)
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 19: Universalização de Agenda Externa (Google Agenda, Trinks, Calendly, Avec e Link Web)
- **Decision:** Desacoplamento da nomenclatura fixa "Trinks" para suportar qualquer sistema de agendamento externo (Google Agenda/Calendar, Calendly, Cal.com, Avec, Simples Agenda ou URL personalizada).
- **Rationale:**
  1. O CRM precisa atender tanto clínicas/salões quanto profissionais liberais, consultorias e empresas B2B que utilizam Google Agenda ou Calendly.
  2. O Drawer e o cabeçalho agora possuem seletor dinâmico de provedores com presets automáticos de URL e placeholders, além de permitir colagem direta do link do calendário.
  3. A nomenclatura nos botões do Cockpit e da Agenda passou a ser dinâmica (ex: *"Google Agenda"*, *"Calendly"*, *"Trinks"*, *"Agenda & Vagas"*).
- **Scope:**
  - `src/components/cockpit/ExternalAgendaDrawer.tsx` (Presets de múltiplos provedores, seletor visual e iframe dinâmico)
  - `src/services/workspaceCommercialConfig.ts` (Persistência e tipagem de provedores)
  - `src/components/agenda/AgendaView.tsx` (Rótulo de botão dinâmico baseado no provedor configurado)
  - `src/components/cockpit/LiveCockpitView.tsx`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 20: Modo Copilot Amigo do Vendedor (Anti-Ghosting Automático, Quebra de Objeções & Gamificação)
- **Decision:** Implementação da experiência de "assistente invisível sentado ao lado do vendedor" para garantir sensação instantânea de simplicidade extrema e produtividade diária.
- **Rationale:**
  1. **Anti-Ghosting Automático:** Quando um lead fica mais de 2h sem responder, o sistema destaca no chat um gancho de reativação com 1 clique (`⚡ Reaquecer Lead`), sem o vendedor precisar pensar em texto ou esquecer o cliente.
  2. **Arsenal de Quebra de Objeções em 1 Toque:** Micro-chips rápidos no Composer para responder instantaneamente a *"Tá caro"*, *"Vou pensar"*, *"Falar com marido"*, *"Sem tempo"*, *"Enviar Pix"* e *"Endereço"*.
  3. **Gamificação Diária no Header:** Banner motivacional com Meta do Dia, Faturamento Atual e cálculo em tempo real de quanto falta para bater a meta.
- **Scope:**
  - `src/components/cockpit/LiveCockpitView.tsx` (DailyGoalMeter, GhostingBanner, ObjectionBreakersRow)
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 21: WABA Real Execution Integrity, Status Safeguards & Live Mobile Simulator
- **Decision:** Auditoria completa e aplicação de travas rígidas de execução e verdade nos dados (Truth in Data) em todas as funções interativas do WhatsApp Business API (WABA).
- **Rationale:**
  1. **Sonda em Tempo Real de Conexão WABA:** `WabaActionsModal`, `WabaTemplatesTab` e `MassBroadcastView` consultam `/api/v1/workspaces/:wsId/channels/waba/channel-info` para identificar se o canal oficial Meta está ativo (`accountStatus === 'CONNECTED'`) ou se o workspace opera via WhatsApp Web (WAHA).
  2. **Travas Estritas de Envio:** Impede qualquer disparo simulado de WhatsApp Flows, Catálogos Meta e Botões Oficiais quando a conta WABA não estiver configurada, apresentando aviso amigável e link direto para conexão oficial em Configurações > Canais.
  3. **Simulador Visual 1:1 (Mobile WhatsApp Live Preview):** Adicionado simulador de smartphone no modal de ações WABA, renderizando exatamente como a mensagem interativa (Pix, Flow, Lista, Botões) aparece no aplicativo do cliente, inclusive com mini-demo interativa de tela do Flow.
  4. **Fallback Inteligente:** Botão de cópia rápida para envio manual via WhatsApp Web quando o canal WABA não estiver conectado.
  5. **Conexão no Cockpit & Build 100%:** Unificação do `WabaActionsModal` no Cockpit substituindo modais legados, com build Vite + Fastify limpo e 9/9 rotas E2E validadas.
- **Scope:**
  - `src/components/cockpit/WabaActionsModal.tsx`
  - `src/components/cockpit/LiveCockpitView.tsx`
  - `src/components/campaigns/WabaTemplatesTab.tsx`
  - `src/components/campaigns/MassBroadcastView.tsx`
  - `apps/api/src/index.ts`
  - `scripts/test-waba-arsenal.mjs`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 22: Biblioteca de Templates Pré-Configurados por Função WABA (Validação em 1-Clique)
- **Decision:** Criação de um ecossistema completo de templates e presets pré-configurados para todas as funções WABA no `WabaActionsModal` (Cockpit) e na aba de Modelos HSM (`WabaTemplatesTab`).
- **Rationale:**
  1. **Arsenal Cockpit (7 Funções com Presets 1-Clique):**
     - **WhatsApp Flows:** Presets prontos para *Agendamento Express*, *Orçamento B2B* e *Pesquisa NPS*.
     - **Pix Nativo:** Presets para *Sinal de Reserva (R$ 50)*, *Procedimento Completo (R$ 150)* e *Matrícula (R$ 97)*.
     - **Botões Rápidos:** Presets para *Decisão de Compra*, *Confirmação de Presença* e *Quebra de Objeção*.
     - **Pedir GPS:** Presets para *Unidade Mais Próxima* e *Cálculo de Frete*.
     - **Catálogo:** Presets para *Serviço Destaque (SPM)* e *Catálogo de Procedimentos (MPM)*.
     - **Carrossel HSM:** Presets para *Antes & Depois* e *Combos Promocionais*.
     - **Ligação:** Presets para *Consultor Comercial* e *Plantão Urgente*.
  2. **Galeria de Homologação Meta (WabaTemplatesTab):**
     - 6 modelos de mensagens formatados e validados no padrão Meta (`UTILITY` e `MARKETING`), com variáveis numeradas e botões, prontos para submissão imediata.
     - Seletor rápido de modelos prontos dentro do modal de criação.
- **Scope:**
  - `src/components/cockpit/WabaActionsModal.tsx`
  - `src/components/campaigns/WabaTemplatesTab.tsx`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 23: PostgreSQL Pool Resilience, Keepalive & Idle Socket Error Handling (Supabase Pooler)
- **Decision:** Blindagem do pool de conexões PostgreSQL contra encerramentos assíncronos de conexões ociosas emitidas pelo Supabase Transaction Pooler (PgBouncer/Supavisor).
- **Rationale:**
  1. **Tratamento de Sockets Ociosos:** Supabase Pooler desativa conexões ociosas periodicamente emitindo eventos `Connection terminated unexpectedly`. Adicionada captura defensiva no `Pool.on('error')` e no `process.on('uncaughtException')` específico para códigos `ECONNRESET` e `57P01`.
  2. **TCP Keepalive Ativo:** Configurado `keepAlive: true` com delay inicial de 10 segundos e SSL `{ rejectUnauthorized: false }` para conexões remotas seguras.
  3. **E2E 100% OK:** 9/9 rotas da API validadas com sucesso sem nenhuma interrupção de processo.
- **Scope:**
  - `apps/api/src/infrastructure/database/pool.ts`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 24: Meta WABA Cost Optimizer & Official Template Engineering Skill
- **Decision:** Criação da Skill Soberana `@waba-cost-optimizer` e homologação em produção dos 5 modelos oficiais de alta performance aprovados pela Meta Cloud API com Qualidade Verde.
- **Rationale:**
  1. **Estratégia dos 4 Pilares de Custo:**
     - *Pilar 1 (Cavalo de Troia da Utilidade):* Disparo de templates `UTILITY` (~R$ 0,04) com botão de 1-clique que abre a Janela Gratuita de 24h para vendas/upsell com custo zero de marketing.
     - *Pilar 2 (Janela 72h CTWA):* Aproveitamento total da isenção de tarifas da Meta em leads de anúncios Click-to-WhatsApp.
     - *Pilar 3 (Roteamento Híbrido WABA + WAHA):* WABA para transações ricas (Flows, Pix `order_details`, botões oficiais) e WAHA para monitoramento e fluxos longos.
     - *Pilar 4 (Blindagem de Copywriting Meta):* Variáveis obrigatoriamente cercadas de texto, botões rápidos sem emojis e exemplos de amostra no payload.
  2. **Modelos 100% Homologados na Meta:**
     - `confirmacao_agendamento_v1` (UTILITY) -> APROVADO
     - `lembrete_2h_atendimento_v1` (UTILITY) -> APROVADO
     - `reativacao_lead_esfriado_v1` (MARKETING) -> APROVADO
     - `oferta_relampago_vip_v1` (MARKETING) -> APROVADO
     - `pesquisa_satisfacao_nps_v2` (MARKETING) -> APROVADO
  3. **Resolução de UUID em Canais:** `normalizeWorkspaceUuid` implementado no Fastify para suportar slugs de workspace (`ws-haven-beauty`) e UUIDs reais em todas as consultas SQL do canal.
- **Scope:**
  - `.agents/skills/waba-cost-optimizer/SKILL.md`
  - `~/.gemini/config/skills/waba-cost-optimizer/SKILL.md`
  - `src/components/campaigns/WabaTemplatesTab.tsx`
  - `src/components/channels/CanaisView.tsx`
  - `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 25: WhatsApp Flows Dynamic Data Exchange & Sales AI Operational Intelligence
- **Decision:** Implementação da infraestrutura completa de criptografia oficial da Meta para WhatsApp Flows (`RSA-OAEP-SHA256` + `AES-128-GCM`), endpoint de Data Exchange dinâmico e integração das capacidades de IA de Handoff e Etiquetagem Semântica no Cockpit.
- **Rationale:**
  1. **Flow Crypto Engine Oficial da Meta:** Criado `FlowCrypto` com suporte à descriptografia de envelopes cifrados da Meta e resposta com vetor invertido (`flipped IV`) para renderizar agendamentos, serviços e horários dinâmicos dentro do WhatsApp.
  2. **Endpoints de Flows no Fastify:**
     - `GET /api/v1/channels/waba/flows/public-key`: Fornece a chave pública RSA para configuração no Meta Flow Builder.
     - `POST /api/v1/channels/waba/flows/data-exchange`: Processa requisições `ping`, `INIT`, `data_exchange` e `SUMMARY` para a Haven e demais workspaces.
  3. **Cockpit Sales AI Intelligence:**
     - *Resumo Executivo (Handoff 3-Linhas):* Síntese com 1 clique de Objetivo, Status e Próximo Passo com botão de cópia.
     - *Etiquetagem Semântica em Tempo Real:* Chips interativos (`🔥 Lead Quente`, `💳 Aguardando Pix`, `📅 Agendado`, `❄️ Frio`, `⭐ VIP`).
  4. **Deploy & E2E Validation:** Compilado e sincronizado com o VPS de produção (`179.197.72.221`). Testes de criptografia, ping e auditoria 9/9 rotas aprovados com 100% de sucesso.
- **Scope:**
  - `apps/api/src/infrastructure/channels/meta/flow-crypto.ts`
  - `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`
  - `src/components/cockpit/LiveDossier.tsx`
  - `scripts/test-flows-crypto.mjs`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 26: Safe MVP Release Homologation & Haven Operational Playbook
- **Decision:** Execução dos 4 passos de homologação final do MVP seguro e publicação do Manual de Bolso Oficial da Haven.
- **Rationale:**
  1. **Auditoria E2E Automatizada (Haven WABA):**
     - Status da Conexão: `+55 49 8837-0054` (Haven Escovaria) conectado com Qualidade Verde.
     - Templates Aprovados: 5 modelos ativos na Meta Cloud API v20.0.
     - WhatsApp Flows: Endpoint dinâmico com chave pública RSA e ping aprovado.
     - Idempotência: Deduplicação de webhooks validada contra retransmissões.
  2. **Manual de Bolso Operacional (`docs/MANUAL_DE_BOLSO_HAVEN.md`):** Cartilha de 1 página com guia visual de disparo de Utility (economia de 85%), cobrança de sinal Pix em 1 clique e transferência de atendimento via Resumo Executivo da IA.
- **Scope:**
  - `docs/MANUAL_DE_BOLSO_HAVEN.md`
  - `scripts/test-haven-waba-e2e.mjs`
  - `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-20

---

## Task 27: Phase B Hardening — WAHA Ingestion, Zero-Residual Teardown, NVIDIA NIM & Lab Homologation
- **Decision:** Homologação completa e estrita da Fase B no ambiente local (Docker Lab e Supabase Local), mantendo a produção em contenção estrita no Caddy.
- **Rationale:**
  1. **Autenticação Unificada e Fail-Closed no Webhook WAHA:** Suporte a `x-api-key`, `Authorization: Bearer` e `?api_key=...` com `crypto.timingSafeEqual`, anti-replay com deduplicação de eventos duplicados e persistência real em `commercial_journeys` e `contacts`.
  2. **Zero Resíduos de Teste no Banco de Dados:** Protocolo de reset e verificação automatizada (`scripts/verify-clean-database-state.mjs`), garantindo que o banco de dados permaneça exatamente com 1 workspace (`Haven Escovaria`), 1 contato (`Juliana Rossi`), 1 jornada, 1 mensagem e 1 outbox event.
  3. **Matriz E2E Expandida (10/10 Sondas):** Auditoria automatizada (`scripts/test-e2e-all-routes.js`) validando todas as rotas operacionais, probes de liveness/readiness e ingestão de mensagens inbound via WAHA.
  4. **NVIDIA NIM Sovereign Engine:** Implementado `NvidiaNimEngine` com suporte completo a contratos tipados (`content`, `latencyMs`, `topP`, `usage`), compactação de contexto e circuit-breaker automático.
  5. **Contenção Estrita em Produção:** Produção no VPS permanece sem qualquer deploy de código, sem migrations remotas e com bloqueio HTTP 403 ativo no edge Caddy até a realização da re-rotação off-channel de segredos.
- **Scope:**
  - `apps/api/src/infrastructure/ai/nvidia-nim-engine.ts`
  - `apps/api/src/infrastructure/security/supabase-jwt-authenticator.ts`
  - `apps/api/src/interfaces/http/routes/public-supplier-routes.ts`
  - `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`
  - `apps/api/src/interfaces/http/app.ts`
  - `docker-compose.lab.yml`
  - `scripts/verify-waha-webhook-e2e.mjs`
  - `scripts/verify-clean-database-state.mjs`
  - `scripts/test-e2e-all-routes.js`
  - `DECISION_LOG.md`
- **Confidence:** 10/10
- **Date:** 2026-08-22
