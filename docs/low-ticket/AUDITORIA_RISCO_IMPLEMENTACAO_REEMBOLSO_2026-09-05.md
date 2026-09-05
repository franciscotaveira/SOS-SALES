# Auditoria de implementação e risco de reembolso

Data: 05/09/2026  
Escopo: os 48 kits low-ticket locais, antes de publicar ou anunciar.

## Veredito executivo

Há produtos vendáveis em potencial, mas alguns **não devem ser publicados no formato atual**. O problema não é a ideia; é a distância entre o nome prometido e o artefato entregue.

O gerador atual cria drafts de validação com campos, um exemplo fictício e instruções. Ele não cria automaticamente uma biblioteca de mensagens pronta, fórmulas de cálculo, painel operacional completo, simulações preenchidas ou um link público duplicável do Notion.

## Riscos que atingem todo o catálogo

| Risco | Evidência | Efeito provável |
|---|---|---|
| Entrega Notion incompleta | existem arquivos locais `NOTION_TEMPLATE.md`, mas nenhum link público `notion.so`/`notion.site` | comprador espera duplicação e recebe apenas um arquivo local |
| Oferta ainda em rascunho | os READMEs registram preço como hipótese e produto não publicado | promessa, suporte e política ainda não estão fechados |
| Entrega por e-mail não operacionalizada | o runbook possui placeholders de link, anexo, prazo e assinatura | compra aprovada sem entrega confiável |
| Sobreposição não auditada | o inventário informa que Cakto/EKO não foram conferidos nesta geração | pedido de reembolso por conteúdo repetido |

## Bloqueados no formato atual — risco alto

### 33, 34, 35 e 36 — calculadora, planejador e painel

Os quatro prometem uma ferramenta numérica ou painel. Porém, os CSVs atuais repetem o mesmo cabeçalho genérico de registro comercial (`Registro`, `Origem / canal`, `Etapa / status`, `Valor ou custo`, etc.) e não possuem fórmulas, campos de entrada, cenários, gráficos ou instruções de decisão.

**Decisão:** não vender como calculadora, planejador ou painel. Reescrever como ferramenta funcional antes do primeiro checkout.

### 44 — Calculadora de setup e mensalidade

O arquivo `MODELO.csv` atual é uma ficha de projeto/cliente, não uma calculadora de setup, consumo, suporte e mensalidade.

**Decisão:** bloquear até existir uma planilha funcional com premissas editáveis, cenários, margem e exemplo preenchido.

### 01–06 e 11 — biblioteca de scripts e roteiros

Os nomes sugerem mensagens prontas para copiar/adaptar. O conteúdo atual entrega estrutura de campos e uma frase de exemplo, não uma biblioteca de mensagens, variações por situação e critérios de parada.

**Decisão:** só vender como “template para escrever seus próprios scripts” ou completar o acervo de mensagens antes de usar “pronto para copiar”. Além disso, os seis primeiros possuem risco declarado de sobreposição com EKO/Conversas Prontas.

### 38, 41, 47 e 48 — simulação, manual, demonstração e manutenção

Esses nomes sugerem um material de treinamento/documentação já aplicável. O conteúdo atual é majoritariamente ficha genérica de acompanhamento, sem casos completos, rubrica preenchida, roteiro de apresentação ou documentação de manutenção com exemplo realista.

**Decisão:** não prometer treinamento completo, manual pronto ou documentação de agente sem adicionar exemplos executáveis e critérios de aceite.

## Vendáveis depois de um endurecimento curto — risco médio

Estes podem funcionar como **templates editáveis**, desde que a página não prometa implementação, resultado ou automação:

- **07–10:** catálogo, orçamento, opções e portfólio;
- **12–18:** apresentação em vídeo, conteúdo e campanha;
- **19–30:** agenda e pós-venda, respeitando políticas do negócio, consentimento e contexto regulado;
- **31–32:** follow-up e registro de origem, desde que descritos como controle manual;
- **37, 39, 40 e 42:** treinamento e organização operacional;
- **43, 45 e 46:** proposta, briefing e onboarding de implantação, para público profissional.

Para todos eles, o mínimo é: três exemplos preenchidos, uma amostra visível antes da compra, instrução de uso em 10 minutos e definição clara do que não está incluído.

## Os mais fáceis de vender após correção

### 1. 08 — Orçamento claro em uma página

- Dor reconhecível e imediata.
- Resultado visível em uma única página.
- Não depende de API, tráfego ou integração.
- Demonstração fácil: mostrar antes/depois de um orçamento.

**Correção:** criar modelo realmente editável, três exemplos por tipo de serviço e uma versão PDF imprimível.

### 2. 31 — Follow-up com próximo passo

- Uso recorrente e simples de entender.
- Complementa quase todas as outras ofertas.
- Pode ser entregue como Notion e CSV/planilha.
- Não promete vendas; promete organização de uma ação que já deveria existir.

**Correção:** criar visualizações de hoje, atrasados e revisão semanal; incluir cinco registros fictícios coerentes.

### 3. 34 — Calculadora de combos

- Dor financeira clara: saber se o pacote preserva margem.
- Excelente order bump ou upsell do produto 08.
- Valor percebido maior que uma ficha em branco.

**Correção obrigatória:** fórmulas de preço avulso, custo, desconto, contribuição e preço do combo, com exemplo preenchido e aviso de que os custos são responsabilidade do comprador.

### Alternativa: 33 — Calculadora de desconto

Mesma lógica do 34; escolher apenas uma para o primeiro piloto, não vender as duas como produtos separados até provar diferença real.

## Produtos que devem ficar fora do primeiro lote

- **01–06:** risco de duplicação com EKO/Conversas Prontas e expectativa alta de scripts prontos.
- **14, 16 e 17:** podem ser confundidos com promessa de alcance, leads ou vendas se a copy não for extremamente restrita.
- **19–24:** dependem de políticas de cancelamento, agenda real e, em alguns nichos, revisão regulatória.
- **25–30:** dependem de consentimento, opt-out e regras de relacionamento; não são apenas mensagens.
- **37–42:** comprador precisa ter equipe e capacidade de treinamento; público menor e suporte potencialmente maior.
- **43–48:** trilha profissional de implantação de IA, com maior complexidade, expectativa e necessidade de contexto.

## Critério de publicação sem aumentar reembolso

Um SKU só entra no primeiro lote quando:

1. a pessoa consegue usar a entrega em até 10 minutos sem chamada;
2. existe um exemplo preenchido que deixa claro o resultado;
3. o nome do produto corresponde exatamente ao arquivo entregue;
4. o checkout informa PDF, planilha, Notion ou combinação real;
5. o link de duplicação ou o modo de entrega foi testado em conta limpa;
6. a página mostra o que não está incluído;
7. a sobreposição com Cakto/EKO foi conferida;
8. uma compra-teste percorreu pagamento, e-mail, acesso e suporte.

## Recomendação de lançamento

Começar com **08 + 31 + 34** em uma única esteira de “orçamento e acompanhamento”. O 34 deve ser corrigido antes de entrar; caso não haja tempo para a planilha funcional, substituir temporariamente por **11** e vender como roteiro de áudio editável.

Não anunciar os demais 45 como se estivessem prontos. Eles podem continuar no catálogo interno enquanto passam pela mesma auditoria.

