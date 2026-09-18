# Conexão Meta por cliente — procedimento operacional

## Resultado exigido
Uma mensagem originada de anúncio chega ao workspace correto; sua atribuição é persistida; o evento comercial correspondente é aceito no dataset do cliente, sem duplicação. Credenciais salvas, saúde da API e eventos sintéticos isolados não comprovam esse resultado.

## 1. Inventário antes de configurar
Registrar workspace, portfólio empresarial proprietário, conta de anúncios, página/Instagram, WABA, ID do número, número e dataset. Confirmar a propriedade na Meta e as permissões do operador. Não confundir App ID, WABA ID, Pixel ID e Dataset ID. Não criar outro dataset só porque ele não aparece no portfólio selecionado.

## 2. Preservar o atendimento
Identificar o canal que recebe e responde atualmente. Se for WAHA, manter sua operação até definir e validar a conexão oficial. Migração do número ou coexistência precisam de procedimento específico; salvar credenciais WABA não prova que o número está conectado.

## 3. Conectar e descobrir recursos
Autorizar o aplicativo com a conta do cliente e persistir segredos somente no workspace correspondente. Consultar o dataset pela aresta WABA/dataset, além dos pixels acessíveis. Selecionar explicitamente o destino e confirmar seu proprietário no Gerenciador de Eventos. Nunca usar IDs de granular_scopes como datasets.

## 4. Salvar sem ativar envio
Salvar destino e credencial protegida. Manter envio automático desligado durante a configuração. Recarregar a tela e conferir que ela reflete o valor persistido. Não colocar tokens em prints, documentos ou logs.

## 5. Validar o transporte de teste
Abrir Eventos de teste no dataset correto e obter o código. Enviar evento identificado como teste e registrar resposta, events_received, fbtrace_id, horário e recebimento no Gerenciador. Para WhatsApp, validar o contrato business_messaging. Código de teste não deve permanecer em eventos comerciais reais.

## 6. Validar anúncio → CRM
Usar outro telefone/perfil, abrir o anúncio ativo e clicar no botão WhatsApp. Enviar uma frase única de teste. Correlacionar horário, evento de entrada, canal e workspace. Inspecionar presença de referral/ctwa_clid; não converter ctwaSignals ou conversionData em identificador de clique por suposição. Preservar o identificador exatamente como recebido.

## 7. Validar CRM → Meta
Confirmar que existe implementação automática para o evento pretendido. O worker de Purchase não comprova envio de Lead. Exigir ID estável por evento, deduplicação, retries limitados, diagnóstico de falha e isolamento por workspace. Sem atribuição exigida pelo contrato, registrar bloqueio; não inventar clique nem enviar conversão sintética como real.

## 8. Ativação e aceitação
Ativar somente após validar o caminho completo. Confirmar um evento real elegível no destino correto e a persistência do resultado de entrega. Verificar que repetição do webhook não gera nova conversão. Confirmar que outro workspace não recebe nem usa a credencial ou o evento. Registrar release e configuração usadas. Em falha, desligar envio automático preservando o atendimento.

## Situação da Haven em 17/09/2026
- Dataset localizado no Bm-HAVEN: 1211480540851207.
- Eventos de teste aceitos pela Meta e visualizados anteriormente; ver auditoria de preparação.
- WAHA era o canal operacional; conexão oficial reportava DISCONNECTED na última consulta.
- Última linha de base consultada: 1.922 eventos, sem ctwa_clid explícito. Isso não determina o conteúdo de eventos futuros.
- Pendente: mensagem controlada pelo anúncio, captura/persistência do clique, implementação e validação do Lead automático, validação autenticada da interface e publicação das correções locais.
- Correções do seletor e da interface estão no Lab; não declarar produção atualizada sem verificar a release servida.

## Lacunas de implementação confirmadas no código

- `capi-dispatch-worker.ts` reivindica apenas `commercial.outcome_recorded` e `commercial_outcome.capi_queued`; descarta resultados sem WON e valor positivo. Não reutilizar uma venda fictícia para enviar Lead.
- `CapiDispatchGateway` e `CapiClient` expõem apenas Purchase. A entrega usa `outcomeId`, e `capi_deliveries` referencia `commercial_outcomes`.
- O webhook WABA persiste atribuição em uma conexão separada, sem transação abrangendo a nova conversão; captura a exceção e continua. Essa gravação isolada não garante entrega de Lead após falha.
- O webhook ignora novos contextos se a jornada já tem qualquer acquisition_context. Um contato inicialmente orgânico pode receber depois um clique legítimo; a política de atribuição precisa tratar esse caso explicitamente.

## Próxima implementação necessária

Criar um registro durável de conversão de lead, separado de commercial_outcomes, vinculado ao workspace, canal, jornada e evento de entrada. Gravar esse registro e o evento outbox na mesma transação após atribuição confiável. Usar chave única de negócio para que reentregas não criem novas conversões. O worker deve carregar a configuração e credencial do canal do registro e registrar entrega, falha permanente ou retry. Não reprocessar histórico automaticamente ao habilitar a funcionalidade.

Validar com testes integrados: webhook repetido, falha antes/depois do commit, resposta Meta ambígua, retry com mesmo event_id, destino desligado, credencial ausente, clique ausente, troca de workspace e conversa orgânica seguida de anúncio. Depois realizar o teste controlado da Haven e verificar a entrega real na Meta.

## Publicação desta implementação

Antes de promover o bundle, aplicar pelo fluxo versionado as migrações `20260917220000_capi_lead_deliveries.sql` e `20260917220100_queue_capi_lead_rpc.sql`. A checagem de schema da release exige a tabela e a assinatura da função. Não aplicar migrations por SQL avulso em produção.

Manter a CAPI da Haven desligada até a prova controlada de atribuição. Após publicar, verificar release servida, readiness, recepção WAHA e estado salvo de tracking. O código novo não deve reenviar o histórico. Em rollback do bundle, preservar as tabelas aditivas e desligar a CAPI; não apagar entregas nem eventos pendentes. Antes de reativar uma versão futura, revisar o estado das entregas pendentes e a configuração de destino.
