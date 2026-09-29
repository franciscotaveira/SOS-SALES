# STATE.md — Diário de Estado e Retomada

> **Missão Noturna Autônoma — CHAT-SALES**  
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*  
> **Objetivo:** Levar o CHAT-SALES ao estado `VERIFIED_DOCKER_LAB` sem dependência de n8n e sem aprovação intermediária.

---

## 1. Fotografia do Estado Atual

- **Data / Hora:** 2026-09-29T04:32:00-03:00
- **SHA Base de Entrada:** `3a0392d`
- **Milestone Atual:** `M7 — Onboarding Assistido de Canal por Workspace (WABA/WAHA com Credenciais Protegidas)` -> `COMPLETED`
- **Próximo Milestone:** `M8 — Resiliência, Restarts, Lease Recovery e Preparação para Migração`
- **Último Gate Verde:**
  - Database Test Suite (`pnpm test:db:run`): 53/53 arquivos de teste aprovados, 725/725 testes verdes com teardown limpo.
  - Typecheck Repo (`pnpm typecheck`): 18/18 tarefas bem-sucedidas no Turbo sem erros.
  - Web Build (`pnpm --filter @sos-sales/web build`): Construção com sucesso em 1.70s (`dist/index.html`, `dist/assets/index-DDGbEmeF.css`, `dist/assets/index-D1kJaTxL.js`).
  - Endpoints de Canal & Governança:
    - Revogação Segura: `POST /v1/workspaces/:workspaceId/channels/:channelId/revoke` com `channel_instances.is_active = false`, `provider_credentials.status = 'REVOKED'`, e registro de auditoria imutável em `audit_events` com permissão restrita a `workspace:manage`.
    - Pareamento WAHA Seguro: `GET /v1/workspaces/:workspaceId/channels/:channelId/qr-code` com decriptografia no cofre do servidor, proteção SSRF estrita, zero exposição de token/API key para a UI/navegador, e rejeição de canais não-WAHA (HTTP 400).
    - Projeção Honesta: `GET /v1/workspaces/:workspaceId/channels` projetando `status` (`connected` | `revoked`) e `environment` (`production_certified` | `lab_local`).
  - UI Cockpit Settings (`SettingsPage.tsx`):
    - Badges distintos para "Homologado Oficial" (Meta WABA) e "Laboratório Local" (WAHA).
    - Botão e fluxo de Revogação de canal com confirmação explícita.
    - Modal de visualização de QR Code seguro para instâncias WAHA sem impressão de tokens em console/DOM.
  - Integração & RLS: `apps/api/src/__tests__/channel-onboarding-m7.test.ts` com 6/6 testes aprovados cobrindo isolamento cross-tenant, RBAC e integridade de auditoria.
- **Erro / Bloqueador Ativo no Momento:** Nenhum bloqueador interno em aberto.
- **Próxima Ação Imediata:**
  - Iniciar M8: Executar e validar resiliência do worker sob restarts abruptos, lease recovery concorrente em outbox/CAPI, reconciliação de filas e dry-run reproduzível de migrações SQL.

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
| **M7** | Onboarding assistido de canal por workspace (WABA/WAHA com credenciais protegidas) | `COMPLETED` | pendente commit M7 |
| **M8** | Resiliência, restarts, lease recovery e preparação para migração | `TODO` | — |
| **M9** | E2E integrado P1–P8 + Ensaio sintético Haven de ponta a ponta | `TODO` | — |
| **M10** | Revisão final independente & declaração `VERIFIED_DOCKER_LAB` | `TODO` | — |


