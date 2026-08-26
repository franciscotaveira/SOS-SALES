# 🏛️ Tese Fundamental SOS Sales v2.0 — Commercial Cognition Engine
> **Autor:** Francisco Rios | MCT LTDA | Chapecó, BR  
> **Referência:** Apostila Mãe v2 + Codex Domain Model + MCT OS Kernel v2.0  
> **Filosofia:** Poder invisível, simplicidade visível.  

---

## 1. DEFINIÇÃO CENTRAL

> **O SOS Sales não é um CRM passivo nem um disparador de mensagens.**  
> Ele é um **Commercial Cognition Engine**: um núcleo inteligente que transforma contexto e evidência em conhecimento, conhecimento em decisão, decisão em ação governada, ação em resultado e resultados em aprendizado organizacional.

A unidade de inteligência do produto é a sequência contínua:
$$\text{CONTEXTO} \longrightarrow \text{CONHECIMENTO} \longrightarrow \text{DECISÃO} \longrightarrow \text{AÇÃO} \longrightarrow \text{RESULTADO} \longrightarrow \text{APRENDIZADO}$$

---

## 2. A PERGUNTA-MÃE DO SISTEMA

> **"Dado o estado decisório e o estado de conhecimento atuais, qual é o MENOR PRÓXIMO MOVIMENTO capaz de reduzir incerteza relevante, remover uma fricção ou conquistar um microcompromisso?"**

---

## 3. OS 5 PRINCÍPIOS OPERACIONAIS (TESE v2)

### 3.1 Continuidade Cognitiva
O atendimento **nunca** deve reiniciar uma decisão de compra que já começou. O sistema preserva rigorosamente a origem, o gancho do anúncio, a intenção expressa, decisões anteriores, compromissos e fatos já conhecidos.

### 3.2 Estado de Conhecimento da Oportunidade (EKO)
O pipeline convencional informa apenas *onde* o lead está. O **EKO (Opportunity Knowledge State)** informa o *quanto realmente entendemos da oportunidade*: fatos observados, nível de evidência e confiança epistemológica.

### 3.3 Engenharia Cognitiva de Perguntas
Perguntar é uma intervenção comercial com custo de atenção e atrito. O sistema **só deve perguntar** quando a lacuna de informação puder alterar materialmente a decisão ou a ação comercial atual.

### 3.4 Ação Mínima Útil
Executar sempre o menor movimento necessário para avançar o cliente: sugerir 2 horários em vez de mandar a grade inteira; enviar a chave Pix em vez de pedir confirmações redundantes; usar a resposta sugerida da IA em 1 toque.

### 3.5 Aprendizado Organizacional Governado
Uma conversa melhora a oportunidade atual; o conjunto de conversas melhora as regras da organização. Hipóteses comerciais validadas em campo tornam-se regras automáticas.

---

## 4. COMBATE À REGRESSÃO COGNITIVA COMERCIAL

A tese formaliza como **Regressão Cognitiva Comercial** o ato de exigir do cliente esforço para reafirmar o que ele já decidiu. O SOS Sales proíbe e previne:

| Violação (Regressão) | Regra de Ouro SOS Sales |
| :--- | :--- |
| **Cliente veio de anúncio específico** | Proibido responder *"Olá, como posso ajudar?"*. Abertura obrigatória com o gancho da oferta (`offerHook`). |
| **Cliente já expressou o serviço desejado** | Proibido perguntar o serviço novamente. Avançar direto para qualificação/horários. |
| **Cliente já pediu horário/preço** | Proibido enviar apresentações institucionais longas. Entregar horários ou valores imediatamente. |
| **Cliente aceitou o fechamento** | Proibido reabrir discovery. Injetar chave Pix / link de pagamento em 1 toque. |

---

## 5. ESTRUTURA DO MOTOR COGNITIVO (PODER INVISÍVEL)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TRÍADE SOBERANA SOS SALES                       │
├──────────────────────┬──────────────────────────┬──────────────────────┤
│ 1. WHATSAPP          │ 2. MOTOR INVISÍVEL DE IA │ 3. ATRIBUIÇÃO META   │
│ OPERACIONAL          │ (ANTI-REGRESSÃO + EKO)   │ ADS (PROOF OF ROI)   │
│ • Dual Engine (WABA/ │ • Radar de Potencial     │ • Evidence-Based     │
│   WAHA Evolution)    │   (🔥 Quente / ⚡ / ❄️)   │   Attribution        │
│ • Áudio & Anexos     │ • Linha Tática Única     │ • Campanha, Anúncio, │
│ • Caixinha de        │ • Fatos Conhecidos com   │   Criativo e Gancho  │
│   Atalhos Popover    │   Confiança (KnownFacts) │ • Conexão Direta     │
│ • Alta Velocidade    │ • Ação Mínima Útil       │   Marketing → Caixa  │
└──────────────────────┴──────────────────────────┴──────────────────────┘
```

---

## 6. ERGONOMIA DE BAIXA CARGA COGNITIVA (FRONTEND)

1. **Modo Foco em 2 Colunas:** Fila Lateral à esquerda + Chat Amplo no centro.
2. **Dossiê do Lead Sob Demanda:** Fica recolhido por padrão. Um botão `🧠 Dossiê` no cabeçalho abre o Drawer lateral com a origem Meta Ads, fatos conhecidos e notas quando o vendedor desejar.
3. **Linha Tática Única:** Uma única linha limpa acima do input de digitação contendo o próximo passo recomendado pela IA e botão `[Usar Resposta]`.
4. **Zero Redundâncias:** Todas as ferramentas comerciais (Pix, Horários, Oferta, WABA, Endereço e Catálogo) vivem exclusivamente dentro do botão `⚡ Ferramentas & Atalhos`.
5. **Grupos Orientados a Sinal:** A IA filtra o ruído de conversas paralelas nos grupos e emite alertas apenas para dúvidas de compra, pedidos de suporte ou menções.
