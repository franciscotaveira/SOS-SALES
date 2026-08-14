# SOS Sales — Evidência do Golden Path

## 1. Cenário de Validação Ponta a Ponta

| Etapa | Ação Executada | Resultado Esperado | Evidência & Comportamento |
| :--- | :--- | :--- | :--- |
| **1. Ingestão CTWA** | Lead clica no anúncio e envia mensagem no WhatsApp | Entrada gravada com campanha e oferta | Atribuição CTWA vinculada com custo de aquisição |
| **2. Fila de Prioridades** | Lead aparece no topo da aba **Agora** | SLA < 5 min com contagem regressiva | Card exibe urgência com badge crítico e origem do anúncio |
| **3. Assunção de Handoff** | Operador clica em **Atender Lead** | Atendimento atômico atribuído ao operador | Outros operadores veem status em andamento |
| **4. Linha de Continuidade** | Dossiê Vivo renderiza fatos conhecidos | Informações com evidência documental destacada | Zero necessidade de reler todo o chat |
| **5. Sugestão Copilot** | Operador visualiza recomendação de resposta | Mensagem gerada com 2 evidências e botões rápidos | Botão "Usar no Editor (Enter)" preenche o compositor |
| **6. Envio Supervisionado** | Operador ajusta e clica em **Enviar** | Mensagem transmitida via WhatsApp | Rascunho salvo em caso de erro de rede; timeline atualizada |
| **7. Registro de Venda** | Operador clica em **Venda Ganha** | Modal solicita valor e serviço fechado | Jornada avança para etapa `won` no Kanban e fecha handoff |
| **8. Proof of Traffic** | Acesso à aba **Resultados** | Métricas de conversão e ROAS atualizadas | Receita consolidada por campanha e criativo |
