# Prompt de Execução para Claude Fable — SOS Sales

Copie este documento integralmente para o Claude Fable. Ele é a instrução de execução. O plano técnico referenciado abaixo é a especificação obrigatória.

---

## SUA MISSÃO

Você trabalhará localmente no SOS Sales para construir e validar a remediação completa de:

1. WABA/WhatsApp oficial;
2. inbound, outbound, webhook e status de mensagens;
3. IA de atendimento executada no backend com guardrails e handoff;
4. Messenger, Instagram Direct e Private Reply;
5. provisionamento real de clientes/subcontas de agência;
6. eliminação da condição “somente frontend”, completando o backend ou submetendo eventual remoção à decisão explícita de Francisco;
7. correspondência comprovada entre interface, API, provider, banco e reload.

Seu objetivo não é maquiar, esconder ou apenas desabilitar funções. Desabilitar é permitido somente como contenção temporária enquanto a implementação real não estiver homologada.

O SOS Sales somente está funcional quando este ciclo funciona:

```text
WABA/WhatsApp → mensagem → persistência → IA backend → supervisão/handoff
→ envio real → status Meta → banco → interface após reload
```

## DIRETÓRIO E AMBIENTES

Repositório local:

```text
/Users/franciscotaveira.ads/Projetos/SOS-SALES
```

Ambientes:

```text
Frontend Lab: http://localhost:3333
API Lab:      http://localhost:4335
WAHA Lab:     http://localhost:3005
Produção:     https://crm.iaparavendas.tech
VPS alias:    vps
```

Você está autorizado a editar e testar somente no repositório local e Docker Lab. Você NÃO está autorizado a:

- acessar ou alterar a VPS;
- aplicar migration no Supabase remoto;
- enviar mensagens reais;
- criar templates/campanhas na Meta;
- disparar CAPI real;
- fazer `git push`, merge, PR ou deploy;
- alterar `.env.production`;
- imprimir ou copiar secrets.

Produção e VPS podem ser mencionadas somente como alvo futuro. Se precisar de evidência de produção, marque `BLOCKED — requer auditoria/autorização do Codex e Francisco`.

## LEITURA OBRIGATÓRIA — NESTA ORDEM

Antes de editar qualquer arquivo, leia integralmente:

1. `/Users/franciscotaveira.ads/Projetos/SOS-SALES/AGENTS.md`
2. `/Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/audits/SOS_SALES_META_WABA_REMEDIATION_EXECUTION_PLAN_2026-08-26.md`
3. `/Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/audits/CLAUDE_FABLE_PRODUCTION_CLOSURE_ADDENDUM_2026-08-26.md`
4. `/Users/franciscotaveira.ads/Projetos/SOS-SALES/.gstack/qa-reports/qa-report-crm-iaparavendas-tech-2026-08-26.md`
5. `/Users/franciscotaveira.ads/Projetos/SOS-SALES/CODEBASE.md`
6. `/Users/franciscotaveira.ads/Projetos/SOS-SALES/DECISION_LOG.md`
7. `/Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md`
8. `/Users/franciscotaveira.ads/Projetos/SOS-SALES/openapi.yaml`
9. `/Users/franciscotaveira.ads/Projetos/SOS-SALES/docker-compose.lab.yml`
10. `/Users/franciscotaveira.ads/Projetos/SOS-SALES/docker-compose.prod.yml`

Documentação histórica pode estar desatualizada. Quando uma alegação documental divergir do código, schema ou runtime, classifique:

- `[KNOWN]`: comprovado diretamente;
- `[INFERRED]`: inferência forte;
- `[SPECULATIVE]`: hipótese ainda sem prova.

Nunca trate `CODEBASE.md`, `DECISION_LOG.md` ou `AGENTS.md` como prova de que uma função está operacional. O relatório de QA e a evidência reproduzível prevalecem.

## MAPA DO CÓDIGO

### Frontend

```text
src/App.tsx
src/services/salesOsGateway.ts
src/types/
src/components/cockpit/
src/components/channels/
src/components/clients/
src/components/conversations/
src/components/campaigns/
src/components/intelligence/
src/components/settings/
src/components/layout/
```

Pontos críticos iniciais:

```text
src/components/clients/AgencyClientsManager.tsx
src/components/workspace/WorkspaceInitModal.tsx
src/components/channels/CanaisView.tsx
src/components/cockpit/WabaActionsModal.tsx
src/App.tsx
src/services/salesOsGateway.ts
```

### Backend

```text
apps/api/src/application/ports/
apps/api/src/application/services/
apps/api/src/application/agents/
apps/api/src/infrastructure/database/
apps/api/src/infrastructure/security/
apps/api/src/infrastructure/channels/meta/
apps/api/src/infrastructure/channels/waha/
apps/api/src/infrastructure/workers/
apps/api/src/interfaces/http/routes/
apps/api/src/interfaces/http/routes/webhooks/
```

Pontos críticos iniciais:

```text
apps/api/src/interfaces/http/routes/workspace-init.ts
apps/api/src/infrastructure/database/postgres-workspace-provisioning-gateway.ts
apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts
apps/api/src/interfaces/http/routes/meta-partner-routes.ts
apps/api/src/interfaces/http/routes/webhooks/waba-webhook.ts
apps/api/src/interfaces/http/routes/webhooks/messenger-webhook-handler.ts
apps/api/src/application/agents/receptionist-agent.ts
apps/api/src/application/services/private-reply-service.ts
apps/api/src/server.ts
```

### Banco, testes e contratos

```text
apps/api/supabase/migrations/
apps/api/supabase/seed.sql
apps/api/tests/unit/
apps/api/tests/integration/
scripts/
openapi.yaml
openapi.json
```

## CONFIGURAÇÃO E SECRETS

Arquivos locais existentes:

```text
.env
.env.example
.env.production
.env.production.example
```

Regras:

- nunca mostre o conteúdo integral desses arquivos;
- nunca coloque valor real em código, migration, teste, relatório ou commit;
- leia apenas presença/nome da variável quando necessário;
- use stubs explícitos e não secretos no Lab;
- não altere `.env.production`;
- se faltar uma variável local, documente o nome e pare aquele cenário;
- não reutilize secret de produção no Lab.

Variáveis relevantes esperadas:

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_JWT_ISSUER
SUPABASE_JWKS_URL
META_VERIFY_TOKEN
META_APP_SECRET
WAHA_BASE_URL
WAHA_API_KEY
WAHA_WEBHOOK_SECRET
WABA_FLOW_PRIVATE_KEY
WABA_FLOW_PUBLIC_KEY
WABA_BOOKING_FLOW_ID
NVIDIA_API_KEY
NVIDIA_NIM_MODEL
RECEPTIONIST_ENABLED
```

## GIT E PRESERVAÇÃO DO WORKTREE

1. Comece com:

```bash
cd '/Users/franciscotaveira.ads/Projetos/SOS-SALES'
git status --short
git branch --show-current
git log -5 --oneline
```

2. Há alterações preexistentes pertencentes ao usuário. Não reverta, não sobrescreva e não inclua automaticamente arquivos alheios.
3. Em especial, preserve `AGENTS.md` e os documentos de auditoria já existentes.
4. Não use `git reset --hard`, `git checkout --`, `git clean`, rebase ou force.
5. Trabalhe em branch local com prefixo `claude/`, criada a partir do estado aprovado pelo usuário. Se a branch atual já contiver trabalho desta remediação, não crie outra sem necessidade.
6. Faça commits atômicos conforme a seção “Estratégia de commits” do plano.
7. Não faça push. O Codex revisará, testará e publicará posteriormente.
8. Antes de cada commit, mostre `git diff --check` e rode os testes diretamente relacionados.
9. Não adicione `.env*`, dumps, backups, screenshots com PII ou credenciais ao Git.

## ORDEM DE EXECUÇÃO OBRIGATÓRIA

Siga todas as fases e gates do plano técnico. A ordem macro é:

1. inventário e baseline local;
2. migration mínima de compatibilidade de segredos no Lab;
3. gateway central de secrets tenant-scoped;
4. provisionamento real de subcontas;
5. webhook/fail-fast Meta;
6. UI fail-closed durante a construção;
7. contratos OpenAPI e testes;
8. auditoria de todas as funções visíveis;
9. Docker Lab integrado;
10. Golden Path WABA/WhatsApp + IA usando providers mockados/controlados;
11. preparar handoff — sem deploy.

Não pule um gate porque os testes seguintes parecem passar.

## REGRAS ARQUITETURAIS INEGOCIÁVEIS

### Multi-tenant

- Toda consulta e mutação deve incluir `workspace_id`.
- Toda rota operacional exige JWT e RBAC.
- Não usar UUID, slug, nome ou alias fixo como fallback de tenant.
- Testar agência A versus agência B e workspace A versus workspace B.

### Persistência

- Modo autenticado não usa `localStorage` como fonte de verdade.
- Sucesso exige persistência e mesma informação após reload.
- Nunca fabricar ID, telefone, WABA ID, status, preço, cliente ou canal no frontend.

### WABA/WhatsApp

- Conexão configurada não equivale a canal operacional.
- Provider escolhido na criação da subconta nasce pendente/desconectado.
- Inbound deve persistir antes da IA.
- Outbound precisa de idempotência e reconciliação de status.
- WABA e WAHA não podem duplicar ingestão.

### IA

- IA de atendimento roda no backend.
- Configuração é persistida, publicada e versionada por workspace.
- Catálogo, preço, horário e políticas possuem proveniência.
- Ausência de informação resulta em desconhecido/handoff, nunca invenção.
- Timeout ou envelope inválido resulta em fail-closed.
- Handoff pausa o bot antes de qualquer resposta posterior.
- Processamento deve usar fila/outbox recuperável, não apenas `setImmediate()`.

### Subcontas

- `/workspaces/init` permanece restrito ao primeiro acesso.
- Criar contrato administrativo separado para subcontas de agência.
- Criação exige idempotência, transação, RBAC e relação agência-cliente.
- Convite Supabase Auth é saga/outbox após commit, nunca senha conhecida.
- A conta precisa reaparecer após reload a partir da API.

## COMANDOS DO LAB

Instalação/build não devem modificar dependências sem necessidade. Use os lockfiles existentes.

```bash
docker compose -f docker-compose.lab.yml up --build -d
docker compose -f docker-compose.lab.yml ps
curl -fsS http://localhost:4335/health
curl -fsS http://localhost:4335/ready
curl -fsSI http://localhost:3333
```

Validação de código:

```bash
npm run lint
npm run build
npm --prefix apps/api run check
npm --prefix apps/api run build:lab
```

Testes direcionados primeiro; suíte completa depois:

```bash
npm --prefix apps/api run test:unit
npm --prefix apps/api run test:integration
npm --prefix apps/api run test
```

Não execute `db:reset` sem confirmar que o alvo é inequivocamente o Supabase Lab local. Antes de qualquer comando de banco, mostre host, porta e database sanitizados. É proibido executar reset contra banco remoto.

## MÉTODO DE TRABALHO

Para cada fase:

1. declare arquivos que serão tocados;
2. escreva ou ajuste testes que reproduzam a falha;
3. faça a menor implementação completa;
4. rode teste direcionado;
5. rode testes adjacentes;
6. valide browser/API/banco no Lab;
7. execute `git diff --check`;
8. faça um commit atômico;
9. atualize o registro de progresso;
10. só então avance.

Se descobrir outra função somente no frontend, adicione à matriz funcional e corrija conforme prioridade P0/P1. Não expanda para refinamento cosmético amplo.

## ARTEFATOS QUE VOCÊ DEVE ENTREGAR

Crie e mantenha:

```text
docs/audits/CLAUDE_FABLE_PROGRESS_2026-08-26.md
docs/audits/CLAUDE_FABLE_HANDOFF_2026-08-26.md
docs/audits/SOS_SALES_FUNCTION_CAPABILITY_MATRIX_2026-08-26.md
```

O progresso deve registrar por fase:

```text
FASE:
STATUS: PASS | FAIL | BLOCKED
ARQUIVOS:
ALTERAÇÕES:
TESTES E EXIT CODES:
EVIDÊNCIAS:
RISCOS RESIDUAIS:
PRÓXIMO GATE:
```

A matriz deve conter cada função visível e provar:

```text
UI → API → auth/RBAC → provider/job → persistência → reload
```

## HANDOFF FINAL PARA O CODEX

Pare antes de push/deploy. O handoff final precisa conter:

1. branch e `HEAD` local;
2. lista de commits em ordem;
3. `git status --short`;
4. `git diff <base>...HEAD --stat`;
5. arquivos alterados por commit;
6. migrations novas e ordem;
7. testes executados com exit codes e totais;
8. evidências do Docker Lab;
9. funções PASS, FAIL, BLOCKED e UNVERIFIED;
10. secrets/variáveis que Francisco ainda precisa configurar, somente nomes;
11. passos de deploy propostos, não executados;
12. rollback proposto;
13. canários reais ainda dependentes de autorização;
14. riscos residuais e decisões pendentes.

Não declare “pronto para produção”. Declare no máximo:

```text
READY_FOR_CODEX_REVIEW
```

Somente o Codex, após revisar o diff, repetir testes, verificar Git e obter autorização de Francisco, poderá fazer push, merge e deploy.

## CONDIÇÕES DE PARADA

Pare imediatamente e reporte `BLOCKED` quando:

- detectar risco de apagar/alterar produção;
- faltar decisão que mude schema, autenticação ou comportamento comercial;
- um secret real aparecer em arquivo versionável ou output;
- migration não for idempotente no Lab;
- isolamento cross-tenant falhar;
- teste indicar envio externo não controlado;
- houver conflito com alteração preexistente do usuário;
- três tentativas da mesma hipótese falharem.

## PRIMEIRA RESPOSTA OBRIGATÓRIA

Antes de editar, responda exatamente com um resumo equivalente a:

```text
Li AGENTS.md, o plano técnico, o relatório de QA e os contratos principais.
Trabalharei somente no repositório local e Docker Lab.
Não acessarei VPS, não aplicarei migration remota, não enviarei mensagens e não farei push/deploy.
Começarei pelo baseline, testes de regressão do schema de secrets e provisionamento de subcontas.
Ao final entregarei branch local, commits atômicos, matriz funcional e handoff READY_FOR_CODEX_REVIEW.
```

---

Fonte técnica obrigatória:

`/Users/franciscotaveira.ads/Projetos/SOS-SALES/docs/audits/SOS_SALES_META_WABA_REMEDIATION_EXECUTION_PLAN_2026-08-26.md`
