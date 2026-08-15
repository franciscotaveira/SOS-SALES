export type SalesOsRuntimeMode = 'demo' | 'api' | 'unconfigured';

export interface SalesOsRuntimeConfig {
  mode: SalesOsRuntimeMode;
  apiUrl?: string;
  /** Human-readable explanation intended for the visible safe-failure state. */
  reason?: string;
  /** Makes the local fixture data unmistakable in non-production builds. */
  isDevelopmentFallback: boolean;
}

function readFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function normalizeApiUrl(value: string): string | null {
  try {
    const url = new URL(value, globalThis.location?.origin ?? 'http://localhost');
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * Resolve transport mode once, before the app starts loading commercial data.
 *
 * Production is intentionally fail-closed: fixture data is never selected as a
 * fallback there. Development may use the visual prototype only when no API URL
 * has been supplied; the UI exposes that state as a demo.
 */
export function resolveSalesOsRuntimeConfig(
  env: Record<string, string | boolean | undefined> = import.meta.env,
): SalesOsRuntimeConfig {
  const demoRequested = readFlag(typeof env.VITE_DEMO_MODE === 'string' ? env.VITE_DEMO_MODE : undefined);
  const rawApiUrl = typeof env.VITE_SOS_API_URL === 'string' ? env.VITE_SOS_API_URL.trim() : '';
  const isDevelopment = env.DEV === true || env.MODE === 'development';

  if (demoRequested && rawApiUrl) {
    return {
      mode: 'unconfigured',
      reason: 'VITE_DEMO_MODE e VITE_SOS_API_URL não podem ser usados juntos.',
      isDevelopmentFallback: false,
    };
  }

  if (demoRequested) {
    return { mode: 'demo', isDevelopmentFallback: false };
  }

  if (rawApiUrl) {
    const apiUrl = normalizeApiUrl(rawApiUrl);
    if (!apiUrl) {
      return {
        mode: 'unconfigured',
        reason: 'VITE_SOS_API_URL precisa ser uma URL HTTP(S) sem credenciais, query ou fragmento.',
        isDevelopmentFallback: false,
      };
    }
    return { mode: 'api', apiUrl, isDevelopmentFallback: false };
  }

  if (isDevelopment) {
    return {
      mode: 'demo',
      reason: 'Nenhuma API configurada: usando dados de demonstração somente neste ambiente de desenvolvimento.',
      isDevelopmentFallback: true,
    };
  }

  return {
    mode: 'unconfigured',
    reason: 'Configure VITE_SOS_API_URL para operar com dados autenticados ou VITE_DEMO_MODE=true apenas para demonstração.',
    isDevelopmentFallback: false,
  };
}

export const salesOsRuntimeConfig = resolveSalesOsRuntimeConfig();
