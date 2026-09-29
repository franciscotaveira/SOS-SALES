# SURFACE-INVENTORY.md — Inventário da Superfície Declarada

> **Regra do Contrato:** Cada superfície visível deve terminar em `OPERACIONAL_TESTADO`, `DESABILITADO_COM_MOTIVO` ou `FORA_DO_ESCOPO_OCULTO`. Zero botões mortos, mocks ou sucessos simulados.

---

## 1. Rotas do Frontend & Telas

| Rota | Descrição | Componente Principal | Estado Alvo | Status Atual |
| :--- | :--- | :--- | :---: | :---: |
| `/` ou `/inbox` | Cockpit de Atendimento Tripartite | `CockpitPage.tsx` | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `/contacts` | Tabela de Contatos & Opt-Out | `ContactsPage.tsx` | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `/campaigns` | Relatório de Atribuição Meta CTWA | `CampaignsPage.tsx` | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `/settings` | Gestão de Linhas e Provedores | `SettingsPage.tsx` | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |

---

## 2. Modais, Drawers e Ações Rápidas no Cockpit

| Elemento | Gatilho | Responsabilidade | Estado Alvo | Status Atual |
| :--- | :--- | :--- | :---: | :---: |
| **Drawer Pix** | Botão `Cobrança Pix` na timeline | Geração de cobrança Pix BR Code EMVCo sem mocks | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| **Drawer Catálogo** | Botão `Catálogo` na timeline | Listagem de serviços/preços do workspace para pre-fill | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| **Drawer Radar M01** | Badge `Radar` na coluna de conversas | Exibição de sugestões, aceitar (zero outbound) e dispensar | `OPERACIONAL_TESTADO` | `IN_PROGRESS` (M1 Hotfix) |
| **Card de Conferência no Caixa** | Botão `Conferir no Caixa` no card Pix | Registro de conferência manual pelo operador e rascunho de confirmação | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| **Próxima Ação (E2)** | Bloco contextual na conversa ativa | Registro de compromisso operacional (quem, o que, até quando) | `OPERACIONAL_TESTADO` | `TODO` (M5) |
| **Filtro "Precisa de Atenção"** | Dropdown/Filtro na fila de conversas | Filtrar conversas com próxima ação vencida ou pendente | `OPERACIONAL_TESTADO` | `TODO` (M5) |

---

## 3. Endpoints da API Fastify

| Método & Path | RBAC Role Mínima | Objetivo | Estado Alvo | Status Atual |
| :--- | :--- | :--- | :---: | :---: |
| `GET /v1/me` | Autenticado | Identificação do usuário e workspace atual | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `GET /v1/workspaces/:id/threads` | `operator` | Fila de conversas paginada com tenant RLS | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `GET /v1/workspaces/:id/threads/:id/messages` | `operator` | Mensagens da timeline ordenadas | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `POST /v1/workspaces/:id/messages` | `operator` | Disparo outbound com outbox transacional | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `POST /v1/workspaces/:id/threads/:id/pix-charges` | `operator` | Criação de cobrança Pix EMVCo | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `PATCH /v1/workspaces/:id/pix-charges/:id/confirm` | `operator` | Conferência manual no caixa com ator explícito | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `GET /v1/workspaces/:id/integrations/candidates` | `integration_service` | Candidatos para análise do Radar | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `POST /v1/workspaces/:id/integrations/suggestions` | `integration_service` | Submissão de recomendação com candidateRevision | `OPERACIONAL_TESTADO` | `IN_PROGRESS` (M1) |
| `PATCH /v1/workspaces/:id/integrations/suggestions/:id` | `operator` | Decisão de sugestão (aceitar/dispensar) | `OPERACIONAL_TESTADO` | `IN_PROGRESS` (M1) |
| `POST /v1/workspaces/:id/threads/:id/actions` | `operator` | Criação de Próxima Ação Comercial (E2) | `OPERACIONAL_TESTADO` | `TODO` (M5) |
| `GET /v1/workspaces/:id/threads/:id/actions` | `operator` | Listagem de ações da conversa | `OPERACIONAL_TESTADO` | `TODO` (M5) |
| `PATCH /v1/workspaces/:id/actions/:id` | `operator` | Conclusão ou adiamento de Próxima Ação | `OPERACIONAL_TESTADO` | `TODO` (M5) |
| `POST /v1/workspaces/:id/journeys/:id/outcomes` | `operator` | Registro de desfecho comercial (WON/LOST) | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `POST /v1/ingress/waba` | `sos_ingress_user` | Webhook público Meta Cloud API com assinatura HMAC | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
| `POST /v1/ingress/waha` | `sos_ingress_user` | Webhook público WAHA com token hash | `OPERACIONAL_TESTADO` | `OPERACIONAL_TESTADO` |
