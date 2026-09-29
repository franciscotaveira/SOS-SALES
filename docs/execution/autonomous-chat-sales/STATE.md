# STATE.md — Diário de Estado e Retomada

> **Missão Noturna Autônoma — CHAT-SALES**  
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*  
> **Objetivo:** Levar o CHAT-SALES ao estado `VERIFIED_DOCKER_LAB` sem dependência de n8n e sem aprovação intermediária.

---

## 1. Fotografia do Estado Atual

- **Data / Hora:** 2026-09-29T03:26:00-03:00
- **SHA Base de Entrada:** `32d0bf4`
- **Milestone Atual:** `M3 — Mensageria e Canais no Núcleo (Inbox, Outbox Transacional, Reconciliação, SSRF Guard)` -> `COMPLETED`
- **Próximo Milestone:** `M4 — Cockpit Íntegro (Timeline, Isolamento de Rascunhos, Troca Rápida sem Corrida)`
- **Último Gate Verde:**
  - Full Test Runner (`pnpm test:db:run`): 48/48 arquivos de teste aprovados, 686/686 testes aprovados.
  - Alinhamento de Contrato de Canais: `createChannel` retornando `webhookToken` e `webhookUrl` em ambos os níveis.
  - SSRF Guard & Truth in Data: `test-connection` com I/O real para WAHA/Evolution e bloqueio SSRF testado.
  - CAPI Tenant-Safe: `provider_credentials` descriptografado sob contexto RLS do workspace.
  - CAPI Imutabilidade: `markConversionEventResult` protegido contra leases atrasadas.
  - Workspace Typecheck: 18/18 tarefas bem-sucedidas.
  - Monorepo Build: 10/10 tarefas bem-sucedidas.
- **Erro / Bloqueador Ativo no Momento:** Nenhum bloqueador interno em aberto.
- **Próxima Ação Imediata:**
  - Iniciar M4: Auditar isolamento de rascunhos por workspace/thread, timelines, race condition de seleção rápida de contato e scripts de verificação de navegador.

---

## 2. Mapa dos Milestones

| Milestone | Descrição | Estado | Commit SHA |
| :--- | :--- | :---: | :---: |
| **M0** | Baseline reproduzível, verificação de ambiente, saúde e inventário | `COMPLETED` | `c8f5a09a` |
| **M1** | Fechar F1.1-C.1 (Imutabilidade terminal e replay idempotente estável) | `COMPLETED` | `1e898fa` |
| **M2** | Fundação, auth JWT, RBAC com efeitos, `withTenantTransaction` e RLS | `COMPLETED` | `32d0bf4` |
| **M3** | Mensageria e canais no núcleo (inbox, outbox transacional, reconciliação, SSRF guard) | `COMPLETED` | pendente commit M3 |
| **M4** | Cockpit íntegro (timeline, isolamento de rascunhos, troca rápida sem corrida) | `IN_PROGRESS` | — |
| **M5** | Próxima Ação Comercial E2 (Schema `commercial_actions`, atomicidade Radar, Cockpit Lite) | `TODO` | — |
| **M6** | Fluxo comercial, catálogo, proposta imutável, Pix EMV e outcome WON/LOST | `TODO` | — |
| **M7** | Onboarding assistido de canal por workspace (WABA/WAHA com credenciais protegidas) | `TODO` | — |
| **M8** | Resiliência, restarts, lease recovery e preparação para migração | `TODO` | — |
| **M9** | E2E integrado P1–P8 + Ensaio sintético Haven de ponta a ponta | `TODO` | — |
| **M10** | Revisão final independente & declaração `VERIFIED_DOCKER_LAB` | `TODO` | — |


