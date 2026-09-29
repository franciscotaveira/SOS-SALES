# STATE.md — Diário de Estado e Retomada

> **Missão Noturna Autônoma — CHAT-SALES**  
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*  
> **Objetivo:** Levar o CHAT-SALES ao estado `VERIFIED_DOCKER_LAB` sem dependência de n8n e sem aprovação intermediária.

---

## 1. Fotografia do Estado Atual

- **Data / Hora:** 2026-09-29T03:31:00-03:00
- **SHA Base de Entrada:** `aea5f27`
- **Milestone Atual:** `M4 — Cockpit Íntegro (Timeline, Isolamento de Rascunhos, Troca Rápida sem Corrida)` -> `COMPLETED`
- **Próximo Milestone:** `M5 — Próxima Ação Comercial E2 (Schema commercial_actions, atomicidade Radar, Cockpit Lite)`
- **Último Gate Verde:**
  - Web Build (`pnpm --filter @sos-sales/web build`): Construção com sucesso em 1.63s, bundles gerados sem erros.
  - UI Component Suite (`pnpm --filter @sos-sales/ui test`): 20/20 testes aprovados.
  - Isolamento de Rascunhos: `sessionStorage` persistente com chave `chat_sales_draft_${workspaceId}_${threadId}` e cache local em ref.
  - Prevenção de Condição de Corrida: `activeThreadIdRef` descartando respostas assíncronas de threads anteriores e limpando `messages` imediatamente ao alternar de conversa.
  - Limpeza de Erros Transitórios: reset de erros/sucessos ao alternar contato.
- **Erro / Bloqueador Ativo no Momento:** Nenhum bloqueador interno em aberto.
- **Próxima Ação Imediata:**
  - Iniciar M5: Implementar schema e migration `020_commercial_actions.sql` (RLS, policies, trigger de updated_at), repositório com criação atômica ligada a sugestão aceita do Radar, endpoints de API e integração no Cockpit Lite.

---

## 2. Mapa dos Milestones

| Milestone | Descrição | Estado | Commit SHA |
| :--- | :--- | :---: | :---: |
| **M0** | Baseline reproduzível, verificação de ambiente, saúde e inventário | `COMPLETED` | `c8f5a09a` |
| **M1** | Fechar F1.1-C.1 (Imutabilidade terminal e replay idempotente estável) | `COMPLETED` | `1e898fa` |
| **M2** | Fundação, auth JWT, RBAC com efeitos, `withTenantTransaction` e RLS | `COMPLETED` | `32d0bf4` |
| **M3** | Mensageria e canais no núcleo (inbox, outbox transacional, reconciliação, SSRF guard) | `COMPLETED` | `aea5f27` |
| **M4** | Cockpit íntegro (timeline, isolamento de rascunhos, troca rápida sem corrida) | `COMPLETED` | pendente commit M4 |
| **M5** | Próxima Ação Comercial E2 (Schema `commercial_actions`, atomicidade Radar, Cockpit Lite) | `TODO` | — |
| **M6** | Fluxo comercial, catálogo, proposta imutável, Pix EMV e outcome WON/LOST | `TODO` | — |
| **M7** | Onboarding assistido de canal por workspace (WABA/WAHA com credenciais protegidas) | `TODO` | — |
| **M8** | Resiliência, restarts, lease recovery e preparação para migração | `TODO` | — |
| **M9** | E2E integrado P1–P8 + Ensaio sintético Haven de ponta a ponta | `TODO` | — |
| **M10** | Revisão final independente & declaração `VERIFIED_DOCKER_LAB` | `TODO` | — |


