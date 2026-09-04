import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(here, '../../supabase/migrations/20260901090000_active_whatsapp_phone_provider_exclusivity.sql'),
  'utf8',
);

describe('active WhatsApp provider exclusivity migration', () => {
  it('is transactional, idempotent, and protects only connected display numbers', () => {
    expect(migration).toMatch(/^\s*(--[^\n]*\n|\n)*BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_active_whatsapp_display_phone_provider');
    expect(migration).toContain("provider IN ('waha', 'meta_cloud')");
    expect(migration).toContain("status = 'CONNECTED'");
    expect(migration).toContain("regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g')");
    expect(migration).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|DROP\s+(TABLE|COLUMN)/i);
  });
});
