import { describe, expect, it } from 'vitest';
import { RedisDependencyHealthProvider } from '../../src/infrastructure/health/redis-dependency-health-provider.js';

describe('RedisDependencyHealthProvider', () => {
  it('reports healthy when redis responds PONG', async () => {
    const provider = new RedisDependencyHealthProvider({
      ping: async () => 'PONG',
    });

    await expect(provider.checkAll()).resolves.toEqual([{ name: 'redis', healthy: true }]);
  });

  it('reports unhealthy with a reason when redis responds with an unexpected value', async () => {
    const provider = new RedisDependencyHealthProvider({
      ping: async () => 'WRONG',
    });

    await expect(provider.checkAll()).resolves.toEqual([
      { name: 'redis', healthy: false, reason: 'unavailable' },
    ]);
  });

  it('reports unhealthy without throwing when the redis client rejects', async () => {
    const provider = new RedisDependencyHealthProvider({
      ping: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    await expect(provider.checkAll()).resolves.toEqual([
      { name: 'redis', healthy: false, reason: 'unavailable' },
    ]);
  });

  it('does not leak the underlying error message into the reported reason', async () => {
    const provider = new RedisDependencyHealthProvider({
      ping: async () => {
        throw new Error('password authentication failed for user "redis-admin"');
      },
    });

    const [status] = await provider.checkAll();

    expect(status.reason).toBe('unavailable');
  });
});
