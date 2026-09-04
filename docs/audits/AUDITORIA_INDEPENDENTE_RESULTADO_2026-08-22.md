# SOS Sales v2.0 — Auditoria Independente e Adversarial

**Data de corte:** 22 de agosto de 2026, 07:33 BRT  
**Escopo:** checkout local, histórico Git público, Docker Lab, Supabase local,
VPS de produção, edge Caddy, banco de produção, dependências, multi-tenancy,
webhooks, agentes e backups.  
**Veredito:** **NO-GO para promoção**  
**Produção:** **CONTAINED_PARTIAL / CREDENTIAL INCIDENT REOPENED**  
**Lab:** **HOMOLOGAÇÃO PARCIAL**

## Atualização independente — quarta rodada da Fase B

Esta rodada resolveu de forma reproduzível os dois bloqueadores funcionais que
restavam, mas introduziu um risco destrutivo no utilitário de teardown e ainda
não fechou a proveniência Git.

### Aprovado por reprodução independente

- Callbacks originados pelo `WebhookSender` do container WAHA alcançam a API e
  retornam HTTP 200 repetidamente. O segredo saiu da query string e é enviado
  por header configurado na sessão.
- `npm test` executou 48/48 arquivos e 322/322 testes e chamou o cleanup como
  parte do próprio script.
- Sem reset entre a suíte e a aferição, o banco terminou com exatamente uma
  linha nas sete entidades canônicas verificadas.
- Typecheck da API permanece com exit 0.
- Runtime do Lab informa `v2.0.0-lab` e `environment: lab`.

### Bloqueadores remanescentes

1. **Cleanup destrutivo sem guarda de ambiente.**
   `cleanup-test-fixtures.mjs` aceita `TEST_DATABASE_URL` ou `DATABASE_URL`,
   executa `SET LOCAL session_replication_role = 'replica'` e uma sequência de
   `DELETE`s sem validar hostname, porta, database, marcador explícito de Lab ou
   fingerprint do seed. Uma variável configurada incorretamente pode direcionar
   o teardown para banco remoto. O script deve reutilizar o guard fail-closed do
   Lab, recusar qualquer host não local, exigir opt-in explícito e validar a
   identidade do banco antes da primeira mutação.
2. **Proveniência Git não consolidada.** O checkout possui 56 entradas
   modificadas/não rastreadas e o manifesto registra `cleanTree: false`.
3. **Artefato local divergente do runtime.** Após executar o gerador sem
   `APP_ENV=lab`, `apps/api/dist/release-manifest.json` voltou a declarar
   `v2.0.0-prod`/`production`, enquanto o container ainda serve o manifesto Lab
   anterior. Isso demonstra que o default do gerador continua perigoso e que o
   artefato em disco não corresponde ao runtime validado.

**Veredito atualizado:** integração funcional do Docker Lab aprovada; Fase B
permanece **NÃO ENCERRADA** até blindar o cleanup contra banco remoto, tornar o
gerador fail-closed sem ambiente explícito e produzir commit/manifesto clean e
reconciliado. Isso não autoriza deploy ou remoção da contenção em produção.

## Atualização independente — terceira alegação de fechamento da Fase B

A nova rodada corrigiu a identidade do manifesto e comprovou um teste sintético
completo da rota de ingestão, mas não resolveu a integração originada pelo WAHA
nem implementou teardown automático. A declaração de "todas as 4 metas
comprovadas" é, portanto, rejeitada.

### Confirmado

- Typecheck da API permanece com exit 0.
- `/health` agora retorna `release: "v2.0.0-lab"` e `environment: "lab"`.
- `scripts/verify-waha-webhook-e2e.mjs` comprova, por POST fabricado pelo próprio
  script, rejeição sem chave, aceitação com `x-api-key`, persistência e
  deduplicação na rota da API.
- Após `supabase db reset`, a verificação confirma as sete contagens esperadas
  do seed.

### Não comprovado ou refutado

1. **O container WAHA real continua falhando.** Seus eventos `session.status`
   alcançam `http://api-lab:4334`, mas retornam repetidamente HTTP 401. O teste
   citado não passa pelo WAHA; ele chama a API diretamente e injeta o header.
2. **A URL configurada com `?api_key=...` não foi aplicada às sessões
   persistidas**, cujos logs mostram URL sem query. Além disso, segredo em query
   string é inadequado porque pode aparecer em logs, traces e métricas.
3. **Não existe teardown automático da suíte.** O `afterAll` da matriz apenas
   fecha app e pool. `cleanup-test-fixtures.mjs` não é referenciado pelo
   `package.json`, por Vitest ou pelos testes. Executar `supabase db reset`
   depois da suíte restaura o banco, mas não comprova cleanup da própria suíte.
4. **A alegação de E2E 10/10 é um teste sintético adicional**, não evidência de
   callback originado pelo WAHA. A rota 10 envia diretamente um POST com
   `x-api-key` a partir do runner.
5. **Proveniência continua aberta.** O manifesto contém `cleanTree: false` e o
   `git status` lista dezenas de alterações e arquivos não rastreados.

**Veredito desta rodada:** identidade do Lab aprovada e pipeline sintético de
ingestão aprovado; integração WAHA e teardown continuam reprovados. A Fase B
permanece **NÃO ENCERRADA** e não autoriza promoção.

## Atualização independente — segunda tentativa de fechamento da Fase B

Após as correções subsequentes, cinco dos seis bloqueadores técnicos anteriores
foram reproduzidos com sucesso, mas a Fase B ainda não pode ser considerada
100% homologada.

### Evidências reproduzidas nesta rodada

- Typecheck executado diretamente em `apps/api`: exit 0, zero erros.
- Migration `20260822100000` agora consta no histórico oficial, após
  `20260822091851`.
- Kong, GoTrue, JWKS e PostgreSQL locais estão ativos e saudáveis nas portas
  `55431/55432`.
- E2E autenticado com GoTrue real: 9/9 rotas retornaram HTTP 200.
- Vitest completo: 48/48 arquivos e 322/322 testes passaram.
- `/health` informa `environment: "lab"`; `/ready` está saudável.
- Os aliases `sos-sales-api`, `api-lab` e `sos-sales-lab-api` resolvem para o
  container correto.

### Bloqueadores remanescentes

1. **WAHA continua sem entregar webhooks.** O erro de DNS foi removido, porém
   todos os callbacks observados retornam HTTP 401 `Unauthorized webhook
   caller`. O WAHA alcança a API, mas não envia o `x-api-key` exigido pelo
   receptor. O E2E 9/9 testa leitura de status e QR; ele não testa a ingestão de
   um callback WAHA real e, portanto, não detecta essa falha.
2. **Resíduos da suíte permanecem no banco.** Após o reset e a execução dos
   testes, o banco contém 13 workspaces, 22 contatos, 22 jornadas e 71 eventos
   de outbox, muito acima da fixture única do `seed.sql`. O teardown ainda não
   garante reprodutibilidade limpa.
3. **Identidade de release ainda é parcialmente enganosa.** O ambiente passou
   a `lab`, mas o payload continua anunciando `release: "v2.0.0-prod"`, herdado
   do manifesto presente no bundle.
4. **Proveniência não fechada.** A árvore de trabalho continua amplamente suja;
   nenhum commit/manifesto clean foi produzido nesta rodada.

**Veredito atualizado:** **FASE B PARCIALMENTE APROVADA, NÃO ENCERRADA**. Para
fechar, configurar o header autenticado do webhook WAHA e provar callback 2xx
com persistência/idempotência, corrigir o teardown e repetir a suíte a partir de
reset limpo, gerar identidade de release específica do Lab e consolidar uma
árvore auditável. Isso não autoriza deploy ou abertura do Caddy em produção.

## Atualização independente — alegação de conclusão da Fase B

O relatório posterior que declarou a Fase B local como "100% conforme" foi
reproduzido parcialmente nesta mesma data. O resultado independente é
**FASE B NÃO APROVADA**. Esta atualização substitui as contagens e conclusões
anteriores da seção 5 quando houver conflito.

### Controles confirmados

- Docker Lab: frontend, API, Redis e PostgreSQL ativos; frontend, API e banco
  marcados como healthy; aproximadamente 17 GiB livres no volume de dados.
- `/health`, `/ready` e frontend respondem HTTP 200.
- Banco local: 37/37 tabelas públicas com RLS e 90 policies.
- Índices únicos de `phoneNumberId`, `pageId` e `igUserId` existem.
- Suíte Vitest da API: 48/48 arquivos e 322/322 testes passaram.
- Builds da API e do frontend terminaram com exit 0.

### Divergências bloqueadoras

1. **Typecheck real da API falha.** Executado dentro de `apps/api`,
   `./node_modules/.bin/tsc --noEmit --pretty false` retorna exit 2 e cinco
   erros. `NvidiaNimEngine` passou a retornar `text` e removeu `topP` e
   `latencyMs`, enquanto `receptionist-agent.ts` e `ai-copilot-routes.ts` ainda
   consomem o contrato anterior (`content`, `topP`, `latencyMs`). O build do
   `tsup` não substitui esse gate de typecheck.
2. **Histórico de migrations inconsistente.** A versão `20260822100000` não
   consta em `supabase_migrations.schema_migrations`, embora seus três índices
   já existam. O SQL foi executado diretamente fora do fluxo versionado; não há
   prova de aplicação reprodutível em outro ambiente.
3. **E2E 9 rotas não executado com sucesso.** O comando apresentado usou uma
   chave anon com assinatura textual fictícia e omitiu seu resultado. Na
   reprodução, `127.0.0.1:55431` retorna `ECONNREFUSED`: somente o container do
   PostgreSQL local está ativo, sem Kong/GoTrue local para autenticação.
4. **WAHA integrado falha.** O container está apenas `Up`, sem healthcheck, e
   seus logs mostram retries e falha de callback para
   `http://sos-sales-api:4334/...` por `ENOTFOUND`. A configuração nova aponta
   para `api-lab`, mas a sessão persistida conserva o callback antigo.
5. **Identidade do Lab é enganosa.** O `/health` local declara ambiente
   `production` e release `v2.0.0-prod`, apesar de o compose executar com
   `NODE_ENV=development` e commit `dev-local`.
6. **Release não auditável.** O manifesto gerado pelo build registra
   `Clean: false`; a árvore permanece amplamente modificada e sem cadeia única
   entre commit, bundle e runtime.

**Gate:** corrigir o contrato NVIDIA, obter typecheck zero, registrar/reaplicar
as migrations pelo fluxo oficial, subir GoTrue/Kong local, recriar a sessão
WAHA com callback `api-lab`, executar o E2E 9/9 com credenciais locais e repetir
o teste de resíduos antes de considerar a Fase B concluída.

## 1. Resumo executivo

### Atualização crítica — segunda exposição após rotação

O material de rotação recebido nesta auditoria contém em texto claro a nova
senha do banco e novas credenciais Meta, OpenRouter e NVIDIA. O arquivo local
`/Users/franciscotaveira.ads/1111 codex/rotations.rtf` também contém esses
valores. Como parte deles foi aplicada ao VPS e depois exposta no material de
evidência, a Fase A **não está concluída**: as credenciais devem ser rotacionadas
novamente e nunca copiadas para chat, relatório, comando inline ou RTF.

Verificação independente e sanitizada confirmou:

- API recriada e ativa desde `2026-08-22T10:31:52Z`, sem restart posterior;
- `.env.production` em modo `0600 root:root`;
- runtime usando o pooler Supabase na porta 5432;
- OpenRouter e NVIDIA configurados no container;
- `/health=200`, `/ready=200`, Contacts GET e Billing HEAD contidos com 403;
- a URL de banco não declara `sslmode`, e as provas apresentadas usam
  `rejectUnauthorized:false`, portanto TLS autenticado continua não comprovado;
- a alegação de invalidação da senha anterior não veio acompanhada do output
  sanitizado do teste negativo e permanece não verificada por esta auditoria.

**Decisão:** rotacionar novamente banco, Meta, OpenRouter e NVIDIA; atualizar o
VPS sem registrar valores em shell history; provar somente por fingerprints e
testes positivo/negativo sanitizados. A contenção do Caddy permanece ativa.

O SOS Sales possui um núcleo local de isolamento multi-tenant tecnicamente
funcional: autenticação GoTrue real, RLS em todas as tabelas públicas e testes
negativos A/B passaram. Isso não é suficiente para promover o release.

A auditoria confirmou cinco bloqueadores críticos:

1. A senha de banco publicada no Git continua sendo a senha ativa em produção.
2. Um token Meta está embutido no frontend e no JavaScript público de produção.
3. Outro token Meta está dentro de `channel_connections.public_config`, legível
   por membros `viewer` do tenant.
4. O bundle implantado registra plugins Meta, agent e billing sem autenticação,
   membership ou RBAC. Essas rotas foram bloqueadas no Caddy nesta auditoria,
   mas o código implantado permanece vulnerável.
5. Rotas de tenant ainda aceitam fallbacks globais de credenciais e ativos Meta,
   permitindo herança de credenciais entre tenants mal configurados.

Logo, `health=200`, `ready=200` e testes verdes não significam prontidão de
produção. O release só pode voltar à avaliação depois de rotação, saneamento de
segredos, correção de autorização, migrations forward-only e nova homologação.

## 2. Contenção aplicada e comprovada

Foi realizada somente uma mudança remota: extensão do bloqueio no edge Caddy.
Nenhum bundle de API ou frontend, migration ou configuração de banco foi
implantado.

### Alvo e rollback

- Host: `/opt/sos-sales/Caddyfile`
- SHA-256 ativo: `e1d0ac4d4ea01bb80abb7af0c645a87067f7ebe0af709d8d9017a85afc65b9a0`
- Backup anterior: `/opt/sos-sales/Caddyfile.backup.20260822_055355`
- SHA-256 do backup: `4abea58de0c4cddb4f5b919d3a7a4e755f1788116d2e02704b06f49488bb4071`
- Caddy recriado: `2026-08-22T08:54:19Z`
- API preservada: mesmo container, iniciado `2026-08-22T06:14:28Z`, restart `0`

### Matriz pós-contenção

| Superfície | GET | Fake Auth GET | HEAD | OPTIONS |
|---|---:|---:|---:|---:|
| Billing charge | 403 | 403 | 403 | 403 |
| Meta Partner | 403 | 403 | 403 | 403 |
| Agent pause/resume | 403 | 403 | 403 | 403 |
| Rotas PII já contidas | 403 | já comprovado | 403 | 403 |
| Billing por IP direto | 403 | — | — | — |

Probes após a mudança:

- `/health`: 200
- `/ready`: 200
- frontend CRM: 200

O Caddy também registrou tentativas de emissão de certificado para
`sos.mct.com.br`, que atualmente retorna NXDOMAIN. Isso não derrubou
`crm.iaparavendas.tech`, mas o alias inválido deve ser removido ou provisionado
para evitar retries e ruído operacional.

## 3. Achados críticos

### P0-01 — Credencial de banco pública e ainda ativa

- A DSN completa existe no histórico público de `origin/main`.
- Comparação somente por hash confirmou igualdade com a senha no runtime.
- Uma conexão sanitizada comprovou que o segredo antigo ainda é aceito.
- A API não foi recriada após qualquer rotação.

**Decisão:** incidente de credencial ativo. Rotação manual imediata obrigatória.

### P0-02 — Token Meta publicado no frontend

- O literal existe em `src/components/settings/TrackingSettings.tsx` e em
  `origin/main`.
- Inicializa estado de UI e aparece em um `textarea` comum.
- O mesmo valor está no asset JavaScript público de produção.
- O token não foi testado contra a API Meta, para não ampliar o incidente.

**Decisão:** revogar/rotacionar no fornecedor, remover do cliente e reimplantar
assets sanitizados.

### P0-03 — Segredo Meta em coluna pública para viewer

- Produção possui uma linha com `_secret_token` em `public_config`.
- O token corresponde ao usado em um script rastreado localmente.
- RLS limita a linha ao tenant, mas não limita campos JSON.
- `viewer` pode ler a linha e a API atual ainda devolve o segredo no tracking.
- Não existe migration de limpeza das linhas legadas.

**Decisão:** mover para tabela/vault de segredos, rotacionar e limpar o legado
com migration forward-only.

### P0-04 — Plugins mutáveis sem guarda no bundle implantado

Confirmados no artefato remoto:

- Messenger links, NLP e welcome screen;
- Instagram icebreakers;
- comments private reply/config;
- bot pause/resume;
- AbacatePay charge.

O hook de `operatorAuthRoutes` é encapsulado e não protege plugins irmãos. A
contenção no Caddy agora bloqueia essas rotas, mas isso é somente um controle
temporário.

**Decisão:** manter 403 até redeploy com JWT, membership, capability/RBAC e
testes negativos.

### P0-05 — Fallback global de credenciais Meta

Quando um tenant não possui credencial própria, diversos caminhos aceitam
tokens e IDs globais. Um workspace mal configurado pode atuar sobre um ativo de
outro tenant ou da plataforma.

**Decisão:** credencial e ativo devem pertencer a uma conexão exata do tenant;
ausência ou ambiguidade deve falhar fechado.

## 4. Achados altos

1. **Segredo WAHA global conhecido em uso:** o hash do runtime é igual ao
   fallback rastreado no código. Não existem segredos por conexão.
2. **Agente recepcionista fail-open:** erro de estado ativa o bot; JSON do modelo
   controla pausa, texto externo e WhatsApp Flow sem schema/allowlist/policy gate.
3. **Migrations históricas reescritas:** versões já aplicadas foram substituídas
   sem nova migration; ambientes existentes não recebem o hardening.
4. **Default privileges fail-open:** tabelas futuras recebem grants amplos antes
   de revisão explícita de RLS.
5. **TLS PostgreSQL não autenticado:** conexão é criptografada, mas
   `authorized=false`; CA do projeto não está instalada.
6. **Webhook ambíguo:** `LIMIT 2` no WABA e `LIMIT 1` em Messenger/Instagram
   podem aceitar ownership duplicado e rotear ao tenant errado.
7. **Backup insuficiente:** um único dump plaintext, sem automação, retenção,
   criptografia off-host ou restore drill.
8. **Dependências da API:** `npm audit` aponta 3 high, 1 moderate e 1 low. O
   bypass de Content-Type do Fastify não foi reproduzido nesta configuração,
   mas o gate de supply chain continua vermelho.
9. **Segredos em commits locais não publicados:** chave OpenRouter e outro token
   Meta seriam publicados por um `git push` normal.

## 5. Evidência do Docker Lab

### Controles que passaram

- Supabase local nas portas `55431/55432`.
- 13 migrations aplicadas.
- 37/37 tabelas públicas com RLS.
- 90 policies; nenhuma policy ampla `true`.
- `anon`: zero privilégios nas 37 tabelas.
- role runtime: `NOSUPER`, `NOBYPASSRLS`, `NOLOGIN`.
- GoTrue real: login 200 e issuer local.
- Tenant A: próprio workspace 200; tenant B 403.
- Tenant B: próprio workspace 200; tenant A 403.
- TypeScript API: exit 0.
- TypeScript frontend: exit 0.
- API: 45/45 arquivos e 298/298 testes.

### Controles que falharam ou não foram executados

- A suíte deixou +5 workspaces, +10 contatos, +10 jornadas e +22 outbox rows.
- A matriz usa verificador JWT próprio e WAHA mockado.
- O WAHA real ficou `STARTING`, apresentou auth timeout e falhou callbacks por
  hostname `sos-sales-api` inexistente na rede do compose atual.
- Disco local em 99%; dois Supabase locais simultâneos; readiness oscilou.
- Build não executado por risco operacional com aproximadamente 2,2 GB livres.
- Worktree permanece com alterações não consolidadas.
- `scripts/test-e2e-all-routes.js` ainda tem fallback para Supabase de produção.

**Conclusão do Lab:** isolamento central aprovado; homologação integrada e
reprodutibilidade reprovadas.

## 6. Proveniência e release

- Checkout: `678e0399f7d65f7ffacc67d481cee33b44bbc409`
- `origin/main`: `28b15a73a6147ef8647e96ed4ca73571954c39fe`
- Runtime declara: `d715ee2`
- Bundle remoto e bundle local possuem hashes diferentes.
- API não foi recriada nesta auditoria.
- Árvore local está suja e à frente do remoto.

Não há cadeia única e reconciliável entre código auditado, manifesto, bundle e
runtime. Nenhuma promoção pode usar o `/version` atual como prova suficiente.

## 7. Sequência obrigatória antes de nova avaliação

### Fase A — rotação externa imediata

1. Rotacionar a senha da role de produção no Supabase.
2. Atualizar a URL no VPS e force-recreate somente da API.
3. Provar que a senha nova funciona e a antiga falha.
4. Revogar/rotacionar os dois tokens Meta identificados.
5. Rotacionar o segredo global WAHA.
6. Rotacionar a chave OpenRouter se estiver ativa.
7. Preservar logs e registrar horário, operador e IDs de auditoria dos
   fornecedores, sem copiar valores secretos para o relatório.

### Fase B — saneamento local

1. Remover todos os literais e fallbacks de produção.
2. Restaurar as migrations históricas e criar migration forward-only.
3. Migrar/scrub de segredos em `public_config`.
4. Aplicar JWT, membership e RBAC por capability em cada plugin.
5. Remover fallbacks globais de tenant.
6. Adicionar unicidade e fail-closed a IDs de webhook.
7. Aplicar schema/policy gate ao agente recepcionista.
8. Tornar testes determinísticos e o WAHA real homologável.

### Fase C — infraestrutura e promoção

1. Instalar CA Supabase e validar TLS estrito.
2. Implementar backup criptografado, automático e off-host.
3. Executar restore drill isolado.
4. Liberar disco e repetir build, testes e estabilidade de readiness.
5. Produzir worktree limpo, commit único auditável e manifesto com hashes.
6. Implantar canário somente depois de todos os gates anteriores.
7. Remover a contenção do Caddy uma família de rotas por vez, com testes
   negativos anônimo/fake/viewer/cross-tenant e rollback pronto.

## 8. Critério de promoção

O resultado muda de **NO-GO** apenas quando todos os itens abaixo possuírem
evidência atual:

- segredos antigos invalidados;
- zero segredo em Git, frontend, `public_config` ou fallbacks;
- TLS remoto verificado;
- plugins operacionais autenticados e autorizados;
- migrations forward-only aplicadas;
- WAHA real conectado e callbacks funcionais;
- suíte limpa e determinística;
- backup/restore comprovado;
- build, manifesto e runtime reconciliados;
- contenção removida gradualmente sem regressão.

## 9. Artefatos

- Relatório estruturado local:
  `.gstack/security-reports/2026-08-22-054813.json`
- Configuração ativa de contenção: `deploy/Caddyfile`
- Runbook e rollback: `RUNBOOK_CONTENCAO_P0_VPS.md`

## 10. Limitação

Esta auditoria assistida por IA é uma primeira linha de defesa, não substitui
pentest profissional nem resposta formal a incidente. Para um CRM multi-tenant
internet-facing que processa PII, pagamentos e credenciais de fornecedores,
contrate uma equipe qualificada antes da promoção definitiva.

## 11. Atualização de remediação local — 06:43 BRT

As correções abaixo foram verificadas no checkout local. Elas **não** alteram a
classificação da produção, pois nenhum bundle, variável, migration ou segredo
foi promovido após a contenção no Caddy.

| Controle | Estado local atual | Evidência |
|---|---|---|
| Segredos Meta no frontend, scripts e fallbacks | Removidos do código atual; rotas usam tabela server-only de segredos | varredura de padrões de token sem ocorrências; diff revisado |
| Credenciais Meta por tenant | Fail-closed para conexão exata; ausência/ambiguidade não usa token global | `whatsapp-channel-routes.ts`, `meta-partner-routes.ts`, `private-reply-service.ts` |
| Billing AbacatePay | JWT + role operator/owner + workspace verificado; sem cobrança simulada | 14 testes de autorização e 5 testes AbacatePay |
| Webhook AbacatePay | Secret na URL **e** HMAC-SHA256 `X-Webhook-Signature` sobre raw body; sem chave = 503 | 5 testes AbacatePay; contrato oficial consultado |
| Agente recepcionista | Estado da jornada fail-closed; output do modelo com schema estrito; handoff obrigatório para pagamento, objeção e humano; recheck antes de provider call | 6 testes de política do agente |
| Webhooks Meta | WABA, Messenger e Instagram rejeitam identificador com mais de um workspace proprietário; logs não expõem corpo/assinatura | 4 testes de ownership Meta |
| Privilégios e segredos do banco | Migration forward-only criada e aplicada no Supabase local; revoga grants futuros, move/scrub de `public_config` e impõe constraint | `20260822091851_runtime_role_and_security_hardening.sql`; verificações locais de grants/RLS |
| Unicidade de ativos Meta | Nova migration cria índices únicos para phone number ID, Page ID e IG user ID; ainda pendente de aplicação no Lab/produção | `20260822100000_provider_identifier_uniqueness.sql` |
| Runners de auditoria | E2E exige alvo explícito; runner mutável exige flag dupla, variáveis explícitas e hosts locais/isolados | execuções negativas sem rede |

### Evidência de teste pós-remediação

- `npm --prefix apps/api exec -- tsc --noEmit`: exit 0.
- `npx tsc --noEmit`: exit 0.
- `npm --prefix apps/api run build`: exit 0; manifesto local gerado com
  `Clean: false`, portanto não é artefato de promoção.
- `npm run build`: exit 0; há somente alertas não bloqueantes de CSS/chunk size.
- `vitest` focado: 4 arquivos, **30/30** testes aprovados (autorização de
  rotas, AbacatePay, política do agente e ownership Meta).
- `openapi.json` e `openapi.yaml`: parse válido.
- `git diff --check`: sem erro de whitespace.
- Os runners `test-e2e-all-routes.js` e `master-goal-validation.mjs` recusam
  respectivamente alvo implícito e mutação fora de Lab isolado antes de login
  ou request de rede.

### Gate ainda reprovado

A suíte integral não pode ser marcada como aprovada. A tentativa anterior
deixou o PostgreSQL do Docker em filesystem read-only e a rechecagem mais
recente confirmou `docker version` com timeout de 12 segundos (exit 124), mesmo
com cerca de 7,5 GiB livres no host. É necessário
reiniciar o Docker Desktop, estabilizar o Lab e repetir a suíte completa sem
paralelismo antes de qualquer promoção.

Também continuam obrigatórios: rotação e invalidação externas dos segredos já
expostos, atualização segura das variáveis do VPS, aplicação remota das migrations
somente após backup e validação, TLS autenticado com CA e prova de backup/restore.
