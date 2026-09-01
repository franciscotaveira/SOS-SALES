-- A WhatsApp display number can have only one active ingress/egress provider.
-- Keeping WAHA and Meta Cloud active for the same number makes webhook routing
-- and message delivery ambiguous. Blank placeholders stay outside the index
-- until the provider has reported its real display number.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_whatsapp_display_phone_provider
  ON public.channel_connections (
    NULLIF(regexp_replace(COALESCE(phone_number, ''), '\D', '', 'g'), '')
  )
  WHERE provider IN ('waha', 'meta_cloud')
    AND status = 'CONNECTED'
    AND NULLIF(regexp_replace(COALESCE(phone_number, ''), '\D', '', 'g'), '') IS NOT NULL;

COMMIT;
