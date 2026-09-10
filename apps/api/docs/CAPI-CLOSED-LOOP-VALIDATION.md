# CAPI: fechamento, teste e entrega — 10/09/2026

## Mudança

O fechamento continua usando record_commercial_outcome, que grava a venda e o evento de outbox na mesma transação. A rota HTTP não envia Purchase nem altera a venda imutável. A evolução de playbook preserva a execução única por desfecho por uma claim independente.

O worker processa uma entrega por lease, usa o token CAPI da conexão da jornada (sem token global ou fallback de outro cliente), prioriza Dataset ID e respeita metaCapiEnabled. Usa occurred_at original e outcomeId estável; uma entrega já confirmada não é reenviada. Falhas transitórias seguem as tentativas da outbox. Sem configuração, registra falha em vez de declarar entrega concluída. Desativado fica NOT_APPLICABLE. A entrega fica em capi_deliveries, separada do fato comercial.

O envio exige confirmação events_received=1. O request tem timeout de 20 segundos; o lease padrão é 120 segundos com lote de um evento. Retries mantêm o ID do evento. Isso não é garantia de exactly-once na Meta: falha após aceitação externa e antes da persistência exige a deduplicação suportada no destino e reconciliação operacional.

No modo business_messaging, o cliente transporta ctwaClid e wabaId do contexto e bloqueia o envio se ausentes. O local do fechamento é uma configuração explícita; não é deduzido apenas da existência de uma conversa. Esse formato ainda precisa ser homologado com os ativos e a versão real da Meta.

O teste usa o destino e token já salvos. Um destino diferente exige salvar a configuração antes de usar o token protegido. Test Event Code continua obrigatório; o evento sintético usa R$ 1 e não comprova atribuição WhatsApp. Nenhum token é devolvido ao frontend.

## Ativação controlada

1. Aplicar as migrações 20260910130000 e 20260910130100 antes do código que lê as novas tabelas.
2. Salvar Dataset, token e origem do fechamento na conexão da jornada. O painel local 8766 não transfere credenciais automaticamente para o CRM.
3. Fazer teste com contato de teste autorizado e código TEST fornecido pelo Events Manager; verificar resposta e presença no painel Meta.
4. Auditar a fila histórica antes de habilitar META_CAPI_WORKER_ENABLED=true. Não ativar automaticamente no deploy. Identificar eventos fora da janela aplicável, já enviados, com origem insuficiente ou sem autorização; não alterar datas para fazê-los caber na janela.
5. Validar uma venda nova no Lab com destino de teste controlado, incluindo reinício, retry e leitura de status no cockpit. O ambiente global META_TEST_EVENT_CODE não é mais aplicado silenciosamente ao cliente do worker.
6. Só então seguir preflight/stage/promote e aprovação de produção conforme AGENTS.md. Não apagar nem reativar filas históricas indiscriminadamente.

## Evidência e limites

- 48 testes focados passaram: fluxo de fechamento, autorização, cliente, worker e teste com token salvo, usando gateways/provedor simulados.
- TypeScript da API passou após corrigir referências indefinidas já existentes a routePool e keyRecord.
- Build frontend passou; migrações aplicadas somente ao Supabase local sos-sales.
- Query de contexto do worker validada com EXPLAIN sob service_role no banco do Lab. RLS ativa em capi_deliveries; authenticated tem leitura e não tem UPDATE.
- Preservadas alterações em andamento no cockpit, contratos e gateways. Nada publicado em produção e nenhum evento real enviado por esta implementação.
- Recebimento na Meta, atribuição, melhora de campanha e fluxo autenticado completo com uma venda real continuam pendentes de homologação externa.
