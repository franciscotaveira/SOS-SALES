# Plano de Execução — Remediação WABA, Meta Cloud, Messenger e Instagram Direct

> **Status em 2026-08-30:** documento histórico de diagnóstico e detalhamento técnico.
> A ordem canônica de construção foi substituída por
> `docs/plans/SOS_SALES_META_FIRST_MVP_MASTER_PLAN_2026-08-30.md`. Não execute os dois
> planos em paralelo. Reaproveite deste documento apenas evidências e tarefas convocadas
> pelo plano-mestre atual.

> Data: 26/08/2026
>
> Ambiente-alvo final: `https://crm.iaparavendas.tech`
>
> Baseline auditada: API `v2.0.0`, runtime commit `dd5bae7ab655451c6aadc94877f704a38baecfc1`
> Regra: Docker Lab primeiro. Produção somente com autorização explícita de Francisco.
> Executor local: seguir também `docs/audits/CLAUDE_FABLE_EXECUTION_PROMPT_SOS_SALES_2026-08-26.md`; Claude Fable não possui autorização para push, merge, VPS ou deploy.

## 0. Objetivo e definição de pronto

Restabelecer a correspondência verificável entre a interface e o backend para WABA, Meta Cloud, Messenger e Instagram Direct, sem perda de dados, vazamento de credenciais, envio involuntário ou falsa indicação visual de funcionamento.

### Premissa soberana do produto

O SOS Sales não é um CRM genérico ao qual WhatsApp e IA podem ser adicionados depois. Seu produto central é este ciclo indivisível:

```text
WABA/WhatsApp conectado
  → mensagem recebida e persistida
  → contato/jornada identificados
  → IA backend interpreta contexto e recomenda ou responde
  → operador supervisiona, assume ou devolve à IA
  → mensagem real é enviada
  → status entregue/lido/falhou retorna pelo webhook
  → histórico, SLA, funil e ROI são reconciliados
```

Se WABA/WhatsApp ou IA backend não estiverem comprovadamente operacionais, o SOS Sales não está pronto. Ocultar controles quebrados é apenas contenção temporária; não satisfaz a Definition of Done.

O trabalho somente estará concluído quando cada capacidade aplicável comprovar:

`UI → API → autenticação/RBAC → credencial segura → Meta Graph API → webhook/job → PostgreSQL → reload da UI`.

Health `200`, container ativo, botão renderizado ou conexão marcada como `CONNECTED` não constituem prova suficiente.

## 1. Fatos congelados da auditoria

### [KNOWN]

1. `channel_connection_secrets` em produção não possui `secret_kind` nem `secret_payload`.
2. O backend atual consulta essas colunas em WABA, Messenger, Instagram Direct, Private Reply, CAPI e Receptionist.
3. `GET .../channels/waba/templates` falha em produção com PostgreSQL `42703`.
4. Existe uma conexão `meta_cloud`, status `CONNECTED`, com `_secret_token` legado em `public_config`.
5. `META_VERIFY_TOKEN` e `META_APP_SECRET` não estão presentes no container da API.
6. `SOS_SALES_RUNTIME_FACTORY` permite que produção inicialize sem o fail-fast das credenciais Meta.
7. Order Details/Pix, Location, Product, Multi-product e Carousel retornam deliberadamente HTTP `501`.
8. `CanaisView.tsx` possui telefone, WABA ID e qualidade verde como fallback visual.
9. A tela `AgencyClientsManager` coleta nome, segmento, tagline, email do dono, telefone e provedor, mas `App.tsx` interrompe o modo autenticado com erro antes de chamar a API.
10. `POST /workspaces/init` é um contrato de primeiro acesso: se o ator já possui qualquer workspace, ele devolve o primeiro workspace e não cria uma subconta.
11. O provisionador atual cria sempre um canal WAHA desconectado e não aceita perfil comercial, dono convidado ou escolha de provedor.
12. A projeção autenticada de workspaces preenche segmento, tagline, operadores e canais com valores neutros porque o backend não entrega esses dados.

### Decisão de engenharia

Não executar cegamente `20260822091851_runtime_role_and_security_hardening.sql` em produção. Ela mistura compatibilidade de schema, backfill, papéis, grants, revogações e RLS. Criar migrations menores, forward-only e verificáveis.

## 2. Limites obrigatórios para o modelo executor

- Não modificar produção antes de concluir todos os gates do Lab.
- Não enviar WhatsApp, Messenger, Instagram Direct, Private Reply, template ou evento CAPI sem autorização específica.
- Não imprimir, registrar, versionar ou copiar valores de tokens.
- Não remover as colunas Vault existentes.
- Não apagar `_secret_token` antes de provar que o segredo foi migrado e consumido pelo backend.
- Não executar `supabase db reset`, `DROP`, `TRUNCATE`, `git reset --hard` ou limpeza de Redis.
- Não declarar uma capacidade operacional sem evidência correlacionada de ponta a ponta.
- Preservar alterações alheias no worktree; cada correção deve ter commit atômico.

## 3. Arquitetura-alvo

```text
UI autenticada
  │
  ▼
Fastify + JWT + tenant/RBAC
  │
  ├── public.channel_connections
  │     somente identificadores e configuração não secreta
  │
  ├── public.channel_connection_secrets
  │     secret_kind + secret_payload ou referência Vault resolvida pelo servidor
  │
  ▼
Meta Graph API
  │
  ▼
Webhook com challenge + HMAC SHA-256
  │
  ▼
Idempotência → contato → jornada → mensagem/evento → UI após reload
```

## 4. Ordem obrigatória de implementação

### Fase 1 — Congelamento, backup e preflight

Responsabilidade: obter evidência antes de qualquer escrita.

1. Registrar branch, `HEAD`, worktree, release local e manifest de produção.
2. Confirmar que Docker Lab e Supabase Lab estão saudáveis.
3. Inventariar migrations aplicadas no Lab e no remoto, somente leitura.
4. Gerar backup lógico restrito a:
   - `channel_connections`;
   - `channel_connection_secrets`;
   - `supabase_migrations.schema_migrations`.
5. Registrar somente contagens, nomes de colunas e chaves JSON; nunca valores secretos.

Gate F1:

- [ ] Backup criado, localização e checksum registrados.
- [ ] Schema antes da mudança registrado.
- [ ] Nenhuma mutação em produção.
- [ ] Worktree limpo ou alterações preexistentes preservadas.

### Fase 2 — Migration mínima de expansão no Lab

Criar uma migration nova em `apps/api/supabase/migrations/` posterior à última migration existente. Não editar migrations históricas.

Conteúdo obrigatório:

1. `ADD COLUMN IF NOT EXISTS secret_kind TEXT`.
2. `ADD COLUMN IF NOT EXISTS secret_payload JSONB`.
3. Backfill explícito dos registros existentes.
4. Tornar as colunas `NOT NULL` somente depois do backfill.
5. Criar constraint única `(channel_connection_id, secret_kind)` de forma idempotente.
6. Criar índice por `secret_kind`.
7. Não alterar grants/RLS nesta migration.
8. Não remover `_secret_token` nesta fase.

Requisitos do backfill:

- `_secret_token` ou `pageAccessToken` → `meta_bearer_token` / `{accessToken}`.
- `metaAccessToken` ou `meta_capi_access_token` → `meta_capi_token`.
- `verifyToken` → `meta_webhook_verify_token` / `{verifyToken}`.
- `ON CONFLICT` não pode sobrescrever um segredo novo já existente com valor vazio ou legado.
- Ignorar valores vazios.

Testes obrigatórios:

- Banco vazio.
- Registro legado com token.
- Registro já migrado.
- Execução dupla da migration.
- Dois tipos de segredo para a mesma conexão.
- Nenhum token exposto em saída de teste.

Gate F2:

- [ ] Migration executada duas vezes no Lab sem erro.
- [ ] Contagem antes/depois reconciliada.
- [ ] Backend recupera credenciais pelo novo contrato.
- [ ] Colunas Vault antigas continuam intactas.

### Fase 3 — Centralizar o acesso a segredos

Problema: consultas duplicadas ao schema aparecem em múltiplos serviços.

Criar um gateway único, por exemplo:

`apps/api/src/infrastructure/security/postgres-channel-secret-store.ts`

Contrato mínimo:

```ts
type ChannelSecretKind =
  | 'meta_bearer_token'
  | 'meta_capi_token'
  | 'meta_webhook_verify_token';

interface ChannelSecretStore {
  find(workspaceId: string, connectionId: string, kind: ChannelSecretKind): Promise<Record<string, unknown> | null>;
  upsert(workspaceId: string, connectionId: string, kind: ChannelSecretKind, payload: Record<string, unknown>): Promise<void>;
}
```

Regras:

- Sempre filtrar por `workspace_id` e `channel_connection_id`.
- Não aceitar busca global por conexão.
- Não retornar segredo para frontend.
- Logs devem conter somente `workspaceId`, `connectionId`, `kind` e resultado presente/ausente.
- Se existir estratégia Vault, resolver dentro do gateway, não nas rotas.

Substituir consultas diretas nestes pontos:

- `apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`
- `apps/api/src/interfaces/http/routes/meta-partner-routes.ts`
- `apps/api/src/application/services/private-reply-service.ts`
- `apps/api/src/application/agents/receptionist-agent.ts`
- `apps/api/src/interfaces/http/routes/commercial-outcomes.ts`

Gate F3:

- [ ] Não existem novas consultas de segredo duplicadas nas rotas.
- [ ] Teste cross-tenant impede conexão de outro workspace.
- [ ] Ausência de segredo resulta em erro explícito e fail-closed.
- [ ] Testes antigos e novos passam.

### Fase 3A — Provisionamento completo de clientes e subcontas da agência

Esta fase resolve diretamente a função “Criar Nova Conta de Cliente”. Não reutilizar `/workspaces/init`: primeiro acesso e criação administrativa de subconta possuem autorização, idempotência e efeitos diferentes.

#### 3A.1 — Modelo de autorização

Criar uma permissão explícita de agência, sem inferir poder pelo frontend:

- somente `owner` de workspace com `tier/tenant_type = agency`, ou claim administrativa equivalente comprovada pelo backend, pode provisionar subcontas;
- operador/viewer recebe `403`;
- usuário de uma empresa comum não pode criar tenants;
- toda decisão deve ser auditada com ator, workspace-agência, workspace criado e request ID.

Se o schema ainda não diferencia agência de cliente, criar campo ou tabela de relacionamento explícita. Não confiar em slug, nome, UUID conhecido ou `tier` fabricado no adaptador frontend.

#### 3A.2 — Schema mínimo

Criar migrations forward-only para os dados que hoje existem apenas no formulário/UI:

1. `workspace_profiles` (ou extensão equivalente normalizada):
   - `workspace_id` PK/FK;
   - `business_type` validado;
   - `tagline`;
   - `owner_email_pending` somente se necessário ao fluxo de convite;
   - `whatsapp_contact_number` normalizado em E.164;
   - `preferred_channel_provider` (`waba` ou `waha`);
   - `onboarding_status`;
   - timestamps.
2. Relação agência → cliente, por exemplo `agency_client_workspaces`:
   - `agency_workspace_id`;
   - `client_workspace_id` único;
   - `status` (`PROVISIONING`, `ACTIVE`, `SUSPENDED`, `FAILED`);
   - `created_by_user_id`;
   - timestamps.
3. `workspace_provisioning_requests` para idempotência e rastreabilidade:
   - `idempotency_key` única por agência;
   - hash normalizado do payload;
   - estado e erro sanitizado;
   - IDs dos recursos criados.

Não salvar convite, senha, token de acesso ou chave Meta nessas tabelas.

#### 3A.3 — Contrato da API

Criar endpoint autenticado separado:

```http
POST /api/v1/agencies/:agencyWorkspaceId/client-workspaces
Idempotency-Key: <uuid>
```

Payload:

```json
{
  "name": "Jacob - Adv",
  "businessType": "general_services",
  "tagline": "Escritório de advocacia migratória",
  "ownerEmail": "owner@example.com",
  "whatsappNumber": "+15082501315",
  "preferredProvider": "waba"
}
```

Resposta `201`:

```json
{
  "data": {
    "workspace": {},
    "profile": {},
    "membership": { "status": "INVITED_OR_PENDING" },
    "channel": { "status": "PENDING_CONFIGURATION" },
    "onboarding": { "nextStep": "CONNECT_META" }
  }
}
```

Regras:

- validar nome, email, enum, tamanho da tagline e telefone E.164;
- gerar slug único no backend, com colisão determinística;
- exigir `Idempotency-Key` e devolver o mesmo resultado para replay idêntico;
- mesma chave com payload diferente retorna `409`;
- nunca retornar `WABA CONNECTED` durante o provisionamento;
- provider escolhido representa intenção de configuração, não conexão ativa;
- se telefone estiver vazio, persistir `null`, nunca número fictício.

#### 3A.4 — Transação e saga de convite

Dentro de uma transação PostgreSQL:

1. registrar request idempotente;
2. criar workspace;
3. criar relação agência-cliente;
4. criar perfil;
5. criar membership do ator-agência com papel administrativo permitido;
6. criar canal:
   - WABA: `meta_cloud / PENDING_CONFIGURATION`, sem token e sem WABA ID;
   - WAHA: `waha / DISCONNECTED`, com session name dedicado;
7. criar configuração de IA fail-closed, sem bot globalmente ativo;
8. confirmar a transação.

O convite Supabase Auth é efeito externo e não deve ficar dentro da transação do banco. Executar como saga/outbox após commit:

- email vazio: pular convite e manter `OWNER_PENDING`;
- usuário já existente: criar membership idempotente;
- usuário inexistente: enfileirar convite oficial;
- falha no convite: workspace continua criado em `OWNER_INVITE_FAILED`, com ação de reenviar; não apagar silenciosamente a conta;
- nunca criar usuário com senha fixa ou conhecida pelo operador.

#### 3A.5 — Leitura e gerenciamento

Expandir `GET /workspaces` ou criar projeção específica para devolver dados reais:

- perfil comercial;
- relação com agência;
- contagem real de memberships ativas;
- canais reais e status;
- onboarding status;
- papel do ator.

Implementar também, com RBAC e auditoria:

- `GET /api/v1/agencies/:agencyWorkspaceId/client-workspaces`;
- `GET /api/v1/agencies/:agencyWorkspaceId/client-workspaces/:clientWorkspaceId`;
- `PATCH` de perfil comercial;
- reenviar convite do dono;
- suspender/reativar sem apagar dados;
- transferir owner com proteção de último owner;
- arquivar apenas com confirmação forte e política de retenção, fora do primeiro release se não houver requisito aprovado.

#### 3A.6 — Integração frontend

Arquivos:

- `src/components/clients/AgencyClientsManager.tsx`
- `src/App.tsx`
- `src/services/salesOsGateway.ts`
- tipos de workspace/API relacionados.

Alterações:

1. Adicionar método real `createClientWorkspace` ao gateway HTTP.
2. Remover o `throw` que bloqueia o modo autenticado somente quando o contrato estiver implementado e testado.
3. Remover toda criação local de IDs, canal conectado e WABA fictício do fluxo autenticado.
4. Após `201`, refazer a consulta ao backend; não inserir manualmente um workspace fabricado no estado React.
5. Selecionar o novo workspace somente depois de confirmar que ele aparece na projeção autorizada.
6. Exibir progresso real por etapa: criando empresa, preparando canal, convite pendente/concluído.
7. Sucesso deve dizer “Conta criada; conexão WhatsApp pendente”, nunca “WABA criado”.
8. Falha/replay deve manter o formulário e permitir tentativa segura com a mesma chave.
9. Desabilitar envio enquanto request estiver em voo e impedir duplo clique.

#### 3A.7 — Testes obrigatórios

- owner de agência cria cliente: `201`;
- operator/viewer: `403`;
- owner de tenant comum: `403`;
- JWT ausente: `401`;
- idempotência com mesma chave/payload;
- conflito mesma chave/payload diferente: `409`;
- slug duplicado;
- email inválido e telefone inválido;
- WABA nasce `PENDING_CONFIGURATION` e sem segredo;
- WAHA nasce `DISCONNECTED`;
- convite existente, novo, ausente e falho;
- rollback em falha de cada insert transacional;
- isolamento: agência A não lê/altera cliente da agência B;
- reload da aplicação mantém perfil, canal, operadores e status;
- criação concorrente não duplica workspace;
- bot/Receptionist permanece desligado até configuração explícita.

Gate F3A:

- [ ] A conta aparece após reload usando somente dados do backend.
- [ ] Nenhum ID, telefone, canal, WABA ou status conectado é inventado.
- [ ] Relação agência-cliente e RBAC estão comprovados.
- [ ] Convite possui estado e recuperação observáveis.
- [ ] WABA/WAHA iniciam em estados fail-closed corretos.
- [ ] Idempotência e concorrência estão cobertas.
- [ ] Outra agência não acessa a subconta.

### Fase 4 — Corrigir configuração e fail-fast do webhook

Arquivos:

- `docker-compose.prod.yml`
- `apps/api/src/server.ts`
- `.env.example` ou documentação equivalente, sem valores reais.

Alterações:

1. Encaminhar ao container:
   - `META_VERIFY_TOKEN=${META_VERIFY_TOKEN}`
   - `META_APP_SECRET=${META_APP_SECRET}`
2. Em `NODE_ENV=production`, exigir ambas as variáveis independentemente de `SOS_SALES_RUNTIME_FACTORY`.
3. Runtime customizado somente pode flexibilizar credenciais em teste/Lab.
4. Manter challenge com comparação timing-safe.
5. Manter POST com validação do corpo bruto e `X-Hub-Signature-256`.

Testes:

- Produção sem uma variável deve recusar inicialização.
- Lab pode usar stubs explícitos.
- Challenge correto retorna o challenge.
- Token incorreto retorna `403`.
- Assinatura ausente/incorreta retorna `401`.
- Assinatura correta aceita o evento uma vez.
- Replay não cria uma segunda mensagem.

Gate F4:

- [ ] API de perfil `production` não inicia sem credenciais.
- [ ] Testes de challenge, assinatura e replay passam.
- [ ] Nenhum segredo aparece nos logs.

### Fase 5 — Tornar a UI fail-closed

Arquivos prioritários:

- `src/components/channels/CanaisView.tsx`
- `src/components/cockpit/WabaActionsModal.tsx`
- componentes de templates/campanhas que consomem `/channels/waba/templates`.

Alterações obrigatórias:

1. Remover telefone fixo, WABA ID fixo e qualquer identidade Meta de fallback.
2. Corrigir o rótulo de qualidade; mapear `GREEN`, `YELLOW`, `RED` e desconhecido.
3. Se `channel-info` falhar, mostrar “Status Meta não verificado”.
4. Se templates falharem, limpar dados anteriores e mostrar erro dominante.
5. Consumir `/channels/waba/capabilities` como fonte de verdade.
6. Ocultar ou desabilitar Order Details/Pix, Location, Product, Multi-product e Carousel enquanto forem `false`.
7. Nunca converter erro de API em status conectado.

Estados visuais obrigatórios:

- loading;
- conectado e verificado;
- não configurado;
- erro de backend;
- credencial expirada/permissão insuficiente;
- capacidade não homologada.

Gate F5:

- [ ] Busca textual não encontra os fallbacks auditados.
- [ ] Cada estado possui teste de componente.
- [ ] Interface não oferece ação cujo backend declara `false`.
- [ ] Erros permanecem visíveis após reload.

### Fase 6 — Contratos, OpenAPI e testes automatizados

Atualizar `openapi.yaml` e `openapi.json` para refletir todas as rotas Meta realmente expostas.

Cobertura mínima:

| Área | Testes exigidos |
|---|---|
| Auth | sem JWT `401`; tenant alheio `403` |
| Channel info | conectado, ausente, ambíguo |
| Secrets | presente, ausente, cross-tenant, múltiplos kinds |
| Templates | sucesso Meta, token expirado, permissão, rate limit |
| Webhook | challenge, HMAC, payload ignorado, replay |
| Messenger/Direct | workspace resolvido e não resolvido |
| Private Reply | configuração, dedupe, limite Meta |
| Capabilities | UI e API com mesma matriz |
| Migração | primeira e segunda execução |

Não usar chamadas reais da Meta nos testes automatizados; mockar a fronteira HTTP e validar payloads/erros.

Gate F6:

- [ ] Frontend TypeScript passa.
- [ ] Build frontend passa.
- [ ] Build API passa.
- [ ] Suíte API completa passa.
- [ ] Novos testes de regressão passam isoladamente.
- [ ] OpenAPI corresponde às rotas registradas.

### Fase 6A — Auditoria e fechamento de todas as funções visíveis

Objetivo: impedir que outras funções permaneçam somente no frontend, usem fallback local ou apontem para contratos incompletos.

#### 6A.1 — Inventário por tela

Percorrer em desktop `1440×900` e notebook `1280×720`, antes de qualquer validação mobile:

- Agora/Cockpit;
- Conversas;
- Kanban/Funil;
- Agenda;
- Grupos;
- Resultados/Dashboard;
- Campanhas, CTWA, Broadcast e Templates;
- Inteligência, Catálogo, Base de Conhecimento e Agentes;
- Clientes/Subcontas;
- Canais;
- Equipe/RBAC;
- Tracking/CAPI;
- API/Webhooks;
- Feature flags e demais configurações.

Para cada elemento visível registrar:

| Campo | Conteúdo obrigatório |
|---|---|
| Tela/controle | nome e localização |
| Promessa ao usuário | resultado esperado |
| Visibilidade | papel/estado que pode ver |
| API chamada | método e rota reais |
| Auth/RBAC | papel mínimo e tenant check |
| Provider/job | Meta, WAHA, worker ou nenhum |
| Persistência | tabela/evento de verdade |
| Reload | estado permanece após recarregar? |
| Falha | erro explícito e recuperável? |
| Status | PASS, FAIL, BLOCKED, UNVERIFIED, REDUNDANT |

#### 6A.2 — Regras de verdade funcional

- `onClick`, toast ou alteração React não contam como sucesso.
- `localStorage` não pode ser fonte de verdade no modo autenticado.
- Dados de fixture/mock não podem aparecer em produção.
- Todo botão mutável precisa de endpoint, validação, RBAC, idempotência quando aplicável e reload.
- Todo status precisa vir do backend/provider; não inferir “online” por existência de configuração.
- Função não implementada deve ser removida, desabilitada ou rotulada como indisponível.
- Ações redundantes devem ser realocadas ou consolidadas, sem duplicar caminhos com contratos diferentes.

#### 6A.3 — Varredura estática obrigatória

Localizar e revisar:

- handlers que apenas alteram estado local;
- `localStorage`, fixtures, `mock`, `demo`, fallbacks e IDs fixos;
- `catch` vazio ou erro ignorado;
- botões sem `onClick` e formulários sem request;
- requests para rotas ausentes no OpenAPI/backend;
- respostas `501`, `404`, `500` e sucesso fabricado;
- números, preços, telefones, WABA IDs e métricas hardcoded;
- capability flags definidas apenas no frontend;
- ações destrutivas sem confirmação/RBAC.

Cada ocorrência precisa ser ligada a uma linha da matriz, não apenas listada.

#### 6A.4 — Fechamento por prioridade

1. P0: segurança, tenant isolation, mensagens, dinheiro, IA autônoma e exclusão.
2. P1: criação/edição que não persiste, contratos quebrados e status falsos.
3. P2: redundância, realocação, carga cognitiva e mensagens pouco claras.
4. P3: refinamento cosmético sem impacto operacional.

Para P0/P1, corrigir ou ocultar antes do release. P2/P3 podem ser deferidos somente com aceite explícito e sem promessa funcional falsa.

#### 6A.5 — Critério de prova por ação

Para toda ação crítica coletar evidência correlacionada:

1. screenshot antes;
2. request/response sanitizado;
3. log com request/correlation ID;
4. estado no banco/job/provider;
5. screenshot depois;
6. reload e reconciliação;
7. teste negativo de auth/tenant;
8. retry/idempotência quando aplicável.

Gate F6A:

- [ ] 100% das telas alcançáveis possuem inventário.
- [ ] 100% dos controles visíveis possuem classificação.
- [ ] Nenhuma ação P0/P1 está somente no frontend.
- [ ] Nenhuma função indisponível comunica sucesso ou status conectado.
- [ ] Toda mutação crítica persiste e sobrevive ao reload.
- [ ] Matriz final aponta owner, correção, teste e evidência.

### Fase 7 — Validação integrada no Docker Lab

Executar o build conforme `docker-compose.lab.yml`. Não copiar bundle manualmente se o build reproduzível estiver funcionando; registrar qualquer exceção.

Cenários no Lab:

1. Login e acesso à tela de canais.
2. Channel-info com configuração ausente.
3. Configuração Meta de teste com token mockado.
4. Templates mockados.
5. Capabilities aplicadas na UI.
6. Webhook assinado de teste.
7. Persistência de mensagem simulada.
8. Reload e mesma mensagem visível.
9. Replay sem duplicação.
10. Workspace não mapeado não recebe evento.
11. Agência cria subconta autenticada.
12. Subconta aparece após reload com perfil real.
13. Canal escolhido aparece pendente/desconectado, nunca conectado automaticamente.
14. Convite de owner fica observável e recuperável.
15. Tentativa cross-agency recebe `403`.

Gate F7:

- [ ] Evidência UI, API, log correlacionado e banco para cada cenário.
- [ ] Nenhum erro inesperado no console.
- [ ] Nenhum dado mock apresentado como produção.
- [ ] Zero envio externo.

### Fase 8 — Preparar release, sem implantar

1. Gerar release manifest.
2. Registrar migrations incluídas.
3. Produzir diff de schema esperado.
4. Criar runbook de deploy e rollback.
5. Confirmar backup e janela de manutenção.
6. Parar e solicitar autorização explícita.

O modelo executor deve apresentar:

- commit/branch;
- arquivos modificados;
- testes executados e códigos de saída;
- riscos residuais;
- SQL exato que será aplicado;
- comandos exatos de deploy;
- rollback operacional;
- canário proposto.

Gate F8: **aprovação humana obrigatória**.

### Fase 9 — Produção, somente após aprovação

Sequência:

1. Confirmar novamente commit e versão atualmente implantada.
2. Realizar backup remoto.
3. Aplicar somente a migration de expansão validada.
4. Reconciliar contagens e presença de segredos, sem exibir valores.
5. Implantar API/frontend testados no Lab.
6. Recriar o container da API para carregar novas variáveis; `docker restart` isolado não relê `env_file`.
7. Validar health, ready, version e logs.
8. Validar negativos de autenticação e assinatura.
9. Não executar outbound ainda.

Stop conditions:

- Migration divergiu do dry-run.
- Contagem de segredos não reconciliou.
- API não inicia.
- Health degrada banco/Redis/worker.
- Aparecem erros de tenant, auth ou segredo em log.

Rollback:

- Voltar a imagem/artefato anterior da API e frontend.
- Manter colunas aditivas da migration.
- Não remover colunas durante incidente.
- Desativar recursos Meta na UI/feature flag se necessário.

### Fase 9A — Golden Path obrigatório: WABA/WhatsApp + IA

Antes de qualquer alegação de MVP pronto, implementar e comprovar no backend real:

#### 9A.1 — Conexão oficial WABA

- Embedded Signup/Login Auth ou configuração manual validada pela Graph API;
- persistência segura de WABA ID, Phone Number ID e token;
- webhook challenge configurável e assinatura HMAC obrigatória;
- status real da conta, telefone, qualidade e permissões;
- reconexão/renovação de token com erro acionável;
- estados: `PENDING_CONFIGURATION`, `VERIFYING`, `CONNECTED`, `DEGRADED`, `DISCONNECTED`, `TOKEN_EXPIRED`.

#### 9A.2 — Inbound WhatsApp oficial

- texto, mídia, áudio, localização, contato e respostas interativas;
- dedupe por provider message ID;
- resolução tenant pelo Phone Number ID, sem fallback global;
- criação/atualização de contato e jornada;
- persistência da mensagem antes de acionar IA;
- download de mídia autenticado e referência segura;
- falha recuperável por fila/dead-letter;
- atualização da UI em tempo real e confirmação após reload.

#### 9A.3 — Outbound WhatsApp oficial

- texto dentro da janela de atendimento;
- template aprovado fora da janela;
- botões, listas e mídia;
- status `QUEUED`, `SENT`, `DELIVERED`, `READ`, `FAILED` reconciliado por webhook;
- idempotência contra envio duplicado;
- retries somente para falhas transitórias, com limite;
- erros Meta traduzidos em problema, causa e ação recomendada.

#### 9A.4 — IA de atendimento no backend

- nenhuma decisão de atendimento pode existir apenas no frontend;
- configuração publicada e versionada por workspace;
- prompt, catálogo, políticas, horários, preços e links carregados de fontes persistidas;
- desconhecido não pode virar fato, preço ou serviço;
- classificação e resposta produzem envelope validado por schema;
- timeout, indisponibilidade ou resposta inválida resultam em fail-closed e fila humana;
- bot responde somente quando workspace, jornada e política autorizarem;
- pedido humano, risco, baixa confiança e tema proibido geram handoff;
- decisão registra modelo, versão da configuração, evidências e correlation ID;
- operador pode pausar, assumir, editar sugestão e retomar;
- copiloto/`Tab` apenas preenche o composer, nunca envia automaticamente.

#### 9A.5 — Orquestração recuperável

```text
Webhook válido
  → idempotency gate
  → persistir evento bruto
  → normalizar mensagem
  → resolver tenant/contato/jornada
  → persistir mensagem
  → avaliar bot_enabled + bot_paused_at + política
  → carregar configuração publicada e fatos permitidos
  → inferência com timeout/schema/guardrails
  → handoff OU criar outbound idempotente
  → enviar pela WABA
  → persistir provider_message_id
  → reconciliar status pelo webhook
  → atualizar cockpit
```

Proibido depender de `setImmediate()` sem fila persistente, retry controlado e observabilidade. O webhook deve responder rapidamente após registrar o evento; processamento posterior precisa sobreviver a restart.

#### 9A.6 — WAHA complementar, não mascarador

- identificar claramente qual engine atende cada conversa;
- impedir ingestão duplicada por WABA e WAHA;
- dedupe cross-provider durante migração;
- não fazer fallback automático WABA → WAHA sem política e consentimento;
- isolar credenciais, sessões, webhooks e saúde por workspace.

Gate F9A:

- [ ] WABA conecta e retorna identidade real da conta controlada.
- [ ] Inbound real aparece no Cockpit e permanece após reload.
- [ ] IA backend usa a configuração publicada do workspace correto.
- [ ] Resposta desconhecida não inventa preço, serviço ou política.
- [ ] Handoff humano pausa o bot antes de novo envio.
- [ ] Outbound idempotente chega ao destinatário autorizado.
- [ ] Status entregue/lido/falhou é reconciliado.
- [ ] Restart da API/worker não perde nem duplica eventos.
- [ ] Tenant alheio não lê, configura ou envia pelo canal.
- [ ] Métricas/SLA derivam das mensagens persistidas, não de fixtures.

### Fase 10 — Canário oficial controlado

Exige cartão de autorização contendo:

- workspace de teste;
- conta/número WABA de teste;
- Page/Instagram Business de teste;
- remetente e destinatário autorizados;
- ações permitidas;
- horário;
- responsável pela limpeza;
- chave de idempotência;
- rollback;
- autorização registrada.

Executar separadamente:

1. Inbound WABA.
2. Status enviado/entregue/lido quando disponível.
3. Outbound WABA simples.
4. Template aprovado.
5. Messenger inbound/outbound.
6. Instagram Direct inbound/outbound.
7. Private Reply em comentário de teste.
8. CAPI com `test_event_code`, se autorizado.

Cada cenário precisa de correlação única entre request, provider ID, webhook, registro no banco e UI após reload.

## 5. Escopo funcional e ordem de homologação

As capacidades WhatsApp já prometidas pela interface não serão apenas ocultadas. Devem ser implementadas e homologadas em ondas.

### Onda A — Núcleo que bloqueia o MVP

- conexão WABA e webhook;
- inbound/outbound de texto;
- templates e mídia essencial;
- persistência e status;
- IA backend, guardrails, handoff e supervisão;
- provisionamento de subconta e canal pendente;
- tenant isolation, filas e observabilidade.

### Onda B — Operação comercial essencial

- botões, listas e WhatsApp Flows;
- localização, áudio e documentos;
- campanhas/broadcast com templates e consentimento;
- Messenger, Instagram Direct e Private Reply;
- tracking CTWA/CAPI reconciliado.

### Onda C — Arsenal avançado

- Order Details/Pix;
- Product e Multi-product;
- Carousel;
- chamada/OTP, quando houver caso de negócio e permissão Meta;
- automações avançadas de recuperação.

Durante a construção, capability não homologada fica desabilitada com estado explícito. Para declarar o programa completo, cada capability visível precisa estar implementada e homologada ou formalmente removida do produto por decisão de Francisco — nunca apenas escondida pelo modelo executor.

Refinamento visual amplo, billing e métricas financeiras continuam fora desta remediação, exceto quando dependem diretamente da verdade das mensagens/receita e exibem dados falsos.

## 6. Estratégia de commits

1. `test(db): cover legacy channel secret expansion`
2. `feat(db): add forward-only channel secret compatibility migration`
3. `refactor(meta): centralize tenant-scoped channel secret access`
4. `fix(meta): require webhook credentials in production runtime`
5. `fix(ui): remove fabricated WABA identity and status fallbacks`
6. `fix(ui): gate WABA actions by backend capabilities`
7. `docs(api): publish WABA and Meta Partner contracts`
8. `test(meta): cover webhook, templates, direct and tenant isolation`
9. `feat(db): add agency client workspace provisioning state`
10. `feat(api): provision agency client workspaces idempotently`
11. `feat(auth): deliver recoverable client owner invitations`
12. `fix(ui): persist and reload agency client accounts from API`
13. `test(tenancy): cover agency provisioning isolation and replay`

Um commit por responsabilidade. Não combinar migration, UI e deploy.

## 7. Definition of Done

- [ ] Nenhum segredo Meta permanece em `public_config` após a fase de contração aprovada.
- [ ] O backend usa um único gateway de segredos tenant-scoped.
- [ ] Produção recusa inicialização sem credenciais de webhook.
- [ ] UI não mostra telefone, WABA ID, qualidade ou conexão inventados.
- [ ] UI não oferece capacidades não homologadas.
- [ ] Templates WABA deixam de retornar erro de schema.
- [ ] Messenger, Instagram Direct e Private Reply deixam de depender do schema inexistente.
- [ ] OpenAPI documenta os contratos reais.
- [ ] Testes, build e Docker Lab passam.
- [ ] Canário oficial prova persistência, idempotência e reload.
- [ ] Relatório final separa PASS, FAIL, BLOCKED e UNVERIFIED.
- [ ] “Criar Conta de Cliente” cria uma subconta real e reaparece após reload.
- [ ] Perfil, relação com agência, membership e canal inicial são persistidos.
- [ ] O owner é associado ou convidado por fluxo oficial e recuperável.
- [ ] Nenhuma subconta nasce com WABA/WAHA falsamente conectado.
- [ ] Criação é idempotente, transacional e isolada entre agências.
- [ ] Todas as funções visíveis foram inventariadas e classificadas por tela.
- [ ] Nenhuma função P0/P1 permanece apenas no frontend ou sem prova após reload.
- [ ] Golden Path WABA/WhatsApp + IA passa de ponta a ponta em produção controlada.
- [ ] IA de atendimento roda no backend com fila persistente, guardrails e handoff.
- [ ] Inbound, outbound e status sobrevivem a restart sem perda ou duplicação.
- [ ] Capacidades das ondas A e B estão homologadas antes da alegação de produto completo.
- [ ] Capacidade avançada visível está implementada ou removida por decisão explícita, não apenas ocultada.

## 8. Formato obrigatório de reporte do modelo executor

Ao final de cada fase, responder:

```text
FASE:
STATUS: PASS | FAIL | BLOCKED
ALTERAÇÕES:
EVIDÊNCIAS:
TESTES E EXIT CODES:
RISCOS RESIDUAIS:
PRÓXIMO GATE:
AUTORIZAÇÃO NECESSÁRIA:
```

Se qualquer gate falhar, o modelo deve parar. Não pode avançar “para ver se resolve depois”.
