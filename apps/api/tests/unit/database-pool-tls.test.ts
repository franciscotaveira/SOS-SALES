import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getSslConfig } from '../../src/infrastructure/database/pool.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CA_FILE = resolve(HERE, '../../../../certs/supabase-ca.crt');
const REMOTE_URL = 'postgresql://user:password@db.example.test:6543/postgres';
const originalCa = process.env.DATABASE_SSL_CA;
const originalCaFile = process.env.DATABASE_SSL_CA_FILE;

afterEach(() => {
  if (originalCa === undefined) delete process.env.DATABASE_SSL_CA;
  else process.env.DATABASE_SSL_CA = originalCa;
  if (originalCaFile === undefined) delete process.env.DATABASE_SSL_CA_FILE;
  else process.env.DATABASE_SSL_CA_FILE = originalCaFile;
});

describe('database pool TLS', () => {
  it('loads the configured CA file and verifies a remote database certificate', () => {
    delete process.env.DATABASE_SSL_CA;
    process.env.DATABASE_SSL_CA_FILE = CA_FILE;

    expect(getSslConfig(REMOTE_URL)).toEqual(expect.objectContaining({
      rejectUnauthorized: true,
      ca: expect.stringContaining('BEGIN CERTIFICATE'),
    }));
  });

  it('fails closed when a remote database has no configured CA', () => {
    delete process.env.DATABASE_SSL_CA;
    delete process.env.DATABASE_SSL_CA_FILE;

    expect(() => getSslConfig(REMOTE_URL)).toThrow(/DATABASE_SSL_CA or DATABASE_SSL_CA_FILE is required/);
  });
});
