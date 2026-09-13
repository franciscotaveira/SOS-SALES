import { getSupabaseAccessToken } from './supabaseAuth';
import { salesOsRuntimeConfig } from '../config/runtime';

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

  let finalInput = input;
  if (typeof input === 'string') {
    const baseUrl = salesOsRuntimeConfig.apiUrl?.replace(/\/$/, '');
    if (baseUrl) {
      if (input.startsWith('/api/v1')) {
        const pathSuffix = input.slice('/api/v1'.length);
        finalInput = `${baseUrl}${pathSuffix}`;
      } else if (input.startsWith('/') && !input.startsWith('//')) {
        finalInput = `${baseUrl}${input}`;
      }
    }
  }

  return fetch(finalInput, {
    ...init,
    headers,
  });
}

