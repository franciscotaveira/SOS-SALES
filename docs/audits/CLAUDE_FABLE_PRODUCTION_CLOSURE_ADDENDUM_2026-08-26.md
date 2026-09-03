# Adendo de Fechamento para Produção — Claude Fable / SOS Sales

> Data: 26 de agosto de 2026
>
> Complementa, sem substituir:
>
> `docs/audits/CLAUDE_FABLE_EXECUTION_PROMPT_SOS_SALES_2026-08-26.md`
>
> `docs/audits/SOS_SALES_META_WABA_REMEDIATION_EXECUTION_PLAN_2026-08-26.md`

## 1. Mensagem para enviar ao Claude agora

```text
Continue o trabalho no repositório /Users/franciscotaveira.ads/Projetos/SOS-SALES,
seguindo integralmente o prompt e o plano já entregues. Acrescente estas regras de
fechamento:

1. Não crie uma segunda arquitetura para filas, capabilities, status de canal,
   workspace, secrets ou deploy. Primeiro localize e estenda os mecanismos existentes.
2. O projeto já possui contrato de outbox e workers com claim, lease e fencing para
   WAHA/CAPI. Remova o setImmediate() do caminho do Receptionist/WABA estendendo esse
   padrão. Não use o PostgresOutboxProcessingGateway de desenvolvimento como adapter de
   produção; a factory server-only de produção deve receber um adapter compatível.
3. Centralize em backend a fonte de verdade de capabilities e kill switches. Flags em
   localStorage podem servir apenas para desenvolvimento visual e nunca autorizar
   provider, outbound, IA, dados financeiros ou acesso de papel.
4. Preserve todas as funções existentes. Não delete nem esconda silenciosamente.
   Consolide redundâncias, realoque ações na UI quando necessário e mantenha capability
   não homologada em estado explícito, com motivo e requisito para ativação.
5. Feche primeiro a Onda A: WABA/WhatsApp + IA backend + handoff + persistência +
   idempotência + tenant isolation + observabilidade. Uma tela bonita ou build verde
   não prova a função.
6. Não declare produção pronta. Entregue READY_FOR_CODEX_REVIEW com matriz funcional,
   commits, migrations, testes, evidências do Lab e riscos residuais. Não acesse VPS,
   não faça push/deploy e não envie mensagem real.

Antes de implementar algo novo, registre qual componente existente será reutilizado e
qual duplicação será eliminada. Se não houver mecanismo existente adequado, documente
a ausência antes de criar um novo.
```

## 2. Regra de produto: preservar capacidade, reduzir duplicação

O objetivo não é reduzir o SOS Sales por amputação. É reduzir carga cognitiva e risco
arquitetural mantendo a capacidade real.

Para cada função atual, o executor deve escolher exatamente uma classificação:

- `MANTER`: função única, correta e no local adequado;
- `CORRIGIR`: existe contrato, mas o fluxo está quebrado ou incompleto;
- `CONSOLIDAR`: duas ou mais funções fazem a mesma coisa e devem usar um único contrato;
- `REALOCAR`: a função é válida, mas está em uma tela ou hierarquia inadequada;
- `COMPLETAR_BACKEND`: UI existe, porém falta API, job/provider ou persistência;
- `CAPABILITY_PENDENTE`: preservar implementação e contrato, mas não autorizar uso até homologação;
- `REMOVER`: somente mediante decisão explícita de Francisco e prova de que não há dependência.

É proibido usar `REMOVER` como atalho para concluir a auditoria.

## 3. Fontes únicas de verdade obrigatórias

| Domínio | Fonte única | Regra de consolidação |
|---|---|---|
| Capabilities Meta/WABA | backend tenant-scoped | frontend consome contrato; fallback é tudo desabilitado |
| Estado do canal | modelo persistido de conexão | não inferir `connected` por presença de ID/token |
| Segredos | gateway server-only tenant-scoped | nunca duplicar leitura direta de JSON/colunas/env em rotas |
| Workspace e papel | membership/RBAC do backend | nenhuma autorização por `localStorage` ou estado de tela |
| Processamento assíncrono | outbox/worker existente | lease, fencing, retry limitado, DLQ e reconciliação |
| Mensagens | registros persistidos + provider IDs | UI não cria sucesso otimista definitivo sem confirmação |
| IA publicada | configuração versionada por workspace | rascunho não pode operar; fallback desconhecido/handoff |
| Contratos | schemas compartilhados + OpenAPI real | remover tipos e payloads paralelos divergentes |
| Release | um runbook canônico + manifest do commit | eliminar instruções antigas conflitantes |

### Evidência já localizada no código

- `apps/api/src/application/ports/outbox-processing-gateway.ts` já define claim e fencing;
- `apps/api/src/infrastructure/workers/waha-inbound-worker.ts` já usa outbox recuperável;
- `apps/api/src/infrastructure/workers/waha-outbound-worker.ts` já usa dispatch com lease;
- `apps/api/src/infrastructure/workers/capi-dispatch-worker.ts` já usa o mesmo padrão;
- `apps/api/src/interfaces/http/routes/webhooks/waba-webhook.ts` ainda chama o Receptionist por `setImmediate()`;
- `src/services/featureFlags.ts` ainda permite overrides em `localStorage` e não pode ser fonte de autorização operacional;
- `docs/PRODUCTION_DEPLOYMENT_RUNBOOK.md` contém premissas e caminhos de secrets que precisam ser reconciliados com o runtime atual antes de virar o único runbook.

## 4. Fechamentos P0 que não podem faltar

### 4.1 Receptionist/WABA recuperável

O evento que aciona a IA deve ser persistido na mesma fronteira transacional da
mensagem inbound ou por padrão outbox atomicamente equivalente. O worker deve:

1. reclamar o evento com lease/fencing;
2. resolver workspace, jornada e configuração publicada;
3. verificar a precedência dos kill switches;
4. executar inferência com timeout e schema;
5. criar handoff ou outbound idempotente;
6. persistir resultado e correlation ID;
7. completar ou mover para retry/DLQ;
8. sobreviver a restart sem perda nem envio duplicado.

Precedência mínima dos controles:

```text
kill switch global backend
  → capability do workspace/canal
  → configuração publicada runtime_enabled
  → journey.bot_enabled
  → journey.bot_paused_at / handoff humano
  → política da mensagem
```

Qualquer negação interrompe antes da inferência ou antes do provider, conforme o estágio.

### 4.2 Capabilities e estados coerentes

Deve existir um único vocabulário de status, compartilhado por API e UI:

```text
PENDING_CONFIGURATION | VERIFYING | CONNECTED | DEGRADED |
DISCONNECTED | TOKEN_EXPIRED
```

Cada capability precisa informar ao menos:

```text
enabled, operational, reasonCode, provider, lastCheckedAt
```

`enabled=true` não equivale a `operational=true`. A API deve negar a ação novamente;
ocultar ou desabilitar o botão não é controle de segurança.

### 4.3 Correlação e observabilidade operacional

Uma mensagem controlada precisa ser rastreável sem expor conteúdo ou PII:

```text
request/correlation ID
  → webhook receipt/provider message ID
  → outbox event
  → worker attempt
  → AI decision/config version/model
  → outbound dispatch
  → provider status webhook
  → estado exibido após reload
```

Instrumentar, no mínimo: rejeições de webhook, eventos sem tenant, idade/profundidade da
fila, retries/DLQ, latência/falha da IA, falha outbound, atraso de status e circuit breaker.

### 4.4 Meta prerequisites e ciclo de credencial

Não considerar “token presente” como integração pronta. Registrar e validar:

- app/business e ativos corretos por workspace;
- permissões necessárias para WABA, Messenger e Instagram;
- Page, WABA, phone number e Instagram Business realmente vinculados;
- subscriptions de webhook e versão da Graph API;
- expiração, renovação/reconexão e erro acionável de token;
- templates aprovados, janela de atendimento e consentimento/opt-out;
- rate limit e falhas transitórias versus permanentes.

No Lab, providers devem ser mockados/contract-tested. Prova live fica `UNVERIFIED` até
canário autorizado com conta e números controlados.

### 4.5 Backup, migration e rollback reais

Os scripts atuais de backup/restore não bastam como prova de recuperação. Antes do GO:

- migration deve ser expand-only e reproduzível em banco Lab limpo;
- fase de contração fica para release posterior, após zero leitura legada comprovada;
- backup precisa de checksum, destino controlado, retenção e registro temporal;
- restore deve ocorrer somente em banco isolado e descartável, nunca sobre produção;
- medir RPO/RTO do ensaio;
- rollback da aplicação deve preservar migrations aditivas e desligar outbound/IA antes da troca.

O executor local deve apenas preparar scripts/runbook seguros e provar o restore no Lab.

### 4.6 Proveniência e runbook único

Reconciliar o runbook antigo com a composição e os paths reais atuais. O handoff deve
propor um único procedimento contendo:

- branch, commit, artefato/imagem e release manifest concordantes;
- nomes das migrations e ordem exata;
- local canônico de secrets, somente nomes das variáveis;
- preflight, backup, deploy, smoke, canário, rollback e reconciliação;
- proibição de `rsync --delete` até os alvos remotos terem sido listados e validados;
- nenhuma ação destrutiva ou flush de Redis como passo normal de deploy.

## 5. Linha de corte para produção

### READY_FOR_CODEX_REVIEW

O Claude pode alcançar localmente quando:

- Onda A implementada no backend e validada no Docker Lab;
- build, typecheck, testes unitários/integrados e contratos passam;
- migration reproduzível e isolamento cross-tenant aprovados;
- matriz de todas as funções visíveis entregue;
- nenhuma função P0/P1 permanece apenas no frontend;
- WABA/IA demonstradas com providers controlados, incluindo restart/retry/dedupe;
- diff, commits, riscos e itens `UNVERIFIED` entregues.

### READY_FOR_CONTROLLED_PILOT

Só pode ser decidido pelo Codex após revisar o diff e executar o canário real autorizado.
Exige WABA inbound/outbound, IA/handoff, status, persistência/reload, restart e isolamento.

### PRODUCTION_READY_IN_AUDITED_SCOPE

Só pode ser declarado após o piloto e somente para as capabilities que possuem evidência
real. Onda B/C não comprovada não pode aparecer como operacional. Como Francisco não quer
perder funções, elas permanecem preservadas e entram numa fila explícita de homologação;
remoção depende de decisão dele.

## 6. Matriz mínima de aceitação

| Capacidade | Happy path | Falha/negação | Recuperação | Prova final |
|---|---|---|---|---|
| Login/RBAC | papel correto | sessão inválida e papel restrito | nova sessão | API + UI + cross-tenant |
| Provisionar cliente | cria uma vez | payload inválido/sem permissão | replay idempotente | DB + reload |
| Conectar WABA | identidade real | token/permissão inválida | reconectar | Graph mock/real autorizado + DB |
| Inbound | persiste mensagem | assinatura/tenant inválido | retry/restart | provider ID + DB + UI reload |
| IA | resposta fundamentada | desconhecido/injeção/timeout | handoff/fila humana | config version + decisão + UI |
| Outbound | entrega autorizada | janela/template/provider falha | retry sem duplicar | dispatch + provider ID + status |
| Handoff | pausa antes de responder | papel negado | retomar explicitamente | DB + worker + reload |
| Broadcast | template/consentimento | opt-out/rate limit | retomada controlada | lote auditável sem duplicata |
| Messenger/Direct | inbound/outbound | ativo/permissão inválida | reconectar | webhook + DB + UI |
| Release | commit correto | readiness/canário falha | rollback | manifest + smoke + reconciliação |

## 7. Entrega adicional obrigatória do Claude

Adicionar ao handoff:

1. mapa `mecanismo existente → extensão realizada → duplicação evitada`;
2. inventário de todos os `localStorage`, mocks, fallbacks e aleatoriedade que afetam verdade funcional;
3. lista de workers/eventos, política de retry, lease, fencing e DLQ;
4. tabela de kill switches e sua precedência;
5. catálogo de status/capabilities compartilhado por UI/API;
6. requisitos externos Meta ainda `UNVERIFIED`;
7. ensaio de restart/recovery no Lab;
8. restore drill em banco isolado com resultado e tempo;
9. proposta de runbook canônico, marcando o documento antigo como histórico quando substituído;
10. lista explícita do que não foi tocado para evitar falsa cobertura.

## 8. Gate de parada

Pare e reporte `BLOCKED` se houver:

- falha de tenant isolation;
- possibilidade de outbound ou IA sem kill switch backend;
- segredo real em diff/log/artefato;
- migration destrutiva ou restore apontando para host remoto;
- caminho que possa enviar duas vezes após timeout/restart;
- função declarada pronta sem evidência provider/job/persistência/reload;
- conflito com alterações simultâneas que não possa ser resolvido sem perder trabalho.

O encerramento correto do Claude é `READY_FOR_CODEX_REVIEW`, nunca “100% em produção”.
