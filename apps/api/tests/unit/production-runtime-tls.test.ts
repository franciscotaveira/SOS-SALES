import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { X509Certificate } from 'node:crypto';
import {
  buildReadinessStatuses,
  normalizeDatabaseHostname,
  resolveDatabaseSslConfig,
} from '../../src/infrastructure/runtime/production-runtime-helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const API_RUNTIME = resolve(HERE, '../../production-runtime.mjs');
const DEPLOY_RUNTIME = resolve(HERE, '../../../../deploy/production-runtime.mjs');
const PROD_COMPOSE = resolve(HERE, '../../../../docker-compose.prod.yml');
const VPS_COMPOSE = resolve(HERE, '../../../../deploy/docker-compose.prod.yml');
const SUPABASE_CA = resolve(HERE, '../../../../certs/supabase-ca.crt');
const STAGE_SCRIPT = resolve(HERE, '../../../../scripts/stage-production-release.sh');
const PROMOTE_SCRIPT = resolve(HERE, '../../../../scripts/promote-production-release.sh');
const ROLLBACK_SCRIPT = resolve(HERE, '../../../../scripts/rollback-production-release.sh');

describe('production database TLS contract', () => {
  for (const runtimePath of [API_RUNTIME, DEPLOY_RUNTIME]) {
    it(`requires a trusted CA in ${runtimePath}`, () => {
      const source = readFileSync(runtimePath, 'utf8');

      expect(source).toContain('resolveDatabaseSslConfig');
      expect(source).toContain('buildReadinessStatuses');
      expect(source).not.toMatch(/rejectUnauthorized\s*:\s*false/);
      expect(source).not.toContain('EnvironmentWebhookSecretProvider');
      expect(source).toContain('globalWebhookSecret');
    });
  }

  it('keeps both deployment runtime copies behaviorally aligned', () => {
    const apiRuntime = readFileSync(API_RUNTIME, 'utf8');
    const deployRuntime = readFileSync(DEPLOY_RUNTIME, 'utf8').replace(
      "from '../dist/index.js'",
      "from './dist/index.js'",
    );

    expect(deployRuntime).toBe(apiRuntime);
  });

  it('rejects a remote no-CA connection even when DATABASE_SSL=false', () => {
    expect(() => resolveDatabaseSslConfig(
      'postgresql://user:password@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
      { DATABASE_SSL: 'false' },
    )).toThrow('DATABASE_SSL_CA or DATABASE_SSL_CA_FILE is required');
  });

  it('enforces certificate verification for a remote database with a trusted CA', () => {
    expect(resolveDatabaseSslConfig(
      'postgresql://user:password@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
      { DATABASE_SSL_CA: 'trusted-ca' },
    )).toEqual({ rejectUnauthorized: true, ca: 'trusted-ca' });
  });

  it('allows a truly local database without a CA', () => {
    expect(resolveDatabaseSslConfig(
      'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
      {},
    )).toBe(false);
    expect(resolveDatabaseSslConfig(
      'postgresql://postgres:postgres@db:5432/postgres',
      {},
    )).toBe(false);
  });

  it('allows the IPv6 loopback database without a CA', () => {
    expect(resolveDatabaseSslConfig(
      'postgresql://postgres:postgres@[::1]:55432/postgres',
      {},
    )).toBe(false);
    expect(normalizeDatabaseHostname('[::1]')).toBe('::1');

    for (const runtimePath of [API_RUNTIME, DEPLOY_RUNTIME]) {
      const source = readFileSync(runtimePath, 'utf8');
      expect(source).toContain('host: normalizeDatabaseHostname(u.hostname)');
    }
  });

  it('reports all active production worker readiness names', () => {
    const healthyWorker = { isHealthy: () => true };

    expect(buildReadinessStatuses(healthyWorker, {
      outbound: healthyWorker,
      receptionist: healthyWorker,
    })).toEqual([
      { name: 'waha-inbound-worker', healthy: true },
      { name: 'outbound-worker', healthy: true },
      { name: 'receptionist-worker', healthy: true },
    ]);
  });

  it('injects the WABA channel-info gateway in the runtime returned to the server', () => {
    const source = readFileSync(API_RUNTIME, 'utf8');

    expect(source).toContain('new PostgresWabaChannelInfoGateway(pool)');
    expect(source).toMatch(/return \{[\s\S]*\bwabaChannelInfoGateway,/);
  });

  for (const composePath of [PROD_COMPOSE, VPS_COMPOSE]) {
    it(`mounts the Supabase CA read-only in ${composePath}`, () => {
      const compose = readFileSync(composePath, 'utf8');

      expect(compose).toContain('DATABASE_SSL_CA_FILE=/run/secrets/supabase-ca.crt');
      expect(compose).toContain('SOS_SALES_RUNTIME_FACTORY=');
      expect(compose).toContain('supabase-ca.crt:/run/secrets/supabase-ca.crt:ro');
    });
  }

  it('ships the trusted Supabase CA artifact referenced by both compose files', () => {
    const certificate = readFileSync(SUPABASE_CA, 'utf8');
    const parsedCertificate = new X509Certificate(certificate);

    expect(certificate).toContain('-----BEGIN CERTIFICATE-----');
    expect(certificate).toContain('-----END CERTIFICATE-----');
    expect(parsedCertificate.fingerprint256).toBe(
      '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
    );
  });

  it('ships dependencies with the immutable API release and verifies recovery', () => {
    const stage = readFileSync(STAGE_SCRIPT, 'utf8');
    const promote = readFileSync(PROMOTE_SCRIPT, 'utf8');
    const rollback = readFileSync(ROLLBACK_SCRIPT, 'utf8');

    expect(stage).toContain("${REMOTE_STAGING}/api/node_modules");
    expect(stage).toContain("grep -Eq '^META_VERIFY_TOKEN=[[:space:]]*[^[:space:]]'");
    expect(stage).toContain("grep -Eq '^META_APP_SECRET=[[:space:]]*[^[:space:]]'");
    // Production accepts the single canonical WAHA webhook secret. Requiring
    // per-channel variables here would reject the existing VPS configuration
    // and reintroduce the duplicate-secret contract this release removes.
    expect(stage).toContain("grep -Eq '^WAHA_API_KEY=[[:space:]]*[^[:space:]]'");
    expect(stage).not.toContain('WAHA_WEBHOOK_SECRET_[A-Za-z0-9_]');
    expect(promote).toContain('verify_active_release');
    expect(promote).toContain('require_base_release');
    expect(promote).toContain('verify_linked_schema_ledger');
    expect(promote).toContain('|| return 1');
    expect(promote).toContain('automatic restoration both failed');
    expect(rollback).toContain('recreate_and_verify');
    expect(rollback).toContain('require_base_release');
    expect(rollback).toContain('|| return 1');
    expect(rollback).toContain('automatic restoration both failed');
  });
});
