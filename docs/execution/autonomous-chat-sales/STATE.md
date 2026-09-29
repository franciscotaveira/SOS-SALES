# STATE.md — Diário de Estado e Retomada

> **Missão Noturna Autônoma — CHAT-SALES**  
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*  
> **Objetivo:** Levar o CHAT-SALES ao estado `VERIFIED_DOCKER_LAB` sem dependência de n8n e sem aprovação intermediária.

---

## 1. Fotografia do Estado Atual

- **Data / Hora:** 2026-09-29T04:40:00-03:00
- **SHA Base de Entrada:** `cedd45f`
- **Milestone Atual:** `M8 — Resiliência, Restarts, Lease Recovery e Preparação para Migração` -> `COMPLETED`
- **Próximo Milestone:** `M9 — E2E Integrado P1–P8 + Ensaio Sintético Haven de Ponta a Ponta`
- **Último Gate Verde:**
  - Database Test Suite (`pnpm test:db:run`): 55/55 arquivos de teste aprovados, 730/730 testes verdes com teardown limpo.
  - Typecheck Repo (`pnpm typecheck`): 18/18 tarefas bem-sucedidas no Turbo sem erros.
  - Monorepo Build (`pnpm build`): 10/10 pacotes construídos com sucesso (incluindo `@sos-sales/web` em 1.84s).
  - Runbook de Operação & Resiliência: `docs/runbooks/BACKUP-RESTORE-ROLLBACK-RUNBOOK.md` documentando procedimentos de snapshot/restore para `sos-v3-postgres`, protocolo de rollback por tráfego e feature flags (expand-contract sem down-migration destrutiva) e procedimentos de recuperação de falhas do worker.
  - Ferramenta de Dry-Run V2->V3: `scripts/migration-v2-to-v3-dryrun.ts` executando validação completa de schema (17 tabelas essenciais), verificação estrita de FORCE RLS, privilégios mínimos de `sos_app_user` (sem DELETE), integridade referencial sem registros órfãos e relatório estruturado de divergência.
  - Suítes de Teste M8:
    - `scripts/__tests__/migration-v2-to-v3-dryrun.test.ts`: 2/2 testes aprovados confirmando prontidão V3 e idempotência.
    - `apps/worker/src/__tests__/resilience-and-recovery-m8.test.ts`: 3/3 testes aprovados validando:
      1. Recuperação de lease expirado de outbox após crash de worker direcionando para `reconciliation_required` sem chamada cega ao provedor WhatsApp;
      2. Recuperação de eventos CAPI em falhas com despacho honesto e seguro em modo simulado;
      3. Rastreabilidade de ponta a ponta com correlação de IDs em eventos de auditoria imutáveis.
- **Erro / Bloqueador Ativo no Momento:** Nenhum bloqueador interno em aberto.
- **Próxima Ação Imediata:**
  - Iniciar M9: Executar suíte de validação integrada dos percursos P1 a P8 no runtime local hermético, incluindo o ensaio sintético completo da jornada comercial Haven (solicitação de catálogo -> proposta imutável -> próxima ação -> Pix EMV -> conferência manual -> outcome WON -> auditoria completa) sem n8n e sem envio real externo.

---

## 2. Mapa dos Milestones

| Milestone | Descrição | Estado | Commit SHA |
| :--- | :--- | :---: | :---: |
| **M0** | Baseline reproduzível, verificação de ambiente, saúde e inventário | `COMPLETED` | `c8f5a09a` |
| **M1** | Fechar F1.1-C.1 (Imutabilidade terminal e replay idempotente estável) | `COMPLETED` | `1e898fa` |
| **M2** | Fundação, auth JWT, RBAC com efeitos, `withTenantTransaction` e RLS | `COMPLETED` | `32d0bf4` |
| **M3** | Mensageria e canais no núcleo (inbox, outbox transacional, reconciliação, SSRF guard) | `COMPLETED` | `aea5f27` |
| **M4** | Cockpit íntegro (timeline, isolamento de rascunhos, troca rápida sem corrida) | `COMPLETED` | `4f4b698` |
| **M5** | Próxima Ação Comercial E2 (Schema `commercial_actions`, atomicidade Radar, Cockpit Lite) | `COMPLETED` | `5072e39` |
| **M6** | Fluxo comercial, catálogo, proposta imutável, Pix EMV e outcome WON/LOST | `COMPLETED` | `3a0392d` |
| **M7** | Onboarding assistido de canal por workspace (WABA/WAHA com credenciais protegidas) | `COMPLETED` | `cedd45f` |
| **M8** | Resiliência, restarts, lease recovery e preparação para migração | `COMPLETED` | pendente commit M8 |
| **M9** | E2E integrado P1–P8 + Ensaio sintético Haven de ponta a ponta | `TODO` | — |
| **M10** | Revisão final independente & declaração `VERIFIED_DOCKER_LAB` | `TODO` | — |


