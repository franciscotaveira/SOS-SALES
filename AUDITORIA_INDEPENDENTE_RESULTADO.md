# Auditoria independente e adversarial — SOS Sales v2.0

**Data:** 21 de agosto de 2026  
**Escopo:** compilação, testes, E2E/produção, multi-tenancy, segurança, saúde e inspeção estática de interface.  
**Método:** execução local, leitura adversarial de código e três revisões independentes. Nenhuma alteração de código ou produção foi feita.

## Veredito geral

**[REPROVADO COM RESSALVAS]**

O build e a suíte automatizada estão verdes, e a produção respondeu aos health checks. Isso não compensa bloqueadores P0 de autorização, isolamento de tenant, webhook e armazenamento de token. O sistema não deve ser aprovado para escala ou para onboarding de tenants até a correção e revalidação desses pontos.

## Evidências de execução

| Área | Comando / método | Resultado |
|---|---|---|
| TypeScript frontend | `npx tsc --noEmit` | Exit 0 |
| API: tipos, testes e build | `npm run check:api` | Exit 0; 40 arquivos e 257 testes passaram; build API passou |
| Build frontend | `npm run build` | Exit 0; avisos de CSS `file:line` inválido e chunk de 952.63 kB |
| Criptografia Flows | `node scripts/test-flows-crypto.mjs` | Exit 0; round-trip local, não prova provider em produção |
| E2E produção | `node scripts/test-e2e-all-routes.js` | Exit 0; 9/9 respostas HTTP 200 autenticadas |
| Saúde produção | `curl https://crm.iaparavendas.tech/health` | HTTP 200, `status: ok`; identifica-se como `TX Commercial Core` |
| Prontidão produção | `curl https://crm.iaparavendas.tech/ready` | HTTP 200; database, Redis e worker `ok` |
| Dependências de produção | `npm audit --omit=dev --json` | 0 vulnerabilidades reportadas (231 deps de produção) |

### Testes deliberadamente não executados

| Comando | Motivo |
|---|---|
| `node scripts/test-haven-waba-e2e.mjs` | Publica webhook WAHA com timestamp e pode criar dado de produção. |
| `API_BASE=https://crm.iaparavendas.tech node scripts/test-all-system-features.js` | Pode ressuscitar jornada, gravar `CLOSED_WON` de R$150 e forçar reconciliação. |

Esses itens estão **não comprovados**, não falhos. Executá-los requer autorização explícita e dados/tenant de homologação isolados.

## Segurança e isolamento multi-tenant

### P0 — rotas de canal sem o escopo JWT/RLS

`whatsappChannelRoutes` é registrada fora de `operatorAuthRoutes`: `apps/api/src/interfaces/http/app.ts:209-231`. QR, logout, sincronização, limpeza de histórico e configuração WABA usam o `workspaceId` da URL sem ator autenticado ou verificação de membership.

### P0 — fallback de tenant padrão

IDs de workspace ausentes ou não reconhecidos caem na sessão default e aliases legados: `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts:13-48`. Com as rotas públicas, a sessão default pode ser operada por uma requisição arbitrária.

### P0 — webhook WAHA legado sem autenticação

A configuração aponta para o receptor legado (`whatsapp-channel-routes.ts:76,187`), que aceita `body.session` e grava diretamente (`:1179-1369`). O receptor seguro com HMAC é outro endpoint: `routes/webhooks/waha.ts:23-71`.

### P0 — token Meta em configuração pública

O access token é persistido em `channel_connections.public_config._secret_token`: `whatsapp-channel-routes.ts:399-409,527-539`. A migration define essa área como pública e concede SELECT a membros: `apps/api/supabase/migrations/20260814000001_initial_domain_schema.sql:122-156,1231-1243`.

### P0 — endpoints de IA sem autenticação

`aiCopilotRoutes` também é registrada fora do escopo autenticado: `app.ts:228`. Entre os endpoints expostos estão teste OpenRouter, sugestão comercial e visão (`ai-copilot-routes.ts:18-110,196-280`). A visão aceita URL/base64 e usa a chave configurada do servidor para chamar o provider (`multimodal-vision-analyzer.ts:45-150`). Isso permite consumo não autorizado e encaminhamento de URL não validada ao serviço externo.

### P1 — seleção WABA ambígua possível

O webhook oficial valida HMAC e descarta `phone_number_id` sem conexão mapeada (`waba-webhook.ts:94-109,231-244`), controle positivo. Porém a busca usa `LIMIT 1`, sem provider e sem unicidade do identificador (`:23-31`). Se houver duplicidade, a entrega ao tenant retornado é uma possibilidade real, ainda não exercitada em banco.

### P1 — TLS PostgreSQL sem validação de certificado

O pool de produção usa `ssl: { rejectUnauthorized: false }` para conexões não locais: `apps/api/src/infrastructure/database/pool.ts:12-22`; o runtime de produção repete a configuração: `deploy/production-runtime.mjs:38-58`. Isso impede validar a identidade do servidor PostgreSQL.

## Controles positivos confirmados

- Provisionamento gera sessão exclusiva `ws_<uuid>`: `postgres-workspace-provisioning-gateway.ts:83-91`.
- Webhook Meta Cloud verifica HMAC e rejeita `phone_number_id` não mapeado: `waba-webhook.ts:94-109,231-244`.
- Adaptador WAHA seguro e receptor legado bloqueiam grupos e broadcasts de criar jornada 1:1: `waha-webhook-adapter.ts:219` e `whatsapp-channel-routes.ts:1199`.
- Lockfiles existem e estão versionados; `npm audit --omit=dev` não reportou CVEs de produção.

## Interface e fluxos

Inspeção estática encontrou controles mortos ou inconsistentes:

- **P0:** confirmação de logout fecha modal, mas não chama `auth.signOut`: `src/components/layout/AppShell.tsx:1140-1146`; callback real vem de `src/App.tsx:859-863`.
- **P1:** paleta envia `analytics`, mas não há branch de render para esse estado: `AppShell.tsx:341`; `App.tsx:207-376,463-483`.
- **P1:** rota ativa de Intelligence usa fixtures/localStorage, não gateway: `ClientAgentHubView.tsx:77-87,101-116`.
- **P1:** Notes não reverte atualização otimista em falha: `NotesView.tsx:114-138`.
- **P2:** chevron em Groups depende de bubbling, sem handler próprio: `GroupsHubView.tsx:594,613-615`.
- **P2:** fallback de áudio cria rascunho `[Áudio]`, não envia áudio: `LiveCockpitView.tsx:1650-1686`.

Não houve validação real em navegador porque o binário de browse do gstack não está instalado e sua instalação única aguarda autorização. A inspeção estática já prova falhas, mas não prova todos os cliques restantes.

## Lacunas de cobertura

- Não foram encontrados testes para o webhook WAHA legado, QR/logout/sync/clear-history/configuração WABA, nem autorização/cross-tenant desses fluxos.
- O E2E de produção contém credenciais e workspace fixo; provar HTTP 200 não prova isolamento semântico ou comportamento adversarial.
- Health/ready provam disponibilidade de dependências, não a identidade correta do deployment. A resposta `TX Commercial Core` é uma divergência operacional.

## Ordem obrigatória de remediação

1. Desabilitar/remover o receptor WAHA legado e aceitar apenas webhook HMAC com `channelConnectionId`.
2. Registrar canais, IA, agentes e parceiros Meta dentro de JWT; derivar workspace do ator e verificar membership/role em toda ação.
3. Remover fallback/aliases default; workspace inválido deve falhar sem efeitos.
4. Mover tokens Meta para armazenamento secreto cifrado e retirar qualquer leitura por `public_config`.
5. Impor unicidade por provider + `phone_number_id`; recusar ambiguidade no webhook.
6. Corrigir logout, Analytics, dados locais de Intelligence e rollback otimista; adicionar regressões automatizadas.
7. Criar ambiente/tenant de homologação para scripts mutáveis e então executar E2E de WAHA e fluxo completo.
8. Usar CA válida/pinada para PostgreSQL em vez de `rejectUnauthorized: false`.

## Conclusão simples

O sistema compila, testa e responde, mas hoje não prova a barreira mais importante de um CRM multi-tenant: que uma empresa não consegue operar, receber dados ou usar credenciais de outra. A prioridade não é adicionar feature nem fazer deploy. É fechar essa fronteira e repetir a auditoria com testes negativos e homologação isolada.
