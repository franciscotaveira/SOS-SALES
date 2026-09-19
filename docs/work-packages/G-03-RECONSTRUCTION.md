# G-03 — Plano Detalhado de Reconstrução e Separação de Checkpoints

> Nome do arquivo: `G-03-RECONSTRUCTION.md`  
> Estado: `ACCEPTED` — Concluído e homologado em 19 de setembro de 2026.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Rebaseline e Governança Soberana
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente QA Independente & Agente SRE/Security
- **Dependências:** `G-00 — Snapshot Bruto Recuperável` (ACCEPTED), `G-01 — Inventário e Rebaseline` (ACCEPTED), `G-02 — Governança Canônica` (ACCEPTED)
- **ADRs Vinculadas:** ADR-001 (Monorepo & Tooling), ADR-002 (Tenant Isolation), ADR-003 (Supabase JWKS Auth), ADR-004 (Testing Strategy & Hermetic DB), ADR-005 (Channel Gateway & Inbox/Outbox)

---

## Objetivo único

Definir com exatidão operacional, comandos reprodutíveis, isolamento hermético de worktree e matriz de gates sequenciais a coreografia de execução do pacote `G-04 — Separação e Reconstrução`, garantindo que as Iterações 2.7, 3 e 4 sejam desmembradas em checkpoints limpos e auditáveis a partir do commit consolidado `a4d9cf1` sem qualquer risco ao working tree original.

---

## Fora do escopo

- Executar qualquer mutação no working tree ativo de `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES`;
- Executar comandos de escrita Git (`git add`, `git commit`, `git reset`, `git checkout`, `git clean`) nesta fase preparatória;
- Alterar arquivos de código-fonte, scripts ou migrations;
- Realizar chamadas para VPS, Supabase remoto, Meta WABA, WAHA externo ou qualquer endpoint de rede externa;
- Iniciar prematuramente a extração física de arquivos de G-04 sem autorização do orquestrador.

---

## Arquivos sob ownership

1. `docs/work-packages/G-03-RECONSTRUCTION.md`
2. `docs/work-packages/G-03-EVIDENCE.json`
3. `docs/project/EXECUTION_BOARD.md` (atualização de estado de G-03 e G-04)
4. `docs/project/EVIDENCE_INDEX.md` (indexação formal de EV-G03-001)

---

## Fatos confirmados

- `[KNOWN]` O snapshot G-00 está aceito e preservado em `/Users/franciscotaveira.ads/Downloads/FT/.chat-sales-recovery/G-00/20260919T045737Z` com manifest canônico `EV-G00-001-v3.json` (`d268548...`).
- `[KNOWN]` O inventário G-01 catalogou 100% dos 149 arquivos modificados/não rastreados (19 Gov, 17 It 2.7, 64 It 3, 38 It 4, 11 Shared).
- `[KNOWN]` A governança G-02 homologou os 15 documentos de `docs/project/` sem discrepâncias factuais com o baseline.
- `[KNOWN]` O commit consolidado no histórico Git é `a4d9cf13ad8885f2948bf51e1048947845ec38b7` (Iteração 2.6).
- `[KNOWN]` A monorepo pnpm utiliza workspaces e exige regeneração determinística de lockfile via `pnpm install --lockfile-only` a cada mudança de dependências.

---

## Invariantes

1. **Custódia Absoluta do Working Tree:** O working tree original em `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES` permanece intocado até a homologação final de G-04.
2. **Ambiente de Trabalho Estéril:** Toda a reconstrução de G-04 deve ocorrer em um worktree temporário secundário (`../CHAT-SALES-REBUILD`) ancorado em `a4d9cf1`.
3. **Atomicidade e Independência de Checkpoints:** Cada checkpoint intermediário deve ser 100% funcional em seu escopo (compilação limpa, testes específicos passando, sem dependências fantasmas).
4. **Regeneração Determinística de Lockfile:** O arquivo `pnpm-lock.yaml` jamais será mesclado via diff de texto; ele será regenerado via CLI pnpm ao término da montagem de cada checkpoint.
5. **Fail-Closed Rollback:** Se qualquer teste ou gate de um checkpoint falhar durante G-04, a reconstrução é imediatamente interrompida e o worktree temporário é purgado.

---

## Fluxos e falhas

### 1. Fluxo de Execução de G-04 (Choreografia Operacional)

```text
[ Commit a4d9cf1 ] (Iteração 2.6)
       │
       ▼ (Passo 1: Setup Worktree Temporário)
[ Worktree: ../CHAT-SALES-REBUILD ]
       │
       ▼ (Passo 2: Checkpoint 1 — CP-GOV)
  - Copiar 19 arquivos de governança
  - Aplicar hunk do .gitignore
  - Validar links e schemas
  - Commit: "docs(gov): establish canonical project governance and G-00..G-03 artifacts"
       │
       ▼ (Passo 3: Checkpoint 2 — CP-2.7)
  - Copiar 17 arquivos da Iteração 2.7
  - Aplicar hunks cirúrgicos nos 10 arquivos compartilhados
  - pnpm install --lockfile-only
  - Executar Gates: pnpm typecheck + test:auth + test:db:run + test:api
  - Commit: "feat(auth): consolidate iteration 2.7 auth providers, test runner and db support"
       │
       ▼ (Passo 4: Checkpoint 3 — CP-3)
  - Copiar 64 arquivos da Iteração 3 (@sos-sales/ui, apps/web, browser qa)
  - Aplicar hunks correspondentes nos arquivos compartilhados
  - pnpm install --lockfile-only
  - Executar Gates: pnpm typecheck + test:ui + test:web + build + test:browser
  - Commit: "feat(ui): consolidate iteration 3 design system, appshell and web application"
       │
       ▼ (Passo 5: Checkpoint 4 — CP-4 Raw / Channels Foundation)
  - Copiar 38 arquivos da Iteração 4
  - Aplicar hunks correspondentes nos arquivos compartilhados
  - pnpm install --lockfile-only
  - Executar Gates: pnpm typecheck + suite de canais
  - Commit: "feat(channels): snapshot iteration 4 channels foundation pending CH-00..CH-12 remediation"
       │
       ▼ (Passo 6: Verificação de Paridade e Encerramento)
  - Diff com snapshot G-00: zero arquivos perdidos
  - Purgar worktree temporário
  - Atualizar branch principal sob supervisão do orquestrador
```

### 2. Modos de Falha e Procedimentos de Contingência

- **Falha de Compilação (`typecheck`):** Indica vazamento de import ou dependência não declarada no checkpoint atual. Ação: inspecionar imports cruzados e corrigir a atribuição do arquivo ou hunk antes de commitar.
- **Falha de Teste em Banco Efêmero:** O container postgres local ou pool do runner falhou. Ação: executar `pnpm test:db:dispose && pnpm test:db:bootstrap` e revalidar.
- **Divergência de Lockfile:** Conflito de resolução pnpm. Ação: limpar `node_modules` local no worktree temporário e rodar `pnpm install --frozen-lockfile=false --lockfile-only`.
- **Falha Irrecuperável:** Abortar imediatamente com `git worktree remove ../CHAT-SALES-REBUILD --force`. O working tree principal permanece 100% preservado.

---

## Critérios de aceite

- **AC-G03-001:** Coreografia operacional de G-04 documentada com comandos exatos, parâmetros e ordem sequencial.
- **AC-G03-002:** Mapeamento fechado de todos os 149 arquivos entre os 4 checkpoints, garantindo 100% de cobertura sem sobreposição em arquivos exclusivos.
- **AC-G03-003:** Estratégia cirúrgica para os 11 arquivos compartilhados detalhada hunk a hunk com atribuição explícita por checkpoint.
- **AC-G03-004:** Procedimento de regeneração determinística de `pnpm-lock.yaml` via pnpm CLI formalizado para cada checkpoint.
- **AC-G03-005:** Procedimento de rollback e contenção em worktree temporário estéril estabelecido com garantia de integridade do working tree original.
- **AC-G03-006:** Manifest canônico `G-03-EVIDENCE.json` estruturado, emitido e validado via `python3 -m json.tool`.

---

## Plano de testes e validação

- Validação estrutural do schema JSON: `python3 -m json.tool docs/work-packages/G-03-EVIDENCE.json` (exit code 0).
- Verificação cruzada entre o mapeamento de arquivos em `G-03-RECONSTRUCTION.md` e os arquivos catalogados em `G-01-INVENTORY.md` (garantia de soma 149).
- Inspeção de consistência entre a sequência de checkpoints proposta e o roadmap `docs/project/MASTER_ROADMAP.md`.

---

## Observabilidade

- Acompanhamento do progresso de G-04 via `git log --oneline --graph` no worktree temporário.
- Registro de logs completos de compilação, testes e diffs salvos em diretório de auditoria temporário de G-04.
- Registro de digests SHA-256 e commits resultantes em `G-04-EVIDENCE.json`.

---

## Migração e rollback

- **Rollback de G-03:** Remoção simples dos artefatos de documentação gerados em `docs/work-packages/G-03-*` e reversão dos índices de governança para o estado de G-02.
- **Rollback planejado para G-04:** Remoção forçada do worktree temporário (`git worktree remove --force ../CHAT-SALES-REBUILD`). O working tree original do repositório CHAT-SALES não sofrerá nenhuma mutação durante os testes de G-04.

---

## Gates

- **Gate G-03.1:** Plano operacional aprovado e detalhado.
- **Gate G-03.2:** Matriz de atribuição de arquivos fecha exatamente 149 itens.
- **Gate G-03.3:** Evidência JSON estruturada e indexada em `EVIDENCE_INDEX.md`.

---

## Limitações e riscos

- O pacote G-03 é estritamente analítico e normativo; ele não executa a separação física do código.
- O Checkpoint 4 gerado em G-04 conterá débitos de segurança e restrições conhecidas (P0/P1 da Iteração 4); esses débitos são formalmente isolados para saneamento controlado na esteira `CH-00..CH-12`.

---

## Parecer independente

O Agente QA Independente e o Agente SRE/Security revisaram a coreografia proposta em `G-03-RECONSTRUCTION.md`. A utilização de worktree secundário estéril ancorado no commit `a4d9cf1`, combinada à regeneração automática do lockfile e execução sequencial dos gates por checkpoint, foi considerada hermética e segura, atendendo plenamente aos requisitos de custódia e integridade do MCT OS v2.0.
