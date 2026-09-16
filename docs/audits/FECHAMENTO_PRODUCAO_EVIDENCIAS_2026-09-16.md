# Evidências do Fechamento de Produção — SOS Sales

**Data:** 16 de setembro de 2026
**Branch:** `codex/production-ca-fix`
**SHA da última rodada de builds:** `8cfb42ce3acd3e1e96cf48749298b739462d8794`
**Release ativa no VPS:** `68664732645c8b1a11a2467a48ba4f9382f0908f`

Este registro acompanha o primeiro pacote de execução do plano de fechamento. Ele separa o que foi comprovado localmente do que continua bloqueado por ambiente, CI ou aprovação de promoção.

## Estado dos gates

| Gate | Estado | Evidência | Limite da afirmação |
|---|---|---|---|
| G0 — verdade do produto | `PASS (local)` | Drawer de agenda sem roster, horários, preços, sincronização ou inserção de slot; teste de segurança dedicado; bundle contém `Disponibilidade indisponível` e não contém `Vagas Disponíveis`, `computeSmartDetectedSlots`, `HAVEN_STAFF_ROSTER` ou `onInsertSlotToDraft` | A agenda real ainda não existe; o recurso permanece indisponível |
| G1 — build e CI | `PARTIAL` | Typecheck, testes, builds e instalação frozen passam localmente; guard de SHA verde foi adicionado ao preflight | O SHA avaliado ainda não tem execução CI (`nenhuma execução de ci.yml`) e não pode ser promovido |
| G2 — integridade e segurança | `PARTIAL` | Progressão automática agora atualiza etapa e auditoria em uma instrução atômica; CORS usa allowlist; headers/CSP e Caddyfile entraram no pacote de release; runtime API da composição está em Node 22 | Supply chain, reconciliador de estados presos, varredura de secrets/imagens e matriz de autorização ainda pendentes |
| G3 — Docker Lab | `BLOCKED` | `docker info` não consegue acessar o socket local (`permission denied`) e o `APP_ENV=test npm --prefix apps/api run check` não consegue conectar ao banco de integração em `127.0.0.1:55432` | Nenhuma homologação integrada foi declarada |
| G4 — release candidate | `NO-GO` | Manifesto de build foi gerado, mas `AGENTS.md` já estava alterado fora deste pacote e o SHA não tem CI verde | Não há candidato imutável elegível |
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
- Lockfile reconciliado para instalação raiz frozen.
- CI ganhou suíte determinística de política de IA, dispatch manual para a bateria externa NIM e bloqueio de preflight para SHA sem run verde.
- `scripts/verify-ci-green.mjs` criado para validar o SHA exato no GitHub Actions.

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
| auditoria de contratos | `PASS — 98 chamadas frontend mapeadas de 98` |
| teste de CORS e progressão atômica | `PASS — allowlist e corrida concorrente cobertas` |
| layout de release do edge | `PASS — Caddyfile, headers e montagem no release verificados por script` |
| `git diff --check` | `PASS` |
| verificação do CI do SHA local | `NO-GO` — nenhuma execução de `ci.yml` encontrada para o SHA |

A auditoria de contratos ainda reporta achados existentes de escritas locais, imports de fixtures e resultados aleatórios. Eles não foram tratados como resolvidos por este pacote.

## Próxima decisão operacional

1. Disponibilizar o Docker daemon e subir o Docker Lab a partir do SHA candidato.
2. Corrigir os testes de integração que dependem do banco/Redis do Lab e executar a matriz dos cinco pilares.
3. Publicar o branch para gerar um novo run CI; só aceitar o SHA quando o workflow completo estiver verde.
4. Fechar os itens P1 de transação/idempotência, CORS/headers, supply chain e observabilidade.
5. Gerar o release candidate e pedir a aprovação humana antes de qualquer promoção.

Até esses pontos, a decisão é **NO-GO para promoção**. Nenhum arquivo, container ou configuração do VPS foi alterado neste ciclo.
