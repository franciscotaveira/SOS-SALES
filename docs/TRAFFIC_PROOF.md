# SOS Sales — Proof of Traffic & Atribuição de Tráfego

## 1. O Problema
Campanhas de WhatsApp no Meta Ads sofrem com a perda de atribuição assim que o lead inicia a conversa. Agências e gestores de tráfego dependem de estimativas imprecisas ou planilhas desconectadas.

## 2. A Solução do SOS Sales
O **Proof of Traffic** estabelece uma linha direta entre o investimento em anúncios (Meta Ads CTWA) e o faturamento real fechado no caixa da empresa:

1. **Captura no Ponto de Entrada**:
   - `campaignName`, `adCreative`, `referralOffer` e `attributedCostBrl` gravados no momento do primeiro webhook.
2. **Continuidade no Atendimento**:
   - Operador visualiza a oferta que motivou o clique diretamente no topo do Dossiê.
3. **Registro do Desfecho (Outcome)**:
   - Ao fechar a venda, o operador registra o valor (`dealValueBrl`) e serviço.
4. **Cálculo de ROAS Real**:
   $$\text{ROAS} = \frac{\text{Receita Total Atribuída (BRL)}}{\text{Investimento Comprovado em Mídia (BRL)}}$$
   - ROAS é exibido **apenas quando há custo de mídia real registrado**, evitando métricas ilusórias ou simuladas.
