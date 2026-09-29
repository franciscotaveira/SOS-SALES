# STATE.md — Diário de Estado e Retomada

> **Missão Noturna Autônoma — CHAT-SALES**  
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*  
> **Objetivo:** Levar o CHAT-SALES ao estado `VERIFIED_DOCKER_LAB` sem dependência de n8n e sem aprovação intermediária.

---

## 1. Fotografia do Estado Atual

- **Data / Hora:** 2026-09-29T04:55:00-03:00
- **SHA Base de Entrada:** `0d18057`
- **Milestone Atual:** `M9 — E2E Integrado P1–P8 + Ensaio Sintético Haven de Ponta a Ponta` -> `COMPLETED`
- **Próximo Milestone:** `M10 — Revisão Final Independente & Declaração VERIFIED_DOCKER_LAB`
- **Último Gate Verde:**
  - Database Test Suite (`pnpm test:db:run`): 56/56 arquivos de teste aprovados, 737/737 testes verdes com teardown limpo.
  - Typecheck Repo (`pnpm typecheck`): 18/18 tarefas bem-sucedidas no Turbo sem erros.
  - Web Build (`pnpm --filter @sos-sales/web build`): Construído com sucesso em 1.84s.
  - M9 E2E Integrado Suite (`apps/api/src/__tests__/e2e-integrated-p1-p8-haven.test.ts`): 7/7 testes aprovados cobrindo integralmente:
    - P1 & P8: Atendimento normal e execução 100% nativa sem dependência de n8n (mensagens in/out com outbox transacional).
    - P2: Isolamento cross-tenant estrito (leitura 403 / 0 mensagens e tentativa de escrita rejeitada com 403 entre Haven e Barbearia).
    - P3: Idempotência de mensagens (replay idêntico com mesma chave retorna HTTP 200, isIdempotentReplay: true, mesmo commandId, sem duplicação de outbox).
    - P6: Estados financeiros honestos: Pix EMV gerado no estado PENDING e confirmação via MANUAL_CASHIER sem inventar conciliação bancária automática.
    - P7: Sugestões governadas e controle de concorrência com optimistic locking (`state_version`).
    - Ensaio Sintético Haven Escovaria (Etapas 1 a 8): Jornada completa de ponta a ponta (catálogo Haven, inbound Fernanda, proposta imutável com congelamento de preços, próxima ação comercial, Pix EMV com conferência manual de caixa, desfecho comercial WON, trilha de auditoria e caso LOST com `REASON_REQUIRED`).
- **Erro / Bloqueador Ativo no Momento:** Nenhum bloqueador interno em aberto.
- **Próxima Ação Imediata:**
  - Iniciar M10: Execução dos gates finais independentes e seriais (`test:db:run`, `typecheck`, `build`, `lint`, `ci:check`, `test:docker:http`), validação de integridade do laboratório e emissão da declaração formal `VERIFIED_DOCKER_LAB`.

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
| **M8** | Resiliência, restarts, lease recovery e preparação para migração | `COMPLETED` | `0d18057` |
| **M9** | E2E integrado P1–P8 + Ensaio sintético Haven de ponta a ponta | `COMPLETED` | pendente commit M9 |
| **M10** | Revisão final independente & declaração `VERIFIED_DOCKER_LAB` | `TODO` | — |


