---
name: waba-cost-optimizer
description: Engenharia de templates WhatsApp Oficial (Meta Cloud API / WABA), estratégias de redução de custo de conversa (Utility vs Marketing, Janela 72h CTWA, Janela 24h Service) e regras de aprovação rápida com qualidade verde.
---

# 💰 Skill: Meta WABA Cost Optimizer & Template Engineering (MCT OS v2.0)

Esta skill define as diretrizes, fórmulas de copywriting e táticas operacionais para **reduzir em até 85% o custo de disparos no WhatsApp Oficial (Meta Cloud API)** e garantir **100% de taxa de aprovação com Qualidade Verde**.

---

## 1. TABELA COMPARATIVA DE CUSTOS DA META (2025/2026)

| Categoria | Custo Médio por Conversa | Economia | Quando Usar |
| :--- | :--- | :--- | :--- |
| **CTWA (Click-to-WhatsApp Ads)** | **R$ 0,00 (Grátis por 72h)** | **100% FREE** | Leads vindos de anúncios do Facebook/Instagram Ads |
| **Service (Janela 24h)** | **R$ 0,00 (Mensagens livres)** | **100% FREE** | Dentro de 24h após qualquer mensagem enviada pelo cliente |
| **Utility (Utilidade)** | **~R$ 0,03 a R$ 0,06** | **85% a 90% MENOR** | Confirmações, lembretes, atualizações, protocolos |
| **Authentication (OTP)** | **~R$ 0,05 a R$ 0,08** | **80% MENOR** | Códigos de verificação e segurança |
| **Marketing (Promocional)** | **~R$ 0,35 a R$ 0,45** | Custo Padrão | Disparos em massa puramente promocionais |

> 🔑 **A REGRA DE OURO MCT:** *Nunca envie um disparo de Marketing pago cheio (R$ 0,40) se você puder abrir a conversa por Utility (R$ 0,04) ou através de CTWA (R$ 0,00).*

---

## 2. A ESTRATÉGIA DOS 4 PILARES DE CUSTO MÍNIMO

### 🚀 Pilar 1: O "Cavalo de Troia da Utilidade" (Utility ➔ 24h Free Window)
1. **O Gatilho:** Envie um template categorizado e aprovado como **UTILITY** (custo de apenas centavos).
2. **A Isca Interativa:** O template deve conter um botão rápido (`QUICK_REPLY`) irresistível de responder (Ex: *"Confirmar Presença"*, *"Ver Horários"*, *"Sim, estou a caminho"*).
3. **O Destravamento da Janela:** No milissegundo em que o cliente clica no botão, a Meta abre a **Janela Gratuita de 24h de Atendimento (Service Conversation)**.
4. **O Upsell & Venda:** Durante as 24h seguintes, todo o atendimento com IA, áudios, envio de catálogo de serviços, fotos e ofertas acontece com **CUSTO ZERO DE MARKETING**.

---

### 🎯 Pilar 2: Maximização da Janela de 72 Horas Grátis (CTWA)
- Todo anúncio da Meta (Meta Ads) com destino para o WhatsApp gera uma **Janela de 72 Horas com Isenção Total de Tarifas de Conversa da Meta**.
- **Tática Operacional:** Configure a tag de atribuição no SOS Sales para registrar a origem CTWA e concentrar todo o fechamento comercial, follow-ups de agendamento e envio de Pix dentro desses 3 dias iniciais sem pagar 1 centavo à Meta.

---

### 🛡️ Pilar 3: Roteamento Híbrido Soberano (WABA + WAHA)
- **WABA (Meta Oficial):** Usado para reativação pós-24h, agendamentos transacionais, WhatsApp Flows (formulários nativos) e Pix Oficial interativo (`order_details`).
- **WAHA (WhatsApp Web):** Usado para grupos de monitoramento, conversas longas e fluxos de contingência sem tarifação por mensagem.

---

### ⚡ Pilar 4: Regras Estritas de Engenharia de Template para Aprovação na Meta

Para a IA da Meta aprovar seus templates na hora e classificar como **UTILITY**:

1. **Estrutura de Variáveis (Regra Inviolável):**
   - ❌ **ERRADO (Rejeição imediata):** `Olá {{1}}! Segue chave Pix: {{2}}` *(Variável no fim sem texto)*.
   - ✅ **CORRETO:** `Olá {{1}}, tudo bem? Passando para confirmar seu atendimento de {{2}} com nossa equipe. Podemos confirmar sua presença?`
   - **Regra:** Variáveis nunca podem estar no início isolado ou no fim da mensagem. Sempre inclua palavras e pontuação após cada variável `{{n}}`.

2. **Botões Rápidos (Quick Reply):**
   - ❌ **ERRADO:** `⭐⭐⭐⭐⭐ Excelente!` *(Emojis e caracteres especiais não são permitidos em botões)*.
   - ✅ **CORRETO:** `Confirmar Presenca`, `Estou a Caminho`, `Excelente Atendimento`.
   - Máximo de 20 caracteres por botão.

3. **Exemplos Obrigatórios (`example.body_text`):**
   - Toda submissão com variáveis exige amostras realistas no payload (ex: `[["Maria", "15:00", "Unidade Centro"]]`).

4. **Nomenclatura Padrão:**
   - Use sempre `snake_case` com versão: `confirmacao_agendamento_v1`, `lembrete_2h_atendimento_v1`.

---

## 3. TEMPLATES MESTRES PRONTOS PARA ECONOMIA MÁXIMA

### Template 1: Confirmação & Blindagem de Horário (UTILITY)
- **Nome:** `confirmacao_agendamento_v1`
- **Categoria:** `UTILITY` (Custo: ~R$ 0,04)
- **Cabeçalho:** `Confirmação de Atendimento`
- **Corpo:** `Olá {{1}}! Passando para confirmar seu atendimento agendado para {{2}} às {{3}}. Podemos confirmar sua presença?`
- **Botão:** `Confirmar Presença`
- **Efeito:** Custo de centavos. Quando o cliente clica, destrava 24h gratuitas para vender pacotes adicionais.

### Template 2: Lembrete de Encaixe Imediato (UTILITY)
- **Nome:** `lembrete_2h_atendimento_v1`
- **Categoria:** `UTILITY` (Custo: ~R$ 0,04)
- **Cabeçalho:** `Seu Horário é Hoje`
- **Corpo:** `Olá {{1}}! Lembramos que seu atendimento está marcado para hoje às {{2}} na unidade {{3}}. Estamos prontos para te receber!`
- **Botão:** `Estou a Caminho`

### Template 3: Reativação Inteligente de Base (MARKETING OTIMIZADO)
- **Nome:** `reativacao_lead_esfriado_v1`
- **Categoria:** `MARKETING`
- **Cabeçalho:** `Condição Especial VIP`
- **Corpo:** `Olá {{1}}, tudo bem? Notamos seu interesse recente em nossos serviços. Preparamos uma condição exclusiva com vagas limitadas para esta semana. Deseja conferir os horários disponíveis?`
- **Botão:** `Quero Ver Horários`

### Template 4: Oferta Relâmpago com Escassez (MARKETING OTIMIZADO)
- **Nome:** `oferta_relampago_vip_v1`
- **Categoria:** `MARKETING`
- **Cabeçalho:** `Apenas Hoje`
- **Corpo:** `Olá {{1}}! Liberamos 3 vagas promocionais com 20% de desconto para atendimentos agendados ainda hoje. Deseja garantir sua vaga?`
- **Botão:** `Garantir com Desconto`

---

## 4. CHECKLIST ANTES DE CRIAR QUALQUER TEMPLATE NO SOS SALES

- [ ] A mensagem pode ser enquadrada como **UTILITY** (confirmação, lembrete, aviso operacional)? Se sim, marque Utility.
- [ ] As variáveis possuem texto e pontuação antes e depois?
- [ ] O botão rápido possui apenas texto (sem emojis)?
- [ ] O payload contém o bloco `example` preenchido?
- [ ] O nome está em letras minúsculas com underscores (`_`)?
