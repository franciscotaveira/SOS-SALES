# Auditoria de verdade funcional — Kanban — 2026-08-26

## Escopo e evidência

Auditoria estática do `LiveCommercialKanbanView`, `SalesOsGateway` e rota Fastify de operações de jornada. Nenhuma alteração foi feita no VPS e nenhum dado de negócio foi mutado. A leitura foi feita sobre a branch local de reconciliação do VPS.

## Matriz de capacidades

| Capacidade visível | Caminho | Estado | Evidência / risco |
|---|---|---|---|
| Carregar jornadas | UI → `listJourneys`/`getJourneys` → API | PASS | Gateway HTTP possui leitura autenticada; fallback de mapeamento perde campos, mas não inventa sucesso de leitura. |
| Arrastar card entre colunas | UI → `setJourneyStage` → `PATCH /workspaces/:workspaceId/journeys/:journeyId/stage` | PASS após correção | Rota exige ator, UUID, estágio permitido e `idempotency-key`. Antes, se o gateway não tivesse mutação, a UI ainda atualizava estado local; agora falha explicitamente. |
| Avançar/voltar etapa | Mesmo contrato PATCH | PASS após correção | Mesmo limite de validação; retorno local só ocorre depois de resposta bem-sucedida. |
| Novo Lead | UI → `StartConversationModal` | UNVERIFIED | O componente dispara fluxo próprio; precisa de teste autenticado específico para provar criação persistida. |
| Buscar no funil | Filtro em memória sobre jornadas carregadas | PASS (escopo local) | Não é busca server-side; limite de 150 jornadas pode ocultar resultados fora da página. |
| Personalizar etapas | `localStorage` | FAIL / UX enganosa | Persistência é apenas no navegador, não workspace/backend; outro operador/dispositivo não vê a alteração. Deve ser rotulada como local ou substituída por contrato persistido. |
| KPIs financeiros / preço dos cards | `detectKanbanService` | FAIL corrigido | Valores fixos por nome/serviço não tinham origem em `ApiJourney`; removida a inferência monetária. Exibe `Valor não informado` e KPIs zerados até existir campo persistido. |
| Atualizar | refaz leitura da API | PASS | Erros ficam visíveis; não altera dados. |
| Realtime / polling | Supabase `postgres_changes` + 10s | UNVERIFIED | Código existe, mas não houve runtime autenticado nesta auditoria para provar recebimento e reconciliação. |

## Findings

### P0 — Inferência financeira sem fonte de verdade (corrigido)

O Kanban exibia R$ 85/R$ 150/R$ 380 etc. derivados de nome ou texto do serviço. `ApiJourney` não fornece preço estimado no projection list. Isso podia induzir decisão comercial e contaminar pipeline/conversão. A correção remove todos os valores hardcoded; valores só devem voltar quando vierem de campo persistido e identificado.

### P0 — Falso sucesso quando mutação não existia (corrigido)

`updateStageDirectly` atualizava `journeys` localmente mesmo sem `setJourneyStage` ou `transitionJourneyStage`. Agora lança erro e não altera estado local sem confirmação da API.

### P1 — Personalização de etapas somente local (aberto)

`handleCustomizePipeline` grava em `localStorage`. Não existe contrato persistido para nomes de colunas no caminho auditado. A UI promete personalização do funil, mas o estado não é compartilhado nem auditável.

## Reteste recomendado

1. Teste autenticado com jornada descartável: mover por drag, confirmar PATCH, reler e conferir estágio persistido; repetir a mesma operação com a mesma chave para idempotência.
2. Teste negativo cross-workspace e sem token: confirmar 401/404 sem mudança.
3. Confirmar endpoint e persistência do `StartConversationModal`.
4. Decidir contrato backend para nomes de colunas antes de expor personalização como recurso multiusuário.

## Decisão

O escopo Kanban não deve ser considerado `PRODUCTION_READY_IN_AUDITED_SCOPE` enquanto personalização, criação de lead e realtime não tiverem evidência de runtime autenticado. As duas fontes de falso sucesso identificadas foram removidas no código local; deploy não realizado.
