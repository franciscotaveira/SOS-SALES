-- Disconnected onboarding rows are placeholders, not provider ownership.
-- The previous index included phone_number for every meta_cloud row, so two
-- new client workspaces with phone_number='pending' could not be created.
-- Enforce uniqueness only for connected channels with a real provider id.

DROP INDEX IF EXISTS public.uq_meta_cloud_phone_number_identifier;

CREATE UNIQUE INDEX uq_meta_cloud_phone_number_identifier
  ON public.channel_connections (
    COALESCE(
      NULLIF(TRIM(public_config->>'phoneNumberId'), ''),
      NULLIF(TRIM(public_config->>'phone_number_id'), ''),
      NULLIF(TRIM(public_config->>'wabaPhoneNumberId'), ''),
      NULLIF(TRIM(phone_number), '')
    )
  )
  WHERE provider = 'meta_cloud'
    AND status = 'CONNECTED'
    AND COALESCE(
      NULLIF(TRIM(public_config->>'phoneNumberId'), ''),
      NULLIF(TRIM(public_config->>'phone_number_id'), ''),
      NULLIF(TRIM(public_config->>'wabaPhoneNumberId'), ''),
      NULLIF(TRIM(phone_number), '')
    ) IS NOT NULL;
