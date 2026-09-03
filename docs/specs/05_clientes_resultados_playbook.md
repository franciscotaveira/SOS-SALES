# Especificação Detalhada — Módulo 5: Gestão de Clientes, Resultados/CAPI & Sales AI Playbook (`/clientes`, `/resultados`, `/playbook`)
> **SOS Sales v2.0 | MCT OS**  
> **Arquivos de Referência:** `src/components/clients/AgencyClientsManager.tsx`, `ResultsHubView.tsx`, `SalesAiPlaybookView.tsx`, `TrackingSettings.tsx`, `CapiClient.ts`

---

## 1. Visão Geral do Módulo

O conjunto de módulos **Gestão de Clientes, Resultados/CAPI & Sales AI Playbook** é responsável pela administração estratégica do SOS Sales. Ele abrange o gerenciamento multi-tenant de sub-contas por agência/matriz, o rastreamento server-side de anúncios Click-to-WhatsApp (CTWA) via Meta Conversions API (CAPI) e a configuração profunda do agente de Inteligência Artificial (Receptionist).

---

## 2. Especificação das Funções — Gestão de Clientes & Workspaces (`/clientes`)

### F5.1 — Switcher de Workspace & Matriz de Clientes
* **Gatilho:** Aba `Gestão de Clientes` no menu principal.
* **Componentes Exibidos:**
  - Lista de todos os workspaces aos quais o usuário tem permissão de acesso.
  - Indicador do papel do usuário no workspace (`viewer`, `operator`, `supervisor`, `admin`, `owner`).
  - Botão de alternância instantânea de workspace ativo.

### F5.2 — Onboarding Wizard de Novos Clientes / Sub-Contas
* **Gatilho:** Clique no botão `+ Adicionar Novo Cliente`.
* **Inputs do Formularário:**
  - Nome da Empresa / Cliente.
  - Nicho de Atuação (`hair_salon`, `auto_film`, `general_services`).
  - Slogan / Descrição Curta.
  - E-mail do Proprietário.
  - Telefone principal do WhatsApp.
  - Provedor WhatsApp Preferencial (`WAHA` ou `Meta WABA`).
* **Endpoint API:** `POST /api/v1/workspaces/:parentWorkspaceId/client-workspaces`.
* **Comportamento Esperado:** Cria a nova linha em `workspaces`, gera o canal padrão em `channel_connections` e adiciona o usuário como `owner` da nova conta.

---

## 3. Especificação das Funções — Resultados Comerciais, ROAS & Meta CAPI (`/resultados`)

### F5.3 — Painel de Analytics & ROI da IA
* **Gatilho:** Aba `Gestão de Campanhas` $\to$ Sub-aba `Analytics & ROI`.
* **Métricas Exibidas:**
  - Receita Gerada por Conversas (R$).
  - Total de Leads Atendidos no Período.
  - Tempo Médio de Primeira Resposta.
  - Taxa de Retenção e Handoff (Percentual de atendimentos resolvidos pela IA vs assumidos por humanos).

### F5.4 — Rastreamento de Anúncios CTWA (Click-to-WhatsApp / Traffic Proof)
* **Gatilho:** Sub-aba `Anúncios & CTWA`.
* **Mapeamento de Referral:**
  - Ingere a estrutura `referral` recebida dos webhooks da Meta Cloud API.
  - Captura `ad_id`, `campaign_id`, `headline`, `source_url` e parâmetros `UTM`.
  - Associa a origem do anúncio diretamente à jornada do lead em `commercial_journeys`.

### F5.5 — Disparador Meta Conversions API (CAPI Server-Side)
* **Gatilho:** Alteração de estágio do lead para agendado/ganho ou clique no botão `Testar Evento CAPI`.
* **Cliente API:** `CapiClient.ts`.
* **Payload Hashed:** Criptografa o número de telefone (SHA-256) e e-mail do lead e envia os eventos `Lead`, `Schedule` ou `Purchase` diretamente para o Pixel/Dataset ID da Meta via chamada server-side (bypass de adblockers).

### F5.6 — Links Rastreados & QR Code Generator
* **Gatilho:** Sub-aba `Links & QR Code`.
* **Inputs:** Mensagem pré-definida de WhatsApp e parâmetros UTM (`utm_source`, `utm_medium`, `utm_campaign`).
* **Gerador:** Cria link curto `https://wa.me/phone?text=...` e gera imagem de QR Code em formato PNG para download.

---

## 4. Especificação das Funções — Sales AI Playbook (`/playbook`)

### F5.7 — Gestão da Base de Conhecimento (Knowledge Base)
* **Gatilho:** Aba `Inteligência` $\to$ Sub-aba `Base de Conhecimento`.
* **Recursos:**
  - Ingestão de documentos (PDF, TXT) e FAQs da empresa.
  - Definição de regras incondicionais que a IA nunca deve violar (ex: *"Nunca prometer desconto superior a 10%"*).

### F5.8 — Catálogo de Serviços & Tabela de Preços
* **Gatilho:** Sub-aba `Catálogo de Serviços`.
* **Cadastro de Itens:**
  - Nome do Serviço/Procedimento.
  - Valor (R$) e duração mínima em minutos (necessário para a leitura da Agenda Externa).
  - Descrição técnica e recomendações pré-atendimento.

### F5.9 — Robôs Especialistas & Modo de Autonomia da IA
* **Gatilho:** Sub-aba `Robôs Especialistas`.
* **Configuração de Autonomia:**
  - **Modo 24/7 Autônomo:** IA responde automaticamente dentro da janela de 24h sem intervenção prévia.
  - **Modo Copiloto Supervisionado:** IA gera sugestões de resposta para aprovação do operador no Cockpit.
* **Prompt Base:** Personalização do System Prompt do agente Receptionist.
