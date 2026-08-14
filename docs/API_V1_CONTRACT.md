# SOS Sales — Contrato HTTP v1

**Estado:** contrato P0; a implementação deve respeitar este documento.  
**Base URL:** `/api/v1`  
**Autenticação:** `Authorization: Bearer <Supabase access token>`

## Regras transversais

- O servidor deriva ator, papel e workspaces a partir do JWT. O navegador nunca
  envia `operatorId`, `operatorName` ou uma permissão como fonte de verdade.
- Toda mutação que possa produzir efeito comercial requer `Idempotency-Key`.
- `401` token inválido/ausente; `403` membro sem acesso; `404` recurso ausente
  no tenant; `409` transição concorrente; `422` regra de domínio; `429` limite.
- O cliente não recebe envelope bruto de webhook, credenciais de canal ou
  mensagens internas de infraestrutura.
- Workers/webhooks são os únicos fluxos com privilégios de serviço. As rotas de
  operador preservam o contexto do JWT e RLS.

## Sessão e shell

| Método | Rota | Resposta |
|---|---|---|
| GET | `/me` | usuário e memberships autorizados |
| GET | `/workspaces` | workspaces selecionáveis pelo usuário |

## Fila e jornadas

| Método | Rota | Observação |
|---|---|---|
| GET | `/workspaces/:workspaceId/priorities?limit=5&cursor=&status=` | projeção de prioridade explicável e SLA real |
| GET | `/workspaces/:workspaceId/journeys?status=open&stage=&q=&limit=&cursor=` | tabela e kanban; cursor, não lista ilimitada |
| GET | `/journeys/:journeyId` | resumo de cockpit sem payload sensível |
| PATCH | `/journeys/:journeyId/stage` | estágio comercial, separado do `decision_state` cognitivo |

`PriorityItem` mínimo:

```ts
{
  journeyId: string;
  handoffCaseId?: string;
  contact: { id: string; name: string | null; phone: string };
  lastMessage?: { text: string | null; sentAt: string };
  acquisition?: { source: string; campaignName?: string; offerHook?: string; confidence?: number };
  sla: { state: 'OK' | 'DUE' | 'OVERDUE'; deadline?: string; minutesRemaining?: number };
  assignment: { state: 'PENDING' | 'MINE' | 'ASSIGNED'; operator?: { id: string; name?: string } };
  priorityReason: string;
  unreadCount: number;
}
```

## Conversa e dossiê

| Método | Rota | Observação |
|---|---|---|
| GET | `/journeys/:journeyId/messages?before=&limit=50` | timeline cursor-paginada, incluindo lifecycle permitido |
| GET | `/journeys/:journeyId/dossier` | aquisição, continuidade, fatos, fricção, compromisso, recomendação, handoff e canal |
| POST | `/journeys/:journeyId/facts` | append-only; correção supersede fato anterior, não o sobrescreve |
| POST | `/journeys/:journeyId/follow-ups` | cria tarefa de retorno auditável |

## Handoff e resultado

| Método | Rota | Observação |
|---|---|---|
| POST | `/handoffs/:handoffCaseId/accept` | RPC atômica; conflito retorna 409 |
| POST | `/handoffs/:handoffCaseId/resolve` | encerra atendimento humano |
| POST | `/handoffs/:handoffCaseId/return-to-ai` | requer motivo auditável |
| POST | `/journeys/:journeyId/outcomes` | ganho/perdido/sem resposta; valores em `amount_minor` |
| GET | `/workspaces/:workspaceId/traffic-proof?from=&to=` | receita/atribuição reais; gasto e ROAS nulos até conexão Meta |

## Outbound — bloqueado até G3

`POST /journeys/:journeyId/messages` só será ativado após provider WAHA, política,
controle de canal, `outbound_dispatches`, outbox worker e lifecycle de status.
Enquanto isso, o composer pode preparar rascunho local, mas não declarar envio,
entrega ou estado de canal como real.

## Controles de canal — owner

| Método | Rota |
|---|---|
| GET | `/workspaces/:workspaceId/channels` |
| POST | `/workspaces/:workspaceId/outbound-control` |
| POST | `/channels/:channelConnectionId/outbound-control` |
| GET | `/channels/:channelConnectionId/health` |

O botão de pausa controla envio outbound; ele não pode fingir uma queda de
sessão. O worker verifica o kill switch imediatamente antes de chamar WAHA.

## Critérios de aceite do contrato

1. Nenhuma rota aceita identidade/role do cliente como autorização.
2. Todas as consultas validam pertença ao workspace.
3. Mutações possuem testes de idempotência e concorrência.
4. DTOs derivam de dados persistidos; não há fallback com números fixture.
5. Toda rota exposta possui schema de entrada/saída e teste de contrato.
