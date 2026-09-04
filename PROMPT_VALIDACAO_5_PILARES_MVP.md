# PROMPT DE VALIDAÇÃO E REFINAMENTO — 5 PILARES DO MVP CANÔNICO (SOS SALES)
> **MCT OS — Sovereign Kernel | Chapecó, BR | v2.0**  
> **Objetivo:** Roteiro prático e auditável para testar, validar e refinar os 5 pilares essenciais do SOS Sales em ambiente real (Docker Lab ou Produção).

---

## 🎯 OBJETIVO DO SPRINT

Executar uma bateria de testes ponta a ponta (E2E) focada exclusivamente nos **5 pilares canônicos** do SOS Sales:
1. **Gestão de WhatsApp** (Cockpit 1:1, SLA de Atendimento e Funil Kanban Comercial)
2. **Loop de Traqueamento Meta Ads $\leftrightarrow$ CAPI** (Captura CTWA e Devolução de Conversão via Conversions API)
3. **Agente 24/7 & Handoff Humano** (Autonomia, Qualificação e Transição suave)
4. **Espelhamento de Agenda Externa** (Consulta Trinks/Agenda e Sugestão de Horários no Chat)
5. **Arsenal Meta Business Platform** (Dual-Engine WAHA + WABA: Templates, Botões, Listas e Pix)

---

## 📋 ROTEIRO OPERACIONAL DE VALIDAÇÃO (PASSO A PASSO)

### PILAR 1: GESTÃO OPERACIONAL DE WHATSAPP (COCKPIT & FUNIL)
- [ ] **1.1 Fila de Atendimento e SLA:**
  - Abrir o **Cockpit Agora** (`/` ou `/agora`).
  - Verificar se as conversas ativas aparecem ordenadas por prioridade/SLA (tempo de espera do lead).
  - Verificar se a contagem de pendências bate exatamente com os leads aguardando resposta humana.
- [ ] **1.2 Chat 1:1 ao Vivo:**
  - Selecionar uma conversa ativa.
  - Enviar mensagem de texto e validar se o indicador de status (relógio $\rightarrow$ enviado $\rightarrow$ entregue $\rightarrow$ lido) reflete o WhatsApp real.
  - Testar envio/recebimento de áudio PTT nativo (gravador do navegador e player com barra de reprodução).
- [ ] **1.3 Funil Kanban Comercial:**
  - Acessar a aba **Conversas & Funil** no modo Kanban.
  - Arrastar um lead de *Novo Lead* para *Qualificado* e depois para *Agendado/Fechado*.
  - Recarregar a página (F5) e confirmar que o estágio persistiu no PostgreSQL sem regressão.

---

### PILAR 2: TRAQUEAMENTO META ADS $\leftrightarrow$ CONVERSIONS API (CAPI)
- [ ] **2.1 Configuração do Pixel e Graph API:**
  - Ir em **Configurações $\rightarrow$ Traqueamento**.
  - Informar/Verificar o **Pixel ID**, **Token de Acesso da Graph API (CAPI)** e o **Test Event Code** (obtido no Gerenciador de Eventos da Meta).
  - Clicar em **"Disparar Teste CAPI"** e verificar se a API retorna status `200 OK` com hash SHA-256 dos dados de contato.
  - Abrir a aba *Testar Eventos* no Meta Events Manager e confirmar o recebimento do evento de teste em tempo real.
- [ ] **2.2 Captura de Parâmetros CTWA:**
  - Verificar se um contato originado de anúncio exibe no **Dossiê do Lead** (coluna 3 do Cockpit) as tags de atribuição: `ad_id`, `campaign_id` ou `source=ctwa`.
- [ ] **2.3 Devolução de Conversão Comercial:**
  - No Cockpit, com o lead selecionado, clicar na ação rápida de registrar fechamento/agendamento.
  - Confirmar o envio automático do evento (`Schedule` ou `Purchase`) com o valor monetário acordado de volta para a Meta.

---

### PILAR 3: AGENTE 24/7 & HANDOFF HUMANO
- [ ] **3.1 Recepção e Resposta Autônoma:**
  - Garantir que a chave de autonomia do workspace esteja em **"IA Ativa"** (Piloto Automático ou Copiloto).
  - Enviar uma mensagem a partir de um número de teste: *"Olá, quais serviços vocês oferecem e qual o valor?"*.
  - Verificar se o agente responde em menos de 10 segundos com as informações corretas da base de conhecimento da empresa.
- [ ] **3.2 Gatilho de Handoff (Transição para Atendente Humano):**
  - No mesmo número de teste, enviar: *"Gostei, quero fechar agora, pode me passar o atendente humano?"*.
  - Verificar se o agente pausa o envio autônomo, emite a mensagem de transição e coloca o lead na fila de prioridade com o status `pending_operator`.
  - No Cockpit, confirmar que o operador humano visualiza a conversa destacada em vermelho/amarelo com o resumo do que o cliente precisa.

---

### PILAR 4: ESPELHAMENTO DE AGENDAMENTO (TRINKS / AGENDA EXTERNA)
- [ ] **4.1 Abertura e Visualização da Grade:**
  - No Cockpit, durante o atendimento a um lead, pressionar `Alt + A` ou clicar no botão **"📅 Agenda Trinks / Horários"**.
  - Verificar se o **Drawer de Agenda Externa** se abre exibindo a grade do dia/semana, os profissionais disponíveis e os serviços cadastrados.
- [ ] **4.2 Inserção de Sugestão de Horários no Chat:**
  - Selecionar um serviço (ex: *Escova Express*) e um profissional com horários vagos.
  - Clicar na ação de sugerir horários (`{{horarios}}`).
  - Validar se a caixa de texto de mensagem do operador/agente é preenchida automaticamente com um texto persuasivo contendo os horários disponíveis reais (ex: *"Olá! Temos vagas hoje às 14:30 e às 16:00..."*).
  - Enviar a mensagem para o cliente.

---

### PILAR 5: ARSENAL META BUSINESS PLATFORM (WAHA + WABA OFICIAL)
- [ ] **5.1 Estado dos Canais (Dual-Engine):**
  - Ir em **Configurações $\rightarrow$ Canais**.
  - Verificar se o status do WAHA (QR Code / Sessão Web) e da WABA Oficial (Token / Phone ID) estão indicando status verde/conectado.
- [ ] **5.2 Disparo Supervisionado de Arsenal no Cockpit:**
  - No chat do Cockpit, clicar em **"Arsenal WABA"** / **"Ações Interativas"**.
  - **Botões de Resposta Rápida (Quick Reply):** Disparar mensagem com 2 botões de sim/não ou opções de serviço. Confirmar que no WhatsApp do cliente os botões são renderizados nativamente.
  - **Listas Interativas:** Disparar um menu com categorias e itens clicáveis. Validar a abertura da gaveta interativa no WhatsApp.
  - **Cobrança / Chave Pix:** Disparar botão/bloco de pagamento Pix e checar se o código Copia e Cola é gerado com formatação correta.
  - **Templates HSM:** Enviar um modelo aprovado de utilidade ou reativação com variáveis preenchidas.

---

## 📊 RELATÓRIO DE RESULTADOS ESPERADO

Ao concluir os 5 passos acima, produzir um resumo com o seguinte formato:

```markdown
### ✅ RELATÓRIO DE AUDITORIA OPERACIONAL (5 PILARES SOS SALES)

| Pilar | Status | Evidência / Latência | Pontos de Atenção |
|---|:---:|---|---|
| 1. Gestão WhatsApp & Kanban | [OK / PENDENTE] | Tempo de sincronização, persistência | ... |
| 2. Meta Ads & Devolução CAPI | [OK / PENDENTE] | Event ID, retorno 200 no Events Manager | ... |
| 3. Agente 24/7 & Handoff | [OK / PENDENTE] | Tempo de resposta, disparo de alerta humano | ... |
| 4. Espelhamento Agenda Trinks | [OK / PENDENTE] | Inserção de slots `{{horarios}}` | ... |
| 5. Arsenal Meta (WABA / WAHA) | [OK / PENDENTE] | Renderização de botões, listas e HSM | ... |

**Diagnóstico Geral:** [Apto para produção / Ajustes necessários]
**Ações Imediatas:** [Listar ajustes prioritários identificados]
```
