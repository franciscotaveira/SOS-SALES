-- =============================================================================
-- FORWARD-ONLY PROVIDER IDENTIFIER OWNERSHIP
-- A provider asset may belong to one channel connection only. A duplicate is a
-- migration failure rather than an arbitrary webhook-routing decision.
-- Empty/null identifiers are excluded so placeholder records do not conflict.
-- =============================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_meta_cloud_phone_number_identifier
  ON public.channel_connections (
    COALESCE(
      NULLIF(TRIM(public_config->>'phoneNumberId'), ''),
      NULLIF(TRIM(public_config->>'phone_number_id'), ''),
      NULLIF(TRIM(public_config->>'wabaPhoneNumberId'), ''),
      NULLIF(TRIM(phone_number), '')
    )
  )
  WHERE provider = 'meta_cloud'
    AND COALESCE(
      NULLIF(TRIM(public_config->>'phoneNumberId'), ''),
      NULLIF(TRIM(public_config->>'phone_number_id'), ''),
      NULLIF(TRIM(public_config->>'wabaPhoneNumberId'), ''),
      NULLIF(TRIM(phone_number), '')
    ) IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_messenger_page_identifier
  ON public.channel_connections (NULLIF(TRIM(public_config->>'pageId'), ''))
  WHERE provider IN ('messenger', 'meta_cloud')
    AND public_config ? 'pageId'
    AND NULLIF(TRIM(public_config->>'pageId'), '') IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_instagram_user_identifier
  ON public.channel_connections (NULLIF(TRIM(public_config->>'igUserId'), ''))
  WHERE provider IN ('instagram_dm', 'meta_cloud')
    AND public_config ? 'igUserId'
    AND NULLIF(TRIM(public_config->>'igUserId'), '') IS NOT NULL;

COMMIT;

