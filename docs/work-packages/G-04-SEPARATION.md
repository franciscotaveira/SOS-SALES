# G-04 — Separação e Reconstrução de Checkpoints

> Nome do arquivo: `G-04-SEPARATION.md`  
> Estado: `ACCEPTED` — Concluído e homologado em 19 de setembro de 2026.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Rebaseline e Governança Soberana
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente QA Independente & Agente SRE/Security
- **Dependências:** `G-00` (ACCEPTED), `G-01` (ACCEPTED), `G-02` (ACCEPTED), `G-03` (ACCEPTED)
- **ADRs Vinculadas:** ADR-001, ADR-002, ADR-003, ADR-004, ADR-005

---

## Objetivo único

Executar a separação física e hermética dos 149 arquivos do working tree atual em 4 checkpoints limpos, autocontidos e verificáveis sobre o commit consolidado `a4d9cf13ad8885f2948bf51e1048947845ec38b7` (Iteração 2.6), garantindo que cada checkpoint compile, passe nos testes do seu domínio e tenha o lockfile regenerado deterministicamente via pnpm CLI, sem contaminar os estágios anteriores com código de iterações futuras.

---

## Fora do escopo

- Alterar ou descartar arquivos do working tree original em `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES` antes da homologação de G-04;
- Conectar ou sincronizar com qualquer serviço externo (VPS, Supabase remoto, Meta, WAHA externo);
- Modificar regras funcionais ou adiantar o saneamento da esteira `CH-00..CH-12` (a Iteração 4 será preservada no Checkpoint 4 raw para tratamento posterior);
- Mesclar arquivos `pnpm-lock.yaml` manualmente via diff.

---

## Arquivos sob ownership

1. **Checkpoint 1 (CP-GOV — 19 arquivos exclusivos + 1 compartilhado):**
   - Documentação de governança (`docs/project/*`, `docs/work-packages/*`)
   - `.gitignore`
2. **Checkpoint 2 (CP-2.7 — 17 arquivos exclusivos + 10 compartilhados):**
   - Auth vertical slice, Local JWT, Supabase JWKS, runner de banco hermético (`scripts/test-db-runner.ts`, `packages/database/src/test-support.ts`)
   - Hunks correspondentes em `.env.example`, `apps/api/src/index.ts`, `docker-compose.yml`, `package.json`, etc.
3. **Checkpoint 3 (CP-3 — 64 arquivos exclusivos + 2 compartilhados):**
   - Pacote `@sos-sales/ui`, aplicação `apps/web/`, scripts de browser QA (`scripts/verify-browser-qa.mjs`)
   - Hunks correspondentes em `package.json` e `apps/web/package.json`.
4. **Checkpoint 4 (CP-4 — 38 arquivos exclusivos + 6 compartilhados):**
   - Pacote de Canais, adaptadores WhatsApp, Transactional Inbox/Outbox, Migration 005, Ingress Fastify e Worker poller.
5. **Artefatos de Governança de G-04:**
   - `docs/work-packages/G-04-SEPARATION.md`
   - `docs/work-packages/G-04-EVIDENCE.json`

---

## Fatos confirmados

- `[KNOWN]` G-00 a G-03 estão formalmente `ACCEPTED` com manifests auditados.
- `[KNOWN]` O commit base imutável é `a4d9cf13ad8885f2948bf51e1048947845ec38b7`.
- `[KNOWN]` O snapshot bruto em `/Users/franciscotaveira.ads/Downloads/FT/.chat-sales-recovery/G-00/20260919T045737Z` protege 100% dos dados caso seja necessário rollback.
- `[KNOWN]` A separação ocorre em ambiente isolado (worktree temporário `../.chat-sales-recovery/G-04-rebuild` ou branch estéril).

---

## Invariantes

1. **Custódia Total:** O working tree do repositório principal permanece intocado durante a execução dos checkpoints intermediários.
2. **Atomicidade de Checkpoints:** Cada commit gerado deve passar nos seus respectivos testes antes de prosseguir para o próximo checkpoint.
3. **Lockfile Determinístico:** O arquivo `pnpm-lock.yaml` é recalculado via `pnpm install --lockfile-only` em cada estágio de código.
4. **Isolamento de Canais:** O código da Iteração 4 é isolado como ponto de partida da esteira `CH-00..CH-12` sem bloquear o baseline limpo das Iterações 2.7 e 3.

---

## Fluxos e falhas

- **Fluxo Normal:**
  1. Criação do worktree isolado ancorado no commit `a4d9cf1`.
  2. Montagem e commit do Checkpoint 1 (`CP-GOV`).
  3. Montagem, regeneração de lockfile, testes e commit do Checkpoint 2 (`CP-2.7`).
  4. Montagem, regeneração de lockfile, testes de UI/build e commit do Checkpoint 3 (`CP-3`).
  5. Montagem, regeneração de lockfile e commit do Checkpoint 4 (`CP-4`).
  6. Validação de paridade total contra o snapshot G-00.
  7. Emissão do manifesto `G-04-EVIDENCE.json`.
- **Fluxo de Falha:** Qualquer falha em testes ou gates interrompe o processo imediatamente. O worktree de rebuild é descartado e o estado original de CHAT-SALES permanece 100% íntegro.

---

## Critérios de aceite

- **AC-G04-001:** Checkpoint 1 (`CP-GOV`) criado com os 19 arquivos de governança e `.gitignore`, sem inclusão de código ou binários.
- **AC-G04-002:** Checkpoint 2 (`CP-2.7`) criado com os 17 arquivos exclusivos e hunks de Auth/Test-Support, passando em `pnpm typecheck`, testes de auth e testes de banco hermético.
- **AC-G04-003:** Checkpoint 3 (`CP-3`) criado com os 64 arquivos de UI/Web, passando em `pnpm typecheck`, testes de componentes, build web e browser QA.
- **AC-G04-004:** Checkpoint 4 (`CP-4`) criado com os 38 arquivos de canais e hunks correspondentes, isolado para a esteira `CH-00..CH-12`.
- **AC-G04-005:** `pnpm-lock.yaml` regenerado deterministicamente em cada checkpoint de código.
- **AC-G04-006:** Manifest `G-04-EVIDENCE.json` emitido com os SHAs dos 4 commits gerados e confirmação de paridade com o snapshot G-00.

---

## Plano de testes e validação

- **CP-GOV:** `git status` limpo, validação de links markdown e validação JSON de manifests.
- **CP-2.7:** `pnpm install --lockfile-only`, `pnpm typecheck`, `pnpm --filter @sos-sales/auth test`, `pnpm --filter @sos-sales/database test:db:run`.
- **CP-3:** `pnpm install --lockfile-only`, `pnpm typecheck`, `pnpm --filter @sos-sales/ui test`, `pnpm --filter @sos-sales/web test`, `pnpm build`, `node scripts/verify-browser-qa.mjs`.
- **CP-4:** `pnpm install --lockfile-only`, `pnpm typecheck`.

---

## Observabilidade

- Registro dos SHAs e mensagens dos commits criados.
- Relatório de paridade com o snapshot G-00 anexado ao manifesto de evidência.

---

## Migração e rollback

- Descarte imediato do worktree de reconstrução com `git worktree remove --force <path>` caso qualquer teste falhe.
- O snapshot G-00 em `/Users/franciscotaveira.ads/Downloads/FT/.chat-sales-recovery/G-00/20260919T045737Z` garante restauração em menos de 10 segundos.

---

## Gates

- **Gate G-04.1:** Checkpoint 1 compilável e documentado.
- **Gate G-04.2:** Checkpoint 2 verde (Auth + DB hermético).
- **Gate G-04.3:** Checkpoint 3 verde (UI + Web + Browser QA).
- **Gate G-04.4:** Checkpoint 4 isolado e pronto para CH-00..CH-12.

---

## Limitações e riscos

- O Checkpoint 4 contém débitos de segurança documentados que serão sanados na esteira CH-00..CH-12.
- Nenhuma dependência externa de produção é invocada durante a validação.

---

## Parecer independente

A separação dos checkpoints em worktree secundário estéril sobre `a4d9cf1` atende rigorosamente aos princípios de custódia e separação de domínios do Sovereign Kernel v2.0.
