# CH-10 — Docker Dual-Engine & Coexistência Operacional

> Nome do arquivo: `CH-10-DUAL-ENGINE.md`  
> Estado: `COMPLETED` — Fases 1, 2 e 3 Concluídas (v1.3.0).<br>
> Versão do Plano: `1.3.0`<br>
> Data de Registro: 19 de setembro de 2026  
> Escopo de Execução: Fases 1, 2 e 3 — Fundação Docker WAHA, Repositório Multi-Linha, ChannelDispatchService e ChannelHealthService.

---

## 1. Identidade e Metadados do Pacote

- **Parent Objective:** Programa SOS Sales V3 — Motor de Canais de Comunicação (Fase CH)
- **Estado:** `READY` (Plano reconciliado para execução imediata das Fases 1 e 2)
- **Arquitetura & Lead:** Gemini 3.8 (@orchestrator)
- **Agentes Especializados Envolvidos:**
  - `Agente de Arquitetura`: Revisão do modelo multi-provider e multi-line; garantia de seleção explícita por `channelInstanceId` (proibição de seleção arbitrária de "primeira instância ativa").
  - `Agente Database/RLS`: Revisão de schema, RLS e transações tenant-first; adiamento de restrições de unicidade precoces (Migration 006 suspensa).
  - `Agente Docker/SRE`: Implementação do serviço WAHA hermético (digest fixo, localhost bind, volume V3, healthcheck, zero `privileged`, zero `SYS_ADMIN`).
  - `Agente Backend`: Implementação de `ChannelInstanceRepository` com contratos não ambíguos reutilizando `ChannelAdapterRegistry`.
  - `Agente Security Reviewer`: Verificação estrita de isolamento, RLS, capacidades Linux, segredos e ausência de path traversal.
  - `Agente QA`: Execução de gates, testes herméticos, verificador estático e smoke test Docker isolado.
- **Dependências Upstream:** `CH-00` a `CH-07` (Fundação, RLS, Ingress Shielding, Rate Limiting, Keyring, SSRF Guard), `CH-08` (WABA Operacional), `CH-09` (WAHA Operacional, commit `9577e17` / `d4b43d8`).
- **ADRs Vinculadas:** ADR-002 (Multi-Tenancy & Auth Strategy), ADR-005 (Channel Gateway & Transactional Ingress Shielding).
- **Roadmap Gate:** `| CH-10 | Docker dual-engine | CH-08/09 | Coexistência de Meta WABA e WAHA, seleção explícita por workspace/linha e integração em Docker Lab |`
- **Risco Primário Mitigado:** `R-006` (Fallback automático silencioso entre provedores, poluição de credenciais cross-workspace, pinning fictício de digest Docker, colisão de rotas de webhook e instabilidade de sessão pós-restart).

---

## 2. Fronteira Arquitetural: CH-10 vs CH-12 vs EXT-05

O pacote **CH-10** tem escopo estritamente delimitado à **infraestrutura, governança e coexistência operacional**:
1. **O que o CH-10 comprova:**
   - Coexistência no mesmo monorepo dos dois motores (`meta_waba` e `waha`).
   - Suporte a múltiplas linhas ativas por provedor e por workspace (multi-line).
   - Subida e saúde do container Docker `waha` via imagem resolvida por digest criptográfico real do Docker Hub.
   - Resolução de adapters sem fallback silencioso (falha fechada obrigatória diante de indisponibilidade).
   - Persistência de sessões WAHA em volume nomeado entre reinicializações do container.
   - Isolamento multi-tenant via RLS e repositório tenant-first.
   - Execução de smoke test de container e API (sessão de lab sem pareamento, healthcheck, endpoints dedicados) em ambiente hermético ou de lab.
2. **O que NÃO pertence ao CH-10 (pertence ao CH-12 ou à subfase CH-10B dependente de EXT-05):**
   - Escaneamento de QR Code com conta de WhatsApp real mantida por operador humano.
   - Envio e recebimento de mensagens ponta-a-ponta na rede pública da Meta/WhatsApp.
   - Tráfego real de webhook da Meta ou do WAHA conectado a dispositivo físico.
   - Criação de threads comerciais reais com clientes reais e deduplicação de ACKs de operadora externa.
   - **Toda validação dependente de aparelho celular real é classificada como `BLOCKED_EXTERNAL` (EXT-05).**
   - **O smoke Docker local NÃO equivale a homologação com WhatsApp real.**

---

## 3. Matriz de Contratos Técnicos: KNOWN / INFERRED / RESOLVED

| Item do Contrato | Classificação | Detalhes Técnicos e Evidência no Código | Ação na Implementação |
|---|---|---|---|
| **Digest da Imagem Docker WAHA** | `RESOLVED` | Inspecionado via Docker Hub: tag `latest-2026.8.2`, OCI index digest `sha256:527ff3d634925adb26d596883d7b3ca502c080f737af3c2af2be0c973c511533` (linux/amd64: `sha256:dcc55f079b1d2c15ad0dc35a1b08c983c203f843bf1260df01441af0f84309b0`). | Fixado formalmente no Compose com pinning estrito por digest. |
| **Edição e Engine WAHA** | `RESOLVED` | Decisão Arquitetural: WAHA usa engine `WEBJS` nesta fatia. `NOWEB` permanece fora de escopo. Zero `SYS_ADMIN`. Zero modo privilegiado (`privileged: true` terminantemente proibido). | Configurar `WHATSAPP_DEFAULT_ENGINE=WEBJS` no Compose sem flags privilegiadas. |
| **Variáveis de Ambiente WAHA** | `KNOWN` | Variáveis documentadas pela API WAHA: `WHATSAPP_HOOK_URL`, `WHATSAPP_HOOK_EVENTS`, `WHATSAPP_API_KEY`, `WAHA_ZIP_LOGS`, `WAHA_LOG_LEVEL`, `WAHA_PRINT_QR`, `WAHA_BASE_URL`. | Consumir segredos via `.env.local` sem valores default hardcoded em produção. |
| **Endpoint de Health / Version** | `KNOWN` | Endpoint WAHA comprovado: `GET /api/server/version`. Suporta retorno estruturado JSON com versão e status do servidor. | Utilizado no probe de healthcheck do Docker Compose e no smoke test. |
| **Endpoints de Sessão e QR** | `KNOWN` | Comprovado em `waha.adapter.ts`: `POST /api/sessions/start`, `POST /api/sessions/stop`, `GET /api/sessions`, `GET /api/sessions/{session}`, `GET /api/sessions/{session}/auth/qr`. | Respeitar teto de 512 KB no QR e leitura segura de buffers. |
| **Diretório de Persistência** | `KNOWN` | O diretório interno padrão do container para armazenamento de perfis Chromium/sessões é `/app/.sessions`. | Mapear para o volume nomeado `sos_v3_waha_sessions:/app/.sessions`. |
| **Header de Autenticação Ingress** | `KNOWN` | Comprovado em `signature-verification.service.ts`: WAHA aceita `x-api-key`, `x-webhook-secret` ou `authorization: Bearer <token>`. | Validado via `SignatureVerificationService.verify()` com `timingSafeEqual`. |
| **Rota de Webhook Fastify Real** | `KNOWN` | Comprovado em `apps/api/src/routes/webhook.routes.ts`: `POST /v1/webhooks/whatsapp/:endpointToken`. Não existe `/webhooks/whatsapp` genérico. | O webhook deve ser configurado por instância com seu `endpointToken` dedicado gerado no banco. Proibido token hardcoded no Compose. |
| **Raw Body e Teto de Payload** | `KNOWN` | Comprovado em `webhook.routes.ts`: Ingress exige `request.rawBody` preservado e impõe teto de 512 KB (`512 * 1024` bytes). Excesso retorna HTTP 413. | Respeitado rigorosamente no gateway Fastify. |
| **Tabela de Auditoria Soberana** | `KNOWN` | Comprovado em Migrations 001 e 004: Tabela é `public.audit_events` (não `audit_logs`), protegida por trigger `trg_audit_events_immutable`. | Auditorias inserem em `public.audit_events` via função security definer ou `sos_app_user`. |
| **Modelo Multi-Linha & Unicidade** | `RESOLVED` | Investigação empírica contra `channel-foundation-security.test.ts` comprovou que workspaces suportam múltiplas linhas ativas do mesmo provedor. Migration 006 adiada até existir identidade externa canônica comprovada. | Suporte nativo a multi-line no repositório. Despacho utiliza `channelInstanceId` explícito. |
| **Health Externo da Meta (WABA)** | `UNRESOLVED_EXTERNAL` | A CI não possui e não deve usar credenciais reais da Meta Graph API para evitar quebras por rede externa ou rate limits. | A saúde estrutural/configuracional do WABA é testada com mocks na CI; verificação externa real exige homologação manual (EXT-03). |

---

## 4. Arquitetura de Responsabilidades e Contratos Não Ambíguos

Para evitar sobreposição de responsabilidades e registries duplicados, o sistema reutiliza o `ChannelAdapterRegistry` existente para resolução de adapters stateless (`provider -> adapter`) e utiliza o `ChannelInstanceRepository` para resolução de instâncias no banco:

```
+---------------------------------------------------------------------------------------------------------+
|                                           SOS SALES V3 APPLICATION                                     |
|                                                                                                         |
|  1. ChannelAdapterRegistry (Stateless Singleton - packages/application)                                |
|     - register(adapter: IChannelAdapter): void                                                          |
|     - get(provider: ChannelProvider): IChannelAdapter                                                   |
|     - has(provider: ChannelProvider): boolean                                                           |
|                                                                                                         |
|  2. ChannelInstanceRepository (Tenant-Safe Database Layer - packages/database)                         |
|     - findById(workspaceId, channelInstanceId): Promise<ChannelInstanceRecord | null>                   |
|     - listActiveByWorkspaceAndProvider(workspaceId, provider): Promise<ChannelInstanceRecord[]>        |
|     - findByEndpointToken(endpointToken): Promise<ChannelInstanceRecord | null>                         |
|     - create(params): Promise<ChannelInstanceRecord>                                                    |
|     - Enforces RLS: app.current_workspace_id = workspaceId                                              |
|                                                                                                         |
|  3. ChannelDispatchService (Explicit Instance Routing & Fail-Closed Policy)                            |
|     - dispatchOutbound(workspaceId, channelInstanceId, messagePayload): Promise<ChannelSendResult>      |
|     - Seleção Explícita: SEMPRE recebe channelInstanceId (PROIBIDO escolher "primeira instância")      |
|     - Falha Fechada: PROIBIDO fallback automático silencioso para outro canal se instância falhar      |
|                                                                                                         |
|  4. ChannelHealthService (Operational Health Evaluator)                                                 |
|     - evaluateChannelHealth(workspaceId, channelInstanceId): Promise<ChannelHealthStatusReport>         |
+---------------------------------------------------------------------------------------------------------+
                         |                                                 |
       [workspace: instance A ('waha')]                  [workspace: instance B ('meta_waba')]
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

### 4.1 Contratos Não Ambíguos do `ChannelInstanceRepository`

1. **`findById(workspaceId: string, channelInstanceId: string)`:**
   Busca determinística de uma linha específica dentro do tenant. Retorna `null` se não existir ou se pertencer a outro tenant (RLS).
2. **`listActiveByWorkspaceAndProvider(workspaceId: string, provider: ChannelProvider)`:**
   Retorna a lista de todas as instâncias ativas daquele provedor no workspace. Suporta explicitamente cenários multi-line (ex: dois números WAHA no mesmo workspace).
3. **`findByEndpointToken(endpointToken: string)`:**
   Calcula o `sha256(endpointToken)` e busca a instância via `endpoint_token_hash` ativo.
4. **Despacho Transacional Explícito:**
   O envio de mensagens exige obrigatoriamente o `channelInstanceId` vinculado à thread comercial (`commercial_threads.channel_instance_id`). É terminantemente proibido escolher arbitrariamente a "primeira instância ativa" do provedor.
5. **Ausência de Switch Global:**
   Nesta missão não é implementado switch global que desative todas as instâncias de um provedor, preservando a integridade das linhas comerciais ativas.

---

## 5. Persistência de Banco, RLS e Decisão sobre Migration 006

### 5.1 O Ledger Imutável `public.audit_events`
Em conformidade com a Migration 001 e a Migration 004, eventos de auditoria de canal utilizam exclusivamente `public.audit_events`, garantindo rastreabilidade protegida por trigger `trg_audit_events_immutable`.

### 5.2 Decisão sobre Migration 006 (Adiada)
- **Fato Arquitetural Comprovado:** A suíte de testes existente (`channel-foundation-security.test.ts`) utiliza múltiplas instâncias ativas do mesmo provedor (`meta_waba`) no mesmo workspace para validar chaves estrangeiras compostas entre canais, threads e mensagens.
- **Decisão Vinculante:** A Migration 006 está **adiada**. Não será criado índice único em `(workspace_id, provider)` nem presumido que `(workspace_id, provider, phone_number_e164)` resolva de forma canônica WABA, WAHA e instâncias pré-provisionadas (sem número atribuído). A identidade da linha permanece orientada ao identificador imutável `channel_instances.id`.

---

## 6. Orquestração e Hardening de Docker Realista

### 6.1 Especificação do Serviço WAHA
- **Imagem com Digest Verificado:** `devlikeapro/waha:latest-2026.8.2@sha256:527ff3d634925adb26d596883d7b3ca502c080f737af3c2af2be0c973c511533`
- **Engine:** `WEBJS` (Chromium headless pré-instalado na imagem).
- **Sem Privilégios:** ZERO `SYS_ADMIN`, ZERO `privileged: true`. Utiliza `security_opt: [no-new-privileges:true]`.
- **Exposição de Porta:** Vinculada estritamente ao loopback local: `"127.0.0.1:${PORT_WAHA:-3000}:3000"`. Proibido bind em `0.0.0.0`.
- **Volume Persistente:** Mapeamento do volume nomeado local `sos_v3_waha_sessions:/app/.sessions`.
- **Healthcheck:** Probe autenticado via `GET /api/server/version` com timeout de 5s, intervalo de 10s e `start_period: 30s`.
- **Rede:** Integrado à bridge interna `sos-v3-network`.

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
  sos_v3_waha_sessions:
    name: sos_v3_waha_sessions
    driver: local
```

### 6.2 Rollback Seguro e Direcionado
```bash
docker stop sos-v3-waha
docker rm sos-v3-waha
# O volume sos_v3_waha_sessions é preservado por padrão.
```

---

## 7. Estruturação dos Testes em Três Camadas

```
+---------------------------------------------------------------------------------------------------------+
|                                           TEST EXECUTION LAYERS                                         |
+---------------------------------------------------------------------------------------------------------+
|  CAMADA A: Hermética Automatizada (Local CI Gate - pnpm test / pnpm ci:gate)                            |
|  - Mock de fetch e probes HTTP locais.                                                                   |
|  - Reutilização do ChannelAdapterRegistry sem duplicação.                                               |
|  - ChannelInstanceRepository com testes de isolamento multi-line e RLS cross-workspace.                 |
|  - Validação de seleção explícita por channelInstanceId sem fallback silencioso.                       |
|  - Verificação estática de segurança do docker-compose.yml (scripts/verify-docker-compose-security.ts).  |
|  - STATUS: 100% AUTOMATIZADO, ZERO DEPENDÊNCIA DE DOCKER ATIVO.                                         |
+---------------------------------------------------------------------------------------------------------+
|  CAMADA B: Docker Smoke Automatizado (Ambiente com Daemon Docker - scripts/smoke-docker-waha.ts)         |
|  - Renderização do docker compose config.                                                                |
|  - Subida controlada apenas do container sos-v3-waha.                                                   |
|  - Validação do healthcheck real (/api/server/version).                                                  |
|  - Consulta do endpoint de versão estruturado.                                                           |
|  - Criação de sessão de lab sem pareamento e verificação de listagem (/api/sessions).                    |
|  - Reinício do container (docker restart sos-v3-waha) e checagem de persistência estrutural.             |
|  - Limpeza cirúrgica dos recursos criados pelo teste.                                                   |
|  - NOTA: Smoke Docker local NÃO equivale a homologação com WhatsApp real.                               |
|  - STATUS: AUTOMATIZADO EM AMBIENTE COM DOCKER.                                                          |
+---------------------------------------------------------------------------------------------------------+
|  CAMADA C: Homologação Humana / Externa (Dispositivo Celular Real - EXT-05)                             |
|  - Escaneamento de QR Code com smartphone físico e chip ativo.                                           |
|  - Envio e recebimento de mensagens ponta-a-ponta na rede da Meta.                                       |
|  - Confirmação de entrega de operadora (ACK read / delivered real).                                      |
|  - STATUS: BLOCKED_EXTERNAL (Pertence formalmente ao CH-12 ou CH-10B).                                   |
+---------------------------------------------------------------------------------------------------------+
```

---

## 8. Critérios de Aceite Numerados (AC-CH10)

| ID do Critério | Requisito Verificado | Método de Verificação | Evidência Esperada | Estado Atual | Bloqueio Externo |
|---|---|---|---|---|---|
| **AC-CH10-001** | `ChannelAdapterRegistry` registra e entrega `waha` e `meta_waba` como instâncias stateless sem conflito ou estado compartilhado. | Teste unitário em `channel-adapter.registry.test.ts`. | Instâncias separadas retornadas para cada provedor com integridade tipada. | `PASS` | `NONE` |
| **AC-CH10-002** | `ChannelInstanceRepository` resolve instâncias com RLS multi-tenant, suportando múltiplas linhas ativas por provedor sem colisão. | Teste de banco em `channel-instance-repository.test.ts`. | Multi-line verificado; cross-tenant e não-existente retornam `ChannelInstanceNotFoundError` idêntico (anti-enumeração). | `PASS` | `NONE` |
| **AC-CH10-003** | `ChannelInstanceRepository` resolve por `findById`, `listActiveByWorkspaceAndProvider` e `findByEndpointToken` de forma determinística e fail-closed. | Teste unitário e de banco em `channel-instance-repository.test.ts`. | Contratos determinísticos sem fallback fail-open; `lookup_channel_ingress` exclusivo via `ingressPool`; erros tipados. | `PASS` | `NONE` |
| **AC-CH10-004** | Duas instâncias ativas do mesmo provedor coexistem no mesmo workspace sem erro de banco, permitindo múltiplas linhas comerciais. | Teste de banco em `channel-instance-repository.test.ts`. | Ambas as instâncias salvas e retornadas na listagem por workspace/provedor. | `PASS` | `NONE` |
| **AC-CH10-005** | Configuração Docker do serviço `waha` vinculada exclusivamente a `127.0.0.1`, com digest SHA-256 fixado, sem `privileged` e sem `SYS_ADMIN`. | Verificador estático `scripts/verify-docker-compose-security.ts`. | Validação de compose aprovada com 8/8 checagens e zero violações de segurança. | `PASS` | `NONE` |
| **AC-CH10-006** | Smoke Docker WAHA executa ciclo de vida local íntegro com garantia contra falsos positivos e cleanup cirúrgico. | Runner `scripts/smoke-docker-waha.ts` e testes em `smoke-docker-waha.test.ts`. | Falso PASS revogado e corrigido: exit code 1 comprovado em teste negativo; 8/8 passos aprovados em teste positivo real. | `PASS` | `BLOCKED_EXTERNAL: EXT-02` (Se daemon Docker indisponível) |
| **AC-CH10-007** | CI hermética padrão (`pnpm test:db:run`, `typecheck`, `build`) executa e passa sem exigir container Docker ativo ou rede externa. | Execução de `pnpm test:db:run`, `pnpm typecheck`, `pnpm build`. | 30 arquivos de teste, 438 asserções aprovadas; typecheck e build 100% íntegros. | `PASS` | `NONE` |
| **AC-CH10-008** | Homologação ponta-a-ponta com escaneamento de QR Code e tráfego em aparelho físico real. | Teste manual com operador humano. | Mensagem real enviada e recebida com ACK. | `BLOCKED_EXTERNAL` | `BLOCKED_EXTERNAL: EXT-05` (Delegado para CH-12) |

---

## 9. Dependências Externas Explícitas (`EXT-01` a `EXT-05`)

- **EXT-01:** Conexão com registry Docker Hub (`RESOLVED` — digest obtido e verificado).
- **EXT-02:** Daemon Docker local disponível para execução da Camada B (Docker Smoke).
- **EXT-03:** Credenciais de homologação da Meta Graph API (WABA) para validação externa manual (fora da CI hermética).
- **EXT-04:** Porta local `${PORT_WAHA:-3000}` desimpedida no host para bind estrito em `127.0.0.1`.
- **EXT-05:** Operador humano com smartphone e chip ativo para escanear QR Code e homologar conexão (`BLOCKED_EXTERNAL` para CH-12).

---

## 10. Arquivos sob Ownership das Fases 1 e 2

### Arquivos Modificados:
1. `docker-compose.yml` (Hardening do serviço waha: digest fixado, bind 127.0.0.1, volume `sos_v3_waha_sessions`, sem privileged/SYS_ADMIN).
2. `packages/database/src/index.ts` (Exportação do `ChannelInstanceRepository` e tipos associados).
3. `packages/database/src/repositories/channel-instance.repository.ts` (Repositório tenant-first com contratos não ambíguos, ingress fail-closed e anti-enumeração).
4. `packages/database/src/__tests__/channel-instance-repository.test.ts` (25 testes cobrindo invariantes de segurança, multi-line, ingress e RLS).
5. `scripts/smoke-docker-waha.ts` (Runner do smoke test Docker isolado, truthful, com abort de dependências e cleanup garantido).
6. `docs/work-packages/CH-10-DUAL-ENGINE.md` (Plano técnico reconciliado e relatório de retificação de bloqueios P0).

### Arquivos Novos:
7. `scripts/verify-docker-compose-security.ts` (Verificador estático estrito de conformidade do Compose).
8. `scripts/__tests__/smoke-docker-waha.test.ts` (Testes automatizados do runner de smoke test: anti falso-PASS, abort e cleanup).
9. `packages/application/src/__tests__/channel-adapter-registry.test.ts` (Testes unitários de registro duplicado e provedor desconhecido).

---

## 11. Ordem Sequencial de Implementação (Fases 1 e 2)

1. **Etapa 0 — Reconciliação do Plano:**
   - Commit do plano reconciliado v1.2.0.
2. **Fase 1 — Fundação Docker WAHA:**
   - Atualizar `docker-compose.yml` com digest fixado, localhost bind, volume exclusivo e sem privilégios.
   - Criar `scripts/verify-docker-compose-security.ts` e validar conformidade.
   - Criar `scripts/smoke-docker-waha.ts` e executar ciclo de vida de smoke test.
   - Commit: `infra(ch10): add isolated digest-pinned waha lab service`.
3. **Fase 2 — Repositório Tenant-First Multi-Linha:**
   - Implementar `packages/database/src/repositories/channel-instance.repository.ts`.
   - Exportar no `packages/database/src/index.ts`.
   - Implementar testes herméticos em `packages/database/src/__tests__/channel-instance-repository.test.ts`.
   - Implementar testes de registry em `packages/application/src/__tests__/channel-adapter-registry.test.ts`.
   - Executar `pnpm test:db:run` e `pnpm ci:gate`.
   - Commit: `feat(ch10): add tenant-first channel instance repository`.

---

## 12. Relatório de Retificação de Bloqueios P0 (Auditoria Independente CH-10)

### 12.1. Descobertas e Causas Raiz

1. **Defeito de Falso PASS no Smoke Runner (`smoke-docker-waha.ts`):**
   - **Causa Raiz:** O scorecard continha uma atribuição invertida acidental (`if (r.status === "FAIL") hasFailures = false;`), que sobrescrevia qualquer status de falha com `false`, culminando em `exitCode: 0` indevido. Adicionalmente, passos subsequentes eram executados mesmo após falha crítica em passos anteriores, e havia import espúrio de `execSync` a partir de `node:crypto`.
   - **Retificação:**
     - Corrigida a lógica para `if (r.status === "FAIL") hasFailures = true;`.
     - Implementado fail-stop imediato (`abortPipeline`): falha no passo 4 impede a execução dos passos dependentes 5, 6 e 7.
     - Garantida a execução da limpeza cirúrgica no bloco `finally` (passo 8), com deleção de sessão via REST API (`DELETE /api/sessions/:name` / `POST /api/sessions/stop`) com timeout de 5 segundos antes de `docker stop -t 3` e `docker rm -f`.
     - Preservação estrita de sessões preexistentes (sessões não criadas pelo teste não são removidas).
     - Geração de nome de sessão único por execução (`lab-smoke-${Date.now()}-${random}`).
     - Adição de suporte a `--negative` para verificação de falha controlada.

2. **Remoção de Fallback Fail-Open no Ingress (`channel-instance.repository.ts`):**
   - **Causa Raiz:** O método `findByEndpointToken()` capturava genericamente exceções e executava uma consulta direta via SQL com `LIMIT 1` em `channel_instances`, abrindo brecha para bypass de ingress security definer e mascarando falhas estruturais de infraestrutura como se fossem ausência legítima de token.
   - **Retificação:**
     - Removido completamente o `catch` com consulta de fallback e eliminada toda consulta direta com `LIMIT 1` sobre `channel_instances`.
     - Exigência estrita do `ingressPool` no construtor ou chamada. Ausência gera `MissingIngressPoolError`.
     - Execução estrita de `SELECT * FROM public.lookup_channel_ingress($1)` sob o papel de menor privilégio `sos_ingress_user`.
     - Erros de banco, rede ou permissão são propagados tipadamente como `ChannelIngressLookupError`, nunca mascarados como `null`.
     - Token não encontrado retorna legitimamente `null`.
     - Resolução do registro completo ocorre pelo `appPool` sob transação tenant-first `withTenantTransaction(workspaceId, ...)`.

3. **Eliminação do Admin Pool e Mitigação de Oráculo de Enumeração Cross-Tenant:**
   - **Causa Raiz:** O repositório recebia `adminPool` no construtor para verificar globalmente se um ID pertencia a outro tenant, permitindo a atacantes distinguir IDs inexistentes de IDs pertencentes a outros workspaces (oráculo de enumeração IDOR/BOLA).
   - **Retificação:**
     - `adminPool` foi removido do construtor e de todos os campos da classe.
     - `getById(workspaceId, channelInstanceId)` agora lança rigorosamente o mesmo erro `ChannelInstanceNotFoundError` tanto para UUIDs inexistentes quanto para UUIDs pertencentes a outros tenants sob RLS. Externamente na API pública, não é possível discernir a existência de recursos entre workspaces.
     - `assertTenantOwnership()` foi retido exclusivamente como asserção defensiva em memória sobre objetos previamente carregados de forma legítima.
     - `ownerPool` nos testes é restrito unicamente à preparação e descarte de fixtures.

4. **Contrato Explícito de Token de Endpoint em `create()`:**
   - **Causa Raiz:** O método `create()` aceitava opções ambíguas ou gerava segredos que eram descartados sem retornar ao chamador.
   - **Retificação:**
     - Contrato explícito e determinístico: exige `endpointToken` OU `endpointTokenHash`.
     - Rejeita com `InvalidEndpointTokenError` se nenhum for informado.
     - Rejeita com `InvalidEndpointTokenError` se ambos forem informados simultaneamente.
     - Rejeita token vazio ou em branco.
     - Valida rigorosamente formato de hash SHA-256 (64 caracteres hexadecimais minúsculos).
     - Não descarta segredos gerados.

### 12.2. Evidências de Validação dos Gates

1. **Testes Unitários do Smoke Runner (`scripts/__tests__/smoke-docker-waha.test.ts`):**
   - 5/5 testes aprovados:
     - Verificação estática de código-fonte: zero atribuições invertidas de `hasFailures` e zero imports de `node:crypto`.
     - Verificação de garantia anti falso-PASS: qualquer passo com FAIL impõe `exitCode: 1`.
     - Verificação de abort imediato: falha no passo 4 não executa passos 5, 6 e 7.
     - Preservação de sessões preexistentes no cleanup.
     - Deleção via API de sessões criadas pelo teste.

2. **Teste Negativo Controlado do Smoke WAHA (Executado via CLI):**
   - Comando: `npx tsx scripts/smoke-docker-waha.ts --negative`
   - Resultado: Passo 4 simulou falha controlada (`Simulated controlled failure for step 4`), passos dependentes 5, 6 e 7 foram abortados, passo 8 executou a limpeza, e o processo encerrou com **código de saída 1 (FAIL estrito)**, comprovando a eliminação definitiva do falso PASS.

3. **Teste Positivo Real do Smoke WAHA (Executado contra Docker):**
   - Comando: `npx tsx scripts/smoke-docker-waha.ts`
   - Resultado: Todos os 8 passos aprovados:
     - Passo 1: Render docker compose config (PASS)
     - Passo 2: Start isolated WAHA container (PASS)
     - Passo 3: Poll WAHA health / version probe (PASS)
     - Passo 4: Create lab session via REST API (PASS)
     - Passo 5: Verify session listing (PASS)
     - Passo 6: Restart container to test volume persistence (PASS)
     - Passo 7: Verify structural persistence of session after restart (PASS)
     - Passo 8: Targeted cleanup of container and test session (PASS)
     - Saída: **`SMOKE TEST COMPLETED: All executed steps passed.` (Exit code: 0)**

4. **Testes do Repositório de Instâncias de Canal (`packages/database/src/__tests__/channel-instance-repository.test.ts`):**
   - 25/25 testes aprovados cobrindo:
     - Ausência de `adminPool` no construtor.
     - Ausência de consultas diretas com `LIMIT 1` em `channel_instances`.
     - Contrato de token em `create()` (rejeição de ausência, duplicidade, vazio e hash inválido).
     - Suporte a múltiplas linhas WAHA no mesmo workspace.
     - Isolamento cross-tenant e oráculo de enumeração indistinguível.
     - Ingress fail-closed via `lookup_channel_ingress` com papel mínimo e propagação de erros tipados.
     - Rejeição de `findByEndpointToken` se `ingressPool` não for fornecido.

5. **Bateria Completa de Banco Hermético (`pnpm test:db:run`):**
   - 30 arquivos de teste, 438 asserções aprovadas com exit code 0.

6. **Verificação de Tipos e Build:**
   - `pnpm typecheck`: 17 tarefas bem-sucedidas.
   - `pnpm build`: 10 pacotes compilados com sucesso.
   - `npx tsx scripts/verify-docker-compose-security.ts`: 8/8 checagens de segurança do Compose aprovadas.
   - `git diff --check`: 0 erros de formatação ou marcadores.

7. **Confirmação de Inviolabilidade (Fases 1 e 2):**
   - SOS Sales V2: 100% intocado.
   - Servidor VPS: 100% intocado.
   - Dispositivo celular / WhatsApp real: Zero conexões externas (EXT-05 permanece `BLOCKED_EXTERNAL` para CH-12).

---

## 13. Relatório de Implementação da Fase 3 e Retificações de Segurança P0

### 13.1. Eliminação de Command Injection e Confiabilidade do Smoke (`scripts/smoke-docker-waha.ts`)

1. **Eliminação Total de Shell Interpolation (P0-1):**
   - Substituído `exec` com string por `execFileAsync("docker", args, options)` utilizando arrays de argumentos literais passados diretamente ao kernel sem invocar `/bin/sh`.
   - `WAHA_API_KEY` injetada exclusivamente via `{ env: { ...process.env, WAHA_API_KEY: this.apiKey } }` em `options.env`, nunca como flag ou parâmetro de linha de comando.
   - Validação estrita por allowlist regex (`SAFE_NAME_REGEX = /^[a-zA-Z0-9_-]+$/`) para `containerName` e `sessionName`.
   - Aplicação de `encodeURIComponent(sessionName)` em todas as URLs REST de manipulação de sessão.
   - Testes unitários comprovam a rejeição de `$()`, backticks, aspas, ponto-e-vírgula e garantem que nenhum valor configurável passe por interpretação de shell.

2. **Ordenação de Veredito e Isolamento no Cleanup (P0-3):**
   - Reestruturado o fluxo de `execute()` com rótulo `stepPipeline: { ... break stepPipeline; }`, garantindo que o bloco `finally` (Passo 8: Cleanup) execute integralmente ANTES da invocação de `evaluateVerdict()`.
   - `BLOCKED_EXTERNAL` possui agora exit code canônico e distinto: **2** (reservado para dependências externas indisponíveis como Docker daemon ausente ou container preexistente).
   - Qualquer falha durante o pipeline ou durante o Passo 8 (stop/rm/DELETE) marca `hasFailures = true` e impõe exit code **1**.
   - Testes unitários validam cenários de container preexistente preservado, falha na API de DELETE, falha em `docker stop` e falha em `docker rm`.

### 13.2. Redação de PII e Erros em `ChannelDispatchService` (P0-2)

1. **Roteamento Explícito Multi-Provider:**
   - Despacho obriga o par `(workspaceId, channelInstanceId)`. Proibida qualquer seleção arbitrária de "primeira linha ativa".
   - Busca determinística via `ChannelInstanceRepository.getById(workspaceId, channelInstanceId)` sob transação tenant-first.

2. **Políticas de Falha Fechada (Fail-Closed):**
   - Instância não encontrada ou de outro tenant: lança `ChannelInstanceNotFoundError`.
   - Instância inativa (`is_active: false`): lança `ChannelInstanceInactiveError`.
   - Provedor sem adapter registrado no `ChannelAdapterRegistry`: lança `ChannelAdapterNotFoundError`.
   - Capacidade não suportada pelo canal (ex.: templates no motor WAHA): lança `ChannelCapabilityUnsupportedError`.
   - Falha de rede/provedor: lança `ChannelProviderUnavailableError` ou `ChannelDispatchFailedError`.
   - **Zero Fallback:** Em hipótese alguma uma mensagem destinada ao WAHA é redirecionada para a Meta WABA (ou vice-versa) em caso de falha.

3. **Higiene de Observabilidade e Redação Estrita de PII:**
   - Removido `recipientMasked` dos logs (número parcialmente mascarado continua sendo PII sob LGPD/GDPR).
   - Removido `idempotencyKey` dos logs.
   - Mensagens de exceção de provedores (`err.message`) e mensagens brutas de erro (`sendResult.errorMessage`) são estritamente redigidas dos logs e exceções públicas.
   - Causa raiz original preservada exclusivamente no campo interno `cause` do erro (`new ChannelDispatchFailedError(msg, err)`), expondo publicamente apenas códigos seguros e o par `(provider, channelInstanceId)`.

### 13.3. Redação de Evidência Técnica em `ChannelHealthService` (P0-2)

1. **Evidência Allowlisted Não Pessoal:**
   - Interface `ChannelHealthEvidence` tipada e restrita a campos allowlisted: `status`, `checkedAt` e `endpointReachable`.
   - Totalmente eliminado `sessionInfo.me` (que continha o JID do WhatsApp e dados do perfil).
   - Proibido o retorno de `err.message`, `String(err)` ou objetos de erro brutos em `reasonMessage` e `lastKnownTechnicalEvidence`.
   - Erros externos são normalizados em reason codes canônicos e seguros (`WAHA_NODE_UNREACHABLE`, `ADAPTER_HEALTH_CHECK_FAILED`, etc.).

2. **Invariante: Baseado em Evidência Técnica (Truth in Data):**
   - A mera presença de uma linha no banco de dados jamais classifica o canal como `healthy`.
   - Exige evidência técnica positiva (ex.: `getSession` do WAHA retornando status `WORKING`). Na ausência de probe ativo, o estado é conservadoramente reportado como `unknown`.

### 13.4. Matriz de Testes e Gates da Fase 3

| Componente | Arquivo de Teste | Asserções / Testes | Status |
|---|---|---|---|
| Smoke Runner WAHA (Segurança, Shell, Cleanup) | `scripts/__tests__/smoke-docker-waha.test.ts` | 16 testes | PASS |
| ChannelDispatchService (Roteamento, PII Redact) | `packages/application/src/__tests__/channel-dispatch.service.test.ts` | 14 testes | PASS |
| ChannelHealthService (Evidência Allowlisted) | `packages/application/src/__tests__/channel-health.service.test.ts` | 13 testes | PASS |
| Pacote Application Completo | `packages/application/src/__tests__/*.test.ts` | 168 testes | PASS |

---
