import {
  DependencyHealthProvider,
  DependencyStatus,
} from '../../application/ports/dependency-health-provider.js';

export interface DependencyProbe {
  name: string;
  check: () => Promise<boolean>;
}

/**
 * Runs all mandatory readiness probes and converts probe failures to a
 * deliberately non-sensitive degraded status. A readiness endpoint must not
 * fail with an unhandled 500 merely because its probe failed.
 */
export class CompositeDependencyHealthProvider implements DependencyHealthProvider {
  constructor(private readonly probes: readonly DependencyProbe[]) {}

  async checkAll(): Promise<DependencyStatus[]> {
    return Promise.all(
      this.probes.map(async (probe): Promise<DependencyStatus> => {
        try {
          const healthy = await probe.check();
          return healthy
            ? { name: probe.name, healthy: true }
            : { name: probe.name, healthy: false, reason: 'unavailable' };
        } catch {
          return { name: probe.name, healthy: false, reason: 'unavailable' };
        }
      })
    );
  }
}
