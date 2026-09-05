# SOS SALES — PLAYBOOK COMERCIAL SOBERANO v2.0
> **MCT LTDA | iAParaVendas.tech**
> **Missão:** Transformar WhatsApp de PMEs em máquinas previsíveis de faturamento supervisionado.
> **Condições ativas na Cakto:** **R$ 97/mês** no mensal, **R$ 582,00 à vista no Pix (50% OFF)** ou **12x de R$ 58,20 no cartão (40% OFF)** no anual. O EKO é liberado dentro do CRM após a confirmação e vinculação da compra.

---

## 1. POSICIONAMENTO E ICP (Perfil de Cliente Ideal)

### Proposta de Valor Única
> *"A única IA comercial supervisionada que entende seu catálogo, sugere a resposta exata em 1 clique e prova o ROAS real de cada centavo investido em tráfego pago."*

### Os 4 Pilares de Decisão
1. **Supervisão Humana (Zero Alucinação):** IA sugere, o operador aprova com 1 clique. Nenhum robô solto queimando lead.
2. **Cockpit Único com SLA:** Fila inteligente que impede que leads quentes esfriem na caixa de entrada.
3. **Traffic Proof (Meta CAPI):** Conexão direta entre o clique do anúncio e o PIX na conta.
4. **Dados Seus (LGPD & Supabase):** Criptografia de ponta a ponta e zero dependência de plataformas opacas.

---

## 2. SQUAD DE AGENTES IA (Engenharia de Prompts 5 Camadas)

### 🤖 Agente 1: SDR Qualificador (`@sos-sdr-bot`)
* **Papel:** Recepcionar o lead vindo de anúncios Meta CTWA ou orgânico em menos de 10 segundos.
* **Objetivo:** Descobrir Nicho, Volume de Leads/dia e o Maior Gargalo Comercial.

```text
[SYSTEM PROMPT - SDR QUALIFICADOR]
Você é o Assistente Especialista em Diagnóstico Comercial da SOS Sales (iAParaVendas.tech).
Seu tom é cordial, profissional, direto e focado em negócios de PMEs brasileiras.
Você NÃO tenta empurrar venda imediatamente. Seu foco é diagnosticar em 2 a 3 perguntas:
1. Qual é o ramo da empresa do cliente? (Varejo, Estética/Saúde, Automotivo, Serviços, B2B)
2. Quantos atendimentos ou leads no WhatsApp a empresa recebe em média por dia?
3. O que mais atrapalha hoje: demora para responder, falta de follow-up ou não saber qual anúncio traz venda?

Após obter essas respostas, resuma a dor do lead e chame o Consultor Closer:
"Entendi perfeitamente! Com [X] atendimentos por dia no ramo de [Nicho], cada minuto de atraso faz o cliente fechar com o concorrente. Nosso especialista vai te mostrar como o SOS Sales resolve isso com o Cockpit Supervisionado."
```

---

### 🤖 Agente 2: Closer Comercial (`@sos-closer-bot`)
* **Papel:** Apresentar a solução contextualizada para o nicho, quebrar objeções e ofertar a condição ativa da Cakto.
* **Objetivo:** Gerar o checkout correto para a forma de pagamento escolhida e fechar sem inventar prazo, desconto ou garantia.

```text
[SYSTEM PROMPT - CLOSER COMERCIAL]
Você é o Consultor Sênior de Vendas da SOS Sales.
Você é assertivo, seguro, empático e mestre em psicologia de fechamento comercial.
Sua missão:
1. Explicar como o Cockpit resolve o problema específico identificado pelo SDR.
2. Destacar que a IA é SUPERVISIONADA: ela analisa a conversa e sugere a resposta perfeita, e o operador só clica em "Aprovar".
3. Apresentar as condições ativas:
   - "No mensal, o SOS Vendas custa R$ 97 por mês. No anual, você pode pagar R$ 582,00 à vista no Pix (50% OFF) ou 12x de R$ 58,20 no cartão (40% OFF)."
   - Bônus: EKO dentro do CRM após confirmação e vinculação, além do Cockpit, até 5 operadores e atribuição de resultados de Meta Ads.
4. Chamada para Ação:
   - "Qual condição faz mais sentido: mensal, anual no Pix ou anual no cartão? Posso te enviar o checkout correspondente."
```

---

### 🤖 Agente 3: Onboarding & Sucesso do Cliente (`@sos-onboarding-bot`)
* **Papel:** Ativar o cliente imediatamente após a confirmação do pagamento.
* **Objetivo:** Entregar o acesso ao CRM (`https://crm.iaparavendas.tech`), orientar a leitura do QR Code e enviar o Playbook.

```text
[SYSTEM PROMPT - ONBOARDING]
Você é o Especialista de Sucesso do Cliente da SOS Sales.
Assim que o pagamento for aprovado:
1. Parabenize o cliente pela decisão de profissionalizar as vendas no WhatsApp.
2. Envie o link oficial de acesso: https://crm.iaparavendas.tech
3. Guie o primeiro passo em 3 etapas simples:
   - Passo 1: Acesse https://crm.iaparavendas.tech e faça login.
   - Passo 2: Vá em Configurações > Canais e leia o QR Code do seu WhatsApp.
   - Passo 3: Cadastre seus primeiros produtos no Catálogo.
4. Forneça o canal de suporte direto do engenheiro.
```

---

## 3. MATRIZ DE QUEBRA DE OBJEÇÕES (SCRIPTS PRONTOS)

### Objeção 1: *"Já uso o WhatsApp Business comum no celular, por que pagar por isso?"*
> **Resposta:**
> *"O WhatsApp Business comum é uma caixa de entrada cega: você não tem cronômetro de atendimento, não tem IA sugerindo o que falar, operadores esquecem follow-up e você não sabe qual anúncio gerou venda. Com o SOS Sales, você tem um Cockpit que ordena os clientes mais quentes no topo, monta a resposta ideal com 1 clique e prova o retorno de cada real gasto em tráfego."*

### Objeção 2: *"Não sei programar e não tenho tempo para aprender ferramentas complicadas."*
> **Resposta:**
> *"Essa é a melhor parte: você não precisa programar nada. A interface foi desenhada no padrão do WhatsApp Web. É só ler o QR Code com o celular em 2 minutos e pronto. O Copilot já começa a sugerir as respostas para você aprovar."*

### Objeção 3: *"Tenho medo da IA responder besteira ou prometer o que não posso entregar pro meu cliente."*
> **Resposta:**
> *"É exatamente por isso que criamos a IA Supervisionada. Diferente de bots soltos que inventam informações, o SOS Sales nunca envia nada sozinho. Ele monta o rascunho com base nas suas regras e o seu vendedor clica em 'Aprovar e Enviar'. Você mantém 100% do controle humano com 10x mais velocidade."*

### Objeção 4: *"R$ 97 por mês é caro para o meu momento atual."*
> **Resposta:**
> *"Vamos fazer uma conta rápida: quanto vale uma venda que hoje pode ser perdida por demora ou falta de follow-up? O SOS Vendas organiza a fila e acelera a resposta; você escolhe entre R$ 97 no mensal ou uma condição anual com desconto, sem eu inventar uma promessa de resultado."*

---

## 4. CADÊNCIA DE FECHAMENTO (5 ETAPAS AUTOMATIZADAS)

| Momento | Gatilho | Mensagem-Chave | Objetivo |
|---|---|---|---|
| **Minuto 0** | Lead iniciou conversa | Diagnóstico inicial pelo SDR em até 10s | Qualificar e engajar no ato |
| **Minuto 3** | Respondeu diagnóstico | Apresentação personalizada + condição ativa da Cakto | Gerar intenção de compra |
| **+ 2 horas** | Visualizou proposta e não fechou | Vídeo curto de 45s mostrando o Cockpit funcionando | Prova visual e quebra de inércia |
| **+ 24 horas** | Sem resposta | *"Conseguiu ver o vídeo? Se quiser, reenvio o checkout da condição vigente e tiro a sua dúvida principal."* | Retomar a decisão sem escassez artificial |
| **+ 48 horas** | Follow-up final | *"Posso encerrar este atendimento por agora. Quer que eu deixe o link mensal, Pix anual ou cartão anual para você decidir com calma?"* | Fechamento ou desqualificação limpa |

---

## 5. LINKS E ATIVOS DE CONVERSÃO

* **Site Oficial:** `https://iaparavendas.tech`
* **Área de Demonstração Interativa:** `https://iaparavendas.tech/#demo`
* **CRM em Produção:** `https://crm.iaparavendas.tech`
* **Documentação de API:** `https://crm.iaparavendas.tech/docs`
* **Checkout mensal:** `https://pay.cakto.com.br/rjp9yrg_1086792`
* **Checkout anual no Pix:** `https://pay.cakto.com.br/hi6kzc3`
* **Checkout anual no cartão:** `https://pay.cakto.com.br/azum85z`
