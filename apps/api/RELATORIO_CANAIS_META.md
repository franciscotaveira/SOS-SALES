# Relatório Canais Meta — apps/api

**Data:** 20 ago 2026
**Escopo:** auditoria e correção da integração Messenger / Instagram DM, estabilização do `npm run check:api` e pendências para fechar o MVP.

| Métrica | Valor |
| --- | --- |
| Testes | 257 / 257 passando (40 ficheiros) |
| Erros TypeScript | 0 |
| Falhas de isolamento de tenant corrigidas | 2 |
| Pendências abertas | 6 |

---

## O que foi feito

### 1. Isolamento de tenant no webhook Messenger/Instagram

`src/interfaces/http/routes/webhooks/messenger-webhook-handler.ts` — `resolveWorkspace()`

Quando o `pageId`/`igUserId` do evento não correspondia a nenhum canal, a função caía num fallback global: pegava a primeira `channel_connection` do banco inteiro, ordenada por `created_at`, sem filtro de workspace. Uma mensagem de uma página desconhecida seria roteada para o tenant mais antigo.

Fallback removido. Sem correspondência, retorna `{ workspaceId: null, channelConnectionId: null }` e os callers já existentes descartam o evento com log de aviso.

### 2. Normalização de workspaceId nas rotas Meta Partner

`src/interfaces/http/routes/meta-partner-routes.ts`

As 9 rotas (`links` GET/POST, `nlp/enable`, `welcome-screen`, `icebreakers`, `private-reply-config`, `private-reply`, `insights`, `conversations`) usavam o `workspaceId` cru do path. Agora passam por `normalizeWorkspaceUuid()` (importado de `./whatsapp-channel-routes.js`), o mesmo padrão de `agent-routes.ts`.

### 3. Testes sem tocar o Supabase cloud

- `src/infrastructure/database/pool.ts` — o DSN cloud hardcoded foi removido; `DATABASE_URL` vem do ambiente/`.env`, com fallback apenas para o Supabase local (`localhost:55432`). SSL desligado só em localhost.
- `package.json` — `test`, `test:integration` e `test:coverage` forçam `DATABASE_URL=${TEST_DATABASE_URL:-postgresql://postgres:postgres@localhost:55432/postgres}`. Antes disto 55 testes de integração falhavam contra produção.

### 4. Verificação

```text
npx tsc --noEmit               → sem erros
npm test (local :55432)        → 40 ficheiros, 257 testes, 0 falhas
npm run check:api (raiz)       → build ESM + DTS ok
PORT=3399 npx tsx src/index.ts → GET /health = {"status":"ok"}
```

---

## Pendências

| # | Item | Prioridade | Quem |
| --- | --- | --- | --- |
| 1 | Criar `apps/api/.env` com `DATABASE_URL` do Supabase cloud (gitignored). Sem isto o runtime liga ao Postgres local. Escrita bloqueada para mim por conter segredo. | **Bloqueante** | Francisco |
| 2 | Rotacionar a senha do utilizador `sos_sales_runtime` — a credencial esteve hardcoded no repositório. | **Segurança** | Francisco |
| 3 | Limpar as linhas de teste gravadas na base de produção em 20/08/2026 (execuções de testes de integração antes do pin do DSN local). | Alta | Francisco / Claude com acesso |
| 4 | Commit das alterações — nada foi commitado. Diff relevante: `pool.ts`, `package.json`, `messenger-webhook-handler.ts`, `meta-partner-routes.ts` (working tree já tinha outras modificações não relacionadas). | Alta | Claude (a pedido) |
| 5 | Validação end-to-end no Docker Lab (`localhost:3333`) e depois VPS, com webhook real da Meta. Nenhum evento real de Messenger/IG foi processado ponta a ponta. | Alta | Francisco + Claude |
| 6 | Hardening opcional: `SELECT public_config FROM channel_connections WHERE id = $1` em `processReferral` e `processCommentForPrivateReply` podem ganhar `AND workspace_id = $2`. O `id` já vem de lookup scoped — defesa em profundidade, não falha activa. | Baixa | Claude |

---

## Estado do MVP

Backend compila, suíte completa passa e os dois vazamentos de tenant estão fechados. **Não está a 100%:** sem `.env` o serviço não liga ao Supabase cloud, a credencial exposta ainda é válida e nenhum fluxo Meta foi exercitado no Docker Lab ou na VPS. Os itens 1–3 destravam o resto; o 5 é o que de facto prova o MVP.
