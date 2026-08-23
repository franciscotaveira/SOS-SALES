-- =============================================================================
-- FORWARD-ONLY SECURITY HARDENING: CONTRACT PHASE (POST-DEPLOY ONLY)
--
-- 1. Remove legacy secret keys from channel_connections.public_config.
-- 2. Add constraint prohibiting future secret keys in public_config JSON.
-- NOTE: Apply this migration ONLY after the v2.0 API bundle is active in production.
-- =============================================================================

BEGIN;

UPDATE public.channel_connections
SET public_config = public_config
  - '_secret_token'
  - 'pageAccessToken'
  - 'metaAccessToken'
  - 'meta_capi_access_token'
  - 'verifyToken',
    updated_at = NOW()
WHERE public_config ?| ARRAY[
  '_secret_token',
  'pageAccessToken',
  'metaAccessToken',
  'meta_capi_access_token',
  'verifyToken'
];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_channel_public_config_no_secrets'
      AND conrelid = 'public.channel_connections'::regclass
  ) THEN
    ALTER TABLE public.channel_connections
      ADD CONSTRAINT ck_channel_public_config_no_secrets
      CHECK (
        NOT (public_config ?| ARRAY[
          '_secret_token',
          'pageAccessToken',
          'metaAccessToken',
          'meta_capi_access_token',
          'verifyToken'
        ])
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.channel_connections
  VALIDATE CONSTRAINT ck_channel_public_config_no_secrets;

COMMIT;
