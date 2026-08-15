export type SalesOsRuntimeMode = 'demo' | 'api' | 'unconfigured';

export interface SalesOsRuntimeConfig {
  mode: SalesOsRuntimeMode;
  apiUrl?: string;
  supabaseUrl?: string;
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

function normalizeSupabaseUrl(value: string): string | null {
  const url = normalizeApiUrl(value);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    // Supabase projects are HTTPS in production. HTTP is deliberately allowed
    // only for local development so the local CLI stack remains usable.
    if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function normalizeSupabaseAnonKey(value: string): string | null {
  const key = value.trim();
  // Do not try to decode or display the key. Publishable/anon keys are public
  // client configuration, but a blank or malformed value must never start an
  // authenticated transport.
  return key.length >= 20 && !/\s/.test(key) ? key : null;
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
  const rawSupabaseUrl = typeof env.VITE_SUPABASE_URL === 'string' ? env.VITE_SUPABASE_URL.trim() : '';
  const rawSupabaseAnonKey = typeof env.VITE_SUPABASE_ANON_KEY === 'string' ? env.VITE_SUPABASE_ANON_KEY : '';
  const isDevelopment = env.DEV === true || env.MODE === 'development';

  if (demoRequested && (rawApiUrl || rawSupabaseUrl || rawSupabaseAnonKey)) {
    return {
      mode: 'unconfigured',
      reason: 'VITE_DEMO_MODE não pode ser usado junto com configurações autenticadas da API ou Supabase.',
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
    const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
    const supabaseAnonKey = normalizeSupabaseAnonKey(rawSupabaseAnonKey);
    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        mode: 'unconfigured',
        reason: 'A operação autenticada exige VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY válidos junto com VITE_SOS_API_URL.',
        isDevelopmentFallback: false,
      };
    }
    return { mode: 'api', apiUrl, supabaseUrl, isDevelopmentFallback: false };
  }

  if (rawSupabaseUrl || rawSupabaseAnonKey) {
    return {
      mode: 'unconfigured',
      reason: 'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY exigem também VITE_SOS_API_URL para evitar uma sessão sem transporte operacional.',
      isDevelopmentFallback: false,
    };
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
    reason: 'Configure VITE_SOS_API_URL, VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para operar com dados autenticados ou VITE_DEMO_MODE=true apenas para demonstração.',
    isDevelopmentFallback: false,
  };
}

export const salesOsRuntimeConfig = resolveSalesOsRuntimeConfig();
