# Handoff de Conclusão — TX Commercial Core / Sales OS

## Papel e regra de operação

Você é o implementador. Trabalhe exclusivamente em `/Users/franciscotaveira.ads/Projetos/new-sales-os`, na branch atual `gemini/p0-3b-production-runtime`. Codex é o supervisor: não faça push, deploy, merge remoto, alteração em VPS, alteração de credenciais reais, reset destrutivo ou commit sem autorização explícita do operador.

Objetivo: entregar um piloto local seguro de **continuidade comercial no WhatsApp**: anúncio/entrada → conversa preservada → contexto vivo → recomendação/handoff humano → ação aprovada → resultado mensurável. Não recriar o CRM-TX; aproveitar somente contratos comprovados de WAHA/Meta sob portas pequenas e testáveis.

## Verdade atual (não assuma além disto)

- Supabase local, Redis e WAHA estão em Docker; o reset do Docker foi recuperado via migrations + seed.
- `npm run check` e `npm run build` passaram localmente com **130 testes** após a migration P0.4A; reexecute antes de alterar ou declarar qualquer conclusão.
- WAHA local está em `127.0.0.1:3001`, sessão `sales-os-test` criada e aguardando QR. Ela está deliberadamente **sem webhook** até existir um contrato de assinatura WAHA real compatível com o receptor.
- Sales OS local está em `:3334`, com `/health` e `/ready` (database/redis/worker) verdes.
- Existem modificações locais não commitadas, inclusive P0.3B/P0.4A/docs. Preserve-as; comece com `git status`, `git diff --check`, `npm run check`, `npm run build`.
- Não há remote Git configurado. Não declare backup remoto como feito.

## Decisão de produto (não reabrir)

O produto é um **Sales OS para PMEs/agências**, não um ERP nem CRM genérico. A primeira experiência operável deve ter somente:

1. entrada de WhatsApp e origem de aquisição;
2. conversa cronológica com continuidade cognitiva;
3. fatos conhecidos e próximo passo com evidências;
4. handoff humano simples;
5. ação de saída bloqueada até aprovação e controles;
6. resultado comercial e prova de tráfego.

Não implementar hotel, financeiro genérico, Kommo, dashboards amplos, automações autônomas, chatbots livres, múltiplos canais, campanhas completas ou UI de administração antes do Golden Path.

## Ordem obrigatória de gstack

Execute e registre artefatos, nesta ordem:

1. `/gstack-autoplan` sobre este documento e `docs/P0_4_HANDOFF_SUPERVISED_EXECUTION_PLAN.md`.
2. `/gstack-plan-eng-review` para a fatia que será implementada.
3. `/gstack-plan-design-review` antes de criar UI.
4. Para cada fatia: `/gstack-review`, `npm run check`, `npm run build`.
5. Para a jornada executável: `/gstack-qa` ou equivalente com evidência reproduzível.
6. Ao final: `/gstack-ship` apenas para preparar o handoff; não realizar push/deploy sem autorização.

Se um comando/skill não estiver disponível, documente a lacuna e continue com revisão manual equivalente. Não invente resultados de ferramentas.

## P0.3B — Runtime de produção (fechar antes de qualquer deploy)

### Problemas conhecidos a validar/corrigir

1. TypeScript/ioredis: validar imports/instanciação de `Redis` e tipos no provider de health. `npm run check` deve ficar verde.
2. Composition root: `src/index.ts` não pode iniciar produção sem RuntimeDependencies reais. Produção deve falhar cedo sem adapters server-only explícitos e ter bootstrap que realmente os compõe, sem pool local ou segredo de env como fallback.
3. Readiness: `/ready` deve exigir exatamente ou no mínimo `database`, `redis`, `worker`; lista vazia, nomes ausentes/duplicados e exceções são 503.
4. Higiene: nunca refletir `DependencyStatus.reason` ou cadeia de conexão no payload HTTP; detalhes só em logs.
5. Worker: saúde deve cair se falhar polling/claim; `stop` deve drenar com limite e fechar recursos.

### Testes mínimos

- produção sem runtime rejeita antes de bind;
- produção com adapters fake seguros sobe, `/health` funciona e `stop` fecha uma vez;
- cada dependência degradada gera 503;
- provider vazio/lançando não gera 200 nem vaza senha/host;
- worker degradado é visível na readiness.

## P0.3C — WAHA real, somente sandbox/local primeiro

### Regra crítica

Não conecte o webhook atual por suposição. O receptor existente exige HMAC SHA-512, timestamp em milissegundos e headers específicos; validar contra o payload/headers reais da versão WAHA fixada. Se WAHA não produzir esse contrato, implementar um **gateway de borda** pequeno que:

- recebe o formato real de WAHA;
- verifica sua assinatura real de forma fail-closed;
- rejeita replay e timestamps fora da tolerância;
- normaliza/assina o envelope interno de forma compatível;
- registra evento bruto antes de projetar;
- não expõe segredo em banco, UI, logs ou URL.

### Entregáveis

- canal WAHA explícito por `channel_connection_id`, sem seleção silenciosa;
- segredo em provider de referência/Vault para produção; env apenas no sandbox local;
- sessão não deve conter URL com IDs/segredos-placeholder;
- configuração do webhook com URL local somente após o endpoint real estar verificável;
- teste físico: WhatsApp de teste → WAHA → webhook → `inbound_channel_events` → `conversation_messages` → outbox/worker;
- duplicata do provider não cria segunda mensagem/jornada;
- LID/telefone normalizado sem quebrar a identidade E.164;
- nenhum evento `message.any` duplicado sem regra explícita e teste.

### Gate externo obrigatório antes de staging/produção

HTTPS público, assinatura real, rotação/revogação de segredo, firewall, observabilidade, alertas, restore, e teste com conta de teste. Sem isso: sandbox local apenas.

## P0.4A — Handoff e controles (já modelado; homologar, não duplicar)

Há migration `20260814000003_handoff_supervision_controls.sql` e testes `handoff-supervision.test.ts`. Antes de editar, revisar o diff. Manter:

- `workspace_operation_controls` e `channel_operation_controls` fail-closed;
- audit trail append-only em `operation_control_events` e `handoff_case_events`;
- transições atômicas `accept_handoff`, `resolve_handoff`, `return_handoff_to_ai`;
- RBAC owner/operator/viewer e workspace isolation via RLS/composite FKs;
- sem UPDATE direto de handoff por operador;
- mutação em fatos históricos bloqueada, exceto procedimento LGPD controlado.

Adicionar somente o que faltar para testes de corrida, idempotência e auditoria passarem de verdade.

## P0.4B — Política, aprovação e outbound supervisionado

Implementar em fatias pequenas.

1. **PolicyEvaluator determinístico**: recebe ação proposta + evidências + controle; devolve ALLOW, REQUIRE_APPROVAL ou BLOCK com `policy_version`, razões e regras. Não chamar LLM para autorizar envio.
2. **Approval record append-only**: proposta, aprovador, decisão, momento, razão, snapshot de evidências/policy. A aprovação é separada da execução.
3. **Canal obrigatório**: ação/jornada outbound referencia `channel_connection_id`; validar que workspace e canal coincidem.
4. **Transactional outbox**: somente ação aprovada e controle habilitado entra em dispatch; revalidar controle e policy imediatamente antes de chamar provider.
5. **Outbound provider port WAHA**: idempotency key, timeout, retry classificado, nenhum retry cego em erro de política/controle, persistência de mensagem e ciclo de status em tabelas append-only.
6. **Kill switches**: desligar workspace ou canal depois de enfileirar impede provider call. Auditoria preservada.

Testes necessários: cross-tenant, approval identity, ação bloqueada = zero provider calls, kill antes/depois do enqueue, retry seguro, duplicata, falha do provider, transição de handoff concorrente, retorno da resposta humana para a mesma jornada.

## P0.5 — Aquisição e prova de tráfego

Extrair do CRM-TX apenas por adaptadores/ports, conforme `docs/WABA_EXTRACTION_BLUEPRINT.md`:

- Meta signature verification e secret rotation;
- seleção explícita Business → WABA → phone (sem seleção silenciosa);
- CTWA/referral/UTMs para `acquisition_contexts` imutáveis;
- status de mensagens, qualidade/template e erros classificados;
- Meta Graph outbound e CAPI via outbox, idempotentes e auditáveis;
- `commercial_outcomes` como origem do evento de conversão, nunca dashboard/sync como fonte de verdade.

Meta fica atrás de WAHA Golden Path e P0.4B. Nenhum token no Git, localStorage ou respostas HTTP.

## P0.6 — Frontend: Operator Cockpit mínimo

Base: `docs/P0_6_OPERATOR_COCKPIT_UX_BLUEPRINT.md`.

Antes de tela, definir contratos HTTP autenticados com DTO/Zod, paginação/cursor, loading/error/empty states e autorização por workspace. Implementar, nesta ordem:

1. `Agora`: lista de 3–5 prioridades, SLA/orfãs/sinais, sem dashboard enciclopédico.
2. `Conversa Viva`: timeline única, origem, fatos com proveniência, estado e próximo passo.
3. `Handoff`: aceitar, devolver à IA, resolver; identidade do operador e trilha de decisão visíveis.
4. `Composer protegido`: rascunho/recomendação, evidências, aprovar/enviar, bloqueado por policy/kill switch; nunca botão que envia implicitamente.
5. `Prova de Resultado`: origem → conversa → ação → outcome, com filtros simples.

Design obrigatório: bounded containers, cores semânticas, no máximo 3–5 itens prioritários, botão “ver todas”, acessibilidade por teclado, contraste, responsividade e estado offline/erro claro. Não copiar a UI poluída do CRM-TX.

## P0.7 — Operação e release

- ambiente separado local/staging/prod;
- migrations forward-only, seed exclusivo de desenvolvimento;
- backup + teste de restore;
- logs estruturados com correlation ID e sem PII/segredos;
- métricas: webhook recebido/deduplicado/falhou, fila, latência, outbound bloqueado/aprovado/enviado/falhou, handoff/SLA, outcome/atribuição;
- rate limits por rota/canal, CORS/trust proxy explícitos;
- SBOM/dependency scan, gitleaks e rotação de chaves antigas;
- runbooks: WAHA desconectado, webhook inválido, Redis/Postgres indisponível, rollback migration, incidente de segredo.

## Go/No-Go do piloto

Só declarar piloto utilizável quando houver evidência de:

- uma conta WAHA de teste conectada e mensagem percorrendo o Golden Path;
- isolamento entre dois workspaces e RBAC negativo;
- handoff humano atômico;
- ação outbound bloqueada sem aprovação e sem provider call;
- mensagem aprovada enviada uma única vez com status persistido;
- kill switch de workspace e canal funcional;
- `npm run check`, build, lint/typecheck aplicáveis e teste E2E/documentado verdes;
- backup/restore testado e nenhuma credencial em Git/logs.

## Formato de entrega de cada fatia

1. diagnóstico e escopo fechado;
2. arquivos/migrations alterados;
3. testes criados e comandos executados com resultado real;
4. riscos e itens deliberadamente adiados;
5. diff limpo;
6. pedir aprovação antes de commit/push/deploy.
