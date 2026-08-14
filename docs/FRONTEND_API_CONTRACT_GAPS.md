# Frontend vs. Backend API Contract Gaps — Sales OS Cockpit

Este documento mapeia todos os contratos e necessidades de dados do **Frontend Operator Cockpit (P0.6)** contra o ecossistema existente de portas e use cases do backend (`src/application/ports/` e `src/interfaces/http/`).

---

## Matriz de Cobertura de Contratos

| Contrato / Funcionalidade Frontend | Status Atual | Endpoint / Use Case Proposto | Autorização Exigida | Resposta / Erros Esperados |
| :--- | :--- | :--- | :--- | :--- |
| **Listar Workspaces do Operador** | `PARTIAL` | `GET /api/v1/workspaces` | `Bearer <session_token>` (Role: operator/viewer) | `200 OK` com `Workspace[]`. Erro `401 Unauthorized` se sessão expirada. |
| **Fila de Prioridades (Agora)** | `PARTIAL` | `GET /api/v1/workspaces/:id/priorities` | `Bearer <token>` (Operator) | `200 OK` com itens ordenados por SLA e criticidade (limite 3-5). `404` se workspace inexistente. |
| **Dossiê da Jornada & Origem CTWA** | `PARTIAL` | `GET /api/v1/journeys/:id` | `Bearer <token>` | `200 OK` com dados cadastrais, payload CTWA/Meta Ads, lista de fatos confirmados/inferidos. |
| **Timeline de Mensagens com Status** | `PARTIAL` | `GET /api/v1/journeys/:id/messages` | `Bearer <token>` | `200 OK` com `Message[]` ordenadas por timestamp com status (`delivered`, `read`, etc.). |
| **Assumir Handoff (Claim)** | `EXISTS` | `POST /api/v1/journeys/:id/claim` | `Bearer <token>` (Operator) | `200 OK` atribuindo jornada ao operador. Erro `409 Conflict` se já assumido por outro. |
| **Liberar Handoff (Release)** | `EXISTS` | `POST /api/v1/journeys/:id/release` | `Bearer <token>` (Operator/Supervisor) | `200 OK` retornando jornada para a fila pendente ou bot. |
| **Envio Supervisionado de Mensagem** | `EXISTS` | `POST /api/v1/journeys/:id/messages` | `Bearer <token>` (Operator atribuído) | `201 Created` com `Message`. Erro `422` se canal pausado; `403` se viewer somente leitura. |
| **Recomendação com Evidências (AI)** | `PARTIAL` | `GET /api/v1/journeys/:id/recommendation` | `Bearer <token>` | `200 OK` com `draftText`, `policyStatus`, e array de `evidences` (mínimo 2). Retorna `null` se sem evidências suficientes. |
| **Registro de Outcome Comercial** | `MISSING` | `POST /api/v1/journeys/:id/outcome` | `Bearer <token>` (Operator/Supervisor) | `200 OK` com `JourneyOutcome` (`won`, `lost`, `scheduled`, valor R$, motivo). |
| **Prova de Resultado e Atribuição CTWA** | `MISSING` | `GET /api/v1/workspaces/:id/traffic-proof` | `Bearer <token>` (Operator/Supervisor/Admin) | `200 OK` com métricas agregadas: Gasto CTWA, Receita Ganha, ROAS, Taxa de Conversão por Campanha. |
| **Pausa / Retomada de Canal WABA** | `EXISTS` | `POST /api/v1/channels/:id/toggle-pause` | `Bearer <token>` (Supervisor/Admin) | `200 OK` com estado atualizado e metadados de quem pausou e motivo. |
| **Sincronização de Rascunho Operador** | `EXISTS (Local)` | Armazenamento local com fallback de sync opcional | N/A (Client-first) | Preservado no LocalStorage mesmo com recarregamento ou erro de envio. |

---

## Detalhamento das Lacunas Críticas

### 1. `POST /api/v1/journeys/:id/outcome` (`MISSING`)
* **Necessidade:** O operador precisa fechar o ciclo de atendimento marcando se o lead fechou (`won`), perdeu (`lost`), ou agendou (`scheduled`), inserindo o valor financeiro do serviço e o motivo.
* **Impacto:** Alimenta diretamente o módulo de Prova de Tráfego e cálculo de ROAS das campanhas de anúncios de clique para o WhatsApp.

### 2. `GET /api/v1/workspaces/:id/traffic-proof` (`MISSING`)
* **Necessidade:** Visão consolidada ligando gasto de mídia Meta Ads ao faturamento real gerado pelos operadores no cockpit.
* **Métricas requeridas:** Gasto CTWA, Faturamento Convertido, ROAS, Taxa de SLA cumprido e Conversão por anúncio.

### 3. `GET /api/v1/journeys/:id/recommendation` (`PARTIAL`)
* **Regra de ouro de UX:** O frontend rejeita recomendações sem evidências. O backend deve sempre fornecer no mínimo 2 itens de evidência vinculados (ex: mensagem do cliente + disponibilidade de agenda/tabela de preços).
