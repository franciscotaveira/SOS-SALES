# Prompt Mestre de Construção — Sales OS Lean

> Data de consolidação: 27/08/2026  
> Produto canônico de destino: `Sales-OS-Lean`  
> Repositório de destino: `https://github.com/franciscotaveira/Sales-OS-Lean.git`  
> Repositório-fonte de capacidades: `/Users/franciscotaveira.ads/Projetos/SOS-SALES`  
> Piloto operacional: Haven Escovaria  
> Regra soberana: Docker Lab primeiro; produção somente após autorização explícita de Francisco.

---

## INÍCIO DO PROMPT PARA A IA EXECUTORA

Você é a IA principal responsável por continuar a construção do **Sales OS Lean**. Este documento é sua especificação de produto, arquitetura, migração, implementação, testes, segurança e reporte. Não trate o trabalho como uma coleção de telas. O objetivo é construir um sistema comercial pós-tráfego que conecte aquisição, atendimento, vendas e aprendizado da mídia em um ciclo verificável.

Sua missão é transformar o protótipo visual do Lean em um SaaS multi-tenant real, usando seletivamente o backend já construído no SOS Sales. O Lean será o produto principal. O SOS Sales deixa de competir como outro CRM e passa a ser fonte auditada de domínio, integrações, contratos e padrões operacionais.

O lema do produto é:

> **Poder invisível, simplicidade visível.**

Não implemente “um CRM com IA”. Implemente um **Sales Feedback OS para PMEs que anunciam na Meta**.

O ciclo indivisível do produto é:

```text
Meta Ads / CTWA
  → lead identificado e atribuído
  → atendimento WhatsApp 24/7
  → IA qualifica, agenda e detecta handoff
  → equipe humana assume sem colisão
  → pipeline e follow-up avançam automaticamente
  → resultado comercial é confirmado
  → qualidade, receita e perdas são reconciliadas
  → eventos elegíveis retornam à Meta via CAPI
  → gestor de tráfego enxerga mídia, lead e venda no mesmo contexto
```

Se esse ciclo não estiver comprovado de ponta a ponta, o produto não está pronto.

---

## 0. Autoridade, limites e comportamento obrigatório

### 0.1 O que você está autorizado a fazer

- Ler e auditar os dois repositórios.
- Criar ou alterar código somente no escopo da nova aplicação e de seu Docker Lab.
- Reaproveitar código do SOS Sales quando ele passar pela classificação de reuso deste plano.
- Criar migrations **forward-only**, testes, documentação, contratos e infraestrutura local.
- Rodar builds, lint, typecheck, testes unitários, integração e E2E no ambiente local/Lab.
- Produzir commits locais atômicos se Francisco tiver autorizado commits na sessão.

### 0.2 O que você não está autorizado a fazer sem aprovação explícita

- Deploy no VPS ou alteração do domínio de produção.
- Push, merge, release ou alteração de branch remota.
- Reconfigurar o número WABA da Haven, trocar webhook ou reconectar Embedded Signup.
- Enviar WhatsApp real, template, broadcast, Flow, ligação ou mensagem de teste externa.
- Disparar CAPI real, inclusive `test_event_code`, sem autorização específica.
- Alterar campanhas, conjuntos, anúncios, orçamento, público ou criativo da Haven.
- Alterar `.env.production`, tokens, permissões Meta ou credenciais.
- Apagar dados, migrations históricas, funções do SOS ou código não classificado.

### 0.3 Regras técnicas invioláveis

- Nunca usar n8n.
- Nunca usar dados mock em produção. Fixtures são permitidas apenas em testes, Storybook e Lab, claramente marcadas.
- Nunca considerar HTTP 200, container saudável, botão visível ou status `CONNECTED` como prova funcional completa.
- Nunca expor tokens no frontend, log, commit, screenshot ou relatório.
- Nunca criar um segundo consumidor concorrente para o mesmo webhook/número WABA.
- Nunca executar `git reset --hard`, `supabase db reset`, `DROP`, `TRUNCATE` ou limpeza ampla de Redis.
- Nunca substituir RLS/RBAC por confiança no frontend.
- Nunca usar `setImmediate()` ou fire-and-forget não persistente para processamento crítico.
- Toda mutação externa deve seguir: preview → autorização → execução → releitura → evidência.
- Toda nova capacidade deve provar: UI → API → auth/RBAC → provider/job → persistência → reload → idempotência.

### 0.4 Verdade e linguagem

Classifique afirmações relevantes:

- `[KNOWN]`: verificado no código, teste ou runtime atual.
- `[INFERRED]`: dedução forte, ainda não provada em execução.
- `[SPECULATIVE]`: hipótese de produto ou técnica que exige validação.
- `[UNVERIFIED EXTERNAL]`: depende de acesso, aprovação ou contrato externo, especialmente Meta.

Não anuncie “Parceiro Oficial Meta”, “Meta Tech Provider” ou equivalente até existir aprovação formal verificável. É permitido dizer “integração pela API oficial da Meta”.

---

## 1. Leitura obrigatória e preflight

Antes de editar qualquer arquivo:

1. Confirme o checkout de execução:
   - `git rev-parse --show-toplevel` e `git remote -v` devem apontar para `Sales-OS-Lean`;
   - se estiver dentro de `SOS-SALES`, trate-o como fonte **read-only**, pare e abra/clone o Lean antes de editar;
   - nunca implemente a nova aplicação diretamente no checkout SOS.
2. Leia integralmente no SOS Sales:
   - `AGENTS.md`;
   - `CODEBASE.md`;
   - `DECISION_LOG.md`;
   - `BLUEPRINT_SOS_SALES.md`;
   - `docs/audits/SOS_SALES_META_WABA_REMEDIATION_EXECUTION_PLAN_2026-08-26.md`;
   - `docs/audits/CLAUDE_FABLE_PRODUCTION_CLOSURE_ADDENDUM_2026-08-26.md`;
   - `docs/audits/SOS_SALES_FRONT_BACK_ASSURANCE_2026-08-25.md`;
   - `docs/audits/SOS_SALES_FUNCTIONAL_AUDIT_2026-08-25.md`.
3. Leia integralmente no Lean:
   - `README.md`;
   - `package.json`;
   - `prisma/schema.prisma`;
   - `src/app/api/webhooks/meta/route.ts`;
   - todas as páginas em `src/app/(dashboard)`;
   - `src/lib/auth/config.ts`, stores e tipos.
4. Registre, sem alterar nada:
   - branch, HEAD, remotes e `git status` de ambos os repositórios;
   - runtime Node/pnpm/npm;
   - arquivos de lock;
   - comandos de build/test existentes;
   - variáveis exigidas, apenas pelos nomes;
   - migrations e schema atual;
   - divergências entre README e código.
5. Preserve toda alteração preexistente no worktree. Elas pertencem ao usuário.
6. Antes de copiar qualquer módulo, produza `docs/reuse-manifest.md` com origem, commit-fonte, dependências, decisão e testes.

### 1.1 Baseline que deve ser revalidada

Estes fatos foram observados em 27/08/2026 e não substituem nova verificação:

- `[KNOWN]` Lean estava no commit `d5a1eca`, com um único commit inicial.
- `[KNOWN]` Lean possuía UI ampla, mas dashboard e outras telas usavam `MOCK_*`.
- `[KNOWN]` o webhook Meta do Lean apenas registrava payload e deixava persistência/IA/automação em comentários.
- `[KNOWN]` o schema Prisma do Lean não tinha `workspace_id`, conversas/mensagens completas nem isolamento multi-tenant.
- `[KNOWN]` o `package.json` referenciava pacotes Radix inexistentes e possuía conflitos de dependência; instalação/build não estavam reprodutíveis.
- `[KNOWN]` scripts de Vitest/Playwright existiam, mas não havia suíte real correspondente.
- `[KNOWN]` SOS Sales possuía Fastify, Supabase/PostgreSQL, Redis, RLS, WABA/WAHA, outbox/workers, IA/handoff, atribuição, outcome, CAPI e traffic proof.
- `[KNOWN]` a última verificação local do SOS passou build web, build API e 127 testes unitários; isso deve ser reexecutado.
- `[KNOWN]` saúde de produção não prova Golden Path autenticado nem isolamento tenant.

Se a nova auditoria contradizer qualquer item, atualize o manifesto e siga o código real.

---

## 2. Decisões de produto já tomadas

Estas decisões não estão abertas para rediscussão durante a primeira execução:

1. **Lean é o produto principal e a experiência canônica.**
2. **SOS Sales é fonte de capacidades, não um segundo produto paralelo.**
3. **O foco é o que acontece depois do tráfego**, não gestão genérica de contatos.
4. **Atendimento 24/7, multiatendente, pipeline e follow-up são baseline**, não diferenciais opcionais.
5. **O diferencial é o closed loop** entre anúncio, qualidade do lead, atendimento, venda e feedback Meta.
6. **A entrada deve ser acessível para PME e ganhar por volume**, sem esconder custos variáveis de Meta/IA.
7. **Haven é o primeiro tenant dourado**, aproveitando o número já conectado e anúncios ativos.
8. **Não reconectar a Haven nem criar webhook paralelo.** O cutover de runtime só ocorre após Lab, canário e autorização.
9. **Nada de big bang.** A migração é strangler/blue-green, reversível e medida.

### 2.1 Posicionamento

Frase curta de produto:

> O Lean transforma conversas de anúncios em atendimento, vendas e feedback que melhora a mídia.

ICP inicial:

- **Beachhead:** empresa brasileira de serviços locais que recebe leads recorrentes por Click-to-WhatsApp, possui 2–5 atendentes e perde vendas por demora, falta de follow-up e ausência de outcome confiável.
- Dono ou gestor que não quer administrar ferramentas técnicas.
- Gestor de tráfego convidado que precisa provar qualidade do lead e resultado comercial.
- Operação com venda por agendamento, orçamento ou conversa consultiva curta.

Anti-ICP da primeira versão:

- e-commerce transacional;
- operação sem WABA ou sem tráfego pago recorrente;
- venda enterprise com ciclo longo e múltiplos comitês;
- setor regulado que exige fluxo clínico, financeiro ou jurídico especializado;
- operação que precisa de omnichannel completo no lançamento;
- empresa sem responsável por confirmar qualificação e outcome.

Dor prioritária: o dinheiro é investido no anúncio, mas o negócio não consegue provar se o lead foi atendido, era válido, recebeu follow-up e virou venda.

Comprador inicial: owner da PME ou agência que responde diretamente pelo resultado comercial. Gatilho de compra: volume recorrente de leads pagos com demora, perda de follow-up ou conflito sobre “lead ruim versus atendimento ruim”.

Evento de ativação do cliente:

> Primeiro lead CTWA atribuído, atendido dentro do SLA e encerrado com outcome auditável.

Usuários e jobs-to-be-done:

| Papel | Trabalho principal |
|---|---|
| Owner | conectar negócio, equipe e mídia; enxergar receita e gargalos |
| Manager | distribuir fila, acompanhar SLA, qualidade e follow-ups |
| Attendant | responder, assumir conversa, registrar outcome e próxima ação |
| Traffic Manager | comparar campanha → lead → qualificação → venda, sem acesso operacional indevido |
| Viewer/Auditor | consultar métricas e trilhas sem mutar operação |

### 2.2 Não objetivos do MVP

- Não construir uma plataforma completa de criação/edição de campanhas Meta.
- Não substituir o Ads Manager.
- Não suportar todos os canais do SOS na primeira onda.
- Não construir ERP, estoque, financeiro completo ou e-commerce.
- Não oferecer automação visual arbitrária estilo n8n.
- Não transformar Call Intelligence em requisito de lançamento.
- Não migrar toda a superfície visual do SOS.
- Não prometer API Meta Business Agent antes de acesso e documentação oficiais verificáveis.
- Não construir portal multi-cliente para agência no MVP; gestor é convidado read-only dentro de cada workspace.
- Não perseguir paridade ampla com WeSales.

Filtro obrigatório de backlog: uma feature só entra antes do Market MVP se melhorar pelo menos um destes pontos:

- tempo até primeira resposta;
- cobertura de atendimento;
- classificação/qualidade do lead;
- recuperação por follow-up;
- fechamento de outcome;
- relação entre mídia e venda;
- tempo para ativar uma PME.

Escada de releases:

```text
Technical Foundation
  → Haven Pilot Release
  → Beta com 3–5 Design Partners do mesmo beachhead
  → Market MVP
  → General Availability
```

Não chame toda essa escada de “MVP”. Cada etapa tem DoD próprio.

### 2.3 Registro executivo de dependências Meta

Crie e mantenha `docs/product/meta-external-dependencies.md`:

| Capacidade | Permissão/App Review | Ativo e proprietário | Estado | Evidência/data | Fallback | Impacto no lançamento |
|---|---|---|---|---|---|---|
| WABA piloto Haven | revalidar | cliente/Haven | existente, não reconectar | leitura atual do backend/Meta | runtime SOS | bloqueia piloto se inválida |
| WABA para novos clientes | Embedded Signup/Tech Provider ou parceiro elegível | a definir | UNVERIFIED EXTERNAL | docs e aprovação oficiais | onboarding assistido | bloqueia GA, não piloto |
| CAPI/dataset | permissões e dataset elegível | cliente | revalidar | Events Manager/API | relatório interno | não bloqueia prova inicial |
| Meta Business Agent | acesso/termos oficiais | Meta/cliente | BLOCKED_EXTERNAL | documentação vigente | LeanHostedAgentProvider | nunca caminho crítico |

Rotas distintas:

- **Piloto:** WABA já pertencente ao cliente e conexão existente.
- **Escala:** Embedded Signup/Tech Provider ou parceiro oficialmente elegível, somente após aprovação verificável.

---

## 3. Arquitetura-alvo

### 3.1 Repositório canônico

O repositório `Sales-OS-Lean` deve evoluir para monorepo:

```text
Sales-OS-Lean/
├── apps/
│   ├── web/                    # Next.js: experiência Lean
│   └── api/                    # Fastify: Commercial Core derivado do SOS
├── packages/
│   ├── contracts/              # Zod/OpenAPI, DTOs públicos e tipos gerados
│   ├── ui/                     # tokens e componentes Lean aprovados
│   ├── config/                 # lint, TS e env schemas compartilhados
│   └── testkit/                # factories/fixtures somente de teste
├── infra/
│   ├── docker/                 # imagens e entrypoints
│   └── lab/                    # compose, serviços e dados descartáveis
├── docs/
│   ├── architecture/
│   ├── product/
│   ├── runbooks/
│   └── evidence/
└── scripts/
```

Use workspaces do pnpm e um único lockfile. Não mantenha dois gerenciadores de pacote.

Fonte autoral de contratos: schemas Zod versionados em `packages/contracts`. Fastify consome os schemas; OpenAPI e client web são gerados. CI falha se a geração produzir diff. Mudanças incompatíveis exigem versão e contract tests contra blue e green.

### 3.2 Decisão de dados e autenticação

- **Fonte de verdade:** PostgreSQL/Supabase e migrations do domínio SOS.
- **Haven Pilot:** usa o mesmo projeto Supabase/banco atual como único data plane; não haverá replicação ativa-ativa nem segundo banco comercial durante o piloto.
- **Auth:** Supabase Auth/JWT validado pelo Fastify.
- **Autorização:** RBAC + RLS por `workspace_id`.
- **Não usar como base:** Prisma/NextAuth atuais do Lean.
- O schema Prisma pode permanecer temporariamente apenas até o inventário terminar; depois deve ser classificado como `RETIRE_AFTER_PARITY`, nunca operar em paralelo.
- Frontend nunca acessa `service_role` nem tabela de segredos.
- Toda consulta e mutação comercial deve ser workspace-scoped no banco e na API.

Ledger de migrations:

- migrations SOS já aplicadas entram no Lean como baseline vendor imutável;
- preservar nome, conteúdo, ordem e SHA-256;
- nunca editar nem reaplicar migration registrada no data plane Haven;
- toda evolução Lean começa em migration nova, forward-only;
- migrations novas devem ser compatíveis com blue N e green N+1 durante a janela de cutover;
- testar banco vazio, snapshot sanitizado equivalente à produção e execução simultânea N/N+1;
- novo projeto Supabase ou cópia física de dados fica fora do Haven Pilot e exige ADR e plano de migração próprios.

O executor deve inventariar `SOS_SALES_RUNTIME_FACTORY` e o composition root efetivo de produção. Antes da Onda 3, deve trazer o factory/adapters com proveniência ou substituí-los por adapters Lean testados; não assumir que o runtime completo está no checkout.

### 3.3 Fronteiras de serviço

```text
Browser Lean
  │ Supabase JWT
  ▼
Fastify API / OpenAPI
  ├── Identity & Workspace
  ├── Inbox & Assignment
  ├── Commercial Journey / Pipeline
  ├── Follow-up Scheduler
  ├── Agent Runtime & Handoff
  ├── Attribution & Outcomes
  ├── Meta Feedback / CAPI
  └── Reporting / Traffic Proof
  │
  ├── PostgreSQL + RLS       fonte durável
  ├── Redis                  presença, rate limit, cache e locks efêmeros
  ├── Outbox + Workers       efeitos externos recuperáveis
  ├── Meta Cloud API         WABA e CAPI
  └── AI Provider Port       Lean Hosted / Meta Business Agent quando elegível
```

Não use API Routes do Next.js como segundo backend de negócio. Elas podem existir apenas como BFF mínimo quando houver razão comprovada, sem duplicar domínio, auth ou provider.

### 3.4 Regra de propriedade do WABA

Para cada `phone_number_id`, deve existir exatamente um ingress owner e uma cadeia de processamento:

```text
Meta webhook
  → verificação challenge/HMAC
  → persistência de receipt/evento idempotente
  → resposta rápida 200/202
  → outbox
  → worker
  → contato/jornada/mensagem
  → IA/handoff/follow-up
  → outbound dispatch
  → status webhook
  → UI/reload
```

No piloto Haven, o endpoint atualmente configurado continua sendo o owner até cutover aprovado. O novo runtime deve ser testado no Lab com payloads sanitizados e providers controlados. Não assine o mesmo webhook em dois runtimes.

Crie autoridade persistente:

```text
channel_runtime_ownership
├── provider
├── provider_asset_id         # phone_number_id/page id
├── owner_runtime             # blue | green
├── ownership_epoch           # inteiro monotônico
├── mode                      # OBSERVE | ACTIVE | DRAINING
└── updated_at / updated_by
```

Toda claim, decisão IA, follow-up e outbound dispatch carrega `ownership_epoch`. Worker com epoch antigo não pode renovar lease, completar evento ou chamar provider.

Regras do receipt/status:

- persistir raw body e identificador estável de forma sanitizada/idempotente antes de normalizar;
- um batch parcialmente inválido não pode apagar os itens válidos nem responder sucesso silencioso aos inválidos;
- status desconhecido vira `UNKNOWN_PROVIDER_STATUS`, nunca `DELIVERED` por fallback;
- status que chega antes da mensagem entra em orphan/quarantine e é reconciliado depois;
- dedupe durável usa provider identifiers/constraint, nunca `Date.now()` ou somente TTL Redis.

### 3.5 Estratégia de migração

Use blue-green/strangler:

1. Lean web e API no Lab, sem tocar produção.
2. Reuso seletivo dos módulos SOS com manifesto de origem.
3. Contratos Lean estabilizados e testados.
4. Shadow read da Haven, se autorizado, sem responder nem emitir eventos.
5. Endpoint estável persiste raw receipt idempotente antes de responder 200.
6. Cutover: pausar outbound, colocar blue em `DRAINING`, registrar high-water mark, drenar claims, incrementar epoch atomicamente e ativar green.
7. Canário ocorre por modo/capacidade/tenant, nunca balanceando aleatoriamente o POST WABA entre blue e green.
8. Rollback incrementa novamente o epoch apontando para blue; não reutiliza epoch anterior.
9. Reconciliar receipt, message, dispatch e provider status antes de declarar conclusão.

---

## 4. Mapa obrigatório de reuso do SOS Sales

Crie `docs/reuse-manifest.md` e classifique cada item em:

- `REUSE_DIRECT`: trazer com mudanças mínimas.
- `ADAPT`: reaproveitar domínio/padrão, reescrever bordas.
- `REFERENCE_ONLY`: usar como aprendizado, não copiar.
- `DEFER`: válido, mas fora da onda atual.
- `RETIRE_AFTER_PARITY`: mecanismo Lean substituído quando paridade estiver provada.
- `BLOCKED_EXTERNAL`: depende de Meta, permissão ou outro sistema.
- `IMMUTABLE_BASELINE`: preservar para compatibilidade/proveniência, mas evoluir somente por migrations/adapters novos.
- `SELECTIVE_PORT`: portar apenas contratos/testes aprovados, sem copiar a superfície inteira.

### 4.1 Reuso recomendado

| Capacidade | Origem SOS | Decisão inicial |
|---|---|---|
| Schema multi-tenant e RLS | `apps/api/supabase/migrations/20260814000001_initial_domain_schema.sql` | IMMUTABLE_BASELINE + ADAPT papéis |
| Ingestão/outbox | `20260814000002_waha_inbound_ingestion.sql` e gateways/workers | ADAPT para provider neutro |
| Handoff e supervisão | `20260814000003_handoff_supervision_controls.sql` | ADAPT/HARDEN com generation fencing |
| Outbound supervisionado | `20260814000005_supervised_waha_outbound.sql` | ADAPT para WABA-first |
| Concorrência/idempotência | `20260818000010_concurrency_and_idempotency_hardening.sql` | REUSE_DIRECT |
| Workspace/auth/RBAC | ports/gateways `workspace-*`, `auth-guard.ts` | ADAPT para cinco papéis |
| WABA client/webhook | `infrastructure/channels/meta` e `routes/webhooks/waba-webhook.ts` | ADAPT/HARDEN |
| Recepcionista 24/7 | `application/agents/receptionist-agent.ts` | ADAPT; remover fire-and-forget |
| Configuração do agente | `workspace_agent_config` + `agent-routes.ts` | REUSE_DIRECT |
| Handoff API | `handoff-operations.ts` + gateway | ADAPT; adicionar claim/transfer/release |
| Atribuição CTWA | `application/services/attribution-service.ts` | ADAPT; normalizar IDs |
| Outcomes comerciais | gateway + `commercial-outcomes.ts` | ADAPT; consolidar CAPI |
| CAPI worker | `capi-dispatch-worker.ts` + outbox | ADAPT/HARDEN; corrigir lifecycle/estados |
| Spend Meta | `meta-spend-import-worker.ts` | ADAPT com scheduler/observabilidade |
| Traffic proof | `postgres-traffic-proof-gateway.ts` + rota | REUSE_DIRECT |
| Segredos | `channel_connection_secrets` e plano de secret store | ADAPT; gateway único |
| OpenAPI/testes | `apps/api/openapi.*`, testes integration/unit | SELECTIVE_PORT |

### 4.2 Redundâncias que devem ser eliminadas

- O endpoint `commercial-outcomes.ts` possui envio CAPI fire-and-forget e existe também `CapiDispatchWorker`. A arquitetura Lean deve ter **um único caminho durável via outbox/worker**.
- O Receptionist não pode continuar crítico via `setImmediate()`. Deve consumir evento persistido.
- Credenciais Meta não podem ser consultadas diretamente por múltiplas rotas. Use `ChannelSecretStore` tenant-scoped.
- Idempotência Redis não substitui unicidade persistente. Redis é aceleração; PostgreSQL/outbox é autoridade.
- Mocks, `localStorage`, defaults de Haven e status fabricados não entram no produto novo.
- WAHA e WABA não podem ingerir a mesma conversa simultaneamente. WABA é padrão oficial do plano de entrada; WAHA fica como adapter legado explicitamente selecionado.

Denylist inicial de reuso direto:

- CAPI fire-and-forget de `commercial-outcomes.ts`;
- mutações síncronas frágeis do webhook WABA atual;
- fallback direto WABA → WAHA em `/send-message`;
- qualquer `inferred-acq`, “Atendimento Geral” ou fato inferido exibido como persistido;
- `HAVEN_CONFIG` e defaults específicos de tenant;
- `cors: { origin: true }` em produção;
- Redis TTL como única idempotência;
- Prisma/NextAuth/API Routes de domínio do protótipo Lean;
- duplicidade `pipeline_stage` versus `decision_states.current_stage` sem ADR de consolidação.

---

## 5. Modelo de domínio mínimo

Preserve e evolua o domínio já existente. Não crie tabelas paralelas com conceitos duplicados.

### 5.1 Entidades principais

- `workspaces`
- `workspace_memberships`
- `workspace_profiles`
- `channel_connections`
- `channel_connection_secrets`
- `contacts`
- `commercial_journeys`
- `conversation_messages`
- `conversation_message_events`
- `acquisition_contexts`
- `handoff_cases` e `handoff_case_events`
- `follow_up_tasks`
- `commercial_appointments`
- `commercial_outcomes`
- `campaign_spend_daily_facts`
- `outbox_events`
- `dead_letter_events` ou estado DLQ equivalente
- `workspace_agent_config`
- `audit_events`

### 5.2 Estados comerciais internos

Pipeline padrão configurável, com IDs estáveis e rótulos por workspace:

```text
NEW
  → CONTACTED
  → QUALIFIED
  → APPOINTMENT_SCHEDULED
  → ATTENDED
  → WON

Saídas possíveis:
  LOST | INVALID | DUPLICATE | UNRESPONSIVE
```

Regras:

- `WON`, `LOST`, `INVALID` e `DUPLICATE` são finais e auditáveis.
- Uma alteração final exige ator, timestamp, razão e idempotency key.
- Receita é armazenada em centavos e moeda explícita.
- Mover card no Kanban chama uma transição de domínio; não faz update arbitrário de coluna.
- A mesma jornada não pode possuir outcomes finais contraditórios.
- Correção de outcome deve ser novo evento de retificação autorizado, não `UPDATE` silencioso.

### 5.3 Estado de conversa e IA

```text
AI_OFF
  → COPILOT_SUPERVISED
  → SEMI_AUTONOMOUS
  → AUTONOMOUS_24_7

Por jornada:
AI_ACTIVE
  → HANDOFF_PENDING
  → HUMAN_ACTIVE
  → RESOLVED_BY_HUMAN
  → RETURNED_TO_AI
```

Autoridade concorrente obrigatória:

```text
conversation_control
├── workspace_id / journey_id
├── mode                  # AI | HANDOFF_PENDING | HUMAN
├── assigned_user_id
├── control_generation    # inteiro monotônico
├── version               # optimistic concurrency
└── updated_at / reason
```

Guardrails:

- Default global e por jornada é fail-closed.
- IA só envia em autonomia após configuração publicada, canal válido e política autorizada.
- Objeção sensível, pagamento, reclamação, risco, pedido humano e baixa confiança geram handoff.
- Ao aceitar handoff, pausar IA atomicamente antes do humano responder.
- Retorno à IA é explícito, auditado e só ocorre se configuração global permitir.
- O modelo sugere; política determinística autoriza ou bloqueia ações.
- `claim`, `transfer`, `release` e `return_to_ai` bloqueiam a linha, validam versão e incrementam `control_generation`.
- Decisão IA, follow-up e outbound guardam a geração observada.
- Worker revalida ownership epoch, control generation e política imediatamente antes da chamada externa.
- Resposta do lead, opt-out ou outcome final invalida a geração da cadência.
- Dispatch já aceito pelo provider não pode ser “cancelado”; vira estado ambíguo/aceito e exige reconciliação.

### 5.4 Estado de follow-up

```text
SCHEDULED → CLAIMED → SENT → ACKNOWLEDGED
                    ↘ RETRY_WAIT → CLAIMED
                    ↘ FAILED_FATAL → DLQ
        ↘ CANCELLED_BY_REPLY
        ↘ CANCELLED_BY_OUTCOME
```

Toda tarefa deve ter `workspace_id`, `journey_id`, `due_at`, timezone, motivo, template/política, attempts, idempotency key e audit trail.

---

## 6. Módulos do produto e critérios funcionais

### 6.1 Onboarding PME

Wizard em linguagem simples:

1. Criar workspace e perfil do negócio.
2. Conectar WhatsApp oficial por Embedded Signup quando aplicável.
3. Convidar atendentes e definir papéis.
4. Importar/configurar serviços, horários, FAQs, limites e tom.
5. Configurar pipeline padrão e regras de follow-up.
6. Conectar conta de anúncios/dataset em modo somente leitura inicialmente.
7. Executar checklist controlado de canal e IA.
8. Publicar primeiro em `copilot_supervised`.

Haven não passa por reconexão. Para esse tenant, o wizard lê a configuração existente pelo backend e apresenta “Conexão existente detectada”, sem revelar segredos.

State machine do onboarding:

```text
NOT_STARTED → IN_PROGRESS → NEEDS_EXTERNAL_ACTION
            → READY_FOR_CHECK → COPILOT_READY → ACTIVATED
            → DEGRADED
```

Cada etapa informa em linguagem PME: objetivo, dado solicitado, motivo, validação, possibilidade/impacto de pular e como retomar. Trate permissão Meta negada, convite pendente, canal existente, config IA inválida e abandono. Concluir formulário não significa ativação: `ACTIVATED` exige primeiro lead CTWA atribuído, atendimento dentro do SLA e outcome auditável.

### 6.2 Inbox multiatendente

Funcionalidades mínimas:

- Lista de conversas com busca, filtros, unread, SLA, canal, estágio e responsável.
- Thread com mensagens reais, status enviado/entregue/lido/falhou e attachments suportados.
- Compositor obedecendo janela de atendimento e templates WABA.
- Assumir, transferir, resolver e devolver à IA.
- Notas internas, tags e próxima ação.
- Dossiê lateral com origem do anúncio, campanha/criativo, fatos, estágio, agenda e outcome.
- Presença/typing efêmeros via Redis/realtime.
- Atribuição e estado de conversa duráveis no PostgreSQL.
- Proteção de colisão: optimistic version/lease e erro claro quando outro atendente assumiu.
- Auditoria de toda ação sensível.

### 6.3 IA 24/7

Abstraia providers:

```ts
interface ConversationAgentPort {
  decide(input: AgentTurnInput): Promise<AgentDecision>;
}

type AgentDecision = {
  intent: string;
  confidence: number;
  proposedReply?: string;
  proposedActions: ProposedAction[];
  requiresHandoff: boolean;
  reasonCodes: string[];
};
```

Implementações possíveis:

- `LeanHostedAgentProvider`: LLM contratado pela plataforma, com prompt/config do workspace.
- `MetaBusinessAgentProvider`: somente após confirmar API, elegibilidade, termos e capacidades oficiais.
- `DisabledAgentProvider`: fail-closed.

O produto não deve depender de um provider para seu domínio. Pipeline, follow-up, outcome, auditoria e CAPI permanecem internos.

Capacidades da primeira versão:

- saudação e descoberta de intenção;
- resposta baseada em base publicada;
- qualificação configurável;
- coleta de dados necessários;
- sugestão/agendamento quando integrado;
- objeções simples em modo supervisionado;
- handoff determinístico;
- resumo da conversa;
- sugestão de próxima ação e etapa;
- cancelamento automático de follow-up quando cliente responde.

### 6.4 Pipeline automatizado

- Kanban é uma projeção do domínio, não fonte isolada.
- Regras determinísticas podem avançar etapas com evidência: primeira resposta, qualificação completa, agendamento confirmado, comparecimento, pagamento/outcome.
- Mudança automática deve mostrar “por quê”, fonte e possibilidade de correção.
- IA pode recomendar mudança; automação só aplica transições autorizadas.
- Pipeline deve ser configurável por workspace sem apagar códigos internos usados em métricas.

### 6.5 Follow-up automatizado

- Templates e cadências por estágio, segmento e canal.
- Janela livre WABA respeitada; fora dela, somente template aprovado elegível.
- Quiet hours, timezone, frequência máxima, opt-out e stop conditions.
- Resposta do lead, outcome final ou handoff humano podem cancelar a sequência.
- Retry exponencial limitado, jitter, classificação fatal/retryable e DLQ.
- Interface mostra próximo follow-up, motivo, conteúdo previsto e opção de cancelar/adiar.

### 6.6 Atribuição e feedback Meta

Capturar no ingresso:

- `ctwa_clid`, `fbclid` e identificadores aceitos pela Meta;
- `source_id/ad_id`, campanha, conjunto, criativo, headline e source URL quando presentes;
- UTM/tracking code quando aplicável;
- primeira mensagem e confiança da atribuição;
- timestamp, phone number id e canal.

Outcome ladder interna:

- lead recebido;
- contatado;
- qualificado/desqualificado com reason code;
- agendado;
- compareceu/não compareceu;
- ganhou/perdeu;
- receita confirmada.

Mapeamento CAPI:

- Deve ser configurável e validado contra a documentação Meta vigente.
- Não invente nomes de eventos. Valide `Lead`, `Contact`, `Schedule`, `Purchase` e qualquer evento de qualidade aceito para o dataset/objetivo.
- `event_id` determinístico por workspace+jornada+versão do outcome.
- Dados pessoais normalizados e SHA-256 conforme contrato oficial.
- Consentimento, base legal, retenção e opt-out devem ser documentados.
- Um único outbox/worker envia eventos.
- Persistir request ID, resposta sanitizada, attempts, event time, dataset, status e erro.
- Antes de produção, usar ambiente/test code somente com autorização e reconciliar no Events Manager.
- O dashboard deve diferenciar `queued`, `accepted_by_api`, `matched/processed` quando disponível, `failed` e `unknown`.

Estados técnicos CAPI obrigatórios:

```text
NOT_ELIGIBLE | BLOCKED_CONFIG | QUEUED | IN_FLIGHT | ACCEPTED_API |
RETRY_WAIT | PROVIDER_UNKNOWN | DLQ
```

Ausência de pixel/token nunca significa publicado. Falha de banco/contexto é retryable. Classifique Meta por HTTP, code, subcode, `is_transient` e `Retry-After`; 429 é retryable. Timeout ambíguo vira `PROVIDER_UNKNOWN` e é reconciliado por `event_id`.

Eventos enviados não significam que a campanha está otimizando por qualidade. Isso só pode ser afirmado após validar dataset, objetivo/performance goal, evento selecionado, volume e diagnóstico no Ads Manager.

### 6.7 Painel do gestor de tráfego

Visão somente leitura por padrão:

- investimento;
- leads atribuídos;
- conversas iniciadas;
- contatos válidos;
- qualificados;
- agendados;
- comparecimentos;
- vendas e receita;
- CPL, custo por qualificado, custo por agendamento, CAC e ROAS quando base válida;
- tempo de primeira resposta;
- taxa de resposta da IA/humano;
- perdas por motivo;
- cobertura e confiança de atribuição;
- saúde do feedback CAPI.

Sempre mostrar período, timezone, fonte, data de atualização e lacunas. Nunca dividir por zero, fabricar spend ou transformar ausência em 0 confiável.

---

## 7. Arquitetura visual e experiência

### 7.1 Navegação canônica

```text
LEAN
├── Hoje
│   ├── fila prioritária
│   ├── follow-ups vencendo
│   └── alertas reais
├── Conversas
│   ├── inbox
│   ├── thread
│   └── dossiê
├── Oportunidades
│   ├── pipeline
│   └── agenda/follow-up
├── Resultados
│   ├── funil comercial
│   ├── qualidade do lead
│   └── mídia → venda / CAPI
└── Configurações
    ├── WhatsApp/Meta
    ├── IA
    ├── Pipeline e follow-up
    ├── Equipe e permissões
    └── Plano e consumo
```

Princípios:

- App operacional, não mosaico de cards.
- Superfície calma, alta legibilidade, pouco chrome e uma cor de ação.
- “Hoje” responde o que fazer agora; “Resultados” responde o que funcionou.
- Evite sete abas técnicas e terminologia Meta na operação diária.
- Configuração avançada usa progressive disclosure.
- Nenhum preset local pode parecer aprovado pelo provedor.

### 7.2 Hierarquia das telas

Em cada tela, documente:

1. informação primária;
2. ação primária;
3. contexto secundário;
4. detalhes sob demanda.

Limite a primeira dobra a três prioridades. Cards só existem quando o card é a interação.

Navegação por papel:

| Papel | Entrada | Primário | Read-only/limitado | Oculto |
|---|---|---|---|---|
| Owner | Hoje | todas as cinco áreas | — | — |
| Manager | Hoje | Hoje, Conversas, Oportunidades, Resultados | settings permitidos | segredos/billing sem grant |
| Attendant | Conversas | Hoje, Conversas, oportunidades atribuídas | resultados limitados | canal, IA global, billing |
| Traffic Manager | Resultados | Resultados | mídia, funil, qualidade | inbox, mensagens e mutações |
| Viewer | Resultados | Resultados | conforme workspace | toda mutação |

Ocultar menu não é autorização. Deep links e API devem aplicar o mesmo RBAC.

### 7.2.1 Contrato operacional da thread

Barra persistente no cabeçalho:

- controlador atual: IA, atendente nomeado ou aguardando aceite;
- modo global da IA e motivo do último handoff;
- ação válida: assumir, transferir, devolver à IA ou revisar sugestão;
- decisão/envio pendente claramente separado de mensagem enviada;
- conflito explícito: “Maria assumiu às 14:32; sua resposta não foi enviada”;
- confirmação antes de devolver à autonomia.

Assignment é autoridade; presença/typing são indícios. Quando outro operador controla, composer fica read-only. Takeover exige permissão, confirmação e motivo. Em conflito, preserve rascunho local para copiar/revisar; nunca reenvie automaticamente. Perda de realtime mostra estado possivelmente desatualizado antes de mutação sensível.

### 7.3 Estados obrigatórios

Para cada feature, implemente e teste:

| Estado | O que o usuário vê |
|---|---|
| Loading | skeleton coerente, sem número falso |
| Empty-first-use | explicação curta + ação de configuração |
| Empty-filter | nenhum resultado + limpar filtro |
| Partial | dados disponíveis + lacuna/fonte indisponível |
| Error retryable | causa simples + tentar novamente + request ID |
| Permission denied | ação bloqueada + papel necessário |
| Provider disconnected | impacto + reconectar, sem status verde |
| Success | confirmação específica e estado atualizado |
| Offline/reconnecting | banner não bloqueante, fila local apenas se segura |

Além da tabela global, crie matriz concreta para Hoje, conversation list, thread, composer, dossiê, pipeline, follow-up, resultados e onboarding. Mínimos:

- thread parcial mostra intervalo ausente e recarregar;
- resultados sem spend preservam funil comercial e marcam métricas de mídia indisponíveis;
- composer fora da janela bloqueia texto livre e oferece template elegível;
- pipeline vazio explica que oportunidades nascem da inbox;
- provider degradado permite leitura, bloqueia efeito externo e informa causa.

Cada KPI expõe `valor | estado | fonte | atualizado em | cobertura | confiança`. Estados: `CONFIRMED`, `PARTIAL`, `DELAYED`, `UNAVAILABLE`, `INFERRED`, `RECONCILING`. `R$ 0` só aparece quando zero foi calculado; ausência usa `—` com explicação. Inferência nunca se mistura visualmente a fato confirmado.

### 7.4 Responsividade e acessibilidade

- Desktop: inbox em três painéis; painel direito recolhível.
- Tablet: lista + thread; dossiê em drawer.
- Mobile: uma tarefa por tela; lista → thread → detalhes, com back previsível.
- Navegação mobile inferior ou drawer consistente; não apenas esconder sidebar.
- Touch target mínimo 44px.
- Contraste WCAG AA, foco visível, landmarks e labels persistentes.
- Inbox, composer, Kanban e diálogos operáveis por teclado.
- Não depender apenas de cor para status.
- Mensagens novas anunciadas de modo não intrusivo para screen reader.

Contrato mobile:

- inbox: lista → thread full-screen → detalhes em sheet, sem perder scroll/rascunho;
- assumir/handoff no header e composer fixo no rodapé;
- pipeline vira lista agrupada por etapa; drag nunca é obrigatório;
- mudança de etapa via menu, com confirmação em estados finais;
- filtros em sheet com contador e limpar;
- Hoje prioriza somente SLA vencido, handoff pendente e follow-up devido;
- tablet usa dois painéis, nunca três colunas comprimidas.

Acessibilidade verificável: WCAG 2.2 AA, ordem de foco, `aria-live="polite"` apenas para nova mensagem relevante, Kanban sem drag, foco retorna ao acionador, lista virtualizada compatível com teclado/AT, erros associados ao campo e resumo, `prefers-reduced-motion` e status independente de cor.

### 7.5 Design system executável

Antes das telas finais, criar `DESIGN.md` com tokens semânticos, tipografia, espaçamento, densidade confortável/compacta e vocabulário canônico. Componentes mínimos: `DataStatus`, `ControlBar`, `AssignmentBadge`, `MetricProvenance`, `EmptyState`, `ErrorPanel`, `PermissionGate`. Definir quando usar card, drawer, sheet, modal e tabela. Não declarar dark mode se não for integralmente suportado/testado.

---

## 8. Segurança, governança e confiabilidade

### 8.1 RBAC mínimo

| Ação | Owner | Manager | Attendant | Traffic Manager | Viewer |
|---|---:|---:|---:|---:|---:|
| Configurar canal/segredo | sim | não | não | não | não |
| Publicar autonomia 24/7 | sim | opcional por permissão | não | não | não |
| Convidar/remover equipe | sim | limitado | não | não | não |
| Assumir/transferir conversa | sim | sim | sim | não | não |
| Registrar outcome | sim | sim | sim | não | não |
| Ver resultados comerciais | sim | sim | limitado | sim | sim |
| Alterar campanhas Meta | não no MVP | não | não | não | não |

### 8.2 Segredos

- `channel_connections`: apenas IDs e config não secreta.
- `channel_connection_secrets`: payload cifrado/Vault e tipo explícito.
- Gateway único por workspace+connection+kind.
- Rotação e revogação auditáveis.
- Nunca retornar token em GET.
- Logs somente com IDs, tipo e presença/ausência.

### 8.3 Outbox e workers

Todo efeito externo crítico usa:

- transação com evento de domínio;
- claim batch;
- lease renovável;
- claim token/fencing;
- idempotency key persistente;
- retry limitado com jitter;
- fatal vs retryable;
- DLQ;
- reconciliação;
- métricas de idade/profundidade.

Workers mínimos:

- inbound normalization;
- AI decision;
- outbound dispatch;
- follow-up scheduler/dispatch;
- provider status reconciliation;
- CAPI dispatch;
- Meta spend import.

Crie `WorkerSupervisor` com start, stop, drain, health, backlog e readiness por worker. O contrato de outbox deve expor `renewLease` e separar explicitamente `retryDelaySeconds` de `maxAttempts`. O processo só fica ready quando migrations, DB, Redis e workers obrigatórios estiverem saudáveis. Corrija antes de portar qualquer divergência entre assinatura TypeScript e RPC SQL.

### 8.4 Observabilidade

Campos comuns: `request_id`, `correlation_id`, `workspace_id`, `journey_id`, `message_id`, `provider_event_id`, `worker_id`, `attempt`, `duration_ms`, `result`.

Métricas:

- webhook rejeitado/aceito/duplicado;
- eventos sem tenant;
- outbox depth e oldest age;
- worker success/retry/DLQ;
- primeira resposta;
- IA latency/error/handoff;
- outbound accepted/delivered/read/failed;
- follow-up due/sent/cancelled;
- CAPI queued/accepted/failed;
- attribution coverage/confidence;
- cross-tenant denials.

Não logue corpo completo de conversa por padrão. Defina redaction, retenção e acesso.

Defina também:

- cursor pagination e virtualização da inbox;
- índices por `workspace_id` + colunas de ordenação/filtro;
- orçamento p95 por endpoint crítico;
- CORS allowlist por ambiente e rate limits distintos para UI, webhook e workers;
- política LGPD de retenção/deleção para receipts, conversas, PII derivada, embeddings, logs e DLQ.

### 8.5 Error envelope canônico

```ts
type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
    correlationId?: string;
    fieldErrors?: Record<string, string[]>;
    action?: string;
    docUrl?: string;
  };
};
```

Crie catálogo e HTTP mapping para validação, autenticação, permissão, version conflict, conversation control conflict, provider degraded, rate limit e internal error. Web e API usam o mesmo contrato gerado.

---

## 9. Registro de falhas e resgates

| Falha | Detecção | Comportamento seguro | Recuperação |
|---|---|---|---|
| Webhook duplicado | provider ID + unique key | 200 sem novo efeito | mostrar dedupe metric |
| HMAC inválido | signature check raw body | 401, nada persistido | corrigir secret/subscription |
| Tenant não resolvido | phone/page mapping ausente | persistir receipt sanitizado/quarentena, sem IA | mapear e replay autorizado |
| Banco indisponível | conexão/transaction fail | provider response conforme contrato, alerta | retry/replay sem duplicar |
| IA timeout/envelope inválido | schema/timeout | sem outbound; handoff/fila | retry limitado ou humano |
| Humano assume durante IA | version/lease conflict | IA perde direito de enviar | reavaliar estado |
| Janela WABA fechada | timestamp/policy | bloquear texto livre | oferecer template aprovado |
| Token Meta expirado | Graph error code | canal degraded, fail-closed | reconectar/rotacionar |
| Rate limit Meta | código retryable | backoff+jitter | retry até limite |
| Follow-up após resposta | reply event | cancelar antes do envio | registrar cancellation reason |
| CAPI duplicado | deterministic event_id | mesmo evento idempotente | reconciliar resposta |
| Spend ausente | import gap | mostrar “sem dado”, não zero | reimportar período |
| Cross-tenant request | JWT/RLS/RBAC | 403/404 seguro | audit alert |
| Worker restart | lease expiry | outro worker recupera | fencing bloqueia stale worker |
| Front stale | version/ETag/realtime | aviso e refresh | reexecutar intenção consciente |

Crie runbook para cada falha P0/P1.

---

## 10. Roadmap de construção obrigatório

Não pule ondas. Cada gate produz evidência e decisão GO/NO-GO.

### Onda 0 — Congelamento e baseline

Objetivo: saber exatamente o que existe.

- Criar inventário Lean/SOS.
- Registrar manifest de commits.
- Mapear mocks, TODOs, rotas, schema, testes e dependências.
- Produzir `reuse-manifest.md`.
- Registrar capacidades `WORKING/PARTIAL/UNPROVEN/BROKEN/DEFERRED`.
- Não implementar feature nesta onda.

Gate:

- [ ] Nenhum segredo exposto.
- [ ] Worktrees preexistentes preservados.
- [ ] Reuso classificado antes de cópia.
- [ ] Riscos P0 listados.

### Onda 1 — Fundação reprodutível do Lean

- Converter para pnpm workspace e lockfile único.
- Corrigir dependências inválidas e remover pacotes inexistentes.
- Mover web para `apps/web` preservando UI útil.
- Criar `apps/api`, `packages/contracts`, `packages/config`, `packages/testkit`.
- Configurar lint, typecheck, Vitest e Playwright de verdade.
- Criar Docker Lab com web, API, PostgreSQL/Supabase compatível e Redis.
- Criar env schema e `.env.example` sem valores.
- CI: install frozen, lint, typecheck, unit, integration, build, E2E smoke.

Divida sem misturar estrutura e comportamento:

- 1A: dependências e toolchain;
- 1B: `git mv` estrutural, sem mudança comportamental;
- 1C: API/contracts mínimos;
- 1D: Lab/CI.

Bootstrap canônico a ser criado e documentado:

```text
pnpm doctor
pnpm bootstrap
pnpm lab:up
pnpm lab:check
pnpm lab:logs
pnpm lab:down
pnpm contracts:generate
pnpm contracts:check
pnpm contracts:test-compat
pnpm migration:verify
pnpm migration:plan
pnpm migration:test:fresh
pnpm migration:test:upgrade
```

Fixar `.nvmrc` ou `.tool-versions`, `packageManager`, Corepack, portas, endpoints, serviços esperados, timeout e mensagens de sucesso/falha. Meta de TTHW: até 10 minutos, medida em clone limpo.

Lab deve iniciar com `APP_ENV=lab`, `OUTBOUND_MODE=stub` e `CAPI_MODE=disabled`. Adapters externos não têm rede por padrão. Se credencial real aparecer no Lab sem autorização específica, inicialização falha de modo sanitizado.

Gate:

- [ ] Clone limpo → um comando sobe o Lab.
- [ ] Build web/API passa.
- [ ] Testes exemplo reais passam.
- [ ] Nenhum `MOCK_*` aparece em bundle de produção.
- [ ] Lab não consegue chamar Meta/WABA/CAPI real por padrão.

### Onda 2 — Identity, workspace e contratos

- Importar/adaptar migrations SOS em ordem e com checksum.
- Supabase Auth no web; JWT no Fastify.
- RBAC e RLS por workspace.
- Workspace bootstrap, memberships e convites.
- OpenAPI como contrato; client web tipado.
- Error envelope padronizado com request ID.
- Testes cross-tenant obrigatórios.

Gate:

- [ ] Usuário A não lê/muta workspace B.
- [ ] Owner/manager/attendant/traffic_manager respeitados.
- [ ] UI não inventa autorização.
- [ ] Reload mantém estado pelo backend.

### Onda 3 — WABA, inbox e multiatendimento

- Implementar ingress durável WABA em Lab.
- Persistir receipt, contato, jornada e mensagem idempotentes.
- Implementar lista/thread/status/attachments prioritários.
- Assignment, accept/transfer/resolve e proteção de colisão.
- Outbound supervisionado com janela/template.
- Status provider reconciliado até reload.
- Presença/typing efêmeros sem virar autoridade.

Gate Golden Path:

```text
payload controlado
→ webhook válido
→ receipt/evento
→ worker
→ contato/jornada/mensagem
→ inbox
→ operador assume
→ outbound provider mock/controlado
→ status
→ reload
→ retransmissão não duplica
```

Gate Haven desta onda: `OBSERVATION_ONLY`. Com autorização somente leitura, provar que leads reais entram, preservam atribuição e aparecem na nova projeção sem o Lean responder, mudar estágio ou emitir evento externo.

### Onda 4 — IA supervisionada e 24/7

- Portar `ReceptionistAgent` para worker durável.
- Publicação de config do workspace.
- Provider abstraction e schema de decisão estrito.
- Copilot supervisionado primeiro.
- Handoff determinístico e pause-before-send.
- Modos semi/autonomous atrás de feature flag backend.
- Avaliação offline com conversas sanitizadas.
- Kill switch por workspace e global.

Gate:

- [ ] IA não envia com config ausente.
- [ ] Timeout/modelo inválido não envia.
- [ ] Handoff vence corrida contra IA.
- [ ] Restart entre decisão e envio recupera sem duplicar.
- [ ] Autonomia 24/7 só ativa por publicação owner.

Gate Haven desta onda: `COPILOT`. A IA apenas sugere; humano revisa e envia. Medir aceitação, correção, intents, handoff e tempo economizado antes de liberar qualquer autonomia.

### Onda 5 — Pipeline e follow-up

- Transições de estágio auditáveis.
- Kanban conectado ao backend.
- Rules engine determinístico.
- Scheduler e worker de follow-up.
- Cancelamento por resposta/outcome.
- Quiet hours, templates, opt-out, retry/DLQ.
- Agenda e próxima ação.

Gate:

- [ ] Drag/drop persiste e recarrega.
- [ ] Dupla mutação concorrente gera conflito seguro.
- [ ] Follow-up não sai após resposta/outcome.
- [ ] Janela WABA e template são respeitados.
- [ ] Timezone/DST possuem testes.

Gate Haven desta onda: `PIPELINE_FOLLOWUP`. Ativar primeiro transições e tarefas observáveis; qualquer envio automático começa em pequena cadência, com preview, kill switch e responsáveis definidos.

### Onda 6 — Atribuição, outcome e closed loop Meta

- Adaptar attribution service CTWA.
- Importar spend com reconciliação.
- Outcomes e reason codes.
- Consolidar CAPI exclusivamente no worker.
- Dashboard acquisition cohort/traffic proof.
- Saúde do feedback e cobertura de atribuição.
- Validar documentação Meta atual antes de payloads.

Gate:

- [ ] Um lead CTWA mantém campanha/criativo após reload.
- [ ] Outcome não multiplica receita.
- [ ] Spend sem lead e lead sem spend aparecem como parcial.
- [ ] Mesmo outcome não gera CAPI duplicado.
- [ ] Teste provider controlado prova retry/fatal/DLQ.
- [ ] Evento real permanece bloqueado sem autorização.

Gate Haven desta onda: primeiro provar o closed loop **interno** `anúncio → conversa → qualificação → outcome → relatório`. `CAPI_TEST` só acontece depois de cobertura e integridade de outcomes aceitáveis, autorização específica e validação do dataset/evento.

### Onda 7 — Beta com Design Partners

Somente após os gates Haven:

- selecionar 3–5 empresas do mesmo beachhead;
- repetir onboarding sem configuração hardcoded da Haven;
- operar sem intervenção diária do desenvolvedor;
- comprovar que pipeline, follow-up e reason codes são reutilizáveis;
- medir tempo de ativação, suporte e custo por workspace;
- validar valor para owner e gestor de tráfego;
- manter Meta Business Agent fora do caminho crítico.

Gate:

- [ ] Pelo menos três tenants ativados pelo mesmo fluxo-base.
- [ ] Nenhum default, número, campanha, preço ou template específico da Haven.
- [ ] Time-to-value e carga de suporte medidos.
- [ ] Closed-Loop Coverage calculável em todos os tenants elegíveis.
- [ ] Nenhum P0 aberto.

### Onda 8 — Onboarding self-service, billing e General Availability

- Embedded Signup simplificado.
- Convites de equipe.
- Templates/config inicial por segmento.
- Planos, limites e consumo transparente.
- Feature entitlements backend.
- Trial e upgrade sem bloquear exportação de dados.
- Suporte e diagnóstico in-app.

Hipótese comercial, não hard-code definitivo:

- Start: R$97–127/mês.
- Team: R$197–247/mês.
- Growth: R$347–497/mês.
- Custos Meta e excedente de IA separados ou com franquia explícita.

Antes de publicar preços, executar Unit Economics Gate:

- custo Meta repassado separadamente;
- custo de IA por conversa resolvida;
- infraestrutura por workspace;
- minutos de suporte/onboarding;
- margem bruta mínima pretendida;
- limites de números, assentos, conversas e IA;
- política de excedente e uso abusivo;
- margem observada na Haven e nos design partners.

Plano acessível não significa IA ilimitada, WABA subsidiada e onboarding manual sem limite.

### 10.1 Protocolo falsificável de validação Haven

Haven é trilha transversal das Ondas 3–6, não etapa tardia.

Baseline:

- obter pelo menos 14 dias anteriores ou um ciclo comercial representativo;
- registrar volume, SLA, qualificação, follow-up, outcomes e cobertura de atribuição;
- usar cohort pela data de entrada do lead, não somente data do outcome;
- revalidar campanhas/anúncios por API em modo read-only; não confiar em memória.

Duração:

- 72 horas são apenas canário técnico de segurança;
- validação operacional dura 14–30 dias ou o ciclo de venda do beachhead;
- amostra mínima é definida depois de medir o volume real; não inventar significância.

Critérios de abortar imediatamente:

- mensagem ou CAPI não autorizada;
- duplicação de mensagem/outcome/evento externo;
- vazamento cross-tenant ou de segredo;
- IA inventar preço, agenda, política ou confirmação;
- follow-up após resposta/opt-out/outcome;
- fila crítica sem recuperação ou rollback;
- impossibilidade de restaurar o ingress owner anterior.

Critérios de aprovação por fase:

- integridade e dedupe dos eventos;
- cobertura de atribuição conhecida;
- atendimento dentro do SLA definido;
- cobertura de qualificação e outcomes;
- follow-ups no prazo e cancelamentos corretos;
- taxa de correção humana da IA dentro do limite definido após baseline;
- zero P0 e rollback ensaiado.

Conversão e receita são comparadas ao baseline, mas não prometa uplift quando a amostra for insuficiente.

Responsáveis e decisão:

- nomear owner técnico, owner operacional e operador de plantão;
- fazer reunião GO/NO-GO ao final de `OBSERVATION_ONLY`, `COPILOT`, `PIPELINE_FOLLOWUP` e `CAPI_TEST`;
- não alterar campanhas durante a validação inicial;
- qualquer `CONTROLLED_AUTONOMY` começa depois do copilot, em intents de baixo risco e janela pequena.

---

## 11. Estratégia de testes

### 11.1 Pirâmide

- Unitários: políticas, schemas, state machines, reason codes, normalization, event mapping.
- Integração: PostgreSQL/RLS, gateways, outbox, workers, migrations e idempotência.
- Contract: OpenAPI/client, provider adapters e payload fixtures sanitizadas.
- E2E Lab: browser → API → DB → worker → UI/reload.
- Chaos/recovery: restart, timeout, lease expiry, duplicação e provider failure.
- Segurança: cross-tenant, role escalation, secret leakage, HMAC e rate limit.

### 11.2 Cenários P0

1. Webhook duplicado não duplica mensagem nem resposta.
2. Dois atendentes tentam assumir a mesma conversa.
3. IA decide responder enquanto humano assume.
4. Worker cai após provider aceitar e antes de completar outbox.
5. Evento CAPI é reprocessado após timeout ambíguo.
6. Usuário de workspace A tenta ler/mutar B.
7. Token expirado e canal marcado corretamente como degraded.
8. Follow-up vence após o lead responder.
9. Outcome final concorrente `WON` vs `LOST`.
10. Spend import parcial não fabrica ROAS.
11. Mobile recebe nova mensagem com thread aberta.
12. Reload prova persistência de todas as mutações críticas.

### 11.3 Integridade de testes

- Nenhum teste pode passar apenas porque mock reproduz a implementação.
- Providers mockados devem simular success, retryable, fatal, timeout e resposta ambígua.
- Fixtures de webhook devem preservar estrutura oficial e remover PII.
- Migrations devem passar em banco vazio e upgrade de snapshot anterior.
- Teste cross-tenant usa tenants e usuários distintos.
- E2E deve validar UI após reload, não só estado em memória.
- Registre comandos e exit codes no relatório.

CI mínimo em GitHub Actions: frozen install, lint, typecheck, unit, contracts, migration fresh/upgrade, integration, build e E2E. PostgreSQL e Redis são descartáveis por job; jobs possuem timeout; nenhum secret real é carregado; artifacts de falha são sanitizados.

Rollback normal reverte runtime/feature flag/ownership epoch. Nunca execute down migration destrutiva como rollback operacional. `migration:plan` deve produzir SQL, checksum, compatibilidade N/N+1 e evidência antes de aplicar no Lab.

---

## 12. Definitions of Done por release

### 12.1 Haven Pilot Release

- [ ] Conexão WABA existente é reconhecida sem reconexão ou segredo no frontend.
- [ ] Mensagem inbound persiste e aparece após reload.
- [ ] Dois atendentes operam sem colisão silenciosa.
- [ ] IA em copilot sugere somente dentro da política publicada.
- [ ] Handoff humano é atômico e auditado.
- [ ] Pipeline mínimo, follow-up e cancelamentos são persistentes.
- [ ] Origem Meta/CTWA permanece associada ao lead.
- [ ] Outcome alimenta relatório interno sem duplicar receita.
- [ ] Canário de 72h e validação operacional possuem zero P0.
- [ ] Rollback para runtime anterior foi ensaiado.

### 12.2 Beta com Design Partners

- [ ] 3–5 PMEs do mesmo beachhead repetem o onboarding-base.
- [ ] Nenhum hardcode da Haven é necessário.
- [ ] Operação não depende de intervenção diária do desenvolvedor.
- [ ] Time-to-value, custo e suporte por workspace são conhecidos.
- [ ] Gestor convidado consulta resultados sem acesso operacional.
- [ ] Closed-Loop Coverage é mensurável nos tenants elegíveis.
- [ ] Build, unit, integration, E2E, restart/retry/dedupe e cross-tenant passam.

### 12.3 Market MVP

- [ ] Uma PME elegível cria workspace, conecta canal e convida equipe pelo fluxo suportado.
- [ ] IA controlada, pipeline e follow-up funcionam com kill switches e auditoria.
- [ ] Gestor enxerga spend → lead → qualidade → venda com fonte e período.
- [ ] CAPI, quando incluída no compromisso comercial, possui fila durável, idempotência, retry, DLQ e diagnóstico.
- [ ] Nenhum mock/status fabricado chega ao bundle/runtime de produção.
- [ ] RLS/RBAC e cross-tenant tests passam.
- [ ] Unit Economics Gate atende à margem definida.
- [ ] Runbooks, suporte, migração e rollback existem.
- [ ] Produção só é alterada com aprovação explícita.

---

## 13. Métricas de sucesso

North Star inicial:

> **Closed-Loop Coverage:** percentual de leads atribuídos que recebem atendimento dentro do SLA, classificação comercial e outcome auditável até o fim do ciclo definido.

Definição mínima:

```text
numerador   = leads atribuídos com SLA + classificação + outcome auditável
denominador = leads atribuídos elegíveis da cohort de entrada
```

Defina por métrica: numerador, denominador, cohort, janela, timezone, fonte, data de atualização e tratamento de dado ausente. Reduzir mídia não pode melhorar artificialmente a North Star.

Métricas complementares:

- tempo para primeira resposta;
- taxa de contato válido;
- taxa de qualificação;
- taxa de agendamento;
- comparecimento;
- conversão em venda;
- receita e CAC;
- cobertura/confiança de atribuição;
- follow-ups recuperados;
- resolução da IA sem handoff, separada por intent;
- handoff SLA;
- taxa de correção humana da IA;
- entrega/leitura/falha WhatsApp;
- CAPI acceptance/failure/match diagnostics;
- time-to-first-value do onboarding;
- custo de IA e Meta por workspace/mensagem/outcome.
- workspaces ativos semanalmente;
- outcomes fechados no prazo;
- frequência de uso pelos atendentes;
- intervenção manual do suporte por workspace.

Não use “mensagens enviadas” ou “IA respondeu” como métrica final de valor.

### 13.1 Glossário comercial obrigatório

Defina em `packages/contracts` e em documentação:

- `lead atribuído`;
- `contato válido`;
- `qualificado` e reason codes de desqualificação;
- `agendado`;
- `compareceu`;
- `WON/LOST`;
- receita confirmada;
- cobertura e confiança de atribuição;
- Closed-Loop Coverage.

Os mesmos termos e códigos devem existir em UI, API, banco e métricas.

---

## 14. Developer Experience e documentação

Persona primária de desenvolvimento: IA/engenheiro full-stack responsável por integrar Next.js, Fastify, Supabase, Redis e Meta sem acesso implícito a produção.

Meta de TTHW local: clone limpo até web+API+DB+Redis saudáveis em **menos de 10 minutos**, com um comando principal e diagnóstico claro.

Entregáveis obrigatórios:

- `README.md` com quick start real e output esperado.
- `CONTRIBUTING.md` com fluxo Lab → review → release.
- `docs/architecture/system.md` com diagramas e decisões.
- `docs/architecture/domain-state-machines.md`.
- `docs/runbooks/webhook.md`, `workers.md`, `waba.md`, `capi.md`, `rollback.md`.
- `docs/api/` gerado da OpenAPI versionada.
- `CHANGELOG.md` e política de migrations.
- `scripts/doctor` ou equivalente que valida pré-requisitos sem imprimir segredos.

Política de evolução:

- SemVer para API/contracts/client;
- expand-contract para schema e eventos;
- matriz web/API/schema compatível N/N+1;
- depreciação documentada antes de remoção;
- breaking change exige ADR, migration guide e teste de compatibilidade.

Todo erro operacional deve conter: problema, causa provável, ação sugerida e request/correlation ID.

---

## 15. Ordem de execução da primeira sessão

### Sessão A — auditoria, sem implementação

1. Preflight dos dois repositórios.
2. Matriz Lean/SOS e `reuse-manifest.md`.
3. Diagnóstico reprodutível da instalação/build do Lean.
4. Proposta de diff da Onda 1 com arquivos exatos.
5. Relatório, `docs/NEXT_SESSION.md` e **STOP**.

### Sessão B — somente após autorização textual `GO ONDA 1`

1. Revalidar HEAD/worktree e a proposta aprovada.
2. Implementar apenas a Onda 1A–1D autorizada.
3. Rodar build/test/Lab.
4. Atualizar evidências, ADRs e handoff.
5. STOP no gate da Onda 1.

Não interprete este prompt como `GO ONDA 1`. Não avance automaticamente para WABA, IA ou produção.

### 15.1 Handoff durável entre IAs

Cada sessão atualiza no repositório Lean:

- `docs/evidence/sessions/<timestamp>-<onda>.md`;
- `docs/NEXT_SESSION.md`;
- `docs/reuse-manifest.md` quando aplicável;
- ADR/decision log correspondente.

`NEXT_SESSION.md` registra HEAD, worktree, onda, gate, arquivos tocados, comandos/exit codes, evidências, bloqueios, autorizações existentes e primeira ação segura. Nunca copie tokens ou dados pessoais.

---

## 16. Formato obrigatório de reporte

Ao fim de cada sessão, reporte:

```text
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED

ONDA:
ESCOPO EXECUTADO:
ARQUIVOS ALTERADOS:
DECISÕES TOMADAS:
REUSO SOS (origem → destino):
COMANDOS + EXIT CODES:
TESTES:
EVIDÊNCIA UI→API→DB→WORKER→RELOAD:
MIGRATIONS:
RISCOS RESIDUAIS:
ITENS UNVERIFIED EXTERNAL:
PRODUÇÃO ALTERADA: NÃO, salvo autorização explícita registrada
PRÓXIMO GATE:
```

Use `DONE_WITH_CONCERNS` sempre que o código local estiver correto, mas depender de Meta, credencial, canário ou evidência externa.

---

## 17. Decisões que devem ser registradas em ADR

Crie ADRs para:

1. Lean como repositório canônico e SOS como fonte de capacidades.
2. Supabase Auth/RLS em vez do Prisma/NextAuth prototípico.
3. Fastify como único backend de domínio.
4. Um ingress owner por WABA/phone number.
5. Outbox/worker como único caminho de efeitos externos.
6. Provider abstraction para IA/Meta Business Agent.
7. Outcome ladder e mapeamento CAPI configurável.
8. WABA-first e WAHA como adapter legado opcional.
9. Strangler/blue-green para o piloto Haven.
10. Separação entre presença efêmera e atribuição durável.

---

## 18. Explicação simples do produto

Para um leigo:

> O Lean recebe a pessoa que veio do anúncio, atende no WhatsApp mesmo fora do horário, ajuda a equipe a não esquecer ninguém, registra se a conversa virou agendamento ou venda e devolve essa informação para a Meta aprender quais leads têm mais qualidade. O dono vê se o problema está no anúncio, no atendimento ou na venda. O atendente vê apenas o que precisa fazer agora.

Essa simplicidade deve existir na interface, mesmo que por trás haja filas, RLS, workers, idempotência, providers e reconciliação.

---

## 19. Checklist antes de começar a codificar

- [ ] Li os dois repositórios e não confiei só neste prompt.
- [ ] Confirmei branch/HEAD/worktree.
- [ ] Sei onde estão dados reais, mocks e placeholders.
- [ ] Classifiquei o reuso antes de copiar.
- [ ] Não criei segundo webhook ou segunda fonte de verdade.
- [ ] Minha mudança é reversível.
- [ ] Tenho teste de sucesso, falha, retry, concorrência e cross-tenant.
- [ ] Sei qual evidência prova o resultado após reload.
- [ ] Nenhum passo exige produção ou mutação externa não autorizada.

Se algum item falhar, pare, registre o bloqueio e proponha a menor decisão necessária.

## FIM DO PROMPT PARA A IA EXECUTORA

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `plan-ceo-review` | Estratégia, ICP, wedge e escopo | 1 | CLEAR | Beachhead estreitado; releases separadas; Haven antecipada; North Star e gates falsificáveis |
| Outside Voice | agente independente | Segunda opinião | 1 | ABSORBED | Evitou construir onboarding/billing antes de Haven + design partners |
| Eng Review | `plan-eng-review` | Arquitetura, dados, falhas e testes | 1 | CLEAR | Mesmo data plane no piloto; migration ledger; ownership epoch; control generation; worker supervision |
| Design Review | `plan-design-review` | UI/UX, estados, mobile e acessibilidade | 1 | CLEAR | Navegação por papel; control bar; conflitos; provenance; mobile e WCAG 2.2 AA |
| DX Review | `plan-devex-review` | Onboarding técnico e operação | 1 | CLEAR | Checkout guard; Sessão A/B; Lab stub; bootstrap, migrations, CI e handoff durável |

**CROSS-MODEL:** a revisão independente confirmou o wedge, mas reduziu o falso “MVP único” para Foundation → Haven → Design Partners → Market MVP → GA.

**VERDICT:** CEO + ENG + DESIGN + DX CLEARED — prompt pronto para Sessão A/Onda 0; implementação continua condicionada a `GO ONDA 1`.

**UNRESOLVED DECISIONS:**

- Especificar e provar no Lab o protocolo de handoff: SOS permanece temporariamente como runtime blue e único owner real do WABA; Lean não depende do SOS e recebe apenas fixtures/replay/espelhamento observer sem outbound/CAPI até o cutover autorizado. O cutover exige drenagem, reconciliação, novo `ownership_epoch`, fencing de workers stale e rollback com outro epoch novo.
- Definir thresholds numéricos do piloto após medir baseline e volume real da Haven.
- Definir limites/franquias dos planos após Unit Economics Gate.
- Confirmar a rota de onboarding WABA em escala após elegibilidade/aprovação Meta verificável.
- Decidir quando CAPI passa de capacidade técnica a compromisso comercial, após integridade de outcomes.
