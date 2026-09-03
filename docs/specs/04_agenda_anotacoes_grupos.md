# Especificação Detalhada — Módulo 4: Agenda Comercial, Anotações & Hub de Grupos (`/agenda`, `/anotacoes`, `/grupos`)
> **SOS Sales v2.0 | MCT OS**  
> **Arquivos de Referência:** `src/components/agenda/AgendaView.tsx`, `NotesView.tsx`, `GroupsHubView.tsx`

---

## 1. Visão Geral do Módulo

Os módulos **Agenda Comercial, Anotações & Hub de Grupos** fornecem suporte operacional para organização interna da equipe de vendas. Eles cobrem a marcação formal de compromissos com leads, o registro colaborativo de insights do workspace e o monitoramento em massa de grupos de atendimento no WhatsApp.

---

## 2. Especificação das Funções — Agenda Comercial (`/agenda`)

### F4.1 — Visualizador de Calendário Comercial
* **Gatilho:** Aba `Agenda` no menu principal.
* **Visões:** Alternância entre `Dia`, `Semana` e `Mês`.
* **Subscrição Realtime:** Escuta atualizações da tabela `workspace_appointments` do PostgreSQL via Supabase WebSockets.

### F4.2 — Agendamento de Atendimento
* **Gatilho:** Clique em uma célula de horário vaga ou no botão `+ Novo Agendamento`.
* **Inputs:**
  - Lead / Contato (busca no PostgreSQL).
  - Título do Compromisso (ex: *"Avaliação de Visagismo & Escova"*).
  - Data e Hora de Início / Término.
  - Atendente Responsável.
  - Observações.
* **Efeito:** Salva o compromisso em `workspace_appointments` e atualiza o estado do lead na jornada para `AGENDADO`.

### F4.3 — Ação Direta no Agendamento
* **Gatilho:** Clique no card de um agendamento no calendário.
* **Ações:**
  - **Ir para Conversa:** Redireciona o operador diretamente para o Cockpit de Atendimento (`/agora`) abrindo o chat do lead correspondente.
  - **Alterar Status:** Marca o agendamento como `Confirmado`, `Realizado`, `Reagendado` ou `Cancelado`.

---

## 3. Especificação das Funções — Anotações & Insights (`/anotacoes`)

### F4.4 — Bloco de Anotações Internas do Workspace
* **Gatilho:** Aba `Anotações` no menu principal.
* **Componentes Exibidos:**
  - Lista de notas criadas pela equipe de vendas.
  - Campo de busca rápida de anotações.
  - Criador de Notas com título, tags e corpo de texto.
* **Banco de Dados:** Tabela `workspace_notes` (isolada por `workspace_id`).

### F4.5 — Categorização por Tags
* **Exemplo de Tags:** `Dica Comercial`, `Script de Venda`, `Aviso Importante`, `Feedback de Cliente`.
* **Filtro:** Clique em uma tag filtra instantaneamente as notas relacionadas.

---

## 4. Especificação das Funções — Hub de Grupos WhatsApp (`/grupos`)

### F4.6 — Monitor de Saúde de Grupos
* **Gatilho:** Aba `Grupos` $\to$ Sub-aba `Monitor de Saúde & Alertas`.
* **Métricas Exibidas:**
  - Status dos Grupos vinculados via WAHA (`Ativo`, `Pendente Ação`, `Inativo`).
  - Alerta de Silêncio: Notifica se um grupo de cliente VIP ficar mais de X horas sem interação humana.
  - Leitura do número de participantes e contagem de mensagens não lidas.

### F4.7 — Torre de Grupos (Wallboard NOC)
* **Gatilho:** Sub-aba `Torre de Grupos (NOC)`.
* **Comportamento Esperado:** Exibe grade em tela cheia com o feed ao vivo dos grupos ativados para monitoramento comercial simultâneo.

### F4.8 — Disparo de Avisos em Grupos (Broadcast de Grupos)
* **Gatilho:** Sub-aba `Disparo de Avisos`.
* **Inputs:** Seleção dos grupos destino e digitação do comunicado.
* **Execução:** Envia a mensagem via cliente WAHA com intervalo anti-spam entre grupos.
