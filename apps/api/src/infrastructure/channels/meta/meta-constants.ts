/**
 * Meta Graph API & WhatsApp Business Platform - Centralized Governance Constants
 * 
 * Regra P0: Nunca usar versão de Graph API hardcoded espalhada pelo sistema.
 * Graph API v20.0 tem hard sunset em 24/09/2026.
 * Padrão ativo: v21.0 (ou sobrescrito via META_GRAPH_API_VERSION).
 */

export const DEFAULT_META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';
export const DEFAULT_META_GRAPH_BASE_URL = `https://graph.facebook.com/${DEFAULT_META_GRAPH_API_VERSION}`;

/**
 * Normaliza base URL da Graph API respeitando a versão configurada
 */
export function getMetaGraphBaseUrl(customBaseUrl?: string, customVersion?: string): string {
  if (customBaseUrl && customBaseUrl.trim()) {
    return customBaseUrl.replace(/\/+$/, '');
  }
  const version = customVersion || DEFAULT_META_GRAPH_API_VERSION;
  return `https://graph.facebook.com/${version.startsWith('v') ? version : `v${version}`}`;
}

/**
 * Contrato canônico de destinatário WhatsApp (compatível com Phone tradicional e BSUID / Usernames)
 */
export type WhatsAppRecipient = 
  | { type: 'PHONE'; value: string }
  | { type: 'BSUID'; value: string };

/**
 * Normaliza destinatário garantindo que tanto telefone quanto BSUID sejam aceitos
 */
export function normalizeWhatsAppRecipient(recipient: string | WhatsAppRecipient): WhatsAppRecipient {
  if (typeof recipient === 'object' && recipient !== null && 'type' in recipient) {
    return recipient;
  }
  const cleanStr = String(recipient || '').trim();
  // Se contiver letras (como BRxxx ou username/BSUID scoped), trata como BSUID
  if (/[a-zA-Z]/.test(cleanStr)) {
    return { type: 'BSUID', value: cleanStr };
  }
  // Caso contrário, normaliza dígitos de telefone
  return { type: 'PHONE', value: cleanStr.replace(/\D/g, '') };
}
