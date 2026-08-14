# P0.3B — Runtime de Produção

**Status:** implementada e validada localmente; pronta para commit local. Não homologada com credenciais/provedor reais.

## Objetivo

Substituir os atalhos locais de banco e segredo por adapters próprios de runtime, sem mudar o contrato do webhook WAHA nem introduzir WAHA real, envio de mensagens, IA, interface ou deploy.

## Problema verificado

- `src/server.ts` bloqueia `NODE_ENV=production` porque só existe o gateway local baseado em `pg`.
- `PostgresInboundIngestionGateway` e `WahaInboundWorker` assumem `SET LOCAL ROLE service_role`; isto é válido somente no banco local controlado e não é uma identidade de aplicação segura para produção.
- `EnvironmentWebhookSecretProvider` consulta `channel_connection_secrets.webhook_secret`, mas a tabela armazena apenas `webhook_vault_secret_id`.
- `/health` só verifica Postgres; não distingue prontidão da aplicação, banco, Redis e worker.
- `trustProxy` e logs ainda não expressam o contrato do proxy reverso de produção.

## Decisões de arquitetura

```text
WAHA
  -> Fastify raw body + HMAC + rate limit
  -> WebhookSecretProvider (runtime)
  -> InboundIngestionGateway (runtime)
  -> RPC Supabase com credencial server-only
  -> outbox_events
  -> WahaInboundWorker com ProcessingGateway injetado
  -> normalização e projeções
```

1. A identidade interna de produção é uma credencial server-only fornecida ao adapter, nunca `SET ROLE` em conexão administrativa da aplicação.
2. O banco mantém apenas IDs de segredo. A resolução de material secreto é responsabilidade de um `WebhookSecretResolver` injetado no bootstrap. O schema atual não habilita nem integra Supabase Vault: `webhook_vault_secret_id` é uma referência opaca até a seleção de um cofre real no P0.3C.
3. `EnvironmentWebhookSecretProvider` continua apenas como fixture/dev adapter. Ele não pode consultar uma coluna inexistente nem ser selecionado em produção.
4. Worker e HTTP dependem de ports; `dbPool` fica confinado aos adapters locais de desenvolvimento/teste.
5. Health e readiness devem ser distintos: health prova que o processo vive; readiness prova que as dependências obrigatórias estão prontas.
6. A topologia de proxy deve ser explícita por configuração. `trustProxy=true` não pode ser um default implícito.

## Arquivos e responsabilidades

| Área | Mudança esperada |
|---|---|
| `src/server.ts` | composition root por ambiente; selecionar adapters autorizados; shutdown ordenado; logger JSON em produção |
| `src/interfaces/http/app.ts` | health/readiness separados; trust proxy injetado e validado; sem import direto do pool |
| `src/application/ports/*` | ports explícitos para secrets, ingestão, processamento de outbox e saúde de dependências |
| `src/infrastructure/database/*` | adapter local mantido para testes; adapter server-only de produção separado |
| `src/infrastructure/security/*` | provider de segredo por referência Vault; env provider somente dev/teste |
| `src/infrastructure/workers/waha-inbound-worker.ts` | receber gateway de processamento; remover acesso direto ao pool |
| `tests/*` | contratos de seleção de adapter, ausência de segredo em logs, readiness degradada e shutdown |

## Critérios de aceite

- [x] `NODE_ENV=production` só inicia com ports server-only explicitamente injetados; sem eles falha cedo e sanitizado.
- [x] Nenhum caminho de produção seleciona pool local ou executa `SET ROLE`/claim JWT; imports locais são carregados dinamicamente apenas após excluir produção.
- [x] `ReferencedWebhookSecretProvider` resolve `webhook_vault_secret_id` como referência opaca; o cofre real continua requisito de P0.3C.
- [x] O worker processa eventos por port injetado, reporta saúde e drena lote em andamento no shutdown.
- [x] `/health` não expõe dependências; `/ready` falha fechada para banco, Redis ou worker ausentes/degradados, sem refletir detalhes internos.
- [x] `trustProxy` tem default seguro `false`, documentação e testes de cabeçalho encaminhado.
- [x] `npm run check` (119 testes), `npm run build` e `git diff --check` passam localmente.

## Limite deliberado

O binário padrão ainda bloqueia produção sem uma composição server-only real. Isso é esperado: conectar a referência de segredo a um cofre e configurar os adapters de provedor é o gate P0.3C, não um fallback permitido nesta fatia.

## Não escopo

- Credenciais reais, Vault remoto, DNS, TLS, VPS ou deploy.
- Conexão com WAHA/Meta reais e envio de mensagens.
- Recomendação IA, handoff, cockpit ou Meta CAPI.

## Rollback

Manter o adapter local somente para desenvolvimento/teste. Em falha de P0.3B, não ativar o runtime de produção; o schema e os fatos append-only não precisam ser revertidos.
