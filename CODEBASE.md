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
- **Observabilidade:** Pino logger estruturado (`@sos-sales/observability`) com mascaramento estrito de PII telefônica e ausência de tokens em claro.

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

### 3.1 Ausência de Shell Legado
- Nenhum script, worker ou serviço utiliza `child_process.exec`, `execSync` ou `spawn({shell: true})`.
- Scripts de smoke e diagnósticos usam estritamente `child_process.execFile` com argumentos em array tipado, sem interpolação de strings.

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
- O poller periódico de reconciliação (`reconcileBatch`) compara o comando contra `provider_delivery_events` tardios recebidos via webhook antes de liberar nova tentativa ou marcar falha.

### 3.6 Integridade Referencial Composta Multi-Tenant
- A integridade de isolamento é forçada a nível de schema pelas chaves compostas:
  - `(workspace_id, channel_instance_id) REFERENCES channel_instances(workspace_id, id)`
  - `(workspace_id, channel_instance_id, message_id) REFERENCES messages(workspace_id, channel_instance_id, id)`
  - `(workspace_id, channel_instance_id, thread_id) REFERENCES commercial_threads(workspace_id, channel_instance_id, id)`
- É impossível vincular um comando de um workspace a um canal de outro workspace.

### 3.7 Higiene de Dados, PII e Tratamento de Erros
- Telefones em logs são obrigatoriamente mascarados pelo helper `maskRecipientPhone` (`+5511*****8888`).
- Payloads brutos em `provider_delivery_events` são encriptados com AES-256-GCM.
- Erros de domínio (`ChannelDispatchBaseError`) implementam método `.toJSON()` que suprime a propriedade interna `cause`, impedindo vazamento de stack traces ou credenciais em APIs externas.

---

## 4. Comandos de Homologação e Verificação

- **Testes Herméticos com Banco Real:**
  ```bash
  ALLOW_TEST_DB_ADMIN_OPERATIONS=true pnpm test:db:run
  ```
  *Executa 34 arquivos de teste e mais de 500 asserções em banco PostgreSQL isolado com criação e descarte atômico.*
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
