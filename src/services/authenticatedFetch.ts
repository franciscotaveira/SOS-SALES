import { getSupabaseAccessToken } from './supabaseAuth';

/**
 * Executes a fetch request with the Supabase JWT Bearer token automatically injected.
 * Used across the frontend to prevent 401 Unauthorized regressions.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = await getSupabaseAccessToken();
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}
