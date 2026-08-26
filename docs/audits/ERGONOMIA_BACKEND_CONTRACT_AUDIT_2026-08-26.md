# Auditoria de contratos backend para ergonomia — 2026-08-26

## Status executivo

Escopo auditado: contratos necessários para `Cmd/Ctrl+K`, navegação `J/K`, Copilot em modo rascunho e checklist de onboarding. Método: inspeção read-only do checkout local, sem mutação de banco, sem deploy e sem chamada à produção.

**Decisão:** `NOT_READY` para liberar a ergonomia completa. Há contratos reais suficientes para leitura autenticada de jornadas e contatos, mas o Copilot possui fallback comercial hardcoded e o onboarding não possui uma projeção agregada de estado. A UI não deve prometer essas capacidades como concluídas.

## Contexto e limites

- Checkout auditado: SOS-SALES local, branch de trabalho vigente.
- Evidência de runtime VPS não foi coletada nesta etapa; portanto este documento não afirma que o artefato implantado tenha exatamente o mesmo contrato.
- A autorização comum passa por JWT via `operatorAuthRoutes`, com `assertTenantAccess` nas rotas WhatsApp e gateways de cockpit usando ator autenticado/RLS.

## Matriz de capacidade

| Capacidade | Rota/contrato encontrado | Auth/tenant | Persistência | Status | Conclusão |
|---|---|---|---|---|---|
| Buscar leads por nome/telefone | `GET /workspaces/:workspaceId/journeys` com paginação; `GET /api/v1/workspaces/:workspaceId/contacts?search=&limit=` | Journeys: JWT + gateway + acesso ao workspace. Contacts: hook JWT + `assertTenantAccess` | PostgreSQL (`commercial_journeys`, `contacts`) | **PASS** para base técnica; **UNVERIFIED** para uso em produção | Pode sustentar `Cmd+K`, mas falta contrato de busca unificado, filtro textual explícito no endpoint de jornadas e teste autenticado de cross-tenant. O endpoint de contatos não valida formalmente params/limite e expõe implementação SQL diretamente na rota. |
| Navegar fila com `J/K` | `GET /workspaces/:workspaceId/priorities` e `GET /workspaces/:workspaceId/journeys` | JWT, ator e workspace | PostgreSQL, cursor e ordenação determinística | **PASS** para leitura | Backend fornece ordenação/paginação. A proteção contra foco em `input/textarea` e a seleção da próxima conversa são responsabilidades de UI; ainda requer teste E2E de estado atualizado. |
| Abrir detalhe da fila | `GET /workspaces/:workspaceId/journeys/:journeyId/cockpit`; mensagens em `GET /journeys/:journeyId/messages` | JWT + gateway; ausência e cross-tenant retornam 404 | PostgreSQL | **PASS** contratual | É o contrato adequado para carregar a conversa selecionada. Deve ser usado em vez de fixture/localStorage.
| Copilot gerar sugestão | `POST /api/v1/ai/copilot-suggestion` | JWT obrigatório no plugin | Provider externo; não persiste sugestão | **FAIL (P0)** | Em erro do provider, a rota responde **200** com `suggestedMessage` hardcoded (`"Olá... condições especiais..."`). Isso mascara indisponibilidade e pode gerar conteúdo não fundamentado. Além disso, esta rota usa `openrouterEngine`, não o caminho NVIDIA descrito no plano. |
| Inserir sugestão no composer sem enviar | Nenhuma rota exclusiva para “draft”; UI chama Copilot e altera estado local. Há `POST /workspaces/:workspaceId/journeys/:journeyId/outbound-drafts` | JWT + idempotency-key + regras do gateway | PostgreSQL/outbound dispatch, se usado | **PARTIAL** | Existe contrato seguro de rascunho persistido e aprovação separada. Porém o `Copilot` atual não o utiliza: o texto vai diretamente para estado local do composer. `saveDraft/getDraft` no adapter local usam `localStorage`, não backend. |
| Aprovar/enviar rascunho | `POST /workspaces/:workspaceId/outbound-dispatches/:dispatchId/approve` | JWT, idempotency-key, regras de dispatch | Persistência e reconciliação pelo gateway | **PASS** contratual; **UNVERIFIED** runtime | O caminho de envio governado existe, mas precisa de teste com ator/dataset controlado e confirmação de que a UI nunca chama envio direto ao pressionar `Tab`. |
| Checklist onboarding — canais | `GET /api/v1/workspaces/:workspaceId/channels/whatsapp/status`, WABA `channel-info`, capabilities | JWT + `assertTenantAccess` | PostgreSQL/provider | **PARTIAL** | Há sinais separados de conexão, não uma resposta normalizada de onboarding. |
| Checklist onboarding — Pix/catálogo | Nenhuma rota agregada identificada para estado verificável de Pix e catálogo | — | — | **UNVERIFIED** | Não há contrato backend identificado que prove configuração atual. Não usar `localStorage`/fixtures como conclusão de setup.
| Checklist onboarding — primeiro lead atendido | Jornadas/mensagens permitem inferência, mas não há endpoint de checklist | JWT + workspace se consultado | PostgreSQL | **PARTIAL** | A inferência deve ser feita no backend, com definição explícita de “atendido”; a UI não deve calcular isso de forma heurística sem contrato.

## Achados

### P0-01 — fallback do Copilot falsifica sucesso

**Reprodução por código:** `apps/api/src/interfaces/http/routes/ai-copilot-routes.ts`, handler de `POST /api/v1/ai/copilot-suggestion`, bloco `catch` retorna `reply.code(200)` e texto comercial fixo.

**Esperado:** falha do provider deve produzir erro explícito (503/502) ou estado `unavailable`, sem texto comercial inventado; qualquer sugestão exibida deve carregar proveniência e fatos usados.

**Observado:** HTTP 200, `success:false`, porém com mensagem pronta que a UI pode colocar no composer.

**Impacto:** operador pode interpretar indisponibilidade como recomendação real; viola Truth in Data e pode produzir mensagem inadequada.

**Remediação:** trocar fallback por erro/estado indisponível; validar schema de saída; exigir facts/proveniência quando preço, agenda, Pix ou catálogo forem citados; alinhar provider ao plano aprovado (NVIDIA, se essa for a decisão do produto).

**Reteste:** simular timeout/erro do provider e provar que não existe `suggestedMessage` comercial utilizável, status não é 2xx e a UI mantém o composer sem alteração.

### P1-01 — não existe checklist de onboarding verificável

**Observado:** canais possuem endpoints separados; Pix, catálogo e primeiro lead não têm uma projeção agregada identificada.

**Impacto:** onboarding pode mostrar item concluído por inferência/local state, sem prova persistida.

**Remediação recomendada:** criar `GET /workspaces/:workspaceId/onboarding/status` autenticado, retornando itens com `status`, `source`, `checkedAt` e razão; cada item deve derivar de tabelas/provider reais. Não implementar apenas no frontend.

### P1-02 — adapter autenticado ainda não implementa a leitura rica usada pela UI

**Evidência:** `src/services/salesOsGateway.ts` declara `getJourneys`, `getJourneyById` e `getMessages`, mas o adapter autenticado lança `SalesOsOperationUnavailableError` para essas operações. As rotas backend correspondentes existem.

**Impacto:** contrato existe no servidor, mas a tela pode permanecer quebrada/indisponível no cliente real; isso é exatamente o tipo de divergência frontend/backend que a auditoria procura.

**Remediação:** conectar o adapter autenticado às rotas de cockpit, mapear paginação e detalhes, e remover dependência de fixtures/localStorage no caminho autenticado. Retestar com JWT e workspace real de homologação.

## Testes mínimos antes de liberar ergonomia

1. JWT ausente/inválido para cada rota: 401.
2. Workspace de outro tenant: 404/403 sem vazamento de dados.
3. Busca por nome e telefone com paginação, limite máximo e ordenação estável.
4. `J/K` após nova mensagem e alteração de prioridade: fila deve refletir banco, não cache local.
5. Provider do Copilot indisponível: sem fallback comercial e sem alteração do composer.
6. Sugestão válida: gerar draft persistido com idempotency-key; `Tab` apenas inserir texto, nunca aprovar/enviar.
7. Aprovação duplicada/retry: mesma decisão idempotente; envio externo somente após aprovação explícita.
8. Onboarding: cada item deve ter fonte backend e estado `unknown/unavailable` quando a dependência não responder.

## Go/No-Go

- `Cmd/Ctrl+K` limitado a navegação e leitura de contatos/jornadas: **GO condicionado** após teste autenticado.
- `J/K`: **GO condicionado** após adapter autenticado consumir cockpit-read.
- Copilot comercial em produção: **NO-GO** enquanto P0-01 estiver aberto.
- Onboarding verificável: **NO-GO** até existir projeção backend agregada.
- Nenhum deploy/VPS autorizado por este artefato.

