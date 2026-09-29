# CHAT SALES — Plano de Execução E0 + E1 (MCT OS v2.0)
**Data:** 28 de setembro de 2026  
**Responsável:** Orchestrator (MCT OS v2.0)  
**Status:** Em execução  

---

## 1. Baseline e Inventário (E0)

### 1.1 Objetivo do Lote
Estabilização técnica e rigor absoluto de **Truth in Data** sobre os caminhos operacionais existentes, sem alterar ou reescrever a F1 (Radar de Oportunidades & Sugestões Governadas).

### 1.2 Mapeamento de Responsabilidade por Arquivo
| Arquivo | Dono / Papel | Objetivo no Lote E1 |
|---|---|---|
| `apps/web/src/pages/CockpitPage.tsx` | Frontend Specialist | CS-01: Isolamento de rascunhos por conversa (`draftsByThread`), descarte de respostas assíncronas concorrentes (`threadSeqRef`), remoção de defaults fictícios (`dealValue`, `pixAmount`, `pixTitle`), eliminação da alegação de "confirmação bancária" em conferência manual. |
| `packages/database/src/pix.ts` | Backend Specialist | CS-02: Eliminação do fallback implícito de chave Pix (`pix-sales@sos-sales.mct.br`). Exigência estrita de chave configurada no workspace. |
| `apps/api/src/routes/pix.routes.ts` | Security / Backend | CS-02 / CS-03: Exigência da permissão `outcome:register` para `confirm-payment`. Validação de existência de chave Pix do workspace. |
| `apps/api/src/routes/commercial.routes.ts` | Security / Backend | CS-03: Adição do guard obrigatório `app.requirePermission("outcome:register")` nas rotas de desfecho comercial. |
| `apps/api/src/__tests__/integration.routes.test.ts` | Quality Engineer | CS-03: Bateria de testes automatizados comprovando a negação de `integration_service` em outcomes, pagamentos e mensagens. |

### 1.3 Preservação da F1
- A tabela `integration_suggestions` (migration 014), repositório `integration-suggestions.repository.ts`, rotas em `integration.routes.ts` e componentes de Radar no Cockpit continuam 100% preservados e ativos.
- O novo lote consolida o ambiente sobre o qual a F1 opera.

---

## 2. Entregas e Critérios de Aceite (E1)

- **CS-01 (Contexto):** Troca rápida entre conversas não mistura mensagens, rascunhos ou valores.
- **CS-02 (Financeiro):** Conferência manual identificada honestamente; chave Pix vinculada à empresa sem fallback invisível; idempotência em confirmações de pagamento.
- **CS-03 (Permissões):** Token `integration_service` sem acesso a desfechos comerciais, pagamentos ou envio de mensagens. Status CAPI exibido como enfileirado para auditoria interna.
- **CS-04 (Evidência):** Timestamps, usuário responsável e separação clara entre desfecho comercial e liquidação financeira.

---

## 3. Fechamento de Bloqueadores E1.1 (Concluído)

- **Separação Financeira Total:** `confirmPixChargeManual` atua estritamente sobre `public.pix_charges` (`status = 'PAID'`, `verification_method = 'MANUAL_CASHIER'`). Não altera jornadas, não registra desfecho comercial (`commercial_outcomes`) e não dispara eventos de conversão Meta CAPI.
- **Sem Disparo Automático de Mensagens:** A ação de conferência no caixa não envia mensagem automática ao WhatsApp do cliente. Em vez disso, preenche o draft do composer para que o atendente decida se e como notificar o cliente.
- **Cálculo Real de CRC-16 EMVCo:** Substituído CRC fixo `A1B2` pelo algoritmo matemático oficial CCITT-FALSE (`0x1021`, vetor de teste `123456789 -> 29B1`). Inclui validador estrito `validatePixCopiaECola`.
- **QR Code Local In-Memory:** Substituída chamada externa a `api.qrserver.com` por geração local em memória (`qrcode.toDataURL`), eliminando vazamentos de telemetria e dados financeiros.
- **Lockdown de Rotas Mutáveis (RBAC):** Rota `POST /v1/workspaces/:workspaceId/journeys` blindada com `app.requirePermission("journey:transition_stage")`. Tokens `integration_service` recebem HTTP 403.
- **Truth in Data no Meta CAPI:** Ambientes sem credenciais Meta configuradas gravam status honesto `SIMULATED` com receipt `{ mode: 'simulated_local' }`, sem inventar `fbtrace_id` falsos.
- **Testes Visuais Sem Tolerância a Falhas:** Eliminados `console.warn` em `scripts/verify-e1-trust-browser.mjs`, convertidos para `throw new Error(...)` fatais.

