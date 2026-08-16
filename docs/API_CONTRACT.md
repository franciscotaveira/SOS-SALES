# SOS Sales API Contract (v1.0.0)

> TX Commercial Core — Sovereign Operating System API Reference

## Especificação OpenAPI 3.0.3
- **Swagger UI (dev)**: `http://localhost:4334/docs`
- **openapi.yaml**: `apps/api/openapi.yaml` (24 paths documentados, auto-gerado)
- **openapi.json**: `apps/api/openapi.json`
- **Gerar/atualizar**: `npm run generate:openapi`

## Base URL
- **Local Dev**: `http://localhost:4334/api/v1`
- **Produção**: `https://crm.iaparavendas.tech/api/v1`

## Autenticação
Todas as rotas sob `/api/v1` (exceto webhooks de canais externos com verificação de assinatura e probes `/health` e `/ready`) requerem autenticação via Supabase Auth JWT.

```http
Authorization: Bearer <supabase_access_token>
```

---

## 📑 Mapeamento Completo de Endpoints

### 1. Sistema & Probes
| Método | Rota | Descrição | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Liveness probe do processo Fastify | Pública |
| `GET` | `/ready` | Readiness probe (Postgres, Redis, Inbound Worker) | Pública |
| `GET` | `/api/v1/me` | Retorna o operador autenticado e seus workspaces | Bearer |

### 2. Workspaces & Provisioning
| Método | Rota | Descrição | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces` | Lista workspaces aos quais o operador pertence | Bearer |
| `POST` | `/api/v1/workspaces/init` | Auto-provisioning do primeiro workspace para novos donos | Bearer |

### 3. Fila de Prioridades & Cockpit Operacional
| Método | Rota | Descrição | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/:wsId/priorities` | Fila classificada por risco de estouro de SLA | Bearer |
| `GET` | `/api/v1/workspaces/:wsId/journeys` | Lista paginada de jornadas comerciais do workspace | Bearer |
| `GET` | `/api/v1/workspaces/:wsId/journeys/:jId/cockpit` | Dossiê completo: mensagens, fatos, status de handoff | Bearer |

### 4. Gestão de Handoff (Transição Humano <-> IA)
| Método | Rota | Descrição | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/workspaces/:wsId/handoffs/:caseId/accept` | Operador humano assume a conversa | Bearer |
| `POST` | `/api/v1/workspaces/:wsId/handoffs/:caseId/resolve` | Finaliza atendimento humano com resolução | Bearer |
| `POST` | `/api/v1/workspaces/:wsId/handoffs/:caseId/return-to-ai` | Devolve atendimento para a IA | Bearer |

### 5. Desfechos Comerciais & Fatos Auditados
| Método | Rota | Descrição | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/workspaces/:wsId/journeys/:jId/outcomes` | Registra desfecho comercial imutável (`WON`/`LOST`/`ABANDONED`) | Bearer |
| `POST` | `/api/v1/workspaces/:wsId/journeys/:jId/facts` | Anexa fato comercial verificado (KV append-only) | Bearer |
| `POST` | `/api/v1/workspaces/:wsId/journeys/:jId/stage` | Atualiza estágio da jornada (`NEW`, `CONTACTED`, `QUALIFIED`, `PROPOSAL`, `NEGOTIATION`) | Bearer |

### 6. Despachos Outbound Supervisionados (WAHA)
| Método | Rota | Descrição | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/workspaces/:wsId/journeys/:jId/outbound/drafts` | Cria rascunho supervisionado para envio | Bearer |
| `POST` | `/api/v1/workspaces/:wsId/outbound/dispatches/:id/approve` | Operador aprova o disparo para a fila do WAHA Worker | Bearer |
| `POST` | `/api/v1/workspaces/:wsId/outbound/dispatches/:id/reject` | Operador rejeita o rascunho com justificativa | Bearer |

### 7. Agendamentos & Notas Operacionais
| Método | Rota | Descrição | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/:wsId/appointments` | Lista agendamentos filtrados por status e data | Bearer |
| `POST` | `/api/v1/workspaces/:wsId/appointments` | Cria novo agendamento comercial | Bearer |
| `PATCH` | `/api/v1/workspaces/:wsId/appointments/:id` | Atualiza data, status (`confirmed`, `rescheduled`, etc.) | Bearer |
| `DELETE` | `/api/v1/workspaces/:wsId/appointments/:id` | Remove agendamento | Bearer |
| `GET` | `/api/v1/workspaces/:wsId/notes` | Lista notas operacionais com filtro por categoria e fixadas | Bearer |
| `POST` | `/api/v1/workspaces/:wsId/notes` | Cria nota com tags, cor e categoria | Bearer |
| `PATCH` | `/api/v1/workspaces/:wsId/notes/:id` | Atualiza título, conteúdo ou estado de pin | Bearer |
| `DELETE` | `/api/v1/workspaces/:wsId/notes/:id` | Exclui nota operacional | Bearer |

### 8. Prova de Tráfego & Atribuição
| Método | Rota | Descrição | Auth |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/workspaces/:wsId/traffic-proof` | Relatório de ROAS, CPA e conversão por campanha | Bearer |

### 9. Webhooks Inbound
| Método | Rota | Descrição | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/webhooks/waha` | Recebe eventos brutos do WhatsApp (WAHA) com assinatura HMAC | Secret |

---

## 🛡️ Tabela de Tratamento de Erros

| Código HTTP | Causa | Resposta Padrão |
| :--- | :--- | :--- |
| **400 Bad Request** | Formato de URL ou parâmetros incorretos | `{ "error": "Bad Request", "message": "..." }` |
| **401 Unauthorized** | Token ausente, expirado ou inválido | `{ "error": "Unauthorized", "message": "Invalid or missing bearer token" }` |
| **403 Forbidden** | Usuário não tem acesso ao workspace | `{ "error": "Forbidden", "message": "Workspace access denied" }` |
| **404 Not Found** | Recurso não existe ou pertence a outro tenant | `{ "error": "Not Found", "message": "Resource not found" }` |
| **409 Conflict** | Conflito de `idempotency-key` com payload divergente | `{ "error": "Conflict", "message": "Idempotency key payload mismatch" }` |
| **422 Unprocessable** | Validação de schema Zod falhou | `{ "error": "Unprocessable Entity", "message": "Validation failed" }` |
| **503 Unavailable** | Provedor externo ou banco degradado | `{ "error": "Service Unavailable", "message": "..." }` |
