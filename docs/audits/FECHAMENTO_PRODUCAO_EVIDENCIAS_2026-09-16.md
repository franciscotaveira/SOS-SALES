# Evidências do Fechamento de Produção — SOS Sales

**Data:** 16 de setembro de 2026
**Branch:** `codex/production-ca-fix`
**SHA da última rodada de builds:** `6df8df3d69180e11ec26343a7b8e9da0d3a2c66e` (manifesto gerado no build local; árvore continua suja por `AGENTS.md` pré-existente)
**Release ativa no VPS:** `68664732645c8b1a11a2467a48ba4f9382f0908f`

Este registro acompanha o primeiro pacote de execução do plano de fechamento. Ele separa o que foi comprovado localmente do que continua bloqueado por ambiente, CI ou aprovação de promoção.

## Estado dos gates

| Gate | Estado | Evidência | Limite da afirmação |
|---|---|---|---|
| G0 — verdade do produto | `PASS (local)` | Drawer de agenda sem roster, horários, preços, sincronização ou inserção de slot; teste de segurança dedicado; bundle contém `Disponibilidade indisponível` e não contém `Vagas Disponíveis`, `computeSmartDetectedSlots`, `HAVEN_STAFF_ROSTER` ou `onInsertSlotToDraft` | A agenda real ainda não existe; o recurso permanece indisponível |
| G1 — build e CI | `PARTIAL` | Typecheck, testes, builds, `bun install --frozen-lockfile` e simulação de `npm ci` passam localmente; guard de SHA verde foi adicionado ao preflight | A consulta do run exato falhou por indisponibilidade do GitHub API; não existe prova de CI verde e o SHA não pode ser promovido |
| G2 — integridade e segurança | `PARTIAL` | Progressão automática agora atualiza etapa e auditoria em uma instrução atômica; CORS usa allowlist; headers/CSP e Caddyfile entraram no pacote de release; runtime API está em Node 22; WAHA e Redis usam digest revisado; cliente Redis reconecta com backoff após perda; dependência raiz `express` sem uso foi removida | Caddy ainda não foi validado pelo binário e segue com tag flutuante; reconciliador de estados presos, varredura de secrets/imagens e matriz de autorização ainda pendentes |
| G3 — Docker Lab | `PASS (local Lab)` | Docker Lab reconstruído e saudável; `/health` e `/ready` 200; `APP_ENV=test npm --prefix apps/api run check` passou com `92 arquivos / 641 testes`; smoke Lab `13/13`; auditoria autenticada de rotas `10/10`; canário Receptionist `10/10`; WAHA E2E confirmou autenticação, envelope persistido, deduplicação e publicação do worker | Não prova provedor Meta/NVIDIA real, agenda externa real, volume de 50 conversas ou operação multi-tenant de produção |
| G4 — release candidate | `NO-GO` | Build frontend/API e manifesto foram gerados no SHA `6df8df3`; `AGENTS.md` já estava alterado fora deste pacote e o SHA ainda não tem CI verde confirmado | O artefato local é reproduzível, mas não é elegível para promoção |
| G5–G7 — promoção/canário/plena | `NOT RUN` | Nenhuma ação de VPS foi executada nesta etapa | Produção permanece na release ativa anterior |

## Alterações executadas

- Agenda externa colocada em modo fail-closed e link-only em `src/components/cockpit/ExternalAgendaDrawer.tsx`.
- Props de contexto e inserção automática removidas de `src/components/cockpit/LiveCockpitView.tsx`.
- Regressão de segurança adicionada em `src/components/cockpit/ExternalAgendaDrawer.production-safety.test.ts`.
- Fallback do Receptionist tipado e humanizado em `apps/api/src/interfaces/http/routes/agent-routes.ts`.
- Progressão automática protegida por atualização monotônica, lock de linha e evento de auditoria na mesma instrução SQL em `apps/api/src/application/services/pipeline-auto-progression-engine.ts`.
- CORS restrito às origens oficiais/configuradas e coberto por teste de origem permitida e arbitrária.
- Headers de segurança/CSP versionados no `deploy/Caddyfile`; o arquivo passou a ser copiado e montado dentro do release imutável.
- Runtime da API no compose de produção alinhado para Node 22, mesma major usada no CI.
- Imagem WAHA fixada por digest nos três composes Lab/produção e dependência raiz `express` removida dos manifests/lockfiles.
- Lockfile reconciliado para instalação raiz frozen.
- CI ganhou suíte determinística de política de IA, dispatch manual para a bateria externa NIM e bloqueio de preflight para SHA sem run verde.
- `scripts/verify-ci-green.mjs` criado para validar o SHA exato no GitHub Actions.
- `scripts/verify-waha-webhook-e2e.mjs` alinhado ao contrato durável atual: valida 401 sem chave, persistência do envelope, deduplicação por `provider_event_id`, normalização e `outbox_events=PUBLISHED`, com limpeza segura dos fixtures.
- Cliente Redis da API deixou de desabilitar reconexão após perda de socket; o Lab comprovou degradação 503 durante a parada e recuperação 200 sem reinício da API.

## Validações executadas

| Verificação | Resultado |
|---|---:|
| `npm test` na raiz | `PASS — 11 arquivos / 30 testes` |
| testes de segurança da agenda + cockpit | `PASS — 2 arquivos / 11 testes` |
| `npm run lint` | `PASS` |
| testes unitários da API | `PASS — 52 arquivos / 390 testes` |
| build frontend de produção | `PASS` |
| build API de produção | `PASS` |
| `bun install --frozen-lockfile` | `PASS` |
| `npm ci --ignore-scripts --dry-run` | `PASS — lockfile reconciliado; remoção esperada do Express sem uso` |
| auditoria de contratos | `PASS — 98 chamadas frontend mapeadas de 98` |
| teste de CORS e progressão atômica | `PASS — allowlist e corrida concorrente cobertas` |
| layout de release do edge | `PASS — Caddyfile, headers e montagem no release verificados por script` |
| `git diff --check` | `PASS` |
| verificação do CI do SHA local | `NO-GO` — `gh run list` não conseguiu consultar `api.github.com`; CI verde do SHA permanece não comprovado |
| `APP_ENV=test npm --prefix apps/api run check` no Lab | `PASS — 92 arquivos / 641 testes` |
| smoke Lab (`scripts/smoke-test.sh`) | `PASS — 13/13 checks` |
| auditoria autenticada (`scripts/test-e2e-all-routes.js`) | `PASS — 10/10 rotas; cleanup pristine` |
| canário Receptionist (`npx tsx scripts/validate-lab-receptionist-canary.mjs`) | `PASS — 10/10 passos; cleanup pristine` |
| WAHA webhook E2E (`scripts/verify-waha-webhook-e2e.mjs`) | `PASS — 401, envelope, idempotência, worker e tenant fence` |
| CAPI/CTWA direcionado | `PASS — 23 testes em 3 arquivos (dispatch, atribuição CTWA e regressão de entrega)` |
| WhatsApp Flows crypto (`scripts/test-flows-crypto.mjs`) | `PASS — round-trip RSA/AES-GCM e resposta bidirecional` |
| arsenal WABA (`scripts/test-waba-arsenal.mjs`) | `PASS — contratos/payloads montados sob alvo Lab; sem envio Meta real` |
| perda/retorno do Redis no Lab | `PASS — readiness 503 durante parada e 200 após retorno, sem reiniciar a API` |

A auditoria de contratos ainda reporta achados existentes de escritas locais, imports de fixtures e resultados aleatórios. Eles não foram tratados como resolvidos por este pacote.

## Cinco pilares — estado comprovado no Lab

| Pilar | Estado | Evidência atual | Limite da afirmação |
|---|---|---|---|
| 1. WhatsApp + Cockpit + Funil | `PASS (Lab automatizado)` | Rotas autenticadas `10/10`; WAHA E2E com persistência, deduplicação, normalização e outbox publicado; suíte completa da API verde | Não houve teste com telefone real, mídia real ou carga de 50 conversas |
| 2. Meta Ads + CAPI | `PARTIAL (contrato local)` | 23 testes direcionados cobrem hash, `event_id`, outbox, retry/DLQ, CTWA e gateway Graph mockado | Não há receipt no Meta Test Events/Event Manager; não enviar evento externo sem credencial e aprovação |
| 3. Receptionist + handoff | `PASS (Lab canário)` | 10 passos de fail-closed, greeting, pedido humano, pausa/retomada, desativação e reconciliação | NVIDIA NIM não foi chamado; latência/provedor externo permanecem não verificados |
| 4. Agenda externa | `BLOCKED / CONTIDA` | UI fail-closed e link-only; estado honesto de indisponibilidade | Adaptador e resposta de provedor real ainda não existem; não declarar MVP 5/5 |
| 5. WAHA + WABA | `PASS (contrato local)` | WAHA E2E real no Lab; Flows crypto round-trip; arsenal WABA gera payloads tipados | Entrega Meta WABA, callbacks, mídia e interativos reais ainda não foram confirmados |

## Próxima decisão operacional

1. Publicar o branch para gerar um run CI do SHA `0850087`; só aceitar o SHA quando o workflow completo estiver verde.
2. Obter confirmação controlada de Meta Test Events e NVIDIA NIM, ou registrar formalmente os pilares como parciais.
3. Definir contrato e sandbox de agenda; até lá, manter o pilar 4 bloqueado e a UI indisponível.
4. Fechar os itens P1 ainda abertos: Caddy validado pelo binário, tags flutuantes de Redis/Caddy, scan de secrets/imagens, reconciliador de `SENDING` e matriz RBAC/multi-tenant.
5. Resolver a árvore suja de `AGENTS.md`, gerar o release candidate imutável e pedir aprovação humana antes de qualquer promoção.

Até esses pontos, a decisão é **NO-GO para promoção**. Nenhum arquivo, container ou configuração do VPS foi alterado neste ciclo.
