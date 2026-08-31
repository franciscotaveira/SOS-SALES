-- Reinstates the public-channel secret boundary after legacy rows bypassed
-- the earlier migration ledger. Credentials have already been backfilled to
-- channel_connection_secrets; this migration removes only duplicate public
-- JSON keys and makes future writes fail closed.

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

ALTER TABLE public.channel_connections
  DROP CONSTRAINT IF EXISTS ck_channel_public_config_no_secrets;

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
  );

COMMIT;
