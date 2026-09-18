# Haven — preparação da CAPI

Estado: **PREPARADA, NÃO ATIVA**. Auditoria e configuração em 17/09/2026.

## Dataset localizado no portfólio proprietário

Evidência visual fornecida pelo proprietário confirmou que o Dataset `1211480540851207` existe em **Bm - HAVEN**, com o nome automático `unknown Event Data` e propriedade da própria Bm - HAVEN. Na tela consultada ele não possui dados conectados, não recebeu eventos e não possui pessoas atribuídas.

Essa evidência explica a divergência anterior: o Dataset era procurado no portfólio `taveira.ia`, enquanto o ativo pertence à Bm - HAVEN. Também é compatível com o erro `Missing Permission` recebido pela credencial atual. O ID salvo no CRM permanece correto, mas a integração ainda precisa receber acesso explícito ao Dataset e passar pela homologação de eventos.

## Homologação de envio ao Dataset

Com a página de Eventos de teste aberta e o código `TEST70062`, foram executados dois envios isolados, sem habilitar a CAPI de produção:

- `Lead`, `action_source=system_generated`: HTTP 200, `events_received=1`, fbtrace `AZrebkvUmCrENlkLOg5WqXS`.
- `TestEvent`, `action_source=business_messaging`, `messaging_channel=whatsapp`, WABA `1749193841879179` e o `ctwa_clid` de teste fornecido pelo próprio Gerenciador de Eventos: HTTP 200, `events_received=1`, fbtrace `A7zA7TK-EmcRg4XqHJ--XzO`.

O segundo evento apareceu visualmente no Gerenciador como `TestEvent`, origem `Servidor`, método `Configuração manual`, estado `Processado`, às 18:37:25. Isso comprova que a credencial salva consegue publicar no Dataset correto e que o contrato de evento `business_messaging` é aceito em modo de teste. Ainda não comprova captura de `ctwa_clid` em um lead real, despacho automático de leads ou funcionamento da conexão oficial de mensagens.

## Atualização após autorização para correção

A consulta atual à lista `1749193841879179/phone_numbers` retornou o número `2498930403536552` como `DISCONNECTED`, `ON_PREMISE`, `NOT_VERIFIED`. Após uma segunda confirmação imediatamente antes da escrita, o status local do canal Meta `362da591-fa93-4042-bd76-bfa0fad387b4` foi reconciliado de `CONNECTED` para `DISCONNECTED`. Credenciais e número foram preservados; não houve chamada de desconexão ou registro na Meta.

Readback: canal oficial `DISCONNECTED`, canal WAHA `CONNECTED`, CAPI desligada em ambos. Consulta ao WAHA `/api/sessions/haven`: HTTP 200, `WORKING`.

A leitura dos detalhes de `1211480540851207` com a credencial da Haven retornou código 100, `Missing Permission`. Isso não prova falta de permissão para postar eventos, mas impede concluir a inspeção dos detalhes com essa credencial. A listagem de WABAs pertencentes ao portfólio taveira.ia confirmou Haven Escovaria `1749193841879179`. Não foi feita substituição de Dataset nem ativação de eventos.

Próxima dependência externa: revisar no portfólio taveira.ia o acesso do usuário e da integração à WABA Haven e ao Dataset retornado pela API. A reconexão oficial exige validar o fluxo apropriado ao número em uso; não executar migração ou registro genérico que possa afetar o atendimento WAHA.

## Evidências em produção

- Dataset `1211480540851207` retornado pela Meta para a WABA `1749193841879179`.
- Credencial própria da Haven válida, incluindo escopo `whatsapp_business_manage_events`. Isso não comprova aceitação de eventos.
- Dataset e segredo `meta_capi_token` salvos nos dois canais ativos da Haven, WAHA e Meta. `metaCapiEnabled=false`; `metaCapiActionSource=business_messaging`.
- Sessão WAHA `haven`: `WORKING`. Na janela de 24h auditada, 265 mensagens recebidas e 23 novas jornadas pelo WAHA.
- Nenhuma entrega CAPI ou resultado comercial registrado para a Haven no momento da consulta.
- Em 1.716 envelopes de sete dias, 83 continham `ctwaContext`; nenhum desses 83 continha identificador explícito `ctwa_clid`, `ctwaClid` ou `ctwaClickId`. `ctwaSignals` e `conversionData` não foram tratados como equivalentes.
- A Meta informou o número como `CONNECTED`, `ON_PREMISE`, `NOT_VERIFIED`. O CRM o registra conectado. Esse retorno requer investigação; não comprova por si só necessidade de migração.
- O Gerenciador de Eventos solicitou login. Homologação externa não concluída.

## Lacunas de implementação

Na reconstrução solicitada pelo usuário, foi removida localmente da descoberta de Datasets a classificação indevida de `debug_token.granular_scopes.target_ids` como Datasets. Esses IDs podem representar outros tipos de ativos. Teste de regressão confirmou que apenas pixels retornados pelas consultas de recursos são oferecidos e duplicatas são removidas. Alteração ainda não publicada no VPS.

Print do anúncio AD1 fornecido pelo usuário: rastreamento offline aponta para `2042592029613403`; eventos de app apontam para STA `2053430015497534`; aviso informa Pixel sem eventos há sete dias. O anúncio aparece desativado e há controles de rascunho. Isso não comprova o estado publicado nem autoriza publicar o rascunho. Não usar essa seleção como prova de vínculo à WABA.

Consulta visual ao Meta Business Suite confirmou acesso total de Francisco ao portfólio taveira.ia. A navegação para os Datasets apresentou timeout; o acesso ao Dataset específico ainda não foi esclarecido.

O worker CAPI atual processa vendas ganhas com receita positiva. Não existe despacho automático de novos leads. O worker de entrada WAHA também não persiste a atribuição presente em `ctwaContext`. Habilitar a flag isoladamente não resolve o objetivo de comunicar leads à Meta.

Referências: `apps/api/src/infrastructure/workers/capi-dispatch-worker.ts`, `apps/api/src/infrastructure/workers/waha-inbound-worker.ts`, `apps/api/src/infrastructure/channels/meta/capi-client.ts` e `apps/api/src/application/services/attribution-service.ts`.

## Sequência para conclusão

1. Obter acesso ao Dataset e código de Testar eventos; confirmar o contrato atual de eventos de leads para business messaging com a Meta.
2. Capturar uma entrada real de anúncio com identificador de clique comprovado. Investigar a disponibilidade desse dado no provedor atual e o estado da WABA, preservando a sessão operacional.
3. Implementar captura de atribuição e despacho de leads com identidade estável, isolamento por workspace, fila durável, deduplicação e falha explícita quando faltar atribuição. Não contar cada mensagem como novo lead nem reenviar histórico automaticamente.
4. Validar no Docker Lab, com testes de duplicidade, retry, isolamento e ausência de identificador. Seguir o fluxo de release do projeto.
5. Homologar em Testar eventos e conferir recebimento na Meta. Código de teste sozinho não resolve a ausência do identificador de clique.
6. Habilitar apenas após essas verificações; acompanhar uma chegada real e correlacionar entrada, jornada, evento enviado e resposta da Meta.

Nenhum evento fictício de produção foi enviado. Nenhum número foi registrado, migrado ou desconectado. Não houve deploy de código nesta preparação. Segredos e conteúdo das conversas foram omitidos deste registro.

## Validação local do fluxo de Lead

- 427 testes unitários em 59 arquivos passaram.
- 24 testes de integração WAHA passaram.
- Teste integrado de fila/entrega/normalização com clique explícito passou no PostgreSQL local; resposta da Meta simulada e fixture revertido.
- A função queue_capi_lead permite EXECUTE somente a service_role entre os papéis anon/authenticated/service_role verificados.
- API recompilada e instalada no Lab com o processamento de leads. Nenhuma alteração desta implementação foi publicada no VPS.
- Pendentes: teste completo do webhook WABA, interface autenticada, revisão das migrações/implantação, prova do clique real da Haven e entrega externa do evento correto.


### Diagnóstico do status divergente no CRM (17/09, sessão Chrome autenticada)

- UI de produção: WABA “Status indisponível”, WAHA “Aguardando Pareamento”, barra lateral “WhatsApp Offline”. Recarga manteve o resultado.
- Consulta interna somente leitura à API WAHA: HTTP 200; sessão `haven` = `WORKING`. Não gerar QR nem reconectar com base no aviso da UI.
- Caddyfile efetivamente carregado no container `sos-sales-caddy`: regra `blocked_sensitive_pii` bloqueia incondicionalmente `channels/waba/channel-info`, `channels/whatsapp/status`, `tracking`, `contacts` e `reports`.
- Consulta externa à rota WAHA da Haven confirmou HTTP 403. A contenção impede que a sessão autenticada consulte esses endpoints.
- Nenhuma regra de produção foi alterada. Próximo gate: verificar JWT, membership e RBAC na API efetivamente implantada e no Lab antes de preparar liberação delimitada das rotas necessárias. Preservar bloqueios destrutivos e acesso direto por IP.


### Validação da liberação delimitada de status no proxy

- Candidato `deploy/Caddyfile` retira somente WAHA status e WABA channel-info da regra de contenção no domínio.
- API publicada inspecionada em `dist/index.js`: guardas JWT e membership presentes. Ambas as rotas, consultadas internamente sem token e com token inválido, retornaram 401 (quatro verificações).
- Suite local `route-authorization-guard.test.ts`: 27 testes aprovados.
- Caddy 2.8 no Docker local: configuração válida. Proxy temporário na rede do Lab, sem exposição externa: GET/HEAD nas duas consultas retornaram 401; GET/HEAD/OPTIONS em tracking, logout e status pelo listener de IP retornaram 403 (13 verificações). OPTIONS sem cabeçalhos de preflight nas consultas retorna 400 no framework; isso não foi contado como teste de autorização.
- Container temporário removido. Candidato ainda não aplicado na VPS; falta promover a configuração com backup e validar acesso pela sessão Chrome autenticada.


### Aplicação autorizada da correção de status — 17/09/2026 22:48 UTC

Usuário autorizou explicitamente a liberação das duas consultas WAHA/WABA. Aplicado somente o diff de `deploy/Caddyfile` na configuração ativa, após builds frontend/API e validação do Caddy candidato. Bundles de frontend/API e migrations não foram promovidos.

- Backup: `/opt/sos-sales/Caddyfile.before-status-20260917T224833Z`.
- SHA256 candidato aplicado: `0aa00dc81c8d5745b63ad1828be4b284d184a6ebbaf2e4f2497e5c7796aabed4`.
- Reload Caddy concluído; `/health` e `/ready` retornam 200.
- Rotas WAHA status/WABA channel-info sem autenticação retornam 401. Tracking e logout continuam 403.
- Chrome autenticado, workspace Haven, após recarga: barra lateral passou a “WhatsApp Online WAHA”. Canal oficial mostra “Configuração pendente”, substituindo o erro de consulta.
- CAPI completa e onboarding WABA continuam pendentes; esta correção comprova a consulta de status, não o envio de conversões à Meta.
