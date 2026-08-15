import { createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import React from 'react';
import { salesOsRuntimeConfig } from '../config/runtime';

export interface SupabaseAuthState {
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

type SupabaseClientConfig = {
  url: string;
  anonKey: string;
};

function getClientConfig(
  env: Record<string, string | boolean | undefined> = import.meta.env,
): SupabaseClientConfig | null {
  if (salesOsRuntimeConfig.mode !== 'api' || !salesOsRuntimeConfig.supabaseUrl) return null;

  const anonKey = typeof env.VITE_SUPABASE_ANON_KEY === 'string'
    ? env.VITE_SUPABASE_ANON_KEY.trim()
    : '';

  // Keep this check aligned with runtime.ts. A client is never created from
  // partially configured values, including in a production browser bundle.
  if (anonKey.length < 20 || /\s/.test(anonKey)) return null;
  return { url: salesOsRuntimeConfig.supabaseUrl, anonKey };
}

let singleton: SupabaseClient | null | undefined;

/**
 * Creates the browser Supabase client only in explicitly configured API mode.
 * The anon/publishable key is expected in a browser application; all
 * authorization remains enforced by JWT verification plus API/RLS policies.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (singleton !== undefined) return singleton;

  const config = getClientConfig();
  singleton = config
    ? createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    : null;
  return singleton;
}

/** Reusable bearer provider for every authenticated SOS Sales HTTP adapter. */
export async function getSupabaseAccessToken(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

const SupabaseAuthContext = React.createContext<SupabaseAuthState | null>(null);

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const client = getSupabaseClient();
  const [isLoading, setIsLoading] = React.useState(Boolean(client));
  const [session, setSession] = React.useState<Session | null>(null);

  React.useEffect(() => {
    if (!client) {
      setIsLoading(false);
      return;
    }

    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [client]);

  const value = React.useMemo<SupabaseAuthState>(() => ({
    isLoading,
    session,
    user: session?.user ?? null,
    async signInWithPassword(email: string, password: string) {
      if (!client) throw new Error('Supabase não está configurado para este ambiente.');
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Não foi possível iniciar a sessão. Verifique e-mail e senha.');
    },
    async signOut() {
      if (!client) return;
      const { error } = await client.auth.signOut();
      if (error) throw new Error('Não foi possível encerrar a sessão.');
    },
  }), [client, isLoading, session]);

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
}

export function useSupabaseAuth(): SupabaseAuthState {
  const context = React.useContext(SupabaseAuthContext);
  if (!context) throw new Error('useSupabaseAuth deve ser usado dentro de SupabaseAuthProvider.');
  return context;
}
