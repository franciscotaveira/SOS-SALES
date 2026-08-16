/**
 * TX COMMERCIAL CORE — POSTGRES DEPENDENCY HEALTH PROVIDER
 * Development / test adapter for DependencyHealthProvider.
 * Probes the local pg pool with a lightweight query.
 * Does NOT expose internal errors in the returned status.
 */

import pg from 'pg';
import { DependencyHealthProvider, DependencyStatus } from '../../application/ports/dependency-health-provider.js';
import { dbPool } from './pool.js';

export class PostgresDependencyHealthProvider implements DependencyHealthProvider {
  private pool: pg.Pool;

  constructor(pool?: pg.Pool) {
    this.pool = pool ?? dbPool;
  }

  async checkAll(): Promise<DependencyStatus[]> {
    const statuses: DependencyStatus[] = [];

    // Database probe
    try {
      const res = await this.pool.query('SELECT 1 AS healthy');
      const healthy = res.rows[0]?.healthy === 1;
      statuses.push({ name: 'database', healthy });
    } catch {
      statuses.push({ name: 'database', healthy: false, reason: 'unreachable' });
    }

    return statuses;
  }
}
