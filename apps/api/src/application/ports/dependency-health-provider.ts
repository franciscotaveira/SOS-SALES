/**
 * TX COMMERCIAL CORE — DEPENDENCY HEALTH PROVIDER PORT
 * Pure domain/application interface for checking readiness of external dependencies.
 * Must NOT import Fastify, PostgreSQL, Supabase or framework code.
 */

export interface DependencyStatus {
  /** Human-readable name of the dependency (e.g. "database", "redis"). */
  name: string;
  /** Whether this dependency is currently reachable and healthy. */
  healthy: boolean;
  /** Optional human-readable reason for unhealthy state. Never expose internal errors. */
  reason?: string;
}

export interface DependencyHealthProvider {
  /**
   * Checks the health of all required dependencies.
   * Must return within a reasonable timeout; never throw.
   */
  checkAll(): Promise<DependencyStatus[]>;
}
