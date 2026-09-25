# CH-12 — E2E Técnico de Mensageria e Ciclo de Vida Completo

> Nome do arquivo: `CH-12-E2E-TECHNICAL.md`  
> Estado: `COMPLETED`  
> Data de Início: 25 de setembro de 2026  
> Data de Conclusão: 25 de setembro de 2026  
> Baseline de referência: `172aa07`  

---

## 1. Identidade e Metadados do Pacote

- **Parent Objective:** Programa SOS Sales V3 — Motor de Canais de Comunicação (Fase CH)
- **Estado:** `COMPLETED`
- **Lead / Agente:** Gemini 3.8 (@orchestrator & @backend-specialist)
- **Reviewers:** Architecture Specialist, Database Specialist, Security Reviewer, QA Reviewer
- **Dependências Upstream:**
  - `CH-00` a `CH-07` (Modelos Mínimos, RLS Fail-Closed, Fencing, Reconciliação, Ingress Shielding, Rate Limiting, Keyring, SSRF Guard)
  - `CH-08` (WABA Operacional)
  - `CH-09` (WAHA Operacional)
  - `CH-10` (Docker Dual-Engine e Coexistência Operacional)
  - `CH-11` (Produtor Transacional de Outbound com Atomicidade `{ message + command + audit }`)
- **ADRs Vinculadas:**
  - `ADR-001` (Fronteira e Escopo Fechado do MVP)
  - `ADR-002` (Multi-Tenancy & Auth Strategy)
  - `ADR-004` (Audit Logging & Immutability)
  - `ADR-005` (Channel Gateway & Transactional Ingress/Outbox Pattern)
- **Roadmap Gate:** `| CH-12 | E2E técnico | CH-10/11 | webhook → conversa → resposta → status |`
- **Risco Primário Mitigado:** `R-007` (Desconexão funcional entre camadas de API, banco e workers; falha na passagem de templates WABA de ponta a ponta; regressão de isolamento multi-tenant em fluxos concorrentes; e falta de comprovação do loop fechado de mensagens).

---

## 2. Objetivo e Fronteira Arquitetural

Comprovar de ponta a ponta o ciclo completo de mensageria omnichannel sob as regras inquebráveis do MCT OS v2.0:

$$\text{Webhook Ingress (WABA/WAHA)} \xrightarrow{\text{Criptografia AES-256-GCM}} \text{Inbox Queue} \xrightarrow{\text{Worker Claim}} \text{Contato + Thread + Inbound Message}$$
$$\Downarrow$$
$$\text{HTTP API Outbound} \xrightarrow{\text{JWT + RBAC + SSRF Guard}} \text{Transactional Producer} \xrightarrow{\text{Atomicity RLS}} \text{Outbox Queue + Audit}$$
$$\Downarrow$$
$$\text{Worker Claim SKIP LOCKED} \xrightarrow{\text{Fencing \& Lease}} \text{ChannelDispatchService} \xrightarrow{\text{Mock Upstream 200 OK}} \text{Sent Status + Delivery Events}$$
$$\Downarrow$$
$$\text{Delivery Status Webhook} \xrightarrow{\text{HMAC / Token Ingress}} \text{Inbox Worker Processing} \xrightarrow{\text{Monotonic Rank}} \text{Status 'delivered' / 'read'}$$

### O que o CH-12 comprova:
1. **Loop Inbound Real:** Recebimento HTTP Fastify em `/webhook/:token` para Meta WABA (com validação HMAC-SHA256) e WAHA (com token de autenticação), encriptação perimétrica AES-256-GCM com AAD e gravação em `channel_webhook_inbox`.
2. **Ingestão no Worker:** `InboxProcessor` resgatando lotes com `FOR UPDATE SKIP LOCKED`, decodificando payload e gerando atomicamente contato, thread comercial e mensagem inbound.
3. **Produção Outbound Transacional (Texto e Template WABA):**
   - Chamada HTTP Fastify em `/v1/workspaces/:workspaceId/channels/:channelInstanceId/messages`.
   - Autenticação JWT, autorização RBAC (`cockpit:send_message`).
   - Suporte completo a **mensagens de texto** e **Templates Oficiais WABA** (`name`, `language`, `components`).
   - Persistência atômica `{ messages + outbound_commands + audit_events }` sob transação RLS com `payload_fingerprint`.
4. **Despacho Outbound no Worker:** `OutboxDispatcher` reclamando comando via `FOR UPDATE SKIP LOCKED`, renovando lease com heartbeat, despachando via `ChannelDispatchService` para upstream HTTP simulado e transicionando para `sent` com registro em `provider_delivery_events`.
5. **Ciclo de Confirmação (ACK / Status Webhook):** Notificações tardias de entrega (`delivered`) e leitura (`read`) via webhook, processadas pelo `InboxProcessor`, atualizando monotonicamente o status da mensagem no banco de dados.
6. **Defesa em Profundidade:**
   - Bloqueio de cross-tenant (operador do Workspace A não envia pelo canal do Workspace B).
   - Bloqueio perimétrico de SSRF em mídia/template antes de tocar o banco.
   - Rejeição de webhooks com assinatura violada.

### O que permanece fora do escopo (Non-Goals):
- Conexão física com chip e aparelho celular real (dependência externa `EXT-05`, a ser exercitada no ambiente de homologação física).
- Automação visual no estilo n8n (proibição arquitetural permanente MCT OS v2.0).
- Entidades de CRM avançado (Oportunidades, Funil Kanban, Outcomes com valor financeiro), que iniciam formalmente a partir do `CRM-01`.

---

## 3. Matriz de Critérios de Aceite (Acceptance Criteria)

| AC ID | Critério | Verificação | Evidência Esperada |
|---|---|---|---|
| **AC-CH12-001** | Ingress Inbound WABA & WAHA via HTTP Fastify com envelope criptográfico | Requisição POST em `/webhook/:token` | HTTP 200/204; registro gravado em `channel_webhook_inbox` com status `pending` e payload encriptado AES-256-GCM. |
| **AC-CH12-002** | Ingestão no Worker e Gênese de Thread/Contato | Execução do `InboxProcessor.claimBatch` + `processItem` | Contato, thread comercial e mensagem `inbound` inseridos; status do inbox transita para `processed`. |
| **AC-CH12-003** | Produção Outbound Transacional de Texto via API | Chamada POST `/v1/workspaces/:workspaceId/channels/:channelInstanceId/messages` | HTTP 201; `{ messages + outbound_commands + audit_events }` gravados atomicamente sob RLS. |
| **AC-CH12-004** | Produção Outbound de Template Oficial WABA via API | Chamada POST `/v1/.../messages` com payload de `template` | HTTP 201; comando outbox persistido com `template_name`, `template_language`, `template_components` e fingerprint válido. |
| **AC-CH12-005** | Despacho Outbound pelo Worker para Upstream | Execução do `OutboxDispatcher.claimBatch` + `dispatchItem` com mock provider | Comando outbox transita para `sent`; mensagem atualizada para `sent`; evento persistido em `provider_delivery_events`. |
| **AC-CH12-006** | Loop de Status / ACK Webhook (`delivered` & `read`) | Ingress de webhook de status e processamento pelo `InboxProcessor` | Mensagem atualizada monotonicamente de `sent` $\rightarrow$ `delivered` $\rightarrow$ `read` com respectivo `status_rank`. |
| **AC-CH12-007** | Blindagem Multi-Tenant e Rejeição Cross-Tenant | Operador do Workspace A tenta enviar mensagem no canal do Workspace B | HTTP 404 (ChannelInstanceNotFoundError) ou 403; zero registros gravados no banco. |
| **AC-CH12-008** | Barreira Anti-SSRF Perimétrica em Templates | Envio de template com link de cabeçalho apontando para IP privado / loopback | Rejeição imediata com HTTP 400 antes de abrir transação de banco de dados. |

---

## 4. Plano de Testes Integrados

O arquivo [apps/api/src/__tests__/messaging-e2e-lifecycle.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/messaging-e2e-lifecycle.test.ts) implementará os 8 cenários acima contra o banco hermético gerenciado pelo `test-db-runner.ts`, garantindo isolamento total, integridade de RLS e zero resíduo entre execuções.
