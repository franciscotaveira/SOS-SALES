-- 025: Pairing-aware ingress resolvers (WAHA only)
--
-- Context: chk_channel_instances_active_status forces is_active = false while a channel is
-- in status 'pairing'. lookup_channel_ingress / resolve_channel_signing_credential both filter
-- on is_active = true, so WAHA `session.status` events emitted during QR pairing were rejected
-- with HTTP 404 before reaching the route.
--
-- These functions are SEPARATE from the active-channel resolvers (which are NOT modified).
-- They return rows only for provider = 'waha' AND status = 'pairing'. The route is responsible
-- for restricting accepted traffic to authenticated `session.status` events.

CREATE OR REPLACE FUNCTION public.lookup_channel_ingress_pairing(p_endpoint_token_hash pg_catalog.text)
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
    IF p_endpoint_token_hash IS NULL OR p_endpoint_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'INVALID_ENDPOINT_TOKEN_HASH: Token hash must be exactly 64 lowercase hexadecimal characters';
    END IF;

    RETURN QUERY
    SELECT
        ci.id AS channel_instance_id,
        ci.workspace_id,
        ci.provider,
        ci.is_active
    FROM public.channel_instances ci
    WHERE ci.is_active = false
      AND ci.status = 'pairing'
      AND ci.provider = 'waha'
      AND ci.endpoint_token_hash = p_endpoint_token_hash
    LIMIT 1;
END;
$$;

ALTER FUNCTION public.lookup_channel_ingress_pairing(pg_catalog.text) OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.lookup_channel_ingress_pairing(pg_catalog.text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_channel_ingress_pairing(pg_catalog.text) TO sos_ingress_user;

CREATE OR REPLACE FUNCTION public.resolve_channel_signing_credential_pairing(
    p_channel_instance_id pg_catalog.uuid,
    p_workspace_id pg_catalog.uuid
)
RETURNS TABLE (
    encrypted_payload pg_catalog.text,
    payload_iv pg_catalog.text,
    payload_auth_tag pg_catalog.text,
    verify_token_hash pg_catalog.text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pc.encrypted_payload,
        pc.iv::text AS payload_iv,
        pc.auth_tag::text AS payload_auth_tag,
        ci.verify_token_hash
    FROM public.channel_instances ci
    LEFT JOIN public.provider_credentials pc
        ON pc.id = ci.credential_id AND pc.workspace_id = ci.workspace_id
    WHERE ci.id = p_channel_instance_id
      AND ci.workspace_id = p_workspace_id
      AND ci.is_active = false
      AND ci.status = 'pairing'
      AND ci.provider = 'waha'
    LIMIT 1;
END;
$$;

ALTER FUNCTION public.resolve_channel_signing_credential_pairing(pg_catalog.uuid, pg_catalog.uuid) OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.resolve_channel_signing_credential_pairing(pg_catalog.uuid, pg_catalog.uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_channel_signing_credential_pairing(pg_catalog.uuid, pg_catalog.uuid) TO sos_ingress_user;
