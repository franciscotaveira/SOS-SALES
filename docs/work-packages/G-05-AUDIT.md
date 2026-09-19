# G-05 — Auditoria Retrospectiva 1–2.6 e Revalidação das Iterações 2.7 e 3

> Nome do arquivo: `G-05-AUDIT.md`  
> Estado: `ACCEPTED` — Concluído e homologado em 19 de setembro de 2026.

---

## Identidade

- **Parent objective:** Programa SOS Sales V3 — Rebaseline e Governança Soberana
- **Estado:** `ACCEPTED`
- **Owner:** Gemini 3.8 (Executor Principal)
- **Reviewer:** Agente QA Independente & Agente SRE/Security
- **Dependências:** `G-00`, `G-01`, `G-02`, `G-03`, `G-04` (todos ACCEPTED)
- **ADRs Vinculadas:** ADR-001 (Monorepo & MVP Frontier), ADR-002 (Auth Strategy & Tenancy), ADR-003 (Secrets Lifecycle), ADR-004 (Testing Strategy & Hermetic DB), ADR-005 (Channel Gateway)

---

## Objetivo único

Auditar retrospectivamente cada um dos commits da história consolidada (`2f6a134`, `28b9843`, `4483f49`, `a4d9cf1`) e revalidar formalmente os novos checkpoints atômicos das Iterações 2.7 (`a41e1ab`) e 3 (`0605dff`) sob os padrões do Sovereign Kernel v2.0, emitindo manifests de evidência canônicos com rastreabilidade por SHA e encerrando a fase de auditoria retrospectiva da monorepo SOS Sales V3.

---

## Fora do escopo

- Alterar ou reescrever o histórico Git da branch consolidada `main`;
- Modificar o código funcional da Iteração 4 (isolado em `d4de6ca` para a esteira `CH-00..CH-12`);
- Executar conexões de rede para serviços externos ou produção;
- Adicionar novas funcionalidades ou dependências fora do escopo auditado.

---

## Arquivos sob ownership

1. `docs/work-packages/G-05-AUDIT.md`
2. `docs/work-packages/G-05-EVIDENCE.json`
3. `docs/project/EVIDENCE_INDEX.md` (atualização dos manifests de IT-01 a IT-03 e G-05)
4. `docs/project/EXECUTION_BOARD.md` (promoção das macrofases e transição para G-06)

---

## Fatos confirmados

- `[KNOWN]` Commit `2f6a134` inicializou a monorepo greenfield SOS Sales V3 com Turbo, pnpm workspaces, Fastify, Docker Compose e migration inicial 001.
- `[KNOWN]` Commit `28b9843` implementou o modelo de isolamento tenant-first com migration 002 (FORCE RLS), papéis dedicados `sos_app_user` e `sos_migration_owner`, e pacote `@sos-sales/auth`.
- `[KNOWN]` Commit `4483f49` implementou o vertical slice autenticado com validação JWT Bearer, plugin Fastify, resolução de workspace tamper-proof via header `X-Workspace-Id` e migration 003.
- `[KNOWN]` Commit `a4d9cf1` concluiu o hardening de segurança (ADR-002), eliminando segredos hardcoded, migrando para biblioteca RFC 7519 (`jose`), introduzindo Supabase JWKS provider e migration 004 (imutabilidade de auditoria).
- `[KNOWN]` Commit `a41e1ab` (Checkpoint CP-2.7) estabeleceu o runner hermético de banco em container efêmero, eliminação de trigger disabling e 90 testes passando com descarte limpo.
- `[KNOWN]` Commit `0605dff` (Checkpoint CP-3) consolidou o Design System `@sos-sales/ui`, tokens de acessibilidade WCAG 2.2 AA, aplicação Web React com Vite e testes de concorrência/sessão.

---

## Invariantes

1. **Rastreabilidade por SHA:** Toda evidência formal deve estar vinculada a um commit SHA específico e imutável no histórico Git.
2. **Fail-Closed em Segurança:** Nenhum provider de autenticação pode permitir token não assinado (`alg: none`), sem expiração (`exp`) ou sem subject (`sub`) no formato UUID v4.
3. **Isolamento de Tenant Incondicional:** Toda consulta no banco sob `sos_app_user` exige `SET LOCAL app.current_workspace_id`, com FORCE RLS ativado em 100% das tabelas tenant-owned.
4. **Imutabilidade de Auditoria:** A tabela `audit_events` rejeita incondicionalmente comandos `TRUNCATE`, `UPDATE` ou `DELETE` em nível de motor e privilégios.

---

## Fluxos e falhas

### Resumo dos Commits Auditados

| Iteração | Commit SHA | Escopo Principal | ADRs | Testes Verificados | Status da Auditoria |
|---|---|---|---|---|---|
| **Iteração 1** | `2f6a134` | Monorepo Turbo, Fastify básico, Docker, Migration 001 | ADR-001 | 3 suites de domínio e liveness probe | `ACCEPTED` (Retrospectivo) |
| **Iteração 2** | `28b9843` | Migration 002, FORCE RLS, papéis DB, `@sos-sales/auth` | ADR-002, ADR-003 | Testes de isolamento tenant e RBAC | `ACCEPTED` (Retrospectivo) |
| **Iteração 2.5** | `4483f49` | Vertical Slice /v1/me e /v1/workspaces, Migration 003 | ADR-002 | 37 testes de integração Fastify + DB | `ACCEPTED` (Retrospectivo) |
| **Iteração 2.6** | `a4d9cf1` | Hardening JWT/JWKS, Migration 004 (Audit Immutability) | ADR-002, ADR-004 | 51 testes monorepo, cenários de ataque | `ACCEPTED` (Retrospectivo) |
| **Iteração 2.7** | `a41e1ab` | Runner hermético, isolamento estrito de DB, sanitização | ADR-004 | 23 testes auth + 90 testes de DB runner | `ACCEPTED` (Revalidado) |
| **Iteração 3** | `0605dff` | Design System `@sos-sales/ui`, Web App, Browser QA | ADR-001 | 20 testes UI + 14 testes Web + build | `ACCEPTED` (Revalidado) |

---

## Critérios de aceite

- **AC-G05-001:** Auditoria técnica de cada commit histórico (`2f6a134`, `28b9843`, `4483f49`, `a4d9cf1`) documentada com escopo, ADRs vinculadas e garantias verificadas.
- **AC-G05-002:** Revalidação formal dos novos checkpoints atômicos das Iterações 2.7 (`a41e1ab`) e 3 (`0605dff`) com exit code 0 em seus gates.
- **AC-G05-003:** Invariantes de segurança (FORCE RLS, imutabilidade de auditoria, ausência de senhas estáticas no código de aplicação) atestadas em todos os checkpoints.
- **AC-G05-004:** Macrofases do [EXECUTION_BOARD.md](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/project/EXECUTION_BOARD.md) atualizadas de `IN_REVIEW` para `ACCEPTED` com evidências canônicas.
- **AC-G05-005:** Manifest canônico consolidado `docs/work-packages/G-05-EVIDENCE.json` emitido e validado via `python3 -m json.tool`.
- **AC-G05-006:** Transição formal do pacote G-05 para `ACCEPTED` e G-06 para `READY`.

---

## Plano de testes e validação

- Verificação de integridade dos commits via `git cat-file -t <sha>` e `git log`.
- Validação do schema JSON dos manifests emitidos (`python3 -m json.tool`).
- Confirmação de que 100% dos testes associados a cada checkpoint passaram nos gates executados em G-04 (124 testes).

---

## Observabilidade

- Mapeamento completo dos Evidence IDs no [EVIDENCE_INDEX.md](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/project/EVIDENCE_INDEX.md).
- Trilha de auditoria append-only validada contra adulterações.

---

## Migração e rollback

- Os commits auditados são imutáveis no Git; nenhuma reescrita de árvore histórica foi necessária.
- A qualquer momento, o snapshot G-00 em `/Users/franciscotaveira.ads/Downloads/FT/.chat-sales-recovery/G-00/20260919T045737Z` pode restaurar o estado original de trabalho.

---

## Gates

- **Gate G-05.1:** Commits 1 a 2.6 auditados e aprovados retrospectivamente.
- **Gate G-05.2:** Checkpoints 2.7 e 3 revalidados com evidência de execução.
- **Gate G-05.3:** Manifestos de evidência registrados no índice de evidências.

---

## Limitações e riscos

- A migração 005 (introduzida na Iteração 4) contém senhas fixas e restrições CHECK problemáticas; seu saneamento não faz parte de G-05 e será executado estritamente no pacote `CH-01`.
- A validação em navegadores reais com Google Chrome CDP real foi congelada como evidência em `docs/audits/iteration-3/` e será incorporada ao CI mínimo em G-06.

---

## Parecer independente

A auditoria retrospectiva concluiu que o histórico consolidado de 1 a 2.6 e os novos checkpoints 2.7 e 3 atendem integralmente aos requisitos de integridade, isolamento multi-tenant e robustez arquitetural exigidos pela Sovereign Kernel Architecture.
