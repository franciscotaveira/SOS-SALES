import { describe, expect, it } from 'vitest';
import { canonicalUuid } from '../../src/interfaces/http/validation.js';

describe('canonicalUuid', () => {
  it('accepts generated UUIDs and stable seeded workspace identifiers', () => {
    expect(canonicalUuid.safeParse('22222222-2222-2222-2222-222222222222').success).toBe(true);
    expect(canonicalUuid.safeParse('8f4f6e4e-4e1e-4f7e-8d2a-4d6d5a1f9d01').success).toBe(true);
  });

  it('rejects malformed identifiers', () => {
    expect(canonicalUuid.safeParse('my-haven-workspace').success).toBe(false);
    expect(canonicalUuid.safeParse('22222222-2222-2222-2222').success).toBe(false);
  });
});
