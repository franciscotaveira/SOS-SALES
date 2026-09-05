# Do “quero comprar” ao pedido confirmado — template duplicável

> Copie esta página para o seu workspace. Ela é um ponto de partida editável, não um sistema hospedado pela nossa equipe.

## Como duplicar

1. Abra a página pública do produto quando ela for publicada.
2. Clique em **Duplicate / Duplicar**.
3. Escolha o seu workspace.
4. Renomeie a cópia e apague o exemplo fictício antes de inserir dados reais.

## Database principal: Do “quero comprar” ao pedido confirmado

**Propriedades**

- **Situação** — select: primeiro contato, dúvida, objeção, retomada, pós-venda
- **Contexto conhecido** — text: o que o cliente já informou
- **Objetivo desta mensagem** — text
- **Resposta adaptável** — text
- **Próxima ação** — text
- **Condição de parada** — text
- **Aprovada em** — date

**Visualizações sugeridas**

- Biblioteca por situação; mensagens em revisão; mensagens aprovadas; itens que precisam de handoff.
- Filtro padrão: mostrar somente itens que têm próxima ação ou status pendente.
- Ordenação padrão: próxima ação crescente; depois, risco ou prioridade.

## Registro inicial

| Situação | Contexto conhecido | Objetivo desta mensagem | Resposta adaptável | Próxima ação | Condição de parada | Aprovada em |
| --- | --- | --- | --- | --- | --- | --- |
| Empresa Aurora | Exemplo fictício | preencher | preencher | preencher | preencher | preencher |

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
