# STATE.md — Diário de Estado e Retomada

> **Missão Noturna Autônoma — CHAT-SALES**  
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*  
> **Objetivo:** Levar o CHAT-SALES ao estado `VERIFIED_DOCKER_LAB` sem dependência de n8n e sem aprovação intermediária.

---

## 1. Fotografia do Estado Atual

- **Data / Hora:** 2026-09-29T04:20:00-03:00
- **SHA Base de Entrada:** `5072e39`
- **Milestone Atual:** `M6 — Fluxo Comercial, Catálogo, Proposta Imutável, Pix EMV e Outcome WON/LOST` -> `COMPLETED`
- **Próximo Milestone:** `M7 — Onboarding Assistido de Canal por Workspace (WABA/WAHA com Credenciais Protegidas)`
- **Último Gate Verde:**
  - Database Test Suite (`pnpm test:db:run`): 52/52 arquivos de teste aprovados, 719/719 testes verdes com teardown limpo.
  - Typecheck Repo (`pnpm typecheck`): 18/18 tarefas bem-sucedidas no Turbo sem erros.
  - Web Build (`pnpm --filter @sos-sales/web build`): Construção com sucesso em 1.63s (`dist/index.html`, `dist/assets/index-DDGbEmeF.css`, `dist/assets/index-B9c6hpGt.js`).
  - Migration `021_commercial_proposals.sql`: Criada tabela `commercial_proposals` com snapshot imutável em JSONB (`items`), `total_cents` consolidado, composite foreign keys com `workspace_id`, FORCE RLS e REVOKE DELETE para `sos_app_user`; adicionada coluna `proposal_id` em `pix_charges`.
  - Repositório `commercial-proposals.repository.ts`: Métodos completos (`createCommercialProposal`, `getCommercialProposalById`, `listCommercialProposalsForThread`, `updateCommercialProposalStatus`) com snapshotting automático de catálogo e avanço para `proposal` no lifecycle da jornada.
  - Salvaguardas em Commercial Outcomes: `recordCommercialOutcome` endurecido com validações `ACTOR_REQUIRED`, `REASON_REQUIRED` para desfechos `lost`, e deduplicação idempotente impedindo re-enfileiramento de CAPI em desfechos idênticos repetidos.
  - Separação Caixa Pix: `confirmPixChargeManual` estritamente desacoplado com método `MANUAL_CASHIER`, sem emissão indevida de conversão CAPI ou avanço cego de jornada.
  - API Routes & Web Client: `commercial-proposals.routes.ts` com RBAC e tenant context em `/v1/workspaces/:workspaceId/threads/:threadId/proposals`, e tipos adicionados a `api-client.ts`.
- **Erro / Bloqueador Ativo no Momento:** Nenhum bloqueador interno em aberto.
- **Próxima Ação Imediata:**
  - Iniciar M7: Auditar assistente de canais em `SettingsPage.tsx` e endpoints de canais para WABA e WAHA, garantindo credenciais protegidas, estados honestos de conexão e ausência de vazamento de segredos para a UI.

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
| **M6** | Fluxo comercial, catálogo, proposta imutável, Pix EMV e outcome WON/LOST | `COMPLETED` | pendente commit M6 |
| **M7** | Onboarding assistido de canal por workspace (WABA/WAHA com credenciais protegidas) | `TODO` | — |
| **M8** | Resiliência, restarts, lease recovery e preparação para migração | `TODO` | — |
| **M9** | E2E integrado P1–P8 + Ensaio sintético Haven de ponta a ponta | `TODO` | — |
| **M10** | Revisão final independente & declaração `VERIFIED_DOCKER_LAB` | `TODO` | — |


