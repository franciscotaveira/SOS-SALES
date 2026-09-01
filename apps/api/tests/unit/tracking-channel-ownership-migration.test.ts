import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(
  resolve(here, '../../supabase/migrations/20260901103000_tracking_channel_ownership_cleanup.sql'),
  'utf8',
);

describe('tracking channel ownership cleanup', () => {
  it('converges only the known phantom channel and preserves its tracking metadata', () => {
    expect(migration).toMatch(/^\s*(--[^\n]*\n|\n)*BEGIN;/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
    expect(migration).toContain("legacy.phone_number = 'Meta CAPI Tracking'");
    expect(migration).toContain("legacy.name = 'Meta Ads Tracking'");
    expect(migration).toContain("real.provider IN ('meta_cloud', 'waha')");
    expect(migration).toContain("real.status = 'CONNECTED'");
    expect(migration).toMatch(/jsonb_strip_nulls\([\s\S]+\)\) \|\| target\.public_config/);
    expect(migration).toContain('INSERT INTO public.channel_connection_secrets');
    expect(migration).toContain('ON CONFLICT (channel_connection_id, secret_kind) DO NOTHING');
    expect(migration).toContain("provider = 'other'");
    expect(migration).toContain("'tracking-legacy:' || legacy.id::text");
    expect(migration).not.toMatch(/DELETE FROM public\.channel_connections/i);
    expect(migration).not.toMatch(/TRUNCATE|DROP\s+(TABLE|COLUMN)/i);
  });
});
