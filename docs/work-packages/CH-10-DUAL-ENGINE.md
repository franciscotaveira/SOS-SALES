# CH-10 — Docker Dual-Engine & Coexistência Operacional

> Nome do arquivo: `CH-10-DUAL-ENGINE.md`  
> Estado: `READY` — Plano técnico de arquitetura e engenharia revisado (v1.1).  
> Versão do Plano: `1.1.0`  
> Data de Registro: 19 de setembro de 2026  
> Escopo de Execução: Planejamento estrito — zero implementação de código funcional nesta etapa.

---

## 1. Identidade e Metadados do Pacote

- **Parent Objective:** Programa SOS Sales V3 — Motor de Canais de Comunicação (Fase CH)
- **Estado:** `READY` (Aguardando autorização de implementação do plano corrigido v1.1)
- **Arquitetura & Lead:** Gemini 3.8 (@orchestrator)
- **Agentes Especializados Envolvidos:**
  - `Architecture Reviewer`: Decomposição de responsabilidades (sem sobreposição de registry) e separação de contratos.
  - `Database/RLS Specialist`: Mapeamento de `audit_events`, trigger de imutabilidade e especificação da Migration 006 para índice parcial único.
  - `Docker/SRE Specialist`: Hardening viável para Chromium/WAHA, isolamento loopback `127.0.0.1`, volumes e rollback direcionado.
  - `WAHA Contract Researcher`: Mapeamento rigoroso KNOWN / INFERRED / UNRESOLVED do contrato OpenAPI, autenticação e rotas.
  - `Security Reviewer`: Isolamento perimétrico Fastify, `endpointToken` seguro, verificação de assinaturas e RLS multi-tenant.
  - `QA/Evidence Engineer`: Estruturação em 3 camadas de teste (Hermético / Docker Smoke / Externo Humano) e critérios de aceite em `NOT_RUN`.
- **Dependências Upstream:** `CH-00` a `CH-07` (Fundação, RLS, Ingress Shielding, Rate Limiting, Keyring, SSRF Guard), `CH-08` (WABA Operacional), `CH-09` (WAHA Operacional, commit `9577e17` / `d4b43d8`).
- **ADRs Vinculadas:** ADR-002 (Multi-Tenancy & Auth Strategy), ADR-005 (Channel Gateway & Transactional Ingress Shielding).
- **Roadmap Gate:** `| CH-10 | Docker dual-engine | CH-08/09 | Coexistência de Meta WABA e WAHA, seleção explícita por workspace e integração em Docker Lab |`
- **Risco Primário Mitigado:** `R-006` (Fallback automático silencioso entre provedores, poluição de credenciais cross-workspace, pinning fictício de digest Docker, colisão de rotas de webhook e instabilidade de sessão pós-restart).

---

## 2. Fronteira Arquitetural: CH-10 vs CH-12 vs EXT-05

O pacote **CH-10** tem escopo estritamente delimitado à **infraestrutura, governança e coexistência operacional**:
1. **O que o CH-10 comprova:**
   - Coexistência no mesmo monorepo dos dois motores (`meta_waba` e `waha`).
   - Seleção determinística e estanque do provedor ativo por workspace.
   - Subida e saúde do container Docker `waha` via imagem resolvida por digest criptográfico real.
   - Resolução de adapters sem fallback silencioso (falha fechada obrigatória diante de indisponibilidade).
   - Persistência de sessões WAHA em volume nomeado entre reinicializações do container.
   - Isolamento multi-tenant via RLS e integridade de auditoria em `audit_events`.
   - Execução de smoke test de API (sessão, QR, health, endpoints dedicados de despacho) em ambiente hermético ou de lab.
2. **O que NÃO pertence ao CH-10 (pertence ao CH-12 ou à subfase CH-10B dependente de EXT-05):**
   - Escaneamento de QR Code com conta de WhatsApp real mantida por operador humano.
   - Envio e recebimento de mensagens ponta-a-ponta na rede pública da Meta/WhatsApp.
   - Tráfego real de webhook da Meta ou do WAHA conectado a dispositivo físico.
   - Criação de threads comerciais reais com clientes reais e deduplicação de ACKs de operadora externa.
   - **Toda validação dependente de aparelho celular real é classificada como `BLOCKED_EXTERNAL` (EXT-05).**

---

## 3. Matriz de Contratos Técnicos: KNOWN / INFERRED / UNRESOLVED

| Item do Contrato | Classificação | Detalhes Técnicos e Evidência no Código | Ação na Implementação |
|---|---|---|---|
| **Digest da Imagem Docker WAHA** | `RESOLVED` | Inspecionado via Docker Hub: tag `latest-2026.8.2`, OCI index digest `sha256:527ff3d634925adb26d596883d7b3ca502c080f737af3c2af2be0c973c511533` (linux/amd64: `sha256:dcc55f079b1d2c15ad0dc35a1b08c983c203f843bf1260df01441af0f84309b0`). | Fixado formalmente no Compose para a fase de implementação do CH-10. |
| **Edição e Engine WAHA** | `KNOWN` | Edição: **WAHA Core** (open-source) ou **WAHA Plus** (avançada). Engines suportadas: `WEBJS` (Puppeteer/Chromium), `NOWEB` (WebSocket leve), `GOWS` (Go WhatsApp). A baseline do projeto suporta Core/Plus sob `WEBJS` ou `NOWEB`. | Definir explicitamente `WHATSAPP_DEFAULT_ENGINE=WEBJS` (ou `NOWEB`) no Compose; documentar compatibilidade. |
| **Variáveis de Ambiente WAHA** | `KNOWN` | Variáveis documentadas pela API WAHA: `WHATSAPP_HOOK_URL`, `WHATSAPP_HOOK_EVENTS`, `WHATSAPP_API_KEY`, `WAHA_ZIP_LOGS`, `WAHA_LOG_LEVEL`, `WAHA_PRINT_QR`, `WAHA_BASE_URL`. | Consumir segredos via `.env.local` sem valores default hardcoded em produção. |
| **Endpoint de Health / Version** | `KNOWN` | Endpoint WAHA comprovado: `GET /api/server/version`. Suporta retorno estruturado JSON com versão e status do servidor. | Utilizado no probe de healthcheck do Docker Compose e no `WahaAdapter.checkHealth()`. |
| **Endpoints de Sessão e QR** | `KNOWN` | Comprovado em `waha.adapter.ts`: `POST /api/sessions/start`, `POST /api/sessions/stop`, `GET /api/sessions/{session}`, `GET /api/sessions/{session}/auth/qr`. | Respeitar teto de 512 KB no QR e tratamento de `response.text()` / `response.json()` seguro contra stream consumido. |
| **Diretório de Persistência** | `KNOWN` | O diretório interno padrão do container para armazenamento de perfis Chromium/sessões é `/app/.sessions`. | Mapear para o volume nomeado `waha_sessions:/app/.sessions`. |
| **Header de Autenticação Ingress** | `KNOWN` | Comprovado em `signature-verification.service.ts`: WAHA aceita `x-api-key`, `x-webhook-secret` ou `authorization: Bearer <token>`. | Validado via `SignatureVerificationService.verify()` com `timingSafeEqual`. |
| **Rota de Webhook Fastify Real** | `KNOWN` | Comprovado em `apps/api/src/routes/webhook.routes.ts`: `POST /v1/webhooks/whatsapp/:endpointToken`. Não existe `/webhooks/whatsapp` genérico. | O webhook deve ser configurado por instância com seu `endpointToken` dedicado gerado no banco. Proibido token hardcoded no Compose. |
| **Raw Body e Teto de Payload** | `KNOWN` | Comprovado em `webhook.routes.ts`: Ingress exige `request.rawBody` preservado e impõe teto de 512 KB (`512 * 1024` bytes). Excesso retorna HTTP 413. | Respeitado rigorosamente no gateway Fastify. |
| **Tabela de Auditoria Soberana** | `KNOWN` | Comprovado em Migrations 001 e 004: Tabela é `public.audit_events` (não `audit_logs`), protegida por trigger `trg_audit_events_immutable`. | `ChannelSwitchService` insere eventos em `public.audit_events` via `sos_app_user`. |
| **Unicidade de Provedor / Linha Ativa** | `RESOLVED` | Investigação empírica contra `channel-foundation-security.test.ts` comprovou que o modelo de dados suporta múltiplas linhas ativas por workspace, desde que cada número seja único por provedor. | Migration 006 implementa `uq_channel_instances_active_provider_phone` sobre `(workspace_id, provider, phone_number_e164) WHERE is_active = true`. |
| **Health Externo da Meta (WABA)** | `UNRESOLVED_EXTERNAL` | A CI não possui e não deve usar credenciais reais da Meta Graph API para evitar quebras por rede externa ou rate limits. | A saúde estrutural/configuracional do WABA é testada com mocks na CI; verificação externa real exige homologação manual (EXT-03). |

---

## 4. Diagrama Arquitetural de Responsabilidades

Para evitar sobreposição de responsabilidades e registries duplicados, o sistema utiliza o `ChannelAdapterRegistry` existente para resolução de adapters stateless e distribui as responsabilidades operacionais em serviços especializados:

```
+---------------------------------------------------------------------------------------------------------+
|                                           SOS SALES V3 APPLICATION                                     |
|                                                                                                         |
|  1. ChannelAdapterRegistry (Stateless Singleton)                                                        |
|     - register(adapter: IChannelAdapter): void                                                          |
|     - get(provider: ChannelProvider): IChannelAdapter                                                   |
|     - has(provider: ChannelProvider): boolean                                                           |
|                                                                                                         |
|  2. ChannelInstanceRepository (Tenant-Safe Database Layer - packages/database)                         |
|     - findActiveByWorkspaceAndProvider(workspaceId, provider): Promise<ChannelInstanceRecord | null>    |
|     - findById(workspaceId, channelInstanceId): Promise<ChannelInstanceRecord | null>                   |
|     - Enforces RLS: app.current_workspace_id                                                            |
|                                                                                                         |
|  3. ChannelDispatchService (Routing & Fail-Closed Policy)                                               |
|     - dispatchOutbound(workspaceId, messagePayload): Promise<ChannelSendResult>                         |
|     - Valida compatibilidade: message.provider === activeInstance.provider                              |
|     - Falha Fechada: Sem fallback silencioso para outro canal se o provedor ativo estiver degradado      |
|                                                                                                         |
|  4. ChannelHealthService (Operational Health Evaluator)                                                 |
|     - evaluateChannelHealth(workspaceId, provider): Promise<ChannelHealthStatusReport>                  |
|     - Consulta estado operacional do adapter (probe HTTP local WAHA / probe credenciais WABA)           |
|                                                                                                         |
|  5. ChannelSwitchService (Administrative Transition Service)                                            |
|     - switchActiveProvider(workspaceId, targetProvider, actorId, reason): Promise<SwitchResult>         |
|     - Inativa provedor anterior, ativa novo provedor e grava em public.audit_events (imutável)          |
+---------------------------------------------------------------------------------------------------------+
                         |                                                 |
       [workspace: provider='waha']                      [workspace: provider='meta_waba']
                         v                                                 v
          +-------------------------------+                 +-------------------------------+
          |          WahaAdapter          |                 |        MetaWabaAdapter        |
          +-------------------------------+                 +-------------------------------+
                         |                                                 |
   Perimeter Guard: INTERNAL_ALLOWLIST    |                                 | External HTTPS WAN
   Strict 127.0.0.1 / waha host           |                                 | Graph API v21.0
                         v                                                 v
        +----------------------------------+              +----------------------------------+
        |     Docker Container: waha       |              |       Meta Cloud API (WABA)      |
        |  Port: 127.0.0.1:3000:3000       |              |      graph.facebook.com/v21.0    |
        |  Volume: waha_sessions:/app/.sess|              +----------------------------------+
        |  Image: devlikeapro/waha@sha256..|
        +----------------------------------+
```

### 4.1 Responsabilidades Detalhadas dos Componentes

1. **`ChannelAdapterRegistry` (`packages/application/src/channels/registry/channel-adapter.registry.ts`):**
   - **Papel:** Catálogo em memória e desacoplado de instâncias de adaptadores (`provider -> IChannelAdapter`).
   - **Regra:** Stateless. Não acessa banco de dados, não conhece tenants e não armazena tokens.
2. **`ChannelInstanceRepository` (`packages/database/src/repositories/channel-instance.repository.ts`):**
   - **Papel:** Acesso a dados tenant-safe para a tabela `channel_instances`.
   - **Regra:** Todas as consultas executam com `app.current_workspace_id` configurado na sessão do cliente PostgreSQL. Utiliza a role `sos_app_user` (ou `sos_ingress_user` para lookups por token hash).
3. **`ChannelDispatchService` (`packages/application/src/channels/services/channel-dispatch.service.ts`):**
   - **Papel:** Orquestração do envio de mensagens de ponta a ponta.
   - **Regra de Falha Fechada (P0):** Se a thread comercial estiver associada ao canal `waha` e o container WAHA estiver indisponível (`UNAVAILABLE` ou `UNHEALTHY`), o serviço retorna erro tipado `CHANNEL_PROVIDER_UNAVAILABLE` e marca o envio como `failed`. **É categoricamente proibido rotear a mensagem para WABA como fallback.**
4. **`ChannelHealthService` (`packages/application/src/channels/services/channel-health.service.ts`):**
   - **Papel:** Avaliação diagnóstica do estado operacional de cada provedor registrado para o workspace.
   - **Estados Mapeados:**
     - `HEALTHY`: Conexão ativa, credenciais íntegras, sessão operacional (`WORKING`/`CONNECTED`).
     - `DEGRADED`: Latência elevada, rate limiting com `Retry-After`, intermitência transitória.
     - `UNHEALTHY`: Sessão desautenticada (`SCAN_QR_CODE`, `FAILED`), erro 401/403 permanente.
     - `UNAVAILABLE`: Host inalcançável (`ECONNREFUSED`), container desligado, credenciais ausentes.
5. **`ChannelSwitchService` (`packages/application/src/channels/services/channel-switch.service.ts`):**
   - **Papel:** Execução de migração administrativa de canal ativo para um workspace.
   - **Auditoria:** Grava registro imutável em `public.audit_events` com `action = 'CHANNEL_PROVIDER_SWITCH'`, `resource_type = 'channel_instance'`.
   - **Integridade de Threads:** As conversas e mensagens anteriores mantêm seu histórico intacto.

---

## 5. Persistência de Banco, RLS e Auditoria Soberana

### 5.1 O Ledger Imutável `public.audit_events`
Em conformidade com a Migration 001 e a Migration 004, o sistema utiliza exclusivamente `public.audit_events`:

```sql
-- Schema real (Migration 001 & 004)
-- Tabela protegida contra mutação via trg_audit_events_immutable
INSERT INTO public.audit_events (
    workspace_id,
    actor_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    metadata,
    ip_address,
    user_agent
) VALUES (
    $1, -- workspace_id (UUID)
    $2, -- actor_id (UUID)
    'user', -- actor_type
    'CHANNEL_PROVIDER_SWITCH', -- action
    'channel_instance', -- resource_type
    $3, -- resource_id (UUID da channel_instance ativada)
    jsonb_build_object(
        'previous_provider', $4,
        'new_provider', $5,
        'switch_reason', $6,
        'timestamp', NOW()
    ),
    $7, -- ip_address
    $8  -- user_agent
);
```

### 5.2 Migration 006: Garantia de Unicidade e Modelagem Multi-Linha
Na investigação empírica contra a suíte hermética existente (`channel-foundation-security.test.ts`), identificou-se que a Migration 005 foi concebida para suportar **múltiplas linhas telefônicas por workspace** (ex: `channelAId` e `channelA2Id` provisionadas como instâncias ativas para testar segregação de threads e mensagens por chave estrangeira composta).

Para conciliar a coexistência dual-engine (CH-10) com o modelo de múltiplas linhas:
- **Trade-off 1 (Unicidade estrita workspace + provider):** `UNIQUE (workspace_id, provider) WHERE is_active = true`. Força no máximo 1 linha WAHA e 1 linha WABA por tenant. Impede cenários onde uma empresa opera 2 números de WhatsApp no mesmo provedor.
- **Trade-off 2 (Unicidade por linha telefônica/número):** `UNIQUE (workspace_id, provider, phone_number_e164) WHERE is_active = true`. Permite múltiplas linhas simultâneas para o mesmo provedor, impedindo colisão do mesmo número de telefone no mesmo provedor.
- **Recomendação Soberana para CH-10:** A Migration 006 implementa a unicidade por linha `(workspace_id, provider, phone_number_e164) WHERE is_active = true AND phone_number_e164 IS NOT NULL`, e o `ChannelDispatchService` consome explicitamente a `channel_instance_id` vinculada à thread comercial, garantindo determinismo sem quebrar o teste canônico de chaves compostas de `channel-foundation-security.test.ts`.

```sql
-- packages/database/migrations/006_channel_instances_active_provider_unique.sql
-- Garante que um mesmo número não seja ativado em duplicidade para o mesmo provedor no workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_instances_active_provider_phone
    ON public.channel_instances (workspace_id, provider, phone_number_e164)
    WHERE is_active = true AND phone_number_e164 IS NOT NULL;
```

---

## 6. Orquestração e Hardening de Docker Realista

### 6.1 Resolução de Imagem Docker com Evidência Canônica
Em inspeção direta ao registry oficial Docker Hub (`docker buildx imagetools inspect`), obteve-se o digest criptográfico real e imutável para a versão estável mais recente do WAHA:

- **Tag Oficial Estável:** `devlikeapro/waha:latest-2026.8.2`
- **Digest OCI Index:** `sha256:527ff3d634925adb26d596883d7b3ca502c080f737af3c2af2be0c973c511533`
- **Digest Manifest linux/amd64:** `sha256:dcc55f079b1d2c15ad0dc35a1b08c983c203f843bf1260df01441af0f84309b0`

Comando de inspeção executado:
```bash
docker buildx imagetools inspect devlikeapro/waha:latest-2026.8.2
```

O compose utilizará a referência imutável resolvida:
`image: devlikeapro/waha:latest-2026.8.2@sha256:527ff3d634925adb26d596883d7b3ca502c080f737af3c2af2be0c973c511533`

### 6.2 Hardening Viável para Chromium no WAHA
O WAHA utiliza Chromium em modo headless para o engine `WEBJS`. Aplicar restrições cegas de segurança como `cap_drop: [ALL]` ou `read_only: true` no rootfs impede a inicialização do Chromium (que necessita de namespaces de PID, gerenciamento de processos filhos e cache de sessão).

**Diretrizes de Hardening Aplicadas:**
1. **Sem Rootfs Read-Only Cego:** O Chromium precisa gravar em `/tmp` e `/app/.sessions`. O isolamento é garantido via volume persistente nomeado e limites de processo.
2. **Capabilidades Adequadas:** Se `cap_drop: [ALL]` for avaliado, devem ser adicionadas as capabilidades estritamente exigidas (`SYS_ADMIN` se necessário para o sandbox do Chromium, ou execução com `--no-sandbox` configurado internamente pelo WAHA).
3. **Loopback Binding Estrito:** A porta do container é mapeada exclusivamente para o IP de loopback do host: `"127.0.0.1:${PORT_WAHA:-3000}:3000"`.
4. **Isolamento de Rede Interna:** Na rede Docker `sos-v3-network`, o hostname interno é `waha`. O hostname `localhost` é expressamente proibido na allowlist de produção.
5. **Zero Token Hardcoded:** O webhook URL do WAHA no compose NÃO deve conter tokens estáticos em texto plano. O endpoint de webhook do workspace é configurado no momento em que a sessão é provisionada via API REST do WAHA (`POST /api/sessions/start`).

```yaml
  waha:
    image: devlikeapro/waha:latest-2026.8.2@sha256:527ff3d634925adb26d596883d7b3ca502c080f737af3c2af2be0c973c511533
    container_name: sos-v3-waha
    restart: unless-stopped
    profiles:
      - waha
    security_opt:
      - no-new-privileges:true
    environment:
      WHATSAPP_DEFAULT_ENGINE: ${WAHA_ENGINE:-WEBJS}
      WHATSAPP_API_KEY: ${WAHA_API_KEY}
      WAHA_ZIP_LOGS: "false"
      WAHA_LOG_LEVEL: info
      WAHA_PRINT_QR: "false"
      WAHA_BASE_URL: http://waha:3000
    ports:
      - "127.0.0.1:${PORT_WAHA:-3000}:3000"
    volumes:
      - sos_v3_waha_sessions:/app/.sessions
    networks:
      - sos-v3-network
    deploy:
      resources:
        limits:
          cpus: '1.50'
          memory: 1024M
        reservations:
          cpus: '0.25'
          memory: 256M
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- --header=\"X-Api-Key: $${WHATSAPP_API_KEY}\" http://127.0.0.1:3000/api/server/version || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

volumes:
  waha_sessions:
    name: sos_v3_waha_sessions
    driver: local
```

### 6.3 Rollback Seguro e Direcionado
É expressamente proibido o uso de `docker compose --profile waha down` genérico, pois isso pode encerrar serviços adjacentes de suporte na mesma rede.

**Procedimento de Parada e Remoção Direcionada:**
```bash
# 1. Parada cirúrgica do container WAHA (sem afetar Postgres, Redis, API ou Web):
docker stop sos-v3-waha

# 2. Remoção do container preservando o volume de dados:
docker rm sos-v3-waha

# 3. O volume nomeado sos_v3_waha_sessions é PRESERVADO por padrão.
# A remoção do volume só ocorrerá se explicitamente autorizada:
# docker volume rm sos_v3_waha_sessions
```

---

## 7. Estruturação dos Testes em Três Camadas

Para garantir conformidade com o rigor de CI e evitar falsos positivos ou falsos negativos:

```
+---------------------------------------------------------------------------------------------------------+
|                                           TEST EXECUTION LAYERS                                         |
+---------------------------------------------------------------------------------------------------------+
|  CAMADA A: Hermética Automatizada (Local CI Gate - pnpm test / pnpm ci:gate)                            |
|  - Mock de fetch e probes HTTP locais.                                                                   |
|  - Resolução de adaptadores via ChannelAdapterRegistry.                                                 |
|  - Validação de fail-closed e ausência de fallback no ChannelDispatchService.                           |
|  - Validação de RLS cross-workspace e auditoria em public.audit_events com banco temporário.            |
|  - Inspeção estática de configuração de segurança do docker-compose.yml.                                |
|  - STATUS: 100% AUTOMATIZADO, ZERO DEPENDÊNCIA DE DOCKER ATIVO.                                         |
+---------------------------------------------------------------------------------------------------------+
|  CAMADA B: Docker Smoke Automatizado (Ambiente com Daemon Docker - RUN_DOCKER_LIVE_TESTS=true)          |
|  - Pull da imagem WAHA pelo digest SHA-256 verificado no registry.                                      |
|  - Subida controlada do container sos-v3-waha.                                                         |
|  - Validação de healthcheck HTTP autenticado (/api/server/version).                                     |
|  - Ciclo de sessão inicial: startSession, stopSession, listSessions.                                    |
|  - Obtenção de QR code sintético ou inicial gerado pelo engine.                                         |
|  - Restart do container (docker restart sos-v3-waha) e validação de persistência no volume waha_sessions.|
|  - REGRA DE FALHA: Se RUN_DOCKER_LIVE_TESTS=true e container ausente, o teste FALHA IMEDIATAMENTE.       |
|  - STATUS: SEMI-AUTOMATIZADO EM AMBIENTE COM DOCKER.                                                    |
+---------------------------------------------------------------------------------------------------------+
|  CAMADA C: Homologação Humana / Externa (Dispositivo Celular Real - EXT-05)                             |
|  - Escaneamento de QR Code com aplicativo WhatsApp em smartphone real.                                  |
|  - Conexão e sincronização com a infraestrutura de produção da Meta.                                    |
|  - Envio e recepção de mensagem de texto e mídia real entre aparelhos físicos.                           |
|  - Confirmação de entrega de operadora (ACK read / delivered real).                                      |
|  - STATUS: BLOCKED_EXTERNAL (Requer operador humano, aparelho de teste e janela autorizada).            |
+---------------------------------------------------------------------------------------------------------+
```

---

## 8. Critérios de Aceite Numerados (AC-CH10)

Todos os critérios de aceite iniciam rigorosamente no estado `NOT_RUN`. Nenhum critério pode ser marcado como `PASS` antes da execução das suítes de validação.

| ID do Critério | Requisito Verificado | Método de Verificação | Evidência Esperada | Estado Atual | Bloqueio Externo |
|---|---|---|---|---|---|
| **AC-CH10-001** | `ChannelAdapterRegistry` registra e entrega `waha` e `meta_waba` como instâncias stateless sem conflito ou estado compartilhado. | Teste unitário hermético em `channel-adapter.registry.test.ts`. | Instâncias separadas retornadas para cada provedor com integridade tipada. | `NOT_RUN` | `NONE` |
| **AC-CH10-002** | `ChannelInstanceRepository` resolve a instância ativa por workspace e respeita RLS multi-tenant, impedindo vazamento cross-workspace. | Teste de banco em `channel-instance.repository.test.ts`. | Isolamento comprovado via `app.current_workspace_id`; tentativa de cross-read retorna `null`. | `NOT_RUN` | `NONE` |
| **AC-CH10-003** | `ChannelDispatchService` proíbe categoricamente fallback silencioso automático: falha fechada com `CHANNEL_PROVIDER_UNAVAILABLE` quando o provedor da thread está inoperante. | Teste de injeção de erro e mock de falha em `channel-dispatch-fallback.test.ts`. | Assert de exceção tipada e zero tentativa de chamada ao provedor alternativo. | `NOT_RUN` | `NONE` |
| **AC-CH10-004** | Migration 006 cria índice único parcial `uq_channel_instances_active_provider` impedindo duas instâncias ativas para o mesmo provedor no mesmo workspace. | Execução de migration e teste de inserção conflitante com erro `23505`. | Violação de unicidade capturada pelo banco em teste de banco hermético. | `NOT_RUN` | `NONE` |
| **AC-CH10-005** | `ChannelSwitchService` realiza transição administrativa de provedor com registro imutável em `public.audit_events` e preservação do histórico de conversas. | Teste de integração de serviço em `channel-switch.service.test.ts`. | Registro persistido em `audit_events`; threads antigas inalteradas. | `NOT_RUN` | `NONE` |
| **AC-CH10-006** | `ChannelHealthService` mapeia os 4 estados operacionais (`HEALTHY`, `DEGRADED`, `UNHEALTHY`, `UNAVAILABLE`) sem realizar requisições reais externas da Meta na CI. | Teste unitário de health service com mocks em `channel-health.service.test.ts`. | Mapeamento exato de latências, códigos HTTP e status de sessão. | `NOT_RUN` | `NONE` |
| **AC-CH10-007** | Configuração Docker do serviço `waha` vinculada exclusivamente a `127.0.0.1`, com volume persistente `sos_v3_waha_sessions` e sem digest ilustrativo inventado. | Script de inspeção estática `verify-docker-compose-security.ts`. | Conformidade do compose validada com digest resolvido via registry. | `NOT_RUN` | `NONE` |
| **AC-CH10-008** | Suíte de Docker Smoke (`RUN_DOCKER_LIVE_TESTS=true`) valida ciclo de vida local do container WAHA (boot, healthcheck, sessions, persistência de volume). | Runner de teste de integração em `channel-docker-dual-engine.integration.test.ts`. | Container sobe, responde healthcheck e preserva dados no restart. Falha se container ausente com flag ativa. | `NOT_RUN` | `BLOCKED_EXTERNAL: EXT-04` (Ambiente Docker ativo) |

---

## 9. Dependências Externas e Bloqueios (`EXT-01` a `EXT-05`)

| Código | Descrição da Dependência Externa | Impacto no CH-10 | Status de Desbloqueio |
|---|---|---|---|
| **EXT-01** | Registry Oficial Docker Hub acessível para inspeção de digest do WAHA. | Impede resolução do digest SHA-256 definitivo da imagem `devlikeapro/waha`. | Desbloqueável via comando de inspeção de registry. |
| **EXT-02** | Daemon Docker disponível para execução da Camada B (Docker Smoke). | Impede execução de testes com container ativo; CI hermética roda com skip gracioso. | Desbloqueável localmente com Docker Desktop / daemon ativo. |
| **EXT-03** | Credenciais de Homologação da Meta Graph API (WABA). | Impede testes manuais de health real contra a Meta; testes de CI rodam com mocks. | Bloqueado para ambiente de produção; mocks usados no Lab. |
| **EXT-04** | Porta local `3000` desimpedida no host para bind loopback `127.0.0.1`. | Conflito se outra aplicação local estiver usando a porta 3000. | Configurável via variável `PORT_WAHA`. |
| **EXT-05** | Operador humano com aparelho smartphone e chip autorizado para escanear QR Code do WAHA. | Impede execução da Camada C (E2E real com WhatsApp ativo). | **BLOCKED_EXTERNAL**: Fica explicitamente delegado para o CH-12 ou CH-10B. |

---

## 10. Arquivos sob Ownership do Pacote CH-10

### 10.1 Arquivos Modificados / Expandidos:
1. `docker-compose.yml` (Hardening do serviço waha: digest resolvido por registry, volume persistente, limits de recursos e porta estrita em `127.0.0.1`).
2. `packages/application/src/channels/adapters/waha.adapter.ts` (Adição do método estruturado de avaliação de saúde operacional `checkHealth()`).
3. `packages/application/src/channels/adapters/meta-waba.adapter.ts` (Adição do método estruturado de avaliação de saúde operacional `checkHealth()`).

### 10.2 Arquivos Novos (Criados na Implementação):
4. `packages/database/migrations/006_channel_instances_active_provider_unique.sql` (Índice único parcial `uq_channel_instances_active_provider`).
5. `packages/database/src/repositories/channel-instance.repository.ts` (Repository tenant-safe para instâncias de canal).
6. `packages/application/src/channels/services/channel-dispatch.service.ts` (Serviço de despacho com fail-closed estrito e sem fallback silencioso).
7. `packages/application/src/channels/services/channel-health.service.ts` (Serviço de diagnóstico de saúde dos provedores por workspace).
8. `packages/application/src/channels/services/channel-switch.service.ts` (Serviço de transição administrativa com gravação em `public.audit_events`).
9. `packages/database/src/__tests__/channel-instance-repository.test.ts` (Testes de consulta e RLS da `channel_instance`).
10. `packages/application/src/__tests__/channel-dispatch-fallback.test.ts` (Testes negativos de proscrição de fallback silencioso).
11. `packages/application/src/__tests__/channel-health.service.test.ts` (Testes de classificação de estados operacionais).
12. `packages/application/src/__tests__/channel-switch.service.test.ts` (Testes de auditoria em `audit_events`).
13. `packages/application/src/__tests__/channel-docker-dual-engine.integration.test.ts` (Suíte Docker Smoke das Camadas A e B).
14. `scripts/verify-docker-compose-security.ts` (Verificador de hardening do `docker-compose.yml`).
15. `docs/work-packages/CH-10-DUAL-ENGINE.md` (Este documento canônico de especificação).

---

## 11. Ordem Sequencial de Implementação

1. **Fase 1 — Resolução do Digest e Hardening do Compose:**
   - Inspecionar registry com `docker buildx imagetools inspect` para fixar digest real do WAHA.
   - Ajustar `docker-compose.yml` com portas loopback e volume nomeado `sos_v3_waha_sessions`.
   - Implementar `scripts/verify-docker-compose-security.ts`.
2. **Fase 2 — Migração de Banco e Repository Tenant-Safe:**
   - Criar Migration 006 com índice único parcial.
   - Implementar `ChannelInstanceRepository` em `packages/database` com isolamento por RLS.
   - Criar testes herméticos de banco em `channel-instance-repository.test.ts`.
3. **Fase 3 — Serviços de Despacho, Health e Transição:**
   - Implementar `ChannelDispatchService` (fail-closed, sem fallback).
   - Implementar `ChannelHealthService` com suporte a `checkHealth()` nos adaptadores.
   - Implementar `ChannelSwitchService` gravando em `public.audit_events`.
4. **Fase 4 — Suítes Herméticas Automatizadas (Camada A):**
   - Implementar suítes de teste de fallback, health mapping e transição auditada.
   - Validar execução 100% verde com `pnpm test:db:run`.
5. **Fase 5 — Docker Smoke Test (Camada B):**
   - Implementar `channel-docker-dual-engine.integration.test.ts` com skip gracioso na ausência de daemon Docker e falha estrita quando `RUN_DOCKER_LIVE_TESTS=true`.
6. **Fase 6 — Verificação Canônica de Gates:**
   - Executar `pnpm ci:gate` garantindo 100% de aprovação nos 6 gates locais.
   - Realizar commit cirúrgico dos arquivos implementados.

---

## 12. Matriz de Riscos P0 / P1 / P2

### Riscos P0 (Bloqueadores de Conformidade e Segurança):
- **Risco:** Fallback silencioso automático enviar mensagem com template WABA em formato WAHA ou vice-versa, violando janela de atendimento da Meta ou quebrando regras de negócio.  
  **Mitigação:** Regra inegociável no `ChannelDispatchService`: erro em provedor configurado gera falha imediata na mensagem (`PROVIDER_UNAVAILABLE`), sem desvio de rota.
- **Risco:** Falha de isolamento permitindo que Workspace Alpha despache mensagens pela `channel_instance` do Workspace Beta.  
  **Mitigação:** Validação estrita via RLS no `ChannelInstanceRepository` (`app.current_workspace_id`) e verificação de integridade no `ChannelDispatchService`.

### Riscos P1 (Riscos Operacionais e de Infraestrutura):
- **Risco:** Bloqueio do Chromium dentro do container WAHA devido a capabilidades insuficientes no Docker Compose.  
  **Mitigação:** Não aplicar `cap_drop: [ALL]` indiscriminadamente sem validação empírica; permitir gravação em `/tmp` e `/app/.sessions`.
- **Risco:** Docker Compose local derrubar Postgres ou Redis durante operações de teste no container WAHA.  
  **Mitigação:** Procedimento de rollback direcionado operando exclusivamente sobre o container `sos-v3-waha` via `docker stop/rm`.

### Riscos P2 (Ressalvas de Manutenibilidade):
- **Risco:** Inconsistência nos testes herméticos da CI provocada por chamadas de rede externas não mockadas.  
  **Mitigação:** Isolamento estrito de todos os probes externos na Camada A, utilizando mocks determinísticos.

---

## 13. Comandos de Validação e Verificação do Plano

```bash
# 1. Validação de integridade de sintaxe e schemas (Gate 1):
pnpm ci:gate

# 2. Resolução do digest real da imagem WAHA:
docker buildx imagetools inspect devlikeapro/waha:2025.1.1

# 3. Validação de sintaxe estática do Docker Compose:
docker compose --profile waha config

# 4. Execução da suíte de banco hermético:
pnpm test:db:run
```
