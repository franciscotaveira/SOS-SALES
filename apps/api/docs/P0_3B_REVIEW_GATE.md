# P0.3B — Gate de Revisão

**Branch:** `gemini/p0-3b-production-runtime`
**Base verificada:** `35251fa`
**Estado:** pronto para implementação; nenhuma mudança de runtime revisada ainda.

## Decisão de produto

P0.3B não cria valor visível por si só. Ela remove a condição que hoje impede operar o sistema fora do ambiente local: o serviço não inicia em produção e assume privilégios de banco que não pertencem à aplicação. Sem esta fatia, qualquer teste de WAHA real seria uma falsa validação.

## Achados confirmados

| Prioridade | Evidência | Risco | Decisão obrigatória |
|---|---|---|---|
| P0 | `src/server.ts` bloqueia `NODE_ENV=production` | não existe runtime publicável | criar composition root de produção com dependências explícitas |
| P0 | gateway e worker executam `SET LOCAL ROLE service_role` | identidade administrativa transitando pelo pool | criar port/adapters server-only sem alteração de role em produção |
| P0 | provider consulta `channel_connection_secrets.webhook_secret` | segredo não é resolvido; coluna não existe | receber `webhook_vault_secret_id` como referência e falhar fechado até existir resolver de cofre |
| P1 | `/health` consulta apenas Postgres | orquestrador pode enviar tráfego a serviço incapaz de processar eventos | separar liveness de readiness de dependências |
| P1 | `trustProxy` está comentado e sem contrato | IP e rate limit podem ser falsificados atrás de proxy mal configurado | aceitar apenas topologia configurada e testada |
| P1 | logger usa `pino-pretty` no bootstrap | logs de produção perdem estrutura de busca e correlação | JSON estruturado em produção; pretty somente desenvolvimento |

## Arquitetura aprovada

```text
composition root
  ├─ Environment / production configuration validator
  ├─ Runtime webhook secret provider
  ├─ Runtime inbound ingestion gateway
  ├─ Runtime outbox processing gateway
  ├─ Fastify app
  └─ Waha inbound worker

test/local composition
  ├─ EnvironmentWebhookSecretProvider (fixtures/env)
  ├─ PostgresInboundIngestionGateway (pool local)
  └─ PostgresWahaProcessingGateway (pool local)
```

O domínio e a camada application continuam sem `pg`, `Fastify`, segredo ou variável de ambiente. O UUID `webhook_vault_secret_id` não é prova de Vault integrado: o schema atual não habilita a extensão nem contém um resolver. P0.3B cria o port e o fail-closed; P0.3C escolhe e homologa o cofre real.

## Teste obrigatório por comportamento

| ID | Cenário | Prova esperada |
|---|---|---|
| RUN-01 | produção sem configuração de serviço | bootstrap falha antes de escutar porta, sem vazar variável ou segredo |
| RUN-02 | produção com adapter válido | app e worker iniciam com logger estruturado |
| RUN-03 | caminho produtivo | busca estática e teste de contrato não encontram `SET ROLE`/claim de serviço no adapter produtivo |
| SEC-01 | segredo por referência ausente | webhook retorna falha sanitizada; log não contém material secreto |
| SEC-02 | segredo por referência presente | assinatura HMAC válida é aceita com material fornecido pelo provider injetado |
| OPS-01 | banco indisponível | `/health` permanece vivo; `/ready` reporta dependência degradada |
| OPS-02 | Redis/worker obrigatório indisponível | `/ready` reporta degradação com código estável e sem stack trace |
| NET-01 | proxy não confiável | IP encaminhado não altera a identidade do cliente |
| NET-02 | proxy permitido | rate limit usa o IP encaminhado sob topologia explicitamente permitida |
| LIFE-01 | shutdown durante lote | worker para de aceitar novos ticks e conclui ou devolve corretamente o lease |

## Critério de revisão Codex

Eu só aprovo uma implementação que:

1. mantenha o contrato de webhook P0.3A e os 96 testes existentes;
2. adicione testes novos para todos os comportamentos acima;
3. não crie conexão administrativa alternativa escondida;
4. não use credenciais reais, serviços remotos ou alterações no schema para armazenar o segredo;
5. passe `npm run check`, `npm run build` e `git diff --check`.

## Não escopo explícito

WAHA real, Meta Cloud, envio outbound, IA, cockpit, deploy, VPS, DNS, TLS e Vault remoto entram somente em gates posteriores.
