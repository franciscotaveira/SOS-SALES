# Indicação com contexto — template duplicável

> Copie esta página para o seu workspace. Ela é um ponto de partida editável, não um sistema hospedado pela nossa equipe.

## Como duplicar

1. Abra a página pública do produto quando ela for publicada.
2. Clique em **Duplicate / Duplicar**.
3. Escolha o seu workspace.
4. Renomeie a cópia e apague o exemplo fictício antes de inserir dados reais.

## Database principal: Indicação com contexto

**Propriedades**

- **Cliente** — text
- **Última compra / atendimento** — date/text
- **Ocasião de contato** — select: recebimento, uso, avaliação, indicação, recompra, renovação
- **Elegibilidade** — select: sim, não, revisar
- **Preferência / consentimento** — text
- **Próxima ação** — text
- **Resultado / margem** — text
- **Saída** — select: respondeu, concluiu, opt-out, encerrar

**Visualizações sugeridas**

- Clientes elegíveis; contatos agendados; opt-outs; recompra; renovação; aprendizados.
- Filtro padrão: mostrar somente itens que têm próxima ação ou status pendente.
- Ordenação padrão: próxima ação crescente; depois, risco ou prioridade.

## Registro inicial

| Cliente | Última compra / atendimento | Ocasião de contato | Elegibilidade | Preferência / consentimento | Próxima ação | Resultado / margem | Saída |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Empresa Aurora | Exemplo fictício | preencher | preencher | preencher | preencher | preencher | preencher |

O registro acima é fictício. Substitua-o por um caso real somente depois de revisar privacidade, consentimento e necessidade de cada campo.

## Template de página

### Contexto

- O que aconteceu?
- O que já está confirmado?
- Qual é o resultado desejado?

### Decisão / execução

- Próxima ação:
- Responsável:
- Prazo:
- Evidência esperada:

### Exceções e handoff

- O que não pode ser decidido aqui?
- Quem assume?
- Qual resumo precisa ser transferido?

### Fechamento

- Resultado observado:
- O que ficou pendente:
- Próxima revisão:

## Regras de manutenção

- Não transforme todas as tabelas em campos obrigatórios: mantenha somente o que sustenta uma decisão.
- Faça uma revisão semanal e arquive o que foi encerrado sem apagar histórico.
- Não coloque senhas, tokens, documentos sensíveis ou dados de clientes sem necessidade.
- Se a rotina passar a exigir envio automático, filas ou multiusuário, reavalie o uso de CRM/SOS Sales.
