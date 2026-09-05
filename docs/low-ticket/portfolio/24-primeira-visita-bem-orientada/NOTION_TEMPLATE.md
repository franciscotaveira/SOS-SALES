# Primeira visita bem orientada — template duplicável

> Copie esta página para o seu workspace. Ela é um ponto de partida editável, não um sistema hospedado pela nossa equipe.

## Como duplicar

1. Abra a página pública do produto quando ela for publicada.
2. Clique em **Duplicate / Duplicar**.
3. Escolha o seu workspace.
4. Renomeie a cópia e apague o exemplo fictício antes de inserir dados reais.

## Database principal: Primeira visita bem orientada

**Propriedades**

- **Pessoa / oportunidade** — text
- **Serviço** — text
- **Data e horário confirmados** — date/text
- **Local / instruções** — text
- **Política aplicável** — text
- **Ação esperada** — text
- **Status** — select: solicitado, confirmado, remarcação, cancelado, concluído
- **Responsável / handoff** — person/text

**Visualizações sugeridas**

- Agenda de hoje; confirmações pendentes; remarcações; faltas; handoffs.
- Filtro padrão: mostrar somente itens que têm próxima ação ou status pendente.
- Ordenação padrão: próxima ação crescente; depois, risco ou prioridade.

## Registro inicial

| Pessoa / oportunidade | Serviço | Data e horário confirmados | Local / instruções | Política aplicável | Ação esperada | Status | Responsável / handoff |
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
