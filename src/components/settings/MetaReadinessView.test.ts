import { describe, expect, it, vi } from 'vitest';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import { fetchMetaReadiness, MetaReadinessView } from './MetaReadinessView';

vi.mock('../../services/authenticatedFetch', () => ({ authenticatedFetch: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Meta readiness request lifetime', () => {
  it('discards the old workspace response even if its transport ignores cancellation', async () => {
    const oldBody = deferred<unknown>();
    vi.mocked(authenticatedFetch)
      .mockResolvedValueOnce({ ok: true, json: () => oldBody.promise } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { workspace: 'B' } }) } as Response);
    const old = new AbortController();
    const pending = fetchMetaReadiness('A', old.signal);
    old.abort();
    const current = await fetchMetaReadiness('B', new AbortController().signal);
    oldBody.resolve({ data: { workspace: 'A' } });
    expect(current).toEqual({ workspace: 'B' });
    expect(await pending).toBeNull();
    expect(authenticatedFetch).toHaveBeenCalledWith('/api/v1/workspaces/A/meta-readiness', { signal: old.signal });
  });

  it('ignores an obsolete error but propagates a current failure', async () => {
    const oldResponse = deferred<Response>();
    vi.mocked(authenticatedFetch).mockReturnValueOnce(oldResponse.promise);
    const old = new AbortController();
    const pending = fetchMetaReadiness('A', old.signal);
    old.abort();
    oldResponse.resolve({ ok: false, json: async () => ({ error: 'old failure' }) } as Response);
    expect(await pending).toBeNull();
    vi.mocked(authenticatedFetch).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'current failure' }) } as Response);
    await expect(fetchMetaReadiness('B', new AbortController().signal)).rejects.toThrow('current failure');
  });

  it('gives different workspaces distinct React identities so prior state is not reused', () => {
    expect(MetaReadinessView({ workspaceId: 'A' }).key).toBe('A');
    expect(MetaReadinessView({ workspaceId: 'B' }).key).toBe('B');
  });
});
