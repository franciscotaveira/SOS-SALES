-- Migration 009: Fix channel_connection_secrets schema
-- The table was created with vault-style columns (api_key_vault_secret_id, webhook_vault_secret_id)
-- but the application code expects secret_kind + secret_payload columns.
-- This migration adds the missing columns and makes the table work correctly.

-- 1. Add secret_kind column if not exists
ALTER TABLE public.channel_connection_secrets
  ADD COLUMN IF NOT EXISTS secret_kind TEXT NOT NULL DEFAULT 'meta_bearer_token';

-- 2. Add secret_payload column if not exists (JSONB for flexibility)
ALTER TABLE public.channel_connection_secrets
  ADD COLUMN IF NOT EXISTS secret_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Drop the old vault-style columns (they were never used)
ALTER TABLE public.channel_connection_secrets
  DROP COLUMN IF EXISTS api_key_vault_secret_id;

ALTER TABLE public.channel_connection_secrets
  DROP COLUMN IF EXISTS webhook_vault_secret_id;

-- 4. Drop old unique constraint if it exists (on channel_connection_id alone)
-- and recreate it properly
ALTER TABLE public.channel_connection_secrets
  DROP CONSTRAINT IF EXISTS channel_connection_secrets_pkey;

ALTER TABLE public.channel_connection_secrets
  DROP CONSTRAINT IF EXISTS uq_channel_secrets_conn_id;

-- 5. Add new unique constraint: one secret per (connection, kind)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_channel_secrets_conn_kind'
    AND conrelid = 'public.channel_connection_secrets'::regclass
  ) THEN
    ALTER TABLE public.channel_connection_secrets
      ADD CONSTRAINT uq_channel_secrets_conn_kind
      UNIQUE (channel_connection_id, secret_kind);
  END IF;
END $$;

-- 6. Add index for lookup
CREATE INDEX IF NOT EXISTS idx_channel_secrets_kind
  ON public.channel_connection_secrets(secret_kind);

-- 7. Fix commercial_journeys webhook duplicate inserts
-- Add ON CONFLICT behavior by changing the unique constraint to support it
-- The constraint uq_journeys_open_per_contact already exists, we just need
-- the application to use ON CONFLICT DO NOTHING - handled in app code.
-- Here we ensure the partial unique index exists:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'commercial_journeys'
    AND indexname = 'uq_journeys_open_per_contact_active'
  ) THEN
    -- Drop old constraint and recreate as partial index (only for open journeys)
    -- This allows multiple closed journeys per contact but only 1 open
    ALTER TABLE public.commercial_journeys DROP CONSTRAINT IF EXISTS uq_journeys_open_per_contact;
    
    CREATE UNIQUE INDEX uq_journeys_open_per_contact_active
      ON public.commercial_journeys (workspace_id, contact_id)
      WHERE status NOT IN ('closed_won', 'closed_lost', 'lost');
  END IF;
END $$;
