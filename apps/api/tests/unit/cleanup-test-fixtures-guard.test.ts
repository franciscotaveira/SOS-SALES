import { describe, it, expect } from 'vitest';
import { validateSafeLocalDatabaseTarget } from '../../scripts/cleanup-test-fixtures.mjs';

describe('Cleanup Test Fixtures — Security & Fail-Closed Guard', () => {
  it('should allow valid local loopback targets', () => {
    expect(() => validateSafeLocalDatabaseTarget('postgresql://postgres:postgres@127.0.0.1:55432/postgres')).not.toThrow();
    expect(() => validateSafeLocalDatabaseTarget('postgresql://postgres:postgres@localhost:55432/postgres')).not.toThrow();
    expect(() => validateSafeLocalDatabaseTarget('postgresql://postgres:postgres@supabase_db_sos-sales:5432/postgres')).not.toThrow();
  });

  it('should block remote cloud database hosts', () => {
    expect(() => validateSafeLocalDatabaseTarget('postgresql://postgres:pass@aws-0-ca-central-1.pooler.supabase.com:6543/postgres'))
      .toThrow(/prohibited remote\/production pattern/);

    expect(() => validateSafeLocalDatabaseTarget('postgresql://postgres:pass@yiiuebhyqixzluguxsqi.supabase.co:5432/postgres'))
      .toThrow(/prohibited remote\/production pattern/);

    expect(() => validateSafeLocalDatabaseTarget('postgresql://postgres:pass@179.197.72.221:5432/postgres'))
      .toThrow(/prohibited remote\/production pattern/);
  });

  it('should block unpermitted domain names or external IPs', () => {
    expect(() => validateSafeLocalDatabaseTarget('postgresql://postgres:pass@db.mycompany.com:5432/postgres'))
      .toThrow(/NOT a permitted local test instance/);

    expect(() => validateSafeLocalDatabaseTarget('postgresql://postgres:pass@192.168.1.100:5432/postgres'))
      .toThrow(/NOT a permitted local test instance/);
  });

  it('should block execution when APP_ENV or NODE_ENV is set to production', () => {
    const originalEnv = process.env.APP_ENV;
    try {
      process.env.APP_ENV = 'production';
      expect(() => validateSafeLocalDatabaseTarget('postgresql://postgres:postgres@127.0.0.1:55432/postgres'))
        .toThrow(/cannot run test fixture teardown in production environment/);
    } finally {
      process.env.APP_ENV = originalEnv;
    }
  });

  it('should reject invalid or empty URLs', () => {
    expect(() => validateSafeLocalDatabaseTarget('')).toThrow(/non-empty string/);
    expect(() => validateSafeLocalDatabaseTarget('not-a-valid-url')).toThrow(/invalid database URL format/);
  });
});
