# MATRIZ DE TESTES DE ISOLAMENTO MULTI-TENANT

> **Status:** Executada na suíte de testes unitários (`tests/unit/route-authorization-guard.test.ts`, `tests/unit/waha-webhook-security.test.ts`, `tests/unit/workspace-normalization.test.ts`).  

---

## 1. Definição dos Tenants de Teste

| Identificador | Nome do Workspace | UUID do Workspace | Usuário / Ator | Token Mock |
|---|---|---|---|---|
| **Tenant A** | SOS Sales Alpha | `11111111-1111-1111-1111-111111111111` | `user.a@tenant-a.com` | `Bearer valid_token_tenant_a...` |
| **Tenant B** | Haven Beauty Beta | `22222222-2222-2222-2222-222222222222` | `user.b@tenant-b.com` | `Bearer valid_token_tenant_b...` |

---

## 2. Matriz de Cenários e Evidências Reais

| ID | Superfície / Rota | Ação Executada | Resultado Esperado | Resultado Observado | Status |
|---|---|---|---|---|:---:|
| **AUTH-01** | `GET /api/v1/workspaces/:ws/channels/whatsapp/qr` | Operador sem token tenta ler QR code | `401 Unauthorized` | `401 Unauthorized` | ✅ **PASS** |
| **AUTH-02** | `POST /api/v1/ai/vision/analyze` | Operador sem token tenta analisar imagem | `401 Unauthorized` | `401 Unauthorized` | ✅ **PASS** |
| **AUTH-03** | `GET /api/v1/workspaces/:ws/journeys/:id/bot/status` | Operador sem token tenta ler bot status | `401 Unauthorized` | `401 Unauthorized` | ✅ **PASS** |
| **AUTH-04** | `GET /api/v1/workspaces/:ws/channels/whatsapp/status` | Tenant A tenta ler status do WhatsApp do Tenant B | `403 Forbidden` | `403 Forbidden` | ✅ **PASS** |
| **AUTH-05** | `GET /api/v1/workspaces/:ws/channels/whatsapp/qr` | Chamada sem autenticador configurado | `401 Unauthorized` (Fail-Closed) | `401 Unauthorized` | ✅ **PASS** |
| **AUTH-06** | `GET /api/v1/workspaces/:ws/channels/whatsapp/status` | Tenant A acessa seu próprio workspace | `200 OK` (Passa o guard) | `200 OK` | ✅ **PASS** |
| **SEC-01..05** | `POST /api/v1/channels/waha/webhook` | Webhook sem chave ou com chave incorreta | `401 Unauthorized` (Fail-Closed) | `401 Unauthorized` | ✅ **PASS** |
| **SEC-06** | `POST /api/v1/channels/waha/webhook` | Webhook com chave válida e sessão mapeada | `200 OK` com ingestão de tenant | `200 OK` (`workspaceId: 22222222...`) | ✅ **PASS** |
| **SEC-07** | `POST /api/v1/channels/waha/webhook` | Webhook com evento duplicado (replay) | Descarte com `deduplicated: true` | `200 OK` (`deduplicated: true`) | ✅ **PASS** |
| **NORM-01..11**| `normalizeWorkspaceUuid` | Strings maliciosas ou substring traps (`my-haven-workspace`) | Rejeição `null` / `400 Bad Request` | `null` retornado | ✅ **PASS** |

---

## 3. Conclusão de Isolamento Multi-Tenant
* **Zero Vazamento Cruzado:** Rotas operacionais validam pertença do ator ao workspace e retornam 403 Forbidden.
* **Fail-Closed em Todas as Camadas:** Ausência de autenticador, token ou diretório de workspaces rejeita a requisição imediatamente.
