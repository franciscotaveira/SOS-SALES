import { describe, it, expect } from 'vitest';
import {
  assertNotProductionTarget,
  validateLabEnvironmentIsolation,
} from '../../src/infrastructure/security/lab-environment-guard.js';

describe('LabEnvironmentGuard', () => {
  it('allows local and lab URLs', () => {
    expect(() =>
      assertNotProductionTarget('postgresql://postgres:postgres@localhost:55432/postgres', 'DATABASE_URL')
    ).not.toThrow();

    expect(() =>
      assertNotProductionTarget('http://127.0.0.1:55431/auth/v1', 'SUPABASE_URL')
    ).not.toThrow();

    expect(() =>
      assertNotProductionTarget('http://host.docker.internal:55431', 'LAB_SUPABASE_URL')
    ).not.toThrow();
  });

  it('throws fail-closed error if production project ref is detected', () => {
    expect(() =>
      assertNotProductionTarget('https://yiiuebhyqixzluguxsqi.supabase.co', 'SUPABASE_URL')
    ).toThrow(/FAIL-CLOSED LAB GUARD/);

    expect(() =>
      assertNotProductionTarget('postgresql://postgres:pass@aws-0-ca-central-1.pooler.supabase.com:6543/postgres', 'DATABASE_URL')
    ).toThrow(/FAIL-CLOSED LAB GUARD/);

    expect(() =>
      assertNotProductionTarget('https://crm.iaparavendas.tech', 'VITE_SOS_API_URL')
    ).toThrow(/FAIL-CLOSED LAB GUARD/);

    expect(() =>
      assertNotProductionTarget('http://179.197.72.221:8080', 'WAHA_URL')
    ).toThrow(/FAIL-CLOSED LAB GUARD/);
  });

  it('validates entire environment record in lab mode', () => {
    const safeEnv = {
      NODE_ENV: 'development',
      LAB_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
      LAB_SUPABASE_URL: 'http://127.0.0.1:55431',
    };
    expect(() => validateLabEnvironmentIsolation(safeEnv)).not.toThrow();

    const taintedEnv = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://postgres:pass@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
    };
    expect(() => validateLabEnvironmentIsolation(taintedEnv)).toThrow(/FAIL-CLOSED LAB GUARD/);
  });
});
