/**
 * Public SOS Vendas offer catalog.
 *
 * Keep the prices here aligned with the active Cakto offers and use this
 * catalog whenever the API needs a fallback description for the agent. A
 * workspace's published catalog still takes precedence over these defaults.
 */
export const SOS_SALES_OFFERS = {
  monthly: {
    code: 'standard-monthly',
    name: 'Plano Mensal Flexível',
    priceMinor: 9700,
    displayPrice: 'R$ 97,00/mês',
    terms: 'sem fidelidade',
  },
  annualPix: {
    code: 'standard-annual-pix',
    name: 'Plano Anual no Pix',
    priceMinor: 58200,
    displayPrice: 'R$ 582,00 à vista',
    terms: '50% OFF no lançamento',
  },
  annualCard: {
    code: 'standard-annual-card',
    name: 'Plano Anual no Cartão',
    priceMinor: 69840,
    displayPrice: '12x de R$ 58,20',
    terms: '40% OFF no lançamento',
  },
} as const;

export const SOS_SALES_DEFAULT_CATALOG_TEXT = [
  `- ${SOS_SALES_OFFERS.monthly.name}: ${SOS_SALES_OFFERS.monthly.displayPrice} (${SOS_SALES_OFFERS.monthly.terms})`,
  `- ${SOS_SALES_OFFERS.annualPix.name}: ${SOS_SALES_OFFERS.annualPix.displayPrice} (${SOS_SALES_OFFERS.annualPix.terms})`,
  `- ${SOS_SALES_OFFERS.annualCard.name}: ${SOS_SALES_OFFERS.annualCard.displayPrice} (${SOS_SALES_OFFERS.annualCard.terms})`,
].join('\n');

export const SOS_SALES_DEFAULT_PRICE_SUMMARY =
  'Mensal R$ 97,00/mês; anual no Pix R$ 582,00 à vista (50% OFF); anual no cartão 12x de R$ 58,20 (40% OFF).';
