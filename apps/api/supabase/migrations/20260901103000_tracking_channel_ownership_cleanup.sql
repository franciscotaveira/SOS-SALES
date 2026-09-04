-- Tracking/CAPI configuration must never masquerade as a connected WhatsApp
-- channel. Older code created a placeholder meta_cloud row named
-- "Meta Ads Tracking"; converge it into a real messaging channel when one is
-- available and preserve unmatched legacy data as a disconnected `other` row.

BEGIN;

CREATE TEMP TABLE tracking_channel_convergence ON COMMIT DROP AS
SELECT
  legacy.id AS legacy_id,
  legacy.workspace_id,
  (
    SELECT real.id
    FROM public.channel_connections real
    WHERE real.workspace_id = legacy.workspace_id
      AND real.id <> legacy.id
      AND real.provider IN ('meta_cloud', 'waha')
      AND real.status = 'CONNECTED'
      AND real.phone_number <> 'Meta CAPI Tracking'
    ORDER BY CASE WHEN real.provider = 'meta_cloud' THEN 1 ELSE 2 END, real.created_at
    LIMIT 1
  ) AS target_id
FROM public.channel_connections legacy
WHERE legacy.provider = 'meta_cloud'
  AND legacy.phone_number = 'Meta CAPI Tracking'
  AND legacy.name = 'Meta Ads Tracking';

UPDATE public.channel_connections target
SET public_config = jsonb_strip_nulls(jsonb_build_object(
      'metaPixelId', legacy.public_config->'metaPixelId',
      'metaDatasetId', legacy.public_config->'metaDatasetId',
      'meta_capi_pixel_id', legacy.public_config->'meta_capi_pixel_id',
      'meta_capi_dataset_id', legacy.public_config->'meta_capi_dataset_id',
      'metaCapiEnabled', legacy.public_config->'metaCapiEnabled',
      'googleAdsCustomerId', legacy.public_config->'googleAdsCustomerId',
      'googleConversionId', legacy.public_config->'googleConversionId',
      'googleGclidTracking', legacy.public_config->'googleGclidTracking',
      'campaignMappings', legacy.public_config->'campaignMappings'
    )) || target.public_config,
    updated_at = NOW()
FROM tracking_channel_convergence convergence
JOIN public.channel_connections legacy ON legacy.id = convergence.legacy_id
WHERE target.id = convergence.target_id
  AND convergence.target_id IS NOT NULL;

INSERT INTO public.channel_connection_secrets (
  channel_connection_id,
  workspace_id,
  secret_kind,
  secret_payload,
  created_at,
  updated_at
)
SELECT
  convergence.target_id,
  secret.workspace_id,
  secret.secret_kind,
  secret.secret_payload,
  secret.created_at,
  NOW()
FROM tracking_channel_convergence convergence
JOIN public.channel_connection_secrets secret
  ON secret.channel_connection_id = convergence.legacy_id
WHERE convergence.target_id IS NOT NULL
ON CONFLICT (channel_connection_id, secret_kind) DO NOTHING;

-- Keep the legacy row as an inert audit anchor. Historical journeys, messages,
-- events or dispatches may still reference it through RESTRICT/immutable FKs.
-- Reclassifying removes it from every WhatsApp selector without breaking the
-- historical graph or relying on cascades.
UPDATE public.channel_connections legacy
SET provider = 'other',
    phone_number = 'tracking-legacy:' || legacy.id::text,
    name = CASE WHEN convergence.target_id IS NULL
      THEN 'Configuração de rastreamento legada'
      ELSE 'Configuração de rastreamento migrada'
    END,
    status = 'DISCONNECTED',
    updated_at = NOW()
FROM tracking_channel_convergence convergence
WHERE legacy.id = convergence.legacy_id;

COMMIT;
