-- =============================================================================
-- FORWARD-ONLY SECURITY HARDENING: EXPAND & MIGRATE PHASE
--
-- 1. Ensure channel_connection_secrets has secret_kind and secret_payload columns.
-- 2. Configure sos_sales_runtime role with NOBYPASSRLS and explicit grants.
-- 3. Make future Data API exposure explicit instead of automatic.
-- 4. Backfill legacy provider secrets from channel_connections.public_config
--    without removing them from public_config yet (contract phase occurs post-deploy).
-- =============================================================================

BEGIN;

-- 1. Ensure channel_connection_secrets schema compatibility
ALTER TABLE public.channel_connection_secrets
  ADD COLUMN IF NOT EXISTS secret_kind TEXT NOT NULL DEFAULT 'meta_bearer_token';

ALTER TABLE public.channel_connection_secrets
  ADD COLUMN IF NOT EXISTS secret_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_channel_secrets_conn_kind'
      AND conrelid = 'public.channel_connection_secrets'::regclass
  ) THEN
    -- Drop single-column pkey/uq if exists on channel_connection_id
    ALTER TABLE public.channel_connection_secrets DROP CONSTRAINT IF EXISTS channel_connection_secrets_pkey;
    ALTER TABLE public.channel_connection_secrets DROP CONSTRAINT IF EXISTS uq_channel_secrets_conn_id;

    ALTER TABLE public.channel_connection_secrets
      ADD CONSTRAINT uq_channel_secrets_conn_kind
      UNIQUE (channel_connection_id, secret_kind);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_channel_secrets_kind
  ON public.channel_connection_secrets(secret_kind);

-- 2. Ensure application runtime role attributes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sos_sales_runtime') THEN
    CREATE ROLE sos_sales_runtime
      INHERIT
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS
      NOLOGIN;
  ELSE
    ALTER ROLE sos_sales_runtime
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS
      NOLOGIN;
  END IF;
END
$$;

GRANT authenticated TO sos_sales_runtime;
GRANT USAGE ON SCHEMA public TO sos_sales_runtime;
GRANT sos_sales_runtime TO postgres, service_role;

-- 3. Supabase Data API access control
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.channel_connection_secrets FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.executed_actions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.commercial_outcomes FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.outbox_events FROM authenticated;

-- 4. Non-destructive backfill of legacy secrets
INSERT INTO public.channel_connection_secrets (
  channel_connection_id,
  workspace_id,
  secret_kind,
  secret_payload,
  created_at,
  updated_at
)
SELECT
  cc.id,
  cc.workspace_id,
  'meta_bearer_token',
  jsonb_build_object(
    'accessToken',
    COALESCE(cc.public_config->>'_secret_token', cc.public_config->>'pageAccessToken')
  ),
  NOW(),
  NOW()
FROM public.channel_connections cc
WHERE COALESCE(cc.public_config->>'_secret_token', cc.public_config->>'pageAccessToken', '') <> ''
ON CONFLICT (channel_connection_id, secret_kind) DO NOTHING;

INSERT INTO public.channel_connection_secrets (
  channel_connection_id,
  workspace_id,
  secret_kind,
  secret_payload,
  created_at,
  updated_at
)
SELECT
  cc.id,
  cc.workspace_id,
  'meta_capi_token',
  jsonb_build_object(
    'accessToken',
    COALESCE(cc.public_config->>'metaAccessToken', cc.public_config->>'meta_capi_access_token')
  ),
  NOW(),
  NOW()
FROM public.channel_connections cc
WHERE COALESCE(cc.public_config->>'metaAccessToken', cc.public_config->>'meta_capi_access_token', '') <> ''
ON CONFLICT (channel_connection_id, secret_kind) DO NOTHING;

INSERT INTO public.channel_connection_secrets (
  channel_connection_id,
  workspace_id,
  secret_kind,
  secret_payload,
  created_at,
  updated_at
)
SELECT
  cc.id,
  cc.workspace_id,
  'meta_webhook_verify_token',
  jsonb_build_object('verifyToken', cc.public_config->>'verifyToken'),
  NOW(),
  NOW()
FROM public.channel_connections cc
WHERE COALESCE(cc.public_config->>'verifyToken', '') <> ''
ON CONFLICT (channel_connection_id, secret_kind) DO NOTHING;

COMMIT;
