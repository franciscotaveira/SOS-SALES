import {
  DependencyHealthProvider,
  DependencyStatus,
} from '../../application/ports/dependency-health-provider.js';

/** Lightweight Redis readiness adapter. It owns no business data or credentials. */
export class RedisDependencyHealthProvider implements DependencyHealthProvider {
  constructor(private readonly redis: { ping: () => Promise<string> }) {}

  async checkAll(): Promise<DependencyStatus[]> {
    try {
      const response = await this.redis.ping();
      return [{ name: 'redis', healthy: response === 'PONG', ...(response === 'PONG' ? {} : { reason: 'unavailable' }) }];
    } catch {
      return [{ name: 'redis', healthy: false, reason: 'unavailable' }];
    }
  }
}
