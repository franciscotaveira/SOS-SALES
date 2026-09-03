# Especificação Detalhada — Módulo 3: Motor Dual-Engine, WABA Arsenal & Meta Omnichannel (`/configuracoes/canais`)
> **SOS Sales v2.0 | MCT OS**  
> **Arquivos de Referência:** `src/components/channels/ConnectionManager.tsx`, `EmbeddedSignupModal.tsx`, `WabaActionsModal.tsx`, `MessengerInsightsPanel.tsx`, `apps/api/src/infrastructure/channels/meta/`

---

## 1. Visão Geral do Módulo

O **Motor Dual-Engine & Meta Omnichannel** é o coração técnico de conectividade do SOS Sales. Ele gerencia a coexistência do **WAHA (WhatsApp Web)** para chat contínuo e grupos e da **Meta Cloud API (WABA v20.0)** para automações, anúncios Click-to-WhatsApp (CTWA), CAPI e mensagens interativas, além de centralizar interações do Facebook Messenger, Instagram Direct e extração semântica com Wit.ai NLP.

---

## 2. Especificação das Funções — Conexão Dual-Engine (WAHA + Meta WABA)

### F3.1 — Gerenciador de Conexão WAHA (WhatsApp Web)
* **Gatilho:** Aba `Canais de WhatsApp` $\to$ Card WAHA.
* **Recursos & Controles:**
  1. **Status da Sessão:** Exibe estado em tempo real (`WORKING`, `SCAN_QR_CODE`, `STOPPED`, `FAILED`).
  2. **Leitura de QR Code:** Exibe QR Code gerado pelo container WAHA (`http://localhost:3005`) para pareamento via leitura de câmera do celular.
  3. **Reconexão / Disconnect:** Botão para reiniciar a sessão `default` ou deslogar a conta WhatsApp.
  4. **Sincronização de Histórico:** Botão `Sincronizar Histórico` para importar últimas conversas para a tabela `conversation_messages`.

### F3.2 — Gerenciador Meta Cloud API (WABA Oficial v20.0)
* **Gatilho:** Aba `Canais de WhatsApp` $\to$ Card Meta WABA.
* **Recursos & Controles:**
  1. **Configuração Manual de Credenciais:** Entrada de `WABA Account ID`, `Phone Number ID` e `Permanent System User Access Token`.
  2. **Embedded Signup (`EmbeddedSignupModal.tsx`):**
     - Fluxo oficial da Meta FBE (Facebook Business Extension).
     - Permite que novos clientes façam login com o Facebook e autorizem o WABA do SOS Sales em 1 clique.
     - Descobre automaticamente as contas WABA e cadastra os webhooks na Graph API da Meta.
  3. **Verificação de Saúde e Token:** Exibe contagem de mensagens disparadas, tier da conta Meta (Tier 1K, 10K, 100K ou Ilimitado) e validade do token.

---

## 3. Especificação das Funções — Gerenciador de Templates HSM WABA In-App

### F3.3 — Sincronização & Listagem de Modelos HSM
* **Gatilho:** Início do módulo ou clique em `Sincronizar Templates da Meta`.
* **Endpoint:** `GET /api/v1/workspaces/:id/channels/waba/templates`.
* **Exibição:**
  - Status retornado pela Graph API (`APPROVED`, `PENDING`, `REJECTED`).
  - Categoria (`UTILITY`, `MARKETING`, `AUTHENTICATION`).
  - Previsualização do texto com variáveis dinâmicas (ex: `Olá {{1}}, seu agendamento está confirmado para {{2}}`).

### F3.4 — Criador In-App de Templates HSM
* **Gatilho:** Clique no botão `+ Criar Novo Template Meta`.
* **Inputs:**
  - Nome do Template (letras minúsculas e underline, ex: `confirmacao_agendamento_v1`).
  - Categoria (Utilidade ou Marketing).
  - Idioma (`pt_BR`).
  - Cabeçalho (Nenhum, Texto, Imagem, Documento PDF).
  - Corpo da Mensagem (Texto com placeholders `{{1}}`, `{{2}}`).
  - Rodapé (Texto curto).
  - Botões Interativos (Até 3 botões de Resposta Rápida ou Botão de Chamada/Link URL).
* **Endpoint:** `POST /api/v1/workspaces/:id/channels/waba/create-template`.
* **Fluxo:** Envia a estrutura JSON diretamente para a Meta Graph API. O template entra em análise imediata e atualiza seu status para `APPROVED` assim que aprovado pela Meta.

---

## 4. Especificação das Funções — Meta Omnichannel & Wit.ai NLP

### F3.5 — Central de Conexão Messenger & Instagram Direct
* **Gatilho:** Aba `Meta Omnichannel`.
* **Integração:** Conecta Páginas do Facebook e Perfis Comerciais do Instagram via Graph API v20.0.
* **Mapeamento de Identificadores:** Identifica contatos por PSID (Page-Scoped ID) e IGSID (Instagram-Scoped ID) sem colisão com números de telefone WhatsApp.

### F3.6 — Private Replies (Resposta Privada Automática)
* **Gatilho:** Webhook de comentário em post do Facebook ou Instagram.
* **Serviço API:** `PrivateReplyService.ts`.
* **Comportamento Esperado:** Responde automaticamente ao comentário via mensagem privada no Messenger/Direct enviando o link de conversão ou oferta.

### F3.7 — Processamento Semântico Wit.ai NLP
* **Serviço API:** `NlpEnrichmentService.ts`.
* **Entrada:** Texto das mensagens recebidas dos clientes em qualquer canal Meta.
* **Comportamento Esperado:**
  - Envia texto para o Wit.ai em tempo real.
  - Extrai entidades semânticas: `datetime` (datas/horários), `amount_of_money` (valores), `intent` (intenção de compra/duvida), `sentiment` (positivo/neutro/negativo).
  - Alimenta automaticamente os fatos conhecidos do lead em `known_facts`.
