# STATE.md — Diário de Estado e Retomada

> **Missão Noturna Autônoma — CHAT-SALES**  
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*  
> **Objetivo:** Levar o CHAT-SALES ao estado `VERIFIED_DOCKER_LAB` sem dependência de n8n e sem aprovação intermediária.

---

## 1. Fotografia do Estado Atual

- **Data / Hora:** 2026-09-29T04:00:00-03:00
- **SHA Base de Entrada:** `4f4b698`
- **Milestone Atual:** `M5 — Próxima Ação Comercial E2 (Schema commercial_actions, atomicidade Radar, Cockpit Lite)` -> `COMPLETED`
- **Próximo Milestone:** `M6 — Fluxo Comercial, Catálogo, Proposta Imutável, Pix EMV e Outcome WON/LOST`
- **Último Gate Verde:**
  - Database Test Suite (`pnpm test:db:run`): 50/50 arquivos de teste aprovados, 706/706 testes verdes com teardown limpo.
  - Typecheck Repo (`pnpm typecheck`): 18/18 tarefas bem-sucedidas no Turbo sem erros em nenhum pacote ou app.
  - Web Build (`pnpm --filter @sos-sales/web build`): Construção com sucesso em 1.85s (`dist/index.html`, `dist/assets/index-Cf_QKymb.js`).
  - Migration `020_commercial_actions.sql`: Criadas tabelas `commercial_actions` e `commercial_action_history`, partial unique index para ação aberta única por conversa, FORCE RLS, privilégio mínimo e idempotência.
  - Repositório `commercial-actions.repository.ts`: Métodos completos com auditoria imutável de adiamento e reatribuição, conclusão e cancelamento idempotentes.
  - Atomicidade com Radar: `decideSuggestion` aceita cria ou reutiliza ação aberta de forma atômica e idempotente.
  - Visual Cockpit: Card "Próxima Ação Comercial (E2)" na Coluna 3, pill de próxima ação com status de atraso na fila de atendimento, e filtro de fila `needs_attention`.
- **Erro / Bloqueador Ativo no Momento:** Nenhum bloqueador interno em aberto.
- **Próxima Ação Imediata:**
  - Iniciar M6: Auditar e fortalecer fluxo comercial (propostas comerciais com snapshot imutável de itens, QR code Pix EMV com chave BACEN real, separação estrita da confirmação manual de caixa, e transição auditada de WON/LOST com despacho CAPI).

---

## 2. Mapa dos Milestones

| Milestone | Descrição | Estado | Commit SHA |
| :--- | :--- | :---: | :---: |
| **M0** | Baseline reproduzível, verificação de ambiente, saúde e inventário | `COMPLETED` | `c8f5a09a` |
| **M1** | Fechar F1.1-C.1 (Imutabilidade terminal e replay idempotente estável) | `COMPLETED` | `1e898fa` |
| **M2** | Fundação, auth JWT, RBAC com efeitos, `withTenantTransaction` e RLS | `COMPLETED` | `32d0bf4` |
| **M3** | Mensageria e canais no núcleo (inbox, outbox transacional, reconciliação, SSRF guard) | `COMPLETED` | `aea5f27` |
| **M4** | Cockpit íntegro (timeline, isolamento de rascunhos, troca rápida sem corrida) | `COMPLETED` | `4f4b698` |
| **M5** | Próxima Ação Comercial E2 (Schema `commercial_actions`, atomicidade Radar, Cockpit Lite) | `COMPLETED` | pendente commit M5 |
| **M6** | Fluxo comercial, catálogo, proposta imutável, Pix EMV e outcome WON/LOST | `TODO` | — |
| **M7** | Onboarding assistido de canal por workspace (WABA/WAHA com credenciais protegidas) | `TODO` | — |
| **M8** | Resiliência, restarts, lease recovery e preparação para migração | `TODO` | — |
| **M9** | E2E integrado P1–P8 + Ensaio sintético Haven de ponta a ponta | `TODO` | — |
| **M10** | Revisão final independente & declaração `VERIFIED_DOCKER_LAB` | `TODO` | — |


