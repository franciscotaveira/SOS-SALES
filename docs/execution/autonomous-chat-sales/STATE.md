# STATE.md — Diário de Estado e Retomada

> **Missão Noturna Autônoma — CHAT-SALES**  
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*  
> **Objetivo:** Levar o CHAT-SALES ao estado `VERIFIED_DOCKER_LAB` sem dependência de n8n e sem aprovação intermediária.

---

## 1. Fotografia do Estado Atual

- **Data / Hora:** 2026-09-29T03:01:00-03:00
- **SHA Base de Entrada:** `c8f5a09a977495d9e9084409767d5c768ba20413`
- **Milestone Atual:** `M1 — Fechar F1.1-C.1 (Imutabilidade Terminal e Replay Idempotente)` -> `COMPLETED`
- **Próximo Milestone:** `M2 — Fundação, Auth JWT, RBAC com Efeitos, withTenantTransaction e RLS`
- **Último Gate Verde:**
  - Database: 25/25 testes em `packages/database/src/__tests__/integration-suggestions.test.ts`
  - API Routes: 27/27 testes em `apps/api/src/__tests__/integration.routes.test.ts`
  - Workspace Typecheck: 18/18 tarefas bem-sucedidas
  - Monorepo Build: 10/10 tarefas bem-sucedidas
  - Syntax check: `node --check scripts/verify-e1-trust-browser.mjs` OK
- **Erro / Bloqueador Ativo no Momento:** Nenhum bloqueador interno em aberto.
- **Próxima Ação Imediata:**
  - Iniciar M2: Revisar cobertura de `withTenantTransaction`, RLS fail-closed em todas as tabelas comerciais e canais, e testes negativos de cross-tenant.

---

## 2. Mapa dos Milestones

| Milestone | Descrição | Estado | Commit SHA |
| :--- | :--- | :---: | :---: |
| **M0** | Baseline reproduzível, verificação de ambiente, saúde e inventário | `COMPLETED` | `c8f5a09a` |
| **M1** | Fechar F1.1-C.1 (Imutabilidade terminal e replay idempotente estável) | `COMPLETED` | pendente commit M1 |
| **M2** | Fundação, auth JWT, RBAC com efeitos, `withTenantTransaction` e RLS | `IN_PROGRESS` | — |
| **M3** | Mensageria e canais no núcleo (inbox, outbox transacional, reconciliação, SSRF guard) | `TODO` | — |
| **M4** | Cockpit íntegro (timeline, isolamento de rascunhos, troca rápida sem corrida) | `TODO` | — |
| **M5** | Próxima Ação Comercial E2 (Schema `commercial_actions`, atomicidade Radar, Cockpit Lite) | `TODO` | — |
| **M6** | Fluxo comercial, catálogo, proposta imutável, Pix EMV e outcome WON/LOST | `TODO` | — |
| **M7** | Onboarding assistido de canal por workspace (WABA/WAHA com credenciais protegidas) | `TODO` | — |
| **M8** | Resiliência, restarts, lease recovery e preparação para migração | `TODO` | — |
| **M9** | E2E integrado P1–P8 + Ensaio sintético Haven de ponta a ponta | `TODO` | — |
| **M10** | Revisão final independente & declaração `VERIFIED_DOCKER_LAB` | `TODO` | — |

