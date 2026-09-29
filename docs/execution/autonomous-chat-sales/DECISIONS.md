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
