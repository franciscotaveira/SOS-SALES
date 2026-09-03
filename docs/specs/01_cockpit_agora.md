# Especificação Detalhada — Módulo 1: Cockpit de Atendimento ao Vivo (`/agora`)
> **SOS Sales v2.0 | MCT OS**  
> **Arquivo de Referência:** `src/components/cockpit/LiveCockpitView.tsx`, `CockpitView.tsx`, `SupervisedComposer.tsx`, `WabaActionsModal.tsx`, `ExternalAgendaDrawer.tsx`

---

## 1. Visão Geral do Módulo

O **Cockpit de Atendimento ao Vivo** é a central de operação comercial 1:1 de 3 colunas do SOS Sales. Ele permite que operadores humanos atendam leads do WhatsApp em tempo real, disparando recursos avançados da Meta Cloud API (WABA), interagindo com o Copiloto de IA e consultando a agenda externa sem trocar de tela.

---

## 2. Especificação das Funções — Coluna 1: Fila de Atendimento & Foco

### F1.1 — Seletor de Fila (Prioridades vs Todas)
* **Gatilho:** Clique nas abas `Prioridades` (ícone de Chama) ou `Todas as Conversas` (ícone de Mensagem).
* **Entradas:** Clique do operador.
* **Comportamento Esperado:**
  - `Prioridades`: Filtra conversas com `handoffStatus = 'pending_operator'` ou chamados com estouro de SLA (> 15 min sem resposta).
  - `Todas`: Exibe a lista completa de jornadas ativas (`commercial_journeys`) do workspace ordenadas por `updated_at DESC`.
* **Banco de Dados / RLS:** Query em `commercial_journeys` filtrada por `workspace_id = current_user_workspace_ids()`.
* **Badge de Notificação:** Exibe badge vermelho com a contagem de mensagens pendentes não lidas.

### F1.2 — Campo de Busca de Conversas
* **Gatilho:** Digitação no campo `Buscar por nome ou número...`.
* **Entradas:** String de busca.
* **Comportamento Esperado:** Filtro dinâmico local/debounce por `contact_name` ou `contact_phone`.
* **Estado Vazio:** Se não encontrar resultados, exibe *"Nenhum atendimento encontrado para 'termo'"*.

### F1.3 — Iniciar Nova Conversa (`+ Nova`)
* **Gatilho:** Clique no botão `+ Nova Conversa` no topo da fila.
* **Modal:** `StartConversationModal.tsx`.
* **Funções Internas:**
  1. **Busca no Banco:** Digitação busca contatos existentes na tabela `contacts` via `GET /api/v1/workspaces/:id/contacts?q=:query`.
  2. **Novo Telefone E.164:** Se o telefone não existir, insere no formato internacional (ex: `+5549988000000`).
  3. **Abertura de Jornada:** Chama `POST /api/v1/workspaces/:id/conversations/start` informando `contactId` ou `phone`.
  4. **Mensagem Inicial:** Permite enviar texto livre (janela de 24h) ou selecionar um modelo HSM aprovado WABA.

---

## 3. Especificação das Funções — Coluna 2: Stream de Mensagens & Compositor

### F2.1 — Stream de Mensagens em Tempo Real
* **Gatilho:** Seleção de uma jornada na fila ou evento WebSocket do Supabase.
* **Entradas:** `journey_id`.
* **Comportamento Esperado:**
  - Carrega mensagens de `conversation_messages` ordenadas por `sent_at ASC`.
  - Exibe balões verdes para Outbound (enviadas) e balões escuros/brancos para Inbound (recebidas do lead).
  - Exibe status de entrega da Meta (tique único, tique duplo cinza, tique duplo azul de lido).
  - Escuta subscrição em tempo real `supabase.channel('live-cockpit-messages')`.

### F2.2 — Player de Notas de Voz (Áudios PTT)
* **Gatilho:** Mensagem contendo `media_url` com tipo `audio/ogg; codecs=opus`.
* **Comportamento Esperado:**
  - Renderiza player personalizado com forma de onda (waveform visual).
  - Controles: Play/Pause, barra de progresso ajustável e alternador de velocidade ($1\times \to 1.5\times \to 2\times$).

### F2.3 — Temporizador da Janela de 24 Horas Meta
* **Gatilho:** Atualizado dinamicamente a partir da data/hora da última mensagem Inbound enviada pelo cliente.
* **Regra de Negócio Antiban:**
  - **Tempo $\le 24$h:** Banner verde indicando *"Janela de atendimento aberta — Envio livre liberado"*.
  - **Tempo $> 24$h:** Banner âmbar/vermelho indicando *"Janela de 24h expirada — Envio restrito a Templates HSM aprovados"*. Bloqueia o compositor de texto livre para evitar banimento da conta Meta WABA.

### F2.4 — Compositor Supervisionado (`SupervisedComposer`)
* **Gatilho:** Digitação de texto pelo operador humano.
* **Ações:**
  - **Enviar Mensagem (`Enter` / Botão Enviar):** Chama `POST /api/v1/workspaces/:id/journeys/:jId/send-message` via WAHA ou WABA.
  - **Sales Media Vault (Anexo):** Abre modal de seleção de arquivos (PDFs de orçamentos, vídeos institucionais, fotos de catálogo).
  - **Atalhos de Macro Pills:** Clique insere frases prontas (Chave Pix, Endereço, Tabela de Preços) no campo de texto.

### F2.5 — Arsenal WABA Nativo (`WabaActionsModal`)
* **Gatilho:** Clique no botão de raio/WABA no compositor.
* **Sub-Recursos Disparados:**
  1. **💳 Cobrança Pix Oficial (`order_details`):**
     - Inputs: Valor (R$), Descrição do Produto, Chave Pix Recebedora.
     - Endpoint: `POST /api/v1/workspaces/:id/channels/waba/send-interactive`.
     - Resultado: Cliente recebe mensagem interativa com botão nativo "Copiar Chave Pix" e checkout direto no WhatsApp.
  2. **📍 Solicitação de GPS (`location_request`):**
     - Inputs: Texto de instrução ("Por favor, compartilhe sua localização para calcularmos a entrega").
     - Endpoint: `POST /api/v1/workspaces/:id/channels/waba/send-interactive`.
     - Resultado: Cliente clica em "Enviar Localização" e o app do WhatsApp envia as coordenadas GPS exatas.
  3. **🛍️ Vitrine de Produtos (SPM/MPM):**
     - Inputs: Seleção de até 30 itens do Meta Commerce Manager.
     - Endpoint: `POST /api/v1/workspaces/:id/channels/waba/send-catalog`.
  4. **⚡ WhatsApp Interactive Flows:**
     - Inputs: Seleção do ID do Flow (Formulário de Agendamento ou Orçamento).
     - Endpoint: `POST /api/v1/workspaces/:id/channels/waba/send-flow`.
     - Resultado: Abre formulário nativo em tela cheia sem sair do WhatsApp.
  5. **🎠 Carrossel HSM Interativo:**
     - Inputs: Template de carrossel de marketing com cards deslizantes.
  6. **🔐 Autenticação OTP:**
     - Inputs: Código numérico de validação.

---

## 4. Especificação das Funções — Coluna 3: Dossiê Vivo & Agenda Externa

### F3.1 — Dossiê Comportamental & Termômetro do Lead
* **Gatilho:** Carregamento automático dos fatos e análises do lead em `known_facts`.
* **Métricas Exibidas:**
  - **Temperatura de Compra:** Frio, Morno, Quente, Pronto para Fechar (badge colorido).
  - **Dores Mapeadas:** Tags de necessidades (ex: *"Cabelo ressecado"*, *"Precisa de horário no sábado"*).
  - **Objeções Mapeadas:** Objeções ativas (ex: *"Achei o valor elevado"*, *"Verificando com o marido"*).

### F3.2 — Alterador de Etapa do Funil Comercial
* **Gatilho:** Seletor dropdown `Estágio Comercial`.
* **Entradas:** Nova etapa (`LEAD`, `QUALIFICADO`, `PROPOSTA`, `NEGOCIACAO`, `GANHO`).
* **Endpoint:** `PATCH /api/v1/workspaces/:id/journeys/:jId/stage`.
* **Efeito:** Atualiza imediatamente o card no Kanban Comercial e persiste no PostgreSQL.

### F3.3 — Fatos Conhecidos (`known_facts`)
* **Exibição:** Chave-valor dos dados extraídos pela IA ou salvos pelos operadores.
* **Edição In-line:** Operador pode adicionar novo fato (ex: `Aniversário: 15/Out`) ou excluir um fato desatualizado.

### F3.4 — Gaveta de Agenda Externa (`ExternalAgendaDrawer`)
* **Gatilho:** Clique no botão `Agenda Externa / Vagas` na barra superior da coluna 3.
* **Comportamento Esperado:**
  - Abre gaveta lateral com ponte visual para sistemas de agendamento (Trinks, Bling, etc.).
  - **Grade Visual de Horários:** Exibe colunas de profissionais com slots coloridos (Branco = Vaga Livre, Azul = Indisponível, Cinza = Ausência).
  - **Calculador de Janela Contínua:** Avalia se `freeWindowMinutes >= service.minDuration`.
  - **Hero Card de Sugestão:** Destaca o horário ideal baseado nas preferências de dia/turno do cliente e permite copiar a proposta formatada para o WhatsApp em 1 clique.
