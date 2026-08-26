# NVIDIA Receptionist — Gate de canário controlado

> Estado: pronto para homologação controlada; não autoriza deploy nem outbound em produção.

## Pré-condições obrigatórias

- migration `20260825090000_receptionist_bot_enabled_fail_closed.sql` aplicada e verificada;
- todas as jornadas existentes com `bot_enabled = false`;
- `RECEPTIONIST_ENABLED=true` apenas no ambiente escolhido;
- uma jornada descartável informada explicitamente por `TEST_JOURNEY_ID`;
- remetente e destinatário controlados pela MCT;
- autorização literal para mensagem real registrada antes do teste;
- logs sem prompt, token, telefone completo ou conteúdo sensível.

## Sequência

1. Validar `/health`, `/ready` e versão do artefato.
2. Consultar status da jornada controlada: deve iniciar `botEnabled=false` e `botActive=false`.
3. Habilitar somente essa jornada.
4. Enviar uma única mensagem de saudação pelo número controlado.
5. Correlacionar webhook, decisão NIM, provider message ID, persistência e entrega.
6. Repetir com pedido explícito de humano; o agente deve escalar sem responder autonomamente.
7. Pausar durante uma inferência e comprovar ausência de outbound após a pausa.
8. Reenviar o mesmo webhook e comprovar exatamente uma resposta.
9. Desabilitar a jornada e confirmar `botActive=false`.
10. Encerrar com reconciliação de mensagens e logs; qualquer estado incerto mantém o canário fechado.

## Critérios de aprovação

- zero envio fora da jornada controlada;
- zero duplicação;
- JSON válido em 100% da amostra;
- nenhum preço ou fato não confirmado;
- pedido de humano sempre bloqueia resposta autônoma;
- timeout e erro do provedor não aparecem como sucesso;
- estado final do bot desabilitado e comprovado por API e banco.

## Execução protegida

O harness ao vivo exige simultaneamente `ALLOW_LIVE_RECEPTIONIST_TEST=true` e `TEST_JOURNEY_ID`. Sem ambos, deve falhar fechado. Segredos são fornecidos somente por ambiente e nunca por argumentos, código ou documentação.
