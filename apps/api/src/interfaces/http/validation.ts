import { z } from 'zod';

/**
 * PostgreSQL accepts any canonical 8-4-4-4-12 UUID string. The seed data uses
 * stable, synthetic identifiers whose version/variant nibbles are deliberate
 * (for example the public Haven workspace id), so Zod's version-aware
 * `.uuid()` validator incorrectly rejected valid persisted records. Keep the
 * shape check strict while accepting both generated and seeded identifiers.
 */
export const canonicalUuid = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  'Invalid UUID format',
);
