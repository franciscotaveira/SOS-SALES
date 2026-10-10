# CODEBASE.md — SOS Sales V3 (Greenfield Sovereign Architecture)

> MCT OS v2.0 | Francisco Rios | MCT LTDA | Chapecó, BR  
> Filosofia: Poder invisível, simplicidade visível. Truth in Data.  
> Última atualização: 02 de outubro de 2026 (Curadoria de Workflows, Engenharia Reversa e Sanitização de Quarentena)

---

## 1. Stack Técnica Soberana

- **Runtime & Gerenciador de Pacotes:** Node.js >= 20.0.0, pnpm 11.7.0.
- **Linguagem & Compilação:** TypeScript 5.8.2, Turborepo 2.10.13, tsup 8.5.1 (ESM/CJS).
- **Servidor HTTP & Gateway:** Fastify 5.12.5 (Ingress com rawBody, teto de 512 KB, blind-enumeration protection).
- **Banco de Dados & RLS:** PostgreSQL 16 com FORCE ROW LEVEL SECURITY em todas as tabelas comerciais e de fila.
  - Roles de banco segregadas com menor privilégio:
    - `sos_app_user`: Operações de aplicação autenticada com tenant scoping.
    - `sos_ingress_user`: Resolução de webhook por token hash via função security definer `lookup_channel_ingress`.
    - `sos_worker_user`: Polling de filas (`outbound_commands`, `channel_webhook_inbox`) e transições de estado via `withWorkerTransaction`.
    - `sos_migration_owner`: DDL e migrações estruturais.
- **Fila & Cache:** Redis 7 (Docker Compose), BullMQ 5.41.6.
- **Motores de Mensageria & Conversão:**
  - `meta_waba`: Meta WhatsApp Cloud API Oficial (Templates, HSM, Webhooks normatizados).
  - `waha`: WhatsApp HTTP API local em container Docker com engine `WEBJS` e pinning estrito por digest de imagem (`latest-2026.8.2@sha256:...`). Zero modo privilegiado.
  - `meta_capi`: Meta Conversions API para Business Messaging (`whatsapp`) na Graph API `v26.0` (padrão) com envio estrito via Bearer Token, WABA account ID explícito e percurso CTWA ponta a ponta.
- **Criptografia & Segredos:** Keyring versionado com AES-256-GCM, derivação scrypt, `DatabaseSigningSecretResolver` e trigger de auditoria imutável (`audit_events`).
- **Observabilidade:** Pino logger estruturado (`@sos-sales/observability`) com ausência de telefone (mesmo mascarado) nos logs de dispatch/worker e ausência de tokens ou segredos em claro.

---

## 2. Mapa do Monorepo

```
/
├── apps/
│   ├── api/          # Gateway HTTP Fastify: webhooks, autenticação e rotas públicas
│   ├── worker/       # Motor assíncrono: InboxProcessor, OutboxDispatcher e WorkerRuntime
│   └── web/          # Interface administrativa (React/Vite)
├── packages/
│   ├── application/  # Services de canal, registry, dispatch, retry policies e segurança SSRF
│   ├── auth/         # Verificação de tokens JWT/JWKS e injeção de contexto de workspace
│   ├── contracts/    # Tipos DTO, contratos de webhook e eventos de mensageria
│   ├── database/     # Repositórios (ChannelInstance, OutboundCommand), pools e helpers de RLS
│   ├── domain/       # Regras de negócio puras (validação E.164, atribuição comercial)
│   ├── observability/# Loggers estruturados e mascaramento de PII
│   └── ui/           # Design system e componentes visuais reutilizáveis
├── infra/
│   └── docker/       # Configurações do Postgres e init scripts com isolamento de roles
└── scripts/          # Ferramentas operacionais, test runner hermético e CI quality gate
```

---

## 3. Padrões Ativos e Decisões Arquiteturais Invariáveis (P0)

### 3.1 Ausência de Shell em Componentes Comprovados
- O script de verificação de ambiente WAHA (`scripts/smoke-docker-waha.ts`) opera estritamente sem invocação de shell, usando `child_process.execFile` com argumentos em array tipado e sem interpolação de strings (`exec`, `execSync` e `spawn({shell: true})` são proibidos nesse componente).
- Utilitários de runner de CI (`scripts/ci-gate-runner.ts`) utilizam chamadas de processo controladas para orquestração interna de gates locais. Não há ausência global de `execSync` no monorepo fora dos componentes que exigem essa garantia estrita.

### 3.2 Seleção Explícita de Instâncias de Canal (CH-10)
- Múltiplas linhas do mesmo provedor podem coexistir ativas no mesmo workspace (ex: linha Comercial e linha Suporte).
- O envio outbound **SEMPRE** exige o `channel_instance_id` explícito no comando de outbox.
- É terminantemente proibido selecionar arbitrariamente a "primeira instância ativa" ou inferir linha automaticamente.

### 3.3 Fail-Closed Policy (Sem Fallback Silencioso)
- Se o envio por WAHA falhar, o sistema **NUNCA** tentará despachar silenciosamente via Meta WABA.
- Se o envio por WABA falhar, o sistema **NUNCA** tentará despachar via WAHA.
- Falhas na linha atribuída entram no ciclo de retentativa governada daquela linha ou transitam para `dead_letter`.

### 3.4 Concorrência de Workers, Leases e Fencing Tokens
- Polling de filas executado exclusivamente com `FOR UPDATE SKIP LOCKED`.
- Cada claim gera um `lease_token` (UUID) e um `lease_until` temporizado.
- Heartbeats de trabalho renovam o lease com verificação estrita de posse.
- Se o lease expirar ou for assumido por outro worker, qualquer operação em voo é abortada imediatamente com erro de `FENCING` e não sobrescreve o banco.

### 3.5 Tratamento de Timeouts Ambíguos e Reconciliação
- Erros de rede inconclusivos (ex: `ETIMEDOUT`, `ECONNRESET`, socket hangup) **NÃO** realizam retentativa imediata cega para evitar envio duplicado de mensagens ao cliente.
- Comandos com erro ambíguo transitam imediatamente para `reconciliation_required`.
- O poller periódico de reconciliação (`reconcileBatch`) compara o comando contra `provider_delivery_events` tardios recebidos via webhook antes de marcar status final.
- Ausência de evidência/webhook **NUNCA** causa reenvio automático: o comando permanece em `reconciliation_required` até confirmação oficial ou decisão humana auditada.

#### 3.5.1 Matriz de Estados do Outbox
- **`pending`**: Comando registrado aguardando claim ou aguardando retentativa temporizada (`next_attempt_at <= clock_timestamp()`).
- **`processing`**: Reclamado por um worker com posse de lease temporizado (`lease_token`, `lease_until`). Leases expirados são recuperados exclusivamente para `reconciliation_required` por `reclaimExpiredLeases()`.
- **`sent`**: Confirmação positiva recebida do provedor e persistida atomicamente junto com `messages` e `provider_delivery_events`. Estado terminal de sucesso.
- **`failed`**: Falha transitória governada com retentativa agendada (`next_attempt_at`, `retry_count < max_retries`). **NOTA:** Não existe estado `retry` no schema PostgreSQL; retentativas usam `failed` com `next_attempt_at`.
- **`dead_letter`**: Falha definitiva (rejeição permanente do canal ou esgotamento de retentativas). Estado terminal de erro.
- **`reconciliation_required`**: Estado ambíguo (timeout de rede, queda de socket, perda de lease pós-envio, lease de processamento expirado, ou falha na persistência local pós-envio).
  - **Reconciliação Automática:** Somente transita para `sent` (se houver delivery event positivo) ou `dead_letter` (se houver evento negativo definitivo). Sem evidência conclusiva, **permanece** em `reconciliation_required` indefinidamente (zero reenvio cego).
  - **Resolução Humana Auditada:** Executada exclusivamente via `adminReconcile` / `reconcileItem`. Resolução como `sent` exige `externalMessageId` real fornecido pelo operador (proibido identificadores artificiais). Toda resolução gera registro imutável em `audit_events`.

### 3.6 Integridade Referencial Composta Multi-Tenant
- A integridade de isolamento é forçada a nível de schema pelas chaves compostas:
  - `(workspace_id, channel_instance_id) REFERENCES channel_instances(workspace_id, id)`
  - `(workspace_id, channel_instance_id, message_id) REFERENCES messages(workspace_id, channel_instance_id, id)`
  - `(workspace_id, channel_instance_id, thread_id) REFERENCES commercial_threads(workspace_id, channel_instance_id, id)`
- É impossível vincular um comando de um workspace a um canal de outro workspace.

### 3.7 Higiene de Dados, PII e Tratamento de Erros
- Telefone, mesmo mascarado, não é registrado nos logs de dispatch/worker (apenas identificadores técnicos como `commandId`, `workspaceId`, `channelInstanceId` e códigos de erro allowlisted são emitidos).
- Payloads brutos em `provider_delivery_events` são encriptados com AES-256-GCM.
- Erros persistidos em `outbound_commands.error_message` e logs utilizam exclusivamente códigos canônicos e mensagens allowlisted sanitizadas, sendo proibida a persistência de `err.message` bruto, respostas brutas de provedores, telefones, corpos de mensagem, URLs de mídia, tokens, hashes, idempotency keys ou stack traces.
- Erros de domínio (`ChannelDispatchBaseError`) implementam método `.toJSON()` que suprime a propriedade interna `cause`, impedindo vazamento de stack traces ou credenciais em APIs externas.

### 3.8 Meta Conversions API (CAPI) para Business Messaging (v26.0)
- **Governança da Graph API:** Contrato padrão `v26.0`, com allowlist restrita de versões suportadas `["v25.0", "v26.0"]`. Qualquer versão fora desse escopo gera fail-closed imediato com código canônico `CAPI_GRAPH_VERSION_INVALID`. Política preventiva de revisão a cada 60 dias documentada em `docs/architecture/META-VERSIONING.md`.
- **Segurança de Transporte & Segredos:** Token de acesso Meta transmitido **exclusivamente** via cabeçalho `Authorization: Bearer <token>`. É terminantemente proibido o envio de token via query string (`?access_token=...`). Tokens são mascarados preventivamente contra vazamentos em logs, DB e receipts (`replace(/EA[A-Za-z0-9]+/g, '[REDACTED_ACCESS_TOKEN]')`).
- **Resolução Estrita de WABA ID:** `resolveSourceWaba` requer obrigatoriamente `parsed.waba_account_id` ou `parsed.waba_id`. Phone Number ID (`row.account_id`) é categoricamente rejeitado como identificador de conta WABA CAPI, gerando `CAPI_WABA_ID_MISSING` com zero chamadas HTTP.
- **Validação Numérica de Dataset ID:** Credenciais persistidas no banco são validadas pela regex `/^\d{10,20}$/`. Prefixos legados (`pixel_*`) ou strings arbitrárias são rejeitados com `CAPI_DATASET_ID_INVALID`. Identificadores sintéticos são restritos ao modo laboratório com `endpointUrl` explícito.
- **Validação Estrita de Endpoint Sintético (SSRF Guard):** Em modo laboratório, `validateSyntheticEndpoint` exige que o `endpointUrl` utilize estritamente protocolo `http:` ou `https:`, proíba credenciais embutidas (`username:password@`) e restrinja o destino exclusivamente a interfaces de loopback locais (`localhost`, `127.0.0.1`, `::1`). Redirecionamentos HTTP 3xx são desabilitados (`redirect: "manual"`) e rejeitados imediatamente com `CAPI_SYNTHETIC_ENDPOINT_INVALID`.
- **Atribuição CTWA Ponta a Ponta e Isolamento por Conversa:** Percurso end-to-end verificado: webhook referral WABA (`referral.ctwa_clid`) -> normalizador (`metadata.ctwaClid`) -> `inbox-processor` (`commercial_journeys.ctwa_clid` + `attribution_source='ctwa_meta'`) -> `recordCommercialOutcome` -> `conversion_events.user_data.ctwaClid` -> payload CAPI despachado com isolamento multi-tenant RLS. A correlação de jornada pelo `inbox-processor` é restrita estritamente à conversa receptora (`WHERE workspace_id = $1 AND thread_id = $2`), impedindo contaminação de jornadas orgânicas do mesmo contato em outros canais/conversas.
- **Projeção de Receipt Protegido:** O receipt gravado em `conversion_events.receipt` é estritamente projetado contendo apenas `{ graph_api_version, events_received: 1, fbtrace_id }`. O array `messages` arbitrário foi eliminado.
- **Garantia Global Zero-Network:** Interceptor HTTP instalado nos testes de integração do worker bloqueia qualquer tentativa de chamada para `graph.facebook.com` ou redes externas com `FAIL_CLOSED_NETWORK_VIOLATION`. Testes executam exclusivamente contra mock servers locais (`127.0.0.1`).
- **Códigos Canônicos de Erro:** Allowlist estrita de 19 códigos canônicos (`CAPI_ERROR_CODES`), prevenindo vazamento de stack traces ou payloads externos.

---

## 4. Estado de Homologação e Limites Operacionais

- **Implementado e Homologado Localmente:**
  - Persistência atômica e autoridade única via repositório transacional Outbox (`OutboundCommandRepository`).
  - Worker de despacho outbox (`OutboxDispatcher`) com claiming concorrente `FOR UPDATE SKIP LOCKED`, heartbeat de renovação de lease e fencing anti-split-brain.
  - RLS estrito fail-closed em todas as tabelas comerciais e filas.
  - Fail-closed entre canais (zero fallback entre WAHA e Meta WABA).
  - Sanitização de erros allowlisted e ausência absoluta de PII telefônica em logs operacionais.
  - Reconciliação governada de timeouts ambíguos via `provider_delivery_events`.
  - **Produção Ativa (VPS 179.197.72.221 - Chapecó/BR):**
  - **Absorção de Dados V2 -> V3:** 100% concluída com zero data loss.
    - 30 Workspaces consolidados (incluindo Haven Escovaria, SOS Sales Oficial, Sora Ritual Spa, Geral e Chapecó Matriz).
    - 759 Contatos com normalização E.164 estrita.
    - 851 Conversas Comerciais (`commercial_threads`).
    - 826 Jornadas Comerciais (`commercial_journeys`) preservadas com atribuição CTWA Meta Ads.
    - 15.455 Mensagens preservadas com histórico completo e status de entrega.
    - 11 Instâncias de Canal e 6 Credenciais criptografadas via AES-256-GCM.
  - **Containers Operacionais:**
    - `chat-sales-api`: Fastify 5.12.5 (porta interna 4400, health check HTTP 200).
    - `chat-sales-worker`: Background runtime processando `channel_webhook_inbox` e `outbound_commands`.
    - `chat-sales-web`: Cockpit administrativo servido via Nginx/Caddy.
    - `sos-sales-postgres`: PostgreSQL 16 Alpine com RLS estrito e roles segregadas.
    - `sos-sales-redis`: Redis 7 Alpine com caching e rate limiting.
    - `sos-sales-waha`: WAHA Core 2026.8.1 (Chromium com sessões ativas preservadas, `default` +554988447562 em status `WORKING`).
    - `sos-sales-caddy`: Reverse proxy TLS automático gerenciando `crm.iaparavendas.tech` e `iaparavendas.tech`.

---

## 5. Comandos de Homologação e Verificação

- **Testes Herméticos com Banco Real:**
  ```bash
  ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm test:db:run
  ```
- **Suíte de Workers (Hermética / Concorrência Segura):**
  ```bash
  pnpm --filter @sos-sales/worker exec vitest run --fileParallelism=false
  ```
- **Verificação de Tipos Monorepo:**
  ```bash
  pnpm turbo typecheck
  ```
- **Compilação Monorepo:**
  ```bash
  pnpm turbo build
  ```
- **CI Quality Gate:**
  ```bash
  ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm ci:gate
  ```

---

## 6. Integração com a Biblioteca Soberana de Workflows (n8n Brain)

A infraestrutura de automações externas da MCT LTDA está centralizada em um diretório local de workflows (fora deste monorepo, path configurado por ambiente/operador):

- **Acervo Auditado:** 13.053 JSONs brutos, 4.715 workflows n8n classificados e traduzidos em PT-BR (`00 - Catalogo/workflows-completo-4715-ptbr.csv`).
- **Top 256 Homologados:** Seleção prioritária íntegra (`workflows-256-selecionados-ptbr.csv`) com links simbólicos em `01 - Selecionados para revisao/`.
- **Engenharia Reversa de Órfãos:** 763 blueprints estruturais resgatados de fluxos com nós rompidos do repositório Zie619, minerando 512 prompts de IA e 477 snippets de JavaScript (`blueprints-engenharia-reversa-ptbr.csv`).
- **Resgate e Sanitização de Quarentena:** 18 workflows que continham credenciais esquecidas de terceiros (tokens Apify, GitLab, Perplexity, Google API e chaves privadas RSA do Meta WhatsApp Flows) foram 100% desinfetados, validados e salvos como JSONs prontos para teste na subpasta `01 - Selecionados para revisao/11 - Resgatados da Quarentena/`.
- **Fronteira Arquitetural (P0):** Workflows n8n operam como laboratório de apoio, scrapers auxiliares e esteiras de prototipagem rápida. Toda lógica comercial transacional de alta confiabilidade, mensageria CTWA, ingestão de webhooks e outbox assíncrono pertencem estritamente a este monorepo SOS Sales.

---

## 7. Motor de Inteligência Artificial Soberano (Multi-Provider & Anti-Alucinação)

### 7.1 Arquitetura Dual-Engine (`SovereignLlmClient`)
- **Provedor Padrão:** **NVIDIA NIM** via `https://integrate.api.nvidia.com/v1/chat/completions`.
  - Modelo Soberano Ativo: `nvidia/nemotron-3-super-120b-a12b` (substituição formal do `meta/llama-3.3-70b-instruct` descontinuado pela Nvidia em 26/08/2026).
  - Modelos Alternativos Homologados: `nvidia/nemotron-3.5-lightning-30b-a3b` (ultrarrápido), `nvidia/llama-3.1-nemotron-70b-instruct` (factual).
- **Provedor Alternativo:** **OpenRouter** via `https://openrouter.ai/api/v1/chat/completions`.
  - Modelos Homologados: `anthropic/claude-3.5-sonnet` (alta precisão), `google/gemini-2.5-flash`, `deepseek/deepseek-chat`.
  - Cabeçalhos de rastreabilidade obrigatórios: `HTTP-Referer: https://crm.iaparavendas.tech` e `X-Title: Chat Sales V3 Commercial Receptionist`.
- **Governança de Credenciais por Workspace:**
  - Colunas `ai_provider`, `ai_model`, `ai_api_key` em `public.workspaces`.
  - Resolução hierárquica fail-closed: Chave customizada do tenant -> Chave de ambiente do servidor (`NVIDIA_API_KEY` / `OPENROUTER_API_KEY`).

### 7.2 Camadas de Grounding Factual e Protocolo de Ignorância (Truth in Data)
- O prompt do agente é gerado deterministicamente pelo `buildGroundedSystemPrompt` em 4 camadas imutáveis:
  1. `<identidade_e_escopo>`: Nome, personalidade comercial e tom.
  2. `<catalogo_oficial_de_produtos>`: Injeção direta de registros `public.products` (título, descrição, preço em centavos, categoria, badge).
  3. `<regras_operacionais_e_faq>`: Horários, endereço, formas de pagamento, regras gerais e perguntas frequentes cadastradas no workspace.
  4. `<protocolo_de_ignorancia_e_transbordo>`: Proibição estrita de suposições ou dados não ancorados. Se a informação solicitada pelo cliente não estiver no contexto, a IA emite a tag canônica `[TRANSBORDO_HUMANO: motivo estruturado]`.
- O parser `parseAiResponse` extrai o texto limpo para o cliente e detecta automaticamente a intenção de transbordo, gravando `handoff_reason` e `handoff_at` na thread.

### 7.3 Memória do Anúncio Meta (CTWA Hook Memory)
- Eventos de entrada oriundos de Meta Ads (Click-to-WhatsApp) têm seus dados de anúncio (`headline`, `body`) extraídos em `inbox-processor` e persistidos em `commercial_journeys.ad_headline` e `ad_body`.
- A camada `<origem_do_lead_anuncio_meta>` injeta o gancho original no contexto do agente, permitindo que a IA receba o lead alinhada com a oferta de anúncio específica que gerou o clique.

### 7.4 Briefing no Cockpit e Simulador Dry-Run
- **Cockpit Visual:**
  - Mensagens da IA sinalizadas com badge `🤖 {agentName} (IA)`.
  - Status `waiting_human` exibe card de briefing executivo com o motivo exato registrado pelo modelo e botão `[Assumir Conversa]`.
- **Simulador Interativo:**
  - Endpoint seguro `POST /v1/workspaces/:workspaceId/ai-agent/simulate`.
  - Playground no frontend (`Configurações > IA`) com métricas ao vivo: latência em ms, produtos catalogados, validação de transbordo e visualização do balão de chat.

---

## 8. PIPELINE SOBERANO DE MÍDIA MULTIMODAL (ÁUDIO, VÍDEO, FOTOS E DOCUMENTOS)

### 8.1 Ingestão e Normalização Agnóstica de Provedores
- **Normalização WAHA (`WahaWebhookNormalizer`):**
  - Processa tanto eventos `message` quanto `message.any`.
  - Resolução de identidades WhatsApp LID (`@lid`) mapeando `_data.Info.SenderAlt` para o telefone real E.164.
  - Inbound seguro: quando `payload.to` for nulo, resolve deterministicamente via `rawPayload.me.id` ou `me.jid`.
  - Detecção estrita de `contentType`: áudios de voz PTT (`.oga`, `.opus`, `audio/ogg`), vídeos QuickTime/MP4 (`.qt`, `.mp4`), documentos (`.pdf`, `.docx`) e imagens (`.jpeg`, `.png`, `.webp`).

### 8.2 Proxy de Streaming Seguro e Isolamento de Rede (`/media/proxy`)
- **Arquitetura de Isolamento:** Os contêineres de engine (WAHA na porta 3000 interna) rodam isolados na rede Docker fechada e exigem chaves mestras (`x-api-key`). O navegador do cliente não tem acesso direto a essas portas internas nem pode injetar cabeçalhos em tags HTML `<audio>`, `<img>` ou `<video>`.
- **Rota Unificada:** `GET /v1/workspaces/:workspaceId/media/proxy`
  - Suporta `wahaPath` (para arquivos internos do WAHA) e `mediaId` (para Meta Graph API).
  - Autenticação via header `Authorization: Bearer` ou query parameter `?token=` (validada pelo `auth.plugin.ts`).
  - Suporte a cabeçalhos `Range: bytes` para busca/seek instantâneo de áudio e vídeo nos players nativos.
  - Forwarding fiel de `Content-Type`, `Content-Length`, `Content-Range` e cache imutável `Cache-Control: public, max-age=86400, immutable`.
- **Cockpit (`MessageBubble.tsx`):**
  - Reescreve dinamicamente URLs legadas internas (`waha:3000/api/files/...`) para a rota autenticada `/media/proxy`.
  - Renderização nativa: Player de áudio HTML5 com microfone e controle de reprodução, player de vídeo com controles e aspect ratio contido, card de documento com botão de download seguro e visualizador de imagem responsivo.


