import { describe, expect, it, vi } from 'vitest';
import { CompositeDependencyHealthProvider } from '../../src/infrastructure/health/composite-dependency-health-provider.js';

describe('CompositeDependencyHealthProvider', () => {
  it('returns an empty array when there are no probes', async () => {
    const provider = new CompositeDependencyHealthProvider([]);

    await expect(provider.checkAll()).resolves.toEqual([]);
  });

  it('reports every probe as healthy when all checks pass', async () => {
    const provider = new CompositeDependencyHealthProvider([
      { name: 'postgres', check: async () => true },
      { name: 'redis', check: async () => true },
    ]);

    await expect(provider.checkAll()).resolves.toEqual([
      { name: 'postgres', healthy: true },
      { name: 'redis', healthy: true },
    ]);
  });

  it('reports a probe as unhealthy with a generic reason when it resolves false', async () => {
    const provider = new CompositeDependencyHealthProvider([
      { name: 'postgres', check: async () => false },
    ]);

    await expect(provider.checkAll()).resolves.toEqual([
      { name: 'postgres', healthy: false, reason: 'unavailable' },
    ]);
  });

  it('degrades a throwing probe to unhealthy instead of rejecting the whole check', async () => {
    const provider = new CompositeDependencyHealthProvider([
      {
        name: 'postgres',
        check: async () => {
          throw new Error('connection string contains credentials=secret');
        },
      },
    ]);

    const results = await provider.checkAll();

    expect(results).toEqual([{ name: 'postgres', healthy: false, reason: 'unavailable' }]);
  });

  it('isolates one failing probe from the others and preserves probe order', async () => {
    const provider = new CompositeDependencyHealthProvider([
      { name: 'postgres', check: async () => true },
      {
        name: 'redis',
        check: async () => {
          throw new Error('boom');
        },
      },
      { name: 'meta-api', check: async () => true },
    ]);

    await expect(provider.checkAll()).resolves.toEqual([
      { name: 'postgres', healthy: true },
      { name: 'redis', healthy: false, reason: 'unavailable' },
      { name: 'meta-api', healthy: true },
    ]);
  });

  it('runs probes concurrently rather than sequentially', async () => {
    const order: string[] = [];
    const slow = {
      name: 'slow',
      check: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('slow');
        return true;
      }),
    };
    const fast = {
      name: 'fast',
      check: vi.fn(async () => {
        order.push('fast');
        return true;
      }),
    };
    const provider = new CompositeDependencyHealthProvider([slow, fast]);

    await provider.checkAll();

    expect(order).toEqual(['fast', 'slow']);
  });
});
