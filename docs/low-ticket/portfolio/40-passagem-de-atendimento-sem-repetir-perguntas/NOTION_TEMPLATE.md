# Passagem de atendimento sem repetir perguntas — template duplicável

> Copie esta página para o seu workspace. Ela é um ponto de partida editável, não um sistema hospedado pela nossa equipe.

## Como duplicar

1. Abra a página pública do produto quando ela for publicada.
2. Clique em **Duplicate / Duplicar**.
3. Escolha o seu workspace.
4. Renomeie a cópia e apague o exemplo fictício antes de inserir dados reais.

## Database principal: Passagem de atendimento sem repetir perguntas

**Propriedades**

- **Pessoa** — person/text
- **Habilidade / cenário** — text
- **Material de referência** — url/text
- **Simulação realizada** — date/text
- **Critério de prontidão** — text
- **Evidência observada** — text
- **Próximo treino** — date/text
- **Status** — select: não iniciado, em treino, acompanhado, pronto, reciclar

**Visualizações sugeridas**

- Plano de 5 dias; simulações; pontos de handoff; pessoas em reciclagem; prontidão.
- Filtro padrão: mostrar somente itens que têm próxima ação ou status pendente.
- Ordenação padrão: próxima ação crescente; depois, risco ou prioridade.

## Registro inicial

| Pessoa | Habilidade / cenário | Material de referência | Simulação realizada | Critério de prontidão | Evidência observada | Próximo treino | Status |
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
