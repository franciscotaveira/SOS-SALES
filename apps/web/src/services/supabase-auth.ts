/**
 * SOS Sales V3 — Supabase Auth Client for Commercial Individual Identity (AC15)
 * Connects commercial login to Supabase GoTrue Auth (OTP / Magic Link).
 * Uses JWT verified via server-side Supabase JWKS provider.
 * Zero client-side master keys.
 */

export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseAuthConfig(): SupabaseAuthConfig | null {
  const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseAuthConfig() !== null;
}

export interface OtpResponse {
  success: boolean;
  message?: string;
}

export interface VerifyOtpResponse {
  token: string | null;
  email?: string;
  error?: string;
}

/**
 * Sends a one-time passcode (OTP) or magic link to the operator's registered email.
 */
export async function sendSupabaseOtp(email: string): Promise<OtpResponse> {
  const config = getSupabaseAuthConfig();
  if (!config) {
    return {
      success: false,
      message: "Provedor de autenticação comercial não configurado (AC15).",
    };
  }

  try {
    const res = await fetch(`${config.url}/auth/v1/otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        create_user: false, // Strict: operators must be pre-provisioned administratively
      }),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      const msg = errorJson.msg || errorJson.error_description || "Falha ao enviar código de acesso.";
      return { success: false, message: msg };
    }

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Erro de conexão com o provedor de identidade.",
    };
  }
}

/**
 * Verifies the 6-digit OTP code sent to the operator's email.
 */
export async function verifySupabaseOtp(
  email: string,
  token: string
): Promise<VerifyOtpResponse> {
  const config = getSupabaseAuthConfig();
  if (!config) {
    return {
      token: null,
      error: "Provedor de autenticação comercial não configurado (AC15).",
    };
  }

  try {
    const res = await fetch(`${config.url}/auth/v1/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
      },
      body: JSON.stringify({
        type: "email",
        email: email.trim().toLowerCase(),
        token: token.trim(),
      }),
    });

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      const msg = errorJson.msg || errorJson.error_description || "Código de acesso inválido ou expirado.";
      return { token: null, error: msg };
    }

    const data = await res.json();
    const accessToken = data.access_token || null;

    if (!accessToken) {
      return { token: null, error: "Resposta do provedor não contém token de acesso válido." };
    }

    return { token: accessToken, email: data.user?.email };
  } catch (err: unknown) {
    return {
      token: null,
      error: err instanceof Error ? err.message : "Erro de conexão ao verificar código.",
    };
  }
}

/**
 * Extracts access_token from URL hash fragment if redirected from a Supabase magic link.
 * Example: https://app.com/#access_token=eyJhb...&expires_in=3600&token_type=bearer
 */
export function extractHashAccessToken(): string | null {
  if (typeof window === "undefined" || !window.location.hash) {
    return null;
  }

  try {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");

    if (token && token.trim()) {
      // Clean hash from browser URL without triggering reload
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.search
      );
      return token.trim();
    }
  } catch {
    // Ignore hash parsing errors
  }

  return null;
}
