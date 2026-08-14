import { GuardrailValidation } from '../types/cockpit';

export interface CommercialPolicy {
  maxDiscountPercent: number;
  minContractPeriodMonths?: number;
  allowedPaymentMethods: string[];
}

export const DEFAULT_COMMERCIAL_POLICIES: CommercialPolicy = {
  maxDiscountPercent: 15,
  minContractPeriodMonths: 3,
  allowedPaymentMethods: ['pix', 'credito', 'cartao', 'debito', 'link', 'boleto'],
};

// Patterns for secrets/PII that should never leak in chat drafts
const SENSITIVE_PATTERNS = [
  { regex: /sk-[A-Za-z0-9]{20,}/g, label: 'Chave de API (Secret Key)' },
  { regex: /Bearer\s+[A-Za-z0-9._\-]+/gi, label: 'Token de Autenticação (Bearer)' },
  { regex: /mongodb(\+srv)?:\/\/\S+/gi, label: 'URI de Banco de Dados' },
  { regex: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, label: 'Token JWT' },
];

/**
 * Validates any operator draft or AI-suggested text against commercial guardrails.
 * Adapted directly from taveira-crm's commercialGuardrailService.
 */
export function validateCommercialPolicy(
  text: string,
  policy: CommercialPolicy = DEFAULT_COMMERCIAL_POLICIES
): GuardrailValidation {
  if (!text || !text.trim()) {
    return { isValid: true, violations: [], warnings: [] };
  }

  const textLower = text.toLowerCase();
  const violations: string[] = [];
  const warnings: string[] = [];

  // 1. Detect Secret/Token Leaks (Critical)
  for (const { regex, label } of SENSITIVE_PATTERNS) {
    if (regex.test(text)) {
      violations.push(`Possível vazamento de credencial: ${label} detectado no texto.`);
    }
  }

  // 2. Detect Unauthorized Discount Percentages (> maxDiscountPercent)
  // Matches: "20%", "20 por cento", "desconto de 25%", "abatimento de 30%"
  const discountRegex = /(?:desconto|abatimento|off)?\s*(\d{1,2})\s*(?:%|por\s*cento)/gi;
  let match: RegExpExecArray | null;
  while ((match = discountRegex.exec(textLower)) !== null) {
    const percent = parseInt(match[1], 10);
    if (!isNaN(percent)) {
      if (percent > policy.maxDiscountPercent) {
        violations.push(
          `Desconto de ${percent}% ultrapassa o limite comercial permitido (${policy.maxDiscountPercent}%). Exige aprovação da gerência.`
        );
      } else if (percent >= 10) {
        warnings.push(
          `Desconto de ${percent}% aplicado. Certifique-se de registrar o motivo no dossiê.`
        );
      }
    }
  }

  // Also check inverted: "desconto de 25"
  const discountWordRegex = /(?:desconto|abatimento)\s*(?:de)?\s*(\d{1,2})(?!\s*min|\s*dias|\s*h)/gi;
  while ((match = discountWordRegex.exec(textLower)) !== null) {
    const val = parseInt(match[1], 10);
    if (!isNaN(val) && val > policy.maxDiscountPercent && val <= 100) {
      if (!violations.some((v) => v.includes(`${val}%`))) {
        violations.push(
          `Desconto de ${val}% excede o teto autorizado de ${policy.maxDiscountPercent}%.`
        );
      }
    }
  }

  // 3. Detect Prohibited Commitment Claims
  if (textLower.includes('sem compromisso') && textLower.includes('garantido')) {
    warnings.push(
      'Evite prometer reserva sem sinal ou compromisso formal de horário.'
    );
  }

  return {
    isValid: violations.length === 0,
    violations,
    warnings,
  };
}
