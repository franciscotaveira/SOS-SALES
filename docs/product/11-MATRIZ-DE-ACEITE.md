# Matriz de Requisitos e Aceite

## Regra de evidência

Cada requisito possui gates independentes:

- **I — Implementado:** código e gate técnico pertinente;
- **P — Publicado:** presente no runtime verificado;
- **E — E2E:** jornada real comprovada no tenant correto;
- **N/V — Não verificado:** ausência de evidência atual, não afirma falha.

| ID | Capacidade | Critério de aceite | I | P | E | Estado atual |
|---|---|---|:---:|:---:|:---:|---|
| AC-01 | tenancy | usuário A não lê nem altera workspace B | sim | sim | N/V | reexecutar testes negativos no release atual |
| AC-02 | canal | conectar, receber e enviar pelo tenant correto | sim | sim | N/V | validar por cliente e provider |
| AC-03 | inbox | webhook repetido cria um único evento lógico | sim | sim | N/V | runtime não reensaiado neste snapshot |
| AC-04 | Cockpit | abrir conversa, responder e atualizar timeline | sim | sim | N/V | UI publicada; jornada real pendente |
| AC-05 | contatos | criar, abrir, editar e desativar | sim | sim | N/V | persistência E2E pendente |
| AC-06 | funil | abrir card, mover estágio e registrar outcome | sim | parcial | não | detalhe e movimentação precisam prova funcional |
| AC-07 | próxima ação | criar, adiar e concluir com responsável | sim | N/V | não | superfície publicada não confirmada |
| AC-08 | Radar | gerar, aceitar/dispensar sem autoenvio | sim | sim | N/V | decisão real deve ser reensaiada |
| AC-09 | catálogo | CRUD com foto e sem mocks | parcial | parcial | não | remover mocks, deduplicar e provar edição |
| AC-10 | proposta | criar versão ligada à conversa | sim | sim | N/V | requer prova no tenant |
| AC-11 | Pix | gerar cobrança real e registrar liquidação | sim | sim | N/V | provider e liquidação exigem ensaio |
| AC-12 | template WABA | orientar, validar, submeter e acompanhar | parcial | sim | não | retorno Meta não comprovado |
| AC-13 | CAPI | outcome elegível recebe recibo Meta | parcial | sim | não | sem recibo de produção verificado |
| AC-14 | API externa | token restrito não rompe tenancy | não | não | não | planejado |
| AC-15 | webhook externo | assinar, retry, DLQ e replay | não | não | não | planejado |
| AC-16 | n8n | workflow acessa apenas escopos permitidos | parcial | N/V | não | integração oficial incompleta |
| AC-17 | IA | schema, evidência, fallback e custo | parcial | parcial | não | arquitetura completa não entregue |
| AC-18 | onboarding | segundo cliente entra sem código novo | parcial | parcial | não | self-service incompleto |
| AC-19 | backup | restaurar em ambiente isolado | parcial | N/V | não | restore atual não ensaiado |
| AC-20 | observabilidade | detectar e triar falha dentro do SLO | parcial | N/V | não | simulação pendente |

## Gate de cliente

Para declarar um cliente ativo, devem existir evidências atuais de AC-01, AC-02, AC-04, AC-05, AC-06, AC-19 e dos módulos incluídos no contrato.
