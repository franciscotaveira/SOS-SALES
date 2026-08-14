import { describe, expect, it } from 'vitest';

describe('local WAHA bootstrap contract', () => {
  it('documents the two required local-only environment names', async () => {
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../src/local-waha.ts', import.meta.url), 'utf8'),
    );
    expect(source).toContain('WAHA_API_KEY');
    expect(source).toContain('WAHA_WEBHOOK_SECRET');
    expect(source).toContain("dotenv.config({ path: '.env.waha.local'");
  });
});
