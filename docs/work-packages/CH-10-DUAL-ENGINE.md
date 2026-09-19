# CH-10 — Docker Dual-Engine & Coexistência Operacional

> Nome do arquivo: `CH-10-DUAL-ENGINE.md`  
> Estado: `READY` — Plano técnico de arquitetura e engenharia aprovado para execução em Docker Lab hermético.  
> Versão do Plano: `1.0.0`  
> Data de Registro: 19 de setembro de 2026  

---

## 1. Identidade e Metadados do Pacote

- **Parent Objective:** Programa SOS Sales V3 — Motor de Canais de Comunicação (Fase CH)
- **Estado:** `READY` (Aguardando início de implementação)
- **Arquitetura & Lead:** Gemini 3.8 (@orchestrator)
- **Agentes Especializados Envolvidos:**
  - `Architect`: Especificação do `ChannelPortRegistry`, lifecycle states e contratos multi-tenant.
  - `Docker/SRE Specialist`: Hardening de containers, imagem por digest, resource limits, healthchecks e volumes.
  - `Security Auditor`: Isolamento perimétrico de rede, allowlist interna, RLS cross-workspace e proteção contra token leakage.
  - `Backend Specialist`: Implementação de health checks, dispatch routing sem fallback silencioso e audit log de provedores.
  - `QA Specialist`: Testes de integração viva (Docker Lab), suítes herméticas com mocks e validação negativa.
- **Dependências Upstream:** `CH-00` a `CH-07` (Fundação, RLS, Fencing, Ingress, Rate Limiting, Keyring, SSRF Guard), `CH-08` (WABA Operacional), `CH-09` (WAHA Operacional, commit `9577e17` / `d4b43d8`).
- **ADRs Vinculadas:** ADR-002 (Multi-Tenancy & Auth Strategy), ADR-005 (Channel Gateway & Inbox/Outbox).
- **Roadmap Gate:** `| CH-10 | Docker dual-engine | CH-08/09 | Coexistência de Meta WABA e WAHA, seleção explícita por workspace e integração viva em Docker Lab |`
- **Risco Primário Mitigado:** `R-006` (Fallback automático silencioso entre canais provocando envio por canal indevido, poluição de credenciais entre workspaces, deriva de imagens Docker sem pinning por digest, e instabilidade de sessão pós-reinicialização).

---

## 2. Objetivo da Missão

Comprovar em ambiente controlado de **Docker Lab** a coexistência operacional de alta fidelidade entre **Meta WABA (Meta Cloud API)** e **WAHA (WhatsApp HTTP API)** selecionáveis explicitamente por workspace, garantindo:
1. **Zero Fallback Silencioso:** Proibir categoricamente qualquer tentativa de failover automático entre provedores (se o canal WAHA configurado estiver degradado ou desconectado, o sistema reporta o erro e falha fechado, sem desviar mensagens silenciosamente para WABA ou vice-versa).
2. **Isolamento Criptográfico e de Credenciais:** Workspaces mantêm credenciais totalmente estanque via `ISigningSecretResolver`, sem vazamento de API keys ou tokens em logs, webhooks ou mensagens de erro.
3. **Imutabilidade e Segurança de Infraestrutura:** Fixação da imagem do WAHA por digest SHA-256 (nunca tag mutável `latest`), limites estritos de CPU/memória, volume persistente para sessões Chromium e isolamento de portas expostas exclusivamente em loopback (`127.0.0.1`).
4. **Verificação de Integração Viva:** Validação de 12 operações de ciclo de vida real contra o container WAHA (sessão, QR, status, reinicialização com persistência, despacho de 4 tipos de mídia, webhook e ACK) preservando a baseline hermética da CI sem dependência de container ativo.

---

## 3. Especificação Arquitetural

```
+---------------------------------------------------------------------------------------------------------+
|                                           SOS SALES V3 APPLICATION                                     |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  |                                     ChannelPortRegistry                                           |  |
|  |   - resolveAdapter(workspaceId, provider): IChannelAdapter                                        |  |
|  |   - getActiveInstance(workspaceId, provider): ChannelInstanceRecord                              |  |
|  |   - evaluateProviderHealth(workspaceId, provider): Promise<ChannelHealthStatus>                  |  |
|  |   - switchActiveProvider(workspaceId, fromProvider, toProvider, actorId): Promise<AuditLogEntry>  |  |
|  +---------------------------------------------------------------------------------------------------+  |
|                         |                                                 |                             |
|          [workspace A: provider='waha']                    [workspace B: provider='meta_waba']          |
|                         v                                                 v                             |
|          +-------------------------------+                 +-------------------------------+            |
|          |          WahaAdapter          |                 |        MetaWabaAdapter        |            |
|          +-------------------------------+                 +-------------------------------+            |
|                         |                                                 |                             |
|  SSRF Perimeter Guard   | (INTERNAL_SERVICE_ALLOWLIST)                    | (Enforce 24h window)        |
|  No credential leakage  |                                                 | Multi-lang templates        |
|  Single-read QR body    |                                                 | Media filename extraction   |
|                         |                                                 |                             |
+-------------------------|-------------------------------------------------|-----------------------------+
                          |                                                 |
                          v (Docker Network: sos-v3-network)                v (HTTPS WAN)
       +------------------------------------+                  +--------------------------------+
       |       Container: sos-v3-waha       |                  |      Meta Graph API v21.0      |
       |  Image: devlikeapro/waha@sha256:.. |                  |    graph.facebook.com/v21.0    |
       |  Port: 127.0.0.1:3000:3000         |                  +--------------------------------+
       |  Volume: waha_sessions:/app/.sess  |
       |  Limits: 1.5 CPU / 1024MB RAM      |
       +------------------------------------+
```

### 3.1 `ChannelPortRegistry` por Workspace
- Cada workspace possui até uma `channel_instance` ativa por provedor registrado (`meta_waba`, `waha`).
- A rota de despacho transacional (`outbound`) e de recepção (`ingress`) consulta o `ChannelPortRegistry` fornecendo o par `(workspaceId, provider)`.
- **Regra de Não-Ambiguidade:** Se um workspace tentar despachar uma mensagem indicando um provedor diferente do configurado na thread comercial, a operação é rejeitada com código tipado `CHANNEL_PROVIDER_MISMATCH`.
- **Regra de Falha Fechada:** Se o provedor configurado estiver indisponível (`unavailable` ou `unhealthy`), a mensagem é colocada em status `failed` (ou retida em retry temporário com backoff exponencial se o erro for transitório), **sendo expressamente proibido qualquer fallback automático para outro canal**.

### 3.2 Máquina de Estados de Saúde (`ChannelHealthStatus`)
O registro de instâncias monitora e classifica o estado do canal independentemente:

| Estado | Descrição | Comportamento de Despacho |
|---|---|---|
| `HEALTHY` | Provedor operacional, credenciais válidas, sessão WAHA conectada (`CONNECTED`/`WORKING`) ou WABA com conectividade Graph API OK. | Despacho normal autorizado. |
| `DEGRADED` | Latência anormal (> 3000ms), taxa de HTTP 429 elevada com `Retry-After`, ou webhook intermitente. | Despacho autorizado com alerta em métricas e rate-limiting defensivo. |
| `UNHEALTHY` | Sessão WAHA desconectada (`SCAN_QR_CODE`, `STOPPED`, `FAILED`), erro HTTP 5xx contínuo ou auth failure (`190` Meta / `session.auth_failure` WAHA). | Despacho suspenso; erros classificados como permanentes com notificação para reautenticação. |
| `UNAVAILABLE` | Container Docker desligado, timeout de conexão (`ECONNREFUSED`), host inalcançável ou credencial ausente/revogada. | Falha fechada imediata (`PROVIDER_UNAVAILABLE`); zero despacho. |

### 3.3 Transição e Auditoria de Provedor
- A alteração do provedor de um workspace (ex: migrar de `waha` para `meta_waba`) é uma operação explícita executada via comando administrativo de tenant.
- A transição registra evento imutável na tabela `audit_logs` contendo:
  - `workspace_id`, `actor_user_id`, `action: "CHANNEL_PROVIDER_SWITCH"`
  - `metadata: { previous_provider: "waha", new_provider: "meta_waba", timestamp: ISOString }`
- **Preservação de Histórico:** A thread comercial preexistente mantém o histórico de mensagens anterior inalterado com suas respectivas chaves estrangeiras e identificadores externos (`external_message_id`), garantindo integridade forense contábil e de CRM.

---

## 4. Orquestração e Hardening de Docker

### 4.1 Declaração Imutável no `docker-compose.yml`

A definição do serviço `waha` no `docker-compose.yml` deve cumprir os requisitos de hardening corporativo:

```yaml
  waha:
    image: devlikeapro/waha:2024.12.1@sha256:3a6f1d29c8e11a62d08a501ee47b144fcaa6224d2f7ac5d0e045a4cb7df0b5c3
    container_name: sos-v3-waha
    restart: unless-stopped
    profiles:
      - waha
      - full
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETUID
      - SETGID
    environment:
      WHATSAPP_HOOK_URL: http://api:4400/webhooks/whatsapp
      WHATSAPP_HOOK_EVENTS: message,message.ack,session.status,session.qr
      WHATSAPP_API_KEY: ${WAHA_API_KEY}
      WAHA_ZIP_LOGS: "false"
      WAHA_LOG_LEVEL: info
      WAHA_PRINT_QR: "false"
      WAHA_BASE_URL: http://waha:3000
    ports:
      # Exposição estritamente vinculada ao loopback local (127.0.0.1)
      - "127.0.0.1:${PORT_WAHA:-3000}:3000"
    volumes:
      - waha_sessions:/app/.sessions
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

### 4.2 Regras Estritas de Orquestração
1. **Fixação por Digest Criptográfico:** É estritamente proibido o uso da tag `:latest`. A imagem deve especificar tag de versão estável concatenada ao digest SHA-256 do manifesto do registry Docker Hub.
2. **Isolamento de Portas:** A porta `3000` do container é mapeada exclusivamente para `127.0.0.1` na máquina hospedeira. Proibido mapeamento genérico `3000:3000` (que abriria interface em `0.0.0.0` para a rede local ou externa).
3. **Isolamento de Secrets:** A chave `WHATSAPP_API_KEY` deve ser consumida de variável de ambiente (`.env.local` / ambiente do processo), sem fallback com chave hardcoded no repositório.
4. **Persistência de Sessão:** O volume nomeado `sos_v3_waha_sessions` preserva tokens de sessão do WhatsApp Web entre reinicializações do container, permitindo testes de resiliência e validação de reconexão sem novo QR code.
5. **Preservação da Baseline de CI (Zero Poluição):** O profile `profiles: ["waha", "full"]` garante que a execução padrão de testes (`pnpm test`, `pnpm ci:gate`) continue executando com hermeticidade pura e mocks sem exigir o daemon Docker rodando o container WAHA.

---

## 5. Arquitetura de Segurança e Multi-Tenancy

### 5.1 Isolamento de Credenciais Cross-Workspace
- O acesso a segredos de provedor (`apiKey` para WAHA, `accessToken` e `systemUserSecret` para WABA) é mediado pelo `ISigningSecretResolver`.
- Nenhuma chave de API transita na URL de requisição ou em parâmetros query (apenas headers `X-Api-Key` ou `Authorization: Bearer`).
- Caso o workspace A tente carregar o adaptador ou enviar mensagem apontando para uma `channel_instance` do workspace B, a camada de banco bloqueia imediatamente via RLS (`FORCE ROW LEVEL SECURITY`) e constraints compostas `(workspace_id, id)`.

### 5.2 Allowlist Interna de Serviços (`INTERNAL_SERVICE_ALLOWLIST`)
- Em conformidade com o `CH-07` e `CH-09`, a URL base do WAHA (`http://waha:3000` ou `http://localhost:3000`) é validada pela função perimétrica `validateWahaBaseUrl`.
- Em ambiente não-produtivo ou de teste, o acesso via HTTP puro é restrito aos hostnames explicitamente autorizados em `INTERNAL_SERVICE_ALLOWLIST`:
  - `localhost`
  - `127.0.0.1`
  - `waha` (nome do container Docker na rede bridge `sos-v3-network`)
- Qualquer outro host HTTP fora da allowlist é sumariamente bloqueado com exceção `SSRF_VIOLATION`.

### 5.3 Sanitização de Logs e Prevenção de DoS
- Payloads brutos de QR Code (strings base64 ou binários de até 512 KB) são sanitizados antes de qualquer log.
- Mensagens de erro de requisição HTTP interceptam e removem cabeçalhos `Authorization` e `X-Api-Key`.
- O tamanho máximo de payload recebido no webhook do WAHA é estritamente limitado a 512 KB (`WAHA_MAX_INBOUND_PAYLOAD_BYTES`).

---

## 6. Plano de Testes de Integração Viva (Docker Lab)

Os testes de integração viva contra o container Docker real são implementados em arquivo dedicado:
`packages/application/src/__tests__/channel-docker-dual-engine.integration.test.ts`.

### 6.1 Pré-condições de Execução do Lab
- O teste detecta automaticamente se o container WAHA está saudável via healthcheck probe HTTP em `http://127.0.0.1:3000/api/server/version`.
- Se o container não estiver ativo e o teste estiver em modo CI hermético padrão, a suíte de integração viva reporta `SKIPPED` com mensagem instrutiva (`Docker WAHA container offline — run 'docker compose --profile waha up -d' for live integration testing`), preservando a aprovação dos 6 quality gates padrão.
- Quando a variável `RUN_DOCKER_LIVE_TESTS=true` estiver ativa, a suíte executa o ciclo completo de 12 etapas reais:

```mermaid
sequenceDiagram
    autonumber
    participant TestRunner as Integration Test Runner
    participant Registry as ChannelPortRegistry
    participant WahaAdp as WahaAdapter
    participant WahaCont as Docker WAHA Container
    participant Normalizer as WahaWebhookNormalizer

    Note over TestRunner,WahaCont: FASE 1: Ciclo de Vida de Sessão
    TestRunner->>Registry: resolveAdapter(wsA, "waha")
    Registry-->>TestRunner: WahaAdapter instance
    TestRunner->>WahaAdp: startSession("live-test-session")
    WahaAdp->>WahaCont: POST /api/sessions/start
    WahaCont-->>WahaAdp: 201 Created (status: "STARTING")
    TestRunner->>WahaAdp: getQrCode("live-test-session")
    WahaAdp->>WahaCont: GET /api/sessions/live-test-session/auth/qr
    WahaCont-->>WahaAdp: 200 OK (Content-Type: image/png, Buffer 12KB)
    Note over WahaAdp: Leitura única de Buffer + conversão Data URI
    WahaAdp-->>TestRunner: { format: "binary", qr: "data:image/png;base64,..." }

    Note over TestRunner,WahaCont: FASE 2: Despacho Tipado para Endpoints Dedicados
    TestRunner->>WahaAdp: sendTextMessage(textPayload)
    WahaAdp->>WahaCont: POST /api/sendText
    WahaCont-->>WahaAdp: 200 OK { id: "waha-msg-001" }
    TestRunner->>WahaAdp: sendMediaMessage(imagePayload)
    WahaAdp->>WahaCont: POST /api/sendImage
    WahaCont-->>WahaAdp: 200 OK { id: "waha-msg-002" }
    TestRunner->>WahaAdp: sendMediaMessage(videoPayload)
    WahaAdp->>WahaCont: POST /api/sendVideo
    WahaCont-->>WahaAdp: 200 OK { id: "waha-msg-003" }
    TestRunner->>WahaAdp: sendMediaMessage(voicePayload)
    WahaAdp->>WahaCont: POST /api/sendVoice
    WahaCont-->>WahaAdp: 200 OK { id: "waha-msg-004" }
    TestRunner->>WahaAdp: sendMediaMessage(docPayload)
    WahaAdp->>WahaCont: POST /api/sendFile
    WahaCont-->>WahaAdp: 200 OK { id: "waha-msg-005" }

    Note over TestRunner,Normalizer: FASE 3: Normalização de Webhook e ACKs
    TestRunner->>Normalizer: normalizeWebhook(rawAckPayload)
    Normalizer-->>TestRunner: CanonicalDeliveryEvent (status: "delivered", externalEventId)

    Note over TestRunner,WahaCont: FASE 4: Resiliência e Persistência de Sessão
    TestRunner->>WahaAdp: stopSession("live-test-session")
    WahaAdp->>WahaCont: POST /api/sessions/stop
    WahaCont-->>WahaAdp: 200 OK (status: "STOPPED")
    Note over TestRunner: Reinício do container (docker restart sos-v3-waha)
    TestRunner->>WahaAdp: getSession("live-test-session")
    WahaAdp->>WahaCont: GET /api/sessions/live-test-session
    WahaCont-->>WahaAdp: 200 OK (sessão recuperada do volume waha_sessions)
```

### 6.2 As 12 Etapas Auditadas no Teste Vivo
1. `SUBIR_SESSAO`: Dispara `startSession` e valida transição de estado da API.
2. `OBTER_QR`: Consome QR Code real da API WAHA, validando formato (imagem/PNG ou texto) e teto de payload (512 KB).
3. `OBSERVAR_STATUS`: Consulta `getSession` e valida resposta tipada estruturada (`status`, `me`).
4. `PARAR_SESSAO`: Dispara `stopSession` e valida parada controlada sem travar worker.
5. `PERSISTENCIA_RESTART`: Verifica que os metadados da sessão foram preservados no volume `waha_sessions`.
6. `ENVIAR_TEXTO`: Valida rota dedicada `/api/sendText` com payload real.
7. `ENVIAR_IMAGEM`: Valida rota dedicada `/api/sendImage` com URL sanitizada contra SSRF.
8. `ENVIAR_VIDEO`: Valida rota dedicada `/api/sendVideo`.
9. `ENVIAR_VOZ`: Valida rota dedicada `/api/sendVoice` (áudio PTT).
10. `ENVIAR_DOCUMENTO`: Valida rota dedicada `/api/sendFile` com extração do filename original.
11. `RECEBER_WEBHOOK`: Simula evento inbound e valida normalização canônica pelo `WahaWebhookNormalizer`.
12. `PROCESSAR_ACK_E_IDEMPOTENCIA`: Processa confirmação de entrega e valida deduplicação de evento por `externalEventId`.

---

## 7. Critérios de Aceite Numerados (AC-CH10)

| ID do Critério | Requisito Verificado | Método de Verificação | Veredito Alvo |
|---|---|---|---|
| **AC-CH10-001** | `ChannelPortRegistry` instancia e resolve independentemente adaptadores `waha` e `meta_waba` por workspace sem colisão ou estado compartilhado. | Teste unitário e de contrato multi-tenant. | `PASS` |
| **AC-CH10-002** | O despacho de mensagens proíbe categoricamente fallback silencioso automático entre provedores diante de instâncias degradadas ou indisponíveis, falhando fechado com erro tipado `PROVIDER_UNAVAILABLE` ou `PROVIDER_DEGRADED`. | Teste de falha forçada e injeção de erro. | `PASS` |
| **AC-CH10-003** | Serviço Docker `waha` configurado com imagem fixada por digest SHA-256 (sem tag `:latest`), limites de recurso (1.5 CPU, 1024MB RAM), vinculação exclusiva a `127.0.0.1:3000` e volume persistente `sos_v3_waha_sessions`. | Inspeção estática de `docker-compose.yml` e teste de inicialização. | `PASS` |
| **AC-CH10-004** | Healthcheck real do container WAHA implementado e funcional com credenciais injetadas por variável de ambiente sem hardcoding de API key. | Execução de `docker inspect` e consulta HTTP authenticated. | `PASS` |
| **AC-CH10-005** | Adaptação WABA oficial (`MetaWabaAdapter`) preservada integralmente com verificação de health/config sem requisições reais em ambiente de CI. | Suíte `channel-adapters.test.ts` (110 asserções) 100% verde. | `PASS` |
| **AC-CH10-006** | Isolamento multi-tenant comprovado: Workspace Alpha com provedor `waha` não tem acesso ou visibilidade das credenciais ou instâncias do Workspace Beta com `meta_waba`. | Teste de segurança multi-tenant com assert de RLS negativo. | `PASS` |
| **AC-CH10-007** | Alteração de provedor de canal por workspace exige comando administrativo explícito e gera registro de auditoria imutável em `audit_logs`, preservando threads comerciais existentes. | Teste de integração de transição de canal e consulta à tabela de auditoria. | `PASS` |
| **AC-CH10-008** | Suíte de integração viva em Docker Lab executa as 12 operações de ciclo de vida contra container WAHA real e preserva a execução hermética padrão dos 6 gates de CI locais. | Execução de `pnpm ci:gate` e runner dedicado de integração viva. | `PASS` |

---

## 8. Matriz de Rastreabilidade (Requisito → Teste → Evidência)

| Requisito do Plano | Componente / Arquivo | Teste Automatizado | Evidência Canônica |
|---|---|---|---|
| Registry dual-engine por workspace | `packages/application/src/channels/registry/channel-port.registry.ts` | `packages/application/src/__tests__/channel-port-registry.test.ts` | `EV-CH10-001` (Asserção de resolução única e estanque) |
| Proibição de fallback silencioso | `packages/application/src/channels/services/channel-dispatch.service.ts` | `packages/application/src/__tests__/channel-dispatch-fallback.test.ts` | `EV-CH10-001` (Assert de falha fechada sem desvio de tráfego) |
| Docker hardening com digest fixo | `docker-compose.yml` | `scripts/verify-docker-compose-security.ts` | `EV-CH10-001` (Validação de digest SHA-256 e portas 127.0.0.1) |
| Ciclo de vida real WAHA (12 passos) | `packages/application/src/channels/adapters/waha.adapter.ts` | `packages/application/src/__tests__/channel-docker-dual-engine.integration.test.ts` | `EV-CH10-001` (Log de execução viva em Docker Lab) |
| Preservação do adapter WABA | `packages/application/src/channels/adapters/meta-waba.adapter.ts` | `packages/application/src/__tests__/channel-adapters.test.ts` | `EV-CH10-001` (59 testes de adaptadores aprovados) |
| Isolamento multi-tenant | `packages/database/src/messaging.ts` | `packages/database/src/__tests__/channel-foundation-security.test.ts` | `EV-CH10-001` (Assert RLS cross-workspace bloqueado) |
| Auditoria de transição de provedor | `packages/application/src/channels/services/channel-switch.service.ts` | `packages/application/src/__tests__/channel-provider-switch.test.ts` | `EV-CH10-001` (Registro gerado em audit_logs) |
| Gate 6 e verificação criptográfica | `scripts/verify-evidence-digests.ts` | `pnpm ci:gate` | `EV-CH10-001` (Gate 6 aprovado com novo digest do CH-10) |

---

## 9. Arquivos sob Ownership do Pacote CH-10

### Arquivos Modificados / Expandidos:
1. `docker-compose.yml` (Hardening do serviço waha: digest imutável, volume nomeado, limites de recursos, segurança sem privilégios e portas locais)
2. `packages/application/src/channels/registry/channel-adapter.registry.ts` (Evolução para suportar health check e status por provedor)
3. `packages/application/src/channels/adapters/waha.adapter.ts` (Método de health check nativo `checkHealth(): Promise<ChannelHealthStatus>`)
4. `packages/application/src/channels/adapters/meta-waba.adapter.ts` (Método de health check nativo `checkHealth(): Promise<ChannelHealthStatus>`)

### Arquivos Novos (Criados pelo Pacote):
5. `packages/application/src/channels/registry/channel-port.registry.ts` (Port registry multi-tenant vinculando workspace a provedor ativo)
6. `packages/application/src/channels/services/channel-dispatch.service.ts` (Serviço de despacho seguro sem fallback silencioso)
7. `packages/application/src/channels/services/channel-switch.service.ts` (Serviço de transição auditada de provedores com log imutável)
8. `packages/application/src/__tests__/channel-port-registry.test.ts` (Testes unitários do registry multi-tenant)
9. `packages/application/src/__tests__/channel-dispatch-fallback.test.ts` (Testes negativos de proscrição de fallback silencioso)
10. `packages/application/src/__tests__/channel-provider-switch.test.ts` (Testes de auditoria de transição de provedor)
11. `packages/application/src/__tests__/channel-docker-dual-engine.integration.test.ts` (Suíte de integração viva em 12 etapas)
12. `docs/work-packages/CH-10-DUAL-ENGINE.md` (Este documento canônico de especificação e planejamento)
13. `docs/work-packages/CH-10-EVIDENCE.json` (Manifesto estruturado de evidência criptográfica `EV-CH10-001`)

---

## 10. Divisão de Tarefas por Agente Especializado

```
+-------------------+-----------------------------------------------------------------------------------+
| Agente            | Atribuições Específicas na Execução do CH-10                                      |
+-------------------+-----------------------------------------------------------------------------------+
| Architect         | - Modelagem da interface ChannelPortRegistry e tipos ChannelHealthStatus.          |
|                   | - Definição dos contratos de transição de provedor e proscrição de fallback.      |
+-------------------+-----------------------------------------------------------------------------------+
| Docker/SRE        | - Fixação da imagem devlikeapro/waha por digest SHA-256 e declaração de volume.    |
| Specialist        | - Configuração de healthcheck HTTP com timeout/retries e limits de CPU/memória.   |
|                   | - Garantia de isolamento das portas em 127.0.0.1 e preservação da baseline sem CI.|
+-------------------+-----------------------------------------------------------------------------------+
| Security          | - Auditoria perimétrica de rede e validação de INTERNAL_SERVICE_ALLOWLIST.         |
| Auditor           | - Verificação de isolamento RLS cross-workspace e ausência de vazamento de chaves.|
|                   | - Validação de integridade do audit log de transição de provedor.                |
+-------------------+-----------------------------------------------------------------------------------+
| Backend           | - Implementação do ChannelPortRegistry e do ChannelDispatchService.               |
| Specialist        | - Adição de checkHealth() nos adaptadores WahaAdapter e MetaWabaAdapter.          |
|                   | - Integração do ChannelSwitchService com persistência em audit_logs.              |
+-------------------+-----------------------------------------------------------------------------------+
| QA                | - Criação da suíte de integração viva em 12 etapas com skip gracioso sem Docker.   |
| Specialist        | - Implementação dos testes de fallback proibido e testes multi-tenant.            |
|                   | - Homologação de 100% dos testes e aprovação nos 6 gates do ci:gate.             |
+-------------------+-----------------------------------------------------------------------------------+
```

---

## 11. Ordem Sequencial de Implementação

A execução do CH-10 seguirá estritamente 6 fases lineares, com pontos de parada e validação intermediária:

1. **Fase 1 — Hardening do Docker Compose:**
   - Ajustar `docker-compose.yml` para fixar digest SHA-256 do WAHA, volume nomeado de sessões, limits de recurso e porta vinculada ao loopback `127.0.0.1`.
   - Validar sintaxe com `docker compose config` (sem subir serviços desnecessários).

2. **Fase 2 — Tipos e Interfaces de Health & Registry:**
   - Criar contratos de `ChannelHealthStatus` (`HEALTHY`, `DEGRADED`, `UNHEALTHY`, `UNAVAILABLE`) e métodos `checkHealth()` nas interfaces de canal.
   - Implementar `ChannelPortRegistry` com isolamento por workspace.

3. **Fase 3 — Serviços de Despacho e Auditoria de Transição:**
   - Implementar `ChannelDispatchService` aplicando fail-closed estrito e proscrição de fallback silencioso.
   - Implementar `ChannelSwitchService` gravando registros imutáveis em `audit_logs`.

4. **Fase 4 — Suíte de Testes Herméticos e Multi-Tenant:**
   - Implementar `channel-port-registry.test.ts`, `channel-dispatch-fallback.test.ts` e `channel-provider-switch.test.ts`.
   - Executar suíte hermética contra banco temporário (`pnpm test:db:run`).

5. **Fase 5 — Suíte de Integração Viva (Docker Lab):**
   - Implementar `channel-docker-dual-engine.integration.test.ts` cobrindo as 12 etapas do ciclo de vida WAHA.
   - Executar com container real e comprovar persistência de sessão após reinicialização.

6. **Fase 6 — Governança e Homologação de Quality Gates:**
   - Gerar manifesto `docs/work-packages/CH-10-EVIDENCE.json` com `scoped-digest-v1` (ordenação lexicográfica).
   - Executar `pnpm vitest run` e `pnpm ci:gate` garantindo 100% de aprovação nos 6 gates.
   - Realizar commit cirúrgico com caminhos explícitos.

---

## 12. Plano de Rollback

Caso ocorra falha irreversível durante a ativação ou validação do CH-10:
1. **Desativação Imediata do Container:** Executar `docker compose --profile waha down` (remove os containers da rede interna sem destruir o volume persistente `sos_v3_waha_sessions`).
2. **Isolamento de Canais:** O tráfego do Meta WABA (`meta_waba`) permanece 100% operacional através da Graph API, uma vez que não depende de containers locais.
3. **Reversão de Código:** Reversão limpa do branch de trabalho para o commit do precheck `d4b43d8` via `git revert` cirúrgico.
4. **Zero Impacto em Produção/V2:** O ambiente de produção V2 reside em infraestrutura segregada e permanece totalmente intocado.

---

## 13. Classificação de Riscos e Mitigações

### Riscos P0 (Bloqueadores Críticos):
- **Risco:** Tentativa de failover automático entre provedores enviando mensagens de cobrança/notificação com template WABA em formato WAHA ou vice-versa, violando janela de 24h ou quebrando conformidade Meta.  
  **Mitigação:** Regra arquitetural inquebrável no `ChannelDispatchService`: erro de canal reporta status `failed`/`retry` no mesmo provedor, sem desvio de rota.

### Riscos P1 (Riscos Arquiteturais):
- **Risco:** Inicialização lenta do Chromium no container WAHA provocando timeouts nos primeiros requests de teste.  
  **Mitigação:** `start_period: 30s` no healthcheck do compose e polling defensivo de pré-flight no test runner com retry configurável.

### Riscos P2 (Ressalvas Operacionais):
- **Risco:** Consumo de memória elevado pelo Chromium dentro do container WAHA em testes prolongados.  
  **Mitigação:** Limite rígido de memória no compose (`memory: 1024M`), flag de limpeza de processos órfãos e restart controlado.

---

## 14. Definição de Ciclo de Vida do Pacote

- **`READY` (Estado Atual):** Especificação completa aprovada, critérios de aceite AC-CH10-001 a 008 definidos, riscos mitigados, matriz de evidência pronta, pré-requisitos cumpridos.
- **`IN_PROGRESS`:** Desenvolvimento ativo dos componentes em `packages/application` e `docker-compose.yml`.
- **`IN_QA`:** Código finalizado; execução dos testes unitários, testes de banco hermético e teste vivo de 12 passos em Docker Lab.
- **`ACCEPTED`:** 100% dos testes aprovados, 6/6 quality gates do CI aprovados (`pnpm ci:gate`), manifesto criptográfico `CH-10-EVIDENCE.json` validado com `scoped-digest-v1` e commit cirúrgico realizado.
