# DECISIONS.md — Registro de Decisões Técnicas

> **Regra do Contrato:** Registro de escolhas arquiteturais reversíveis, premissas assumidas e justificativas.

---

### D-001: Correção Imediata do Hotfix F1.1-C.1 antes de Iniciar a Fase E2
- **Data:** 2026-09-29T02:50:00-03:00
- **Contexto:** A revisão independente de `c8f5a09` apontou dois bloqueadores P0: imutabilidade de estados terminais e replay idempotente dependente de estado mutável posterior da conversa.
- **Decisão:** Executar F1.1-C.1 como Milestone M1 imediatamente, garantindo que o contrato de sugestões esteja 100% sólido antes de acoplá-lo com a Próxima Ação Comercial em E2 (Milestone M5).
- **Justificativa:** Construir a Próxima Ação sobre um repositório de sugestões com falhas de concorrência ou mutação indevida geraria retrabalho em cascata.

---

### D-002: Replay Idempotente com Fingerprint Estável Baseado no Input do Cliente
- **Data:** 2026-09-29T02:50:00-03:00
- **Contexto:** O fingerprint atual incluía `candidateRevision` ou valores derivados do servidor. Se uma nova mensagem chegasse após uma criação bem-sucedida, uma repetição com a mesma chave falhava em `CANDIDATE_STALE`.
- **Decisão:** Na criação (`createIntegrationSuggestion`), consultar primeiro se `idempotency_key` já existe no workspace. Se existir:
  1. Comparar o fingerprint lógico do input do cliente (título, corpo, evidências, prioridade, draftMessage e candidateRevision informado).
  2. Se coincidir: retornar a linha existente imediatamente com `created: false`, sem mutação, sem revalidar cooldown e sem revalidar se a thread recebeu novas mensagens depois.
  3. Se divergir: lançar `SuggestionIdempotencyConflictError` (HTTP 409).
- **Justificativa:** Idempotência é a garantia de que a repetição de uma operação previamente aceita retorna o mesmo resultado seguro.

---

### D-003: Alinhamento de Contrato de Canais, I/O Real em Teste de Conexão e Isolamento Tenant no CAPI
- **Data:** 2026-09-29T03:25:00-03:00
- **Contexto:** 
  1. A rota `createChannel` devolvia `webhookToken` e `webhookUrl` aninhados em `channel`, enquanto a UI esperava também na raiz da resposta.
  2. O teste de conexão de WAHA/Evolution retornava sucesso estático simulado sem I/O e sem validação SSRF.
  3. Havia chave de criptografia de fallback estática em `channels.routes.ts`.
  4. O dispatcher de Meta CAPI utilizava credenciais globais em vez de buscar `provider_credentials` do workspace, e callbacks de lease expirado podiam sobrescrever eventos terminais.
  5. O formulário WABA no frontend não expunha campo para `appSecret`.
- **Decisão:**
  1. Devolver `webhookToken` e `webhookUrl` tanto na raiz do JSON quanto dentro de `channel` (retrocompatibilidade e contrato alinhado).
  2. Implementar validação SSRF estrita (`validateWahaBaseUrl`, `validateEvolutionBaseUrl`) e requisições HTTP reais com timeout no teste de conexão (Truth in Data: zero mock de sucesso).
  3. Fazer o fallback de chave de criptografia falhar fechado com erro fatal de configuração fora do ambiente de teste (`NODE_ENV === "test"` ou `VITEST`).
  4. Em `CapiDispatcher`, resolver credenciais específicas do workspace via transação de worker RLS (`withWorkerTransaction`) antes de consultar defaults globais.
  5. Em `markConversionEventResult`, adicionar `AND status IN ('QUEUED', 'PROCESSING')` na cláusula WHERE para assegurar imutabilidade de estados terminais contra workers atrasados.
  6. Adicionar campo e estado para `appSecret` no assistente WABA de `SettingsPage.tsx`.
- **Justificativa:** Conformidade integral com o princípio soberano MCT de Truth in Data, fail-closed criptográfico e isolamento estrito entre tenants.

---

### D-004: Snapshot Imutável de Catálogo em Propostas Comerciais e Separação entre Conferência Manual e Liquidação Bancária
- **Data:** 2026-09-29T04:20:00-03:00
- **Contexto:** Propostas comerciais precisam manter integridade jurídica e histórica, mesmo que preços de produtos no catálogo sejam reajustados posteriormente. Cobranças Pix no modelo de varejo/serviço local operam frequentemente com conferência manual de extrato/comprovante antes ou sem liquidação bancária automática via webhook de PSP.
- **Decisão:**
  1. Criar `commercial_proposals` com snapshot JSONB `items` contendo título, preço unitário e quantidade vigentes no momento da emissão, calculando e persistindo `total_cents` de forma imutável.
  2. Adicionar coluna `proposal_id` em `pix_charges` vinculando formalmente a cobrança à proposta comercial.
  3. Implementar `confirmPixChargeManual`: transição para status `PAID` com método `MANUAL_CASHIER`, notas de conferência e identificação do operador responsável, sem disparar falsos eventos de liquidação automática ou webhook de conversão implícito.
  4. Exigir obrigatoriamente motivo formal (`REASON_REQUIRED`) para desfechos comerciais de perda (`status === 'lost'`).
- **Justificativa:** Verdade nos dados e fidelidade contábil estrita: nunca misturar confirmação de caixa manual com liquidação bancária de ponta a ponta sem recibo de PSP.

---

### D-005: Onboarding Seguro de Canais com Cofre Criptográfico em Memória e Badging Transparente de Homologação
- **Data:** 2026-09-29T04:32:00-03:00
- **Contexto:** Provedores de WhatsApp (Meta WABA Oficial e WAHA Local) possuem níveis de homologação e riscos distintos. Credenciais e tokens não podem vazar para o cliente ou para outros workspaces.
- **Decisão:**
  1. Endpoint de QR code do WAHA realiza decriptação em memória via cofre AES-256-GCM, validação SSRF estrita do endpoint e retorna exclusivamente imagem SVG/Data URI sem imprimir ou expor API keys.
  2. Implementação de endpoint dedicado de revogação (`POST .../revoke`) que inativa o canal, revoga a credencial e gera evento imutável em `audit_events`.
  3. Badging explícito na UI: distinção clara entre canal "Homologado Oficial" (WABA em esmeralda) e "Laboratório Local" (WAHA em violeta).
- **Justificativa:** Segurança em profundidade (least privilege), zero vazamento de segredos de canal e clareza visual para o operador.

---

### D-006: Resiliência de Worker sem Duplicação em Canais Externos e Rollback via Expand-Contract
- **Data:** 2026-09-29T04:40:00-03:00
- **Contexto:** Em caso de crash súbito de worker (SIGKILL / OOM) durante o envio de uma mensagem para a API de WhatsApp, a retomada cega do lease expirado poderia gerar duplicação de mensagens para o cliente final caso o provedor já tivesse despachado a requisição anterior.
- **Decisão:**
  1. Ao recuperar lease expirado no outbox worker, marcar o comando como `reconciliation_required` em vez de retentar envio direto, exigindo verificação de recibo externo (`externalMessageId`).
  2. Definir runbook de rollback estritamente baseado no padrão expand-contract (feature flags e roteamento de tráfego), sem down-migrations DDL destrutivas.
  3. Construir ferramenta automatizada de dry-run (`scripts/migration-v2-to-v3-dryrun.ts`) para auditoria de pré-requisitos antes de migração real.
- **Justificativa:** No WhatsApp comercial, enviar mensagem duplicada destrói a confiança do cliente; o estado de reconciliação governada garante integridade absoluta.

---

### D-007: Ensaio Sintético Haven 100% Nativo sem n8n e Declaração VERIFIED_DOCKER_LAB
- **Data:** 2026-09-29T05:10:00-03:00
- **Contexto:** O projeto necessita comprovar capacidade integral de operação e execução dos percursos P1 a P8 de ponta a ponta sem qualquer dependência de n8n, com containers Docker reais operando em harmonia.
- **Decisão:**
  1. Implementar suíte E2E integrada (`apps/api/src/__tests__/e2e-integrated-p1-p8-haven.test.ts`) contendo todas as 8 etapas comerciais reais da Haven Escovaria (Catálogo 24 serviços -> Proposta imutável -> Próxima Ação E2 -> Pix EMV -> Conferência Manual -> Desfecho WON -> Trilha de Auditoria).
  2. Aplicar todas as 21 migrations com garantia de idempotência no banco de dados de desenvolvimento (`sos_sales_v3`).
  3. Validar a execução completa contra os containers `sos-v3-api`, `sos-v3-worker`, `sos-v3-web`, `sos-v3-postgres` e `sos-v3-redis` em portas locais mapeadas, sem interferir em containers de terceiros.
  4. Executar os 6 quality gates seriais em verde e emitir a declaração formal de conclusão `VERIFIED_DOCKER_LAB`.
- **Justificativa:** Cumprimento rigoroso do mandato de autonomia do MCT OS v2.0 com Truth in Data e soberania tecnológica.

