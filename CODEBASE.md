# CODEBASE.md — SOS Sales V3 (Greenfield Sovereign Architecture)

> MCT OS v2.0 | Francisco Rios | MCT LTDA | Chapecó, BR  
> Filosofia: Poder invisível, simplicidade visível. Truth in Data.  
> Última atualização: 19 de setembro de 2026 (CH-10 Dual-Engine Integration)

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
- **Motores de Mensageria:**
  - `meta_waba`: Meta WhatsApp Cloud API Oficial (Templates, HSM, Webhooks normatizados).
  - `waha`: WhatsApp HTTP API local em container Docker com engine `WEBJS` e pinning estrito por digest de imagem (`latest-2026.8.2@sha256:...`). Zero modo privilegiado.
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

---

## 4. Estado de Homologação e Limites Operacionais

- **Implementado e Homologado:**
  - Persistência atômica e autoridade única via repositório transacional Outbox (`OutboundCommandRepository`).
  - Worker de despacho outbox (`OutboxDispatcher`) com claiming concorrente `FOR UPDATE SKIP LOCKED`, heartbeat de renovação de lease e fencing anti-split-brain.
  - RLS estrito fail-closed em todas as tabelas comerciais e filas.
  - Fail-closed entre canais (zero fallback entre WAHA e Meta WABA).
  - Sanitização de erros allowlisted e ausência absoluta de PII telefônica em logs operacionais.
  - Reconciliação governada de timeouts ambíguos via `provider_delivery_events`.
- **Testado Hermeticamente:**
  - Suíte completa de testes unitários e de integração em PostgreSQL isolado temporário com teardown determinístico (`ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm test:db:run`).
  - Verificação de tipos TypeScript e compilação de todos os pacotes via Turborepo.
- **Bloqueado Externamente (Limites Canônicos):**
  - Zero envio de mensagens a redes externas de produção ou celulares reais.
  - Zero geração de QR codes ou pareamento com instâncias reais de WhatsApp.
  - VPS de produção e sistema V2 permanecem 100% intocados e segregados.

---

## 5. Comandos de Homologação e Verificação

- **Testes Herméticos com Banco Real:**
  ```bash
  ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm test:db:run
  ```
  *Executa a suíte hermética completa em banco PostgreSQL isolado com criação e descarte atômico.*
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

