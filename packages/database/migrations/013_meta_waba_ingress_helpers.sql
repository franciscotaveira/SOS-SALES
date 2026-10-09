-- =========================================================================
-- SOS Sales V3 — Migration 013: Meta WABA Ingress Helpers & Direct Resolution
-- =========================================================================
-- Context: Allows incoming Meta WABA webhooks without path token (:endpointToken)
-- to be securely resolved via verify_token_hash (during handshake) and
-- phone_number_id (during incoming events), strictly preserving tenant isolation.
-- =========================================================================

-- 1. Lookup channel instance by verify_token_hash (for GET challenge)
CREATE OR REPLACE FUNCTION public.lookup_channel_by_verify_token(p_verify_token_hash pg_catalog.text)
RETURNS TABLE (
    channel_instance_id pg_catalog.uuid,
    workspace_id pg_catalog.uuid,
    provider pg_catalog.text,
    is_active pg_catalog.bool
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_verify_token_hash IS NULL OR p_verify_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'INVALID_VERIFY_TOKEN_HASH: Token hash must be exactly 64 lowercase hexadecimal characters';
    END IF;

    RETURN QUERY
    SELECT 
        ci.id AS channel_instance_id,
        ci.workspace_id,
        ci.provider,
        ci.is_active
    FROM public.channel_instances ci
    WHERE ci.is_active = true
      AND ci.verify_token_hash = p_verify_token_hash
    LIMIT 1;
END;
$$;

ALTER FUNCTION public.lookup_channel_by_verify_token(pg_catalog.text) OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.lookup_channel_by_verify_token(pg_catalog.text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_channel_by_verify_token(pg_catalog.text) TO sos_ingress_user, sos_app_user, sos_worker_user;

-- 2. Lookup channel instance by Meta phone_number_id (account_id in provider_credentials)
CREATE OR REPLACE FUNCTION public.lookup_channel_by_meta_phone_id(p_phone_id pg_catalog.text)
RETURNS TABLE (
    channel_instance_id pg_catalog.uuid,
    workspace_id pg_catalog.uuid,
    provider pg_catalog.text,
    is_active pg_catalog.bool
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_phone_id IS NULL OR length(trim(p_phone_id)) = 0 THEN
        RAISE EXCEPTION 'INVALID_META_PHONE_ID: Phone ID must not be empty';
    END IF;

    RETURN QUERY
    SELECT 
        ci.id AS channel_instance_id,
        ci.workspace_id,
        ci.provider,
        ci.is_active
    FROM public.channel_instances ci
    JOIN public.provider_credentials pc 
      ON pc.id = ci.credential_id 
     AND pc.workspace_id = ci.workspace_id
    WHERE ci.is_active = true
      AND ci.provider = 'meta_waba'
      AND (
        pc.account_id = trim(p_phone_id)
        OR ci.phone_number_e164 = trim(p_phone_id)
        OR ci.phone_number_e164 = '+' || trim(p_phone_id)
        OR replace(ci.phone_number_e164, '+', '') = trim(p_phone_id)
      )
    ORDER BY (pc.account_id = trim(p_phone_id)) DESC
    LIMIT 1;
END;
$$;

ALTER FUNCTION public.lookup_channel_by_meta_phone_id(pg_catalog.text) OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.lookup_channel_by_meta_phone_id(pg_catalog.text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_channel_by_meta_phone_id(pg_catalog.text) TO sos_ingress_user, sos_app_user, sos_worker_user;
