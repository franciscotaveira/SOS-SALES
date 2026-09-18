# Haven — refinamento Meta e tracking (18/09/2026)

## Evidência atual somente leitura

Meta Graph v24.0, usando a credencial protegida meta_bearer_token da conexão oficial Haven:
- WABA 1749193841879179/subscribed_apps: HTTP 200; somente CRM TX APP, App ID 2294262161340902.
- Número 2498930403536552: HTTP 200; verified_name Haven Escovaria, status DISCONNECTED, platform_type ON_PREMISE, code_verification_status NOT_VERIFIED.
- Isso diverge do CONNECTED local e do segredo STA informado no runtime na sessão anterior. Segredo configurado e POST sintético assinado não comprovam entrega real da Meta.
- Consulta anterior desta avaliação: 288 mensagens inbound WAHA em 24h, zero inbound Meta Cloud; zero entregas capi_lead_deliveries.
- Teste CAPI anterior aceitou um Lead system_generated com TEST70062. Não comprova despacho automático business_messaging.

## Candidato local do proxy

Permitir pelo domínio somente tracking raiz, tracking/test-capi e tracking/meta/list-datasets, sujeitos às guardas JWT e owner/membership da API. Manter bloqueio dos demais subcaminhos tracking (incluindo simulação e histórico), contatos, reports, plugins sob contenção e operações destrutivas. Ampliar o bloqueio direto por IP para todos os subcaminhos tracking.

Validação:
- 36 testes de autorização e credencial CAPI passaram, incluindo JWT ausente/inválido, viewer/operator e owner de outro tenant.
- Caddy 2.8 validate: configuração válida.
- Proxy temporário sem exposição externa na rede Docker Lab: cinco consultas/mutações de tracking sem JWT retornaram 401; simulação, histórico, contatos e logout retornaram 403. Nove verificações passaram; contêiner temporário removido.
- Não houve publicação desta correção nem alteração no número, WABA ou assinatura de aplicativo.

## Próximas dependências

1. Publicar candidato do proxy seguindo build, CI, staging e promoção versionada; validar owner autenticado no Chrome.
2. Escolher arquitetura oficial compatível com o número operacional: migração/coexistência ou número dedicado. Não executar registro genérico nem desligar WAHA.
3. Alinhar app autorizado, credencial, assinatura WABA, callback e segredo HMAC. Não alternar apenas o segredo com base em teste sintético.
4. Validar entrada real CTWA, entrega automática Lead, deduplicação e confirmação Meta.
5. Corrigir onboarding fixo e reconciliar status local com resposta Meta atual.
