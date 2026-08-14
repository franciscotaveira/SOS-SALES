# SOS Sales — Governança de IA & Automação Segura

## 1. Modos de Automação por Workspace & Canal

O SOS Sales adota uma política de automação governada com 3 modos rigorosos:

1. **OFF**:
   - Nenhuma geração de sugestão ou envio automático.
   - Atendimento exclusivamente humano.

2. **COPILOT (Padrão Recomendado)**:
   - A IA analisa o Dossiê Vivo e gera sugestões contextuais no compositor.
   - **Envio zero sem intervenção humana**: O operador pode aprovar com 1 clique (`Enter`), editar ou rejeitar.
   - Toda recomendação exige **dupla evidência documental** extraída da mensagem do lead ou do anúncio CTWA.

3. **AUTONOMOUS_SAFE**:
   - A IA pode enviar respostas automáticas **somente** se todas as seguintes condições forem atendidas:
     - Workspace e Canal com permissão ativa.
     - Limite de confiança da LLM acima de **85%**.
     - Oferta e preço estritamente validados no Playbook Comercial ativo.
     - Ausência de palavras-chave sensíveis (reclamação, cancelamento, desconto não autorizado).
     - Fatos necessários (ex: modelo do carro, tipo de cabelo, horário) confirmados com evidência.
   - Se qualquer condição falhar: **Interrupção imediata, criação de Handoff e alerta para a Fila de Prioridades**.

## 2. Estrutura do Playbook Comercial Versionado

Todo workspace possui um playbook contendo:
- **Identidade da Marca**: Tom de voz, saudação padrão e restrições de comunicação.
- **Catálogo de Ofertas**: Serviços autorizados com valores de tabela e condições de parcelamento.
- **Regras de Negócio**: Horários de funcionamento, bairros/cidades atendidas e políticas de reagendamento.
- **Gatilhos de Handoff**: Termos e intenções que exigem transferência obrigatória para atendimento humano.
