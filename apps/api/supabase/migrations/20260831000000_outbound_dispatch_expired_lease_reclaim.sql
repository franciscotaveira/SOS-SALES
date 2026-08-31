-- =============================================================================
-- SOS Sales — reclaim an expired supervised outbound lease
--
-- A worker can die after it fenced a dispatch. The dispatch remains human
-- approved, but its old lease must not make it permanently invisible. This
-- forward-only replacement permits a new claim only when the previous lease is
-- demonstrably expired; active claims remain fenced.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_outbound_dispatch(
  p_dispatch_id UUID,
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS JSONB AS $$
DECLARE
  v_dispatch public.outbound_dispatches%ROWTYPE;
  v_token UUID := gen_random_uuid();
  v_reclaimed_expired_lease BOOLEAN := FALSE;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: outbound claim requires service_role';
  END IF;
  IF p_worker_id IS NULL
    OR char_length(btrim(p_worker_id)) < 3
    OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RAISE EXCEPTION 'Invalid outbound claim request';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.outbound_dispatches
  WHERE id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outbound dispatch not found';
  END IF;

  v_reclaimed_expired_lease :=
    v_dispatch.status = 'CLAIMED'
    AND v_dispatch.claim_expires_at IS NOT NULL
    AND v_dispatch.claim_expires_at < NOW();

  IF NOT (
    v_dispatch.status = 'APPROVED'
    OR v_reclaimed_expired_lease
  ) OR v_dispatch.approved_by_user_id IS NULL OR v_dispatch.approved_at IS NULL THEN
    RAISE EXCEPTION 'Outbound dispatch is not human-approved or its active claim is still valid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = v_dispatch.workspace_id AND active
  ) THEN
    RAISE EXCEPTION 'Workspace is inactive';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_journeys
    WHERE id = v_dispatch.journey_id
      AND workspace_id = v_dispatch.workspace_id
      AND contact_id = v_dispatch.contact_id
      AND channel_connection_id = v_dispatch.channel_connection_id
      AND status = 'OPEN'
  ) THEN
    RAISE EXCEPTION 'Journey no longer permits outbound';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.channel_connections
    WHERE id = v_dispatch.channel_connection_id
      AND workspace_id = v_dispatch.workspace_id
      AND provider IN ('waha', 'meta_cloud')
      AND status = 'CONNECTED'
  ) THEN
    RAISE EXCEPTION 'Selected outbound channel is not connected or supported';
  END IF;
  IF NOT public.is_outbound_enabled(v_dispatch.workspace_id, v_dispatch.channel_connection_id) THEN
    RAISE EXCEPTION 'Outbound is disabled by workspace or channel control';
  END IF;

  UPDATE public.outbound_dispatches
  SET status = 'CLAIMED',
      claim_token = v_token,
      claimed_by = btrim(p_worker_id),
      claim_expires_at = NOW() + make_interval(secs => p_lease_seconds)
  WHERE id = v_dispatch.id;

  INSERT INTO public.outbound_dispatch_events(
    workspace_id, outbound_dispatch_id, event_type, worker_id, idempotency_key, detail
  ) VALUES (
    v_dispatch.workspace_id,
    v_dispatch.id,
    'CLAIMED',
    btrim(p_worker_id),
    'claim:' || v_token::text,
    jsonb_build_object(
      'leaseSeconds', p_lease_seconds,
      'reclaimedExpiredLease', v_reclaimed_expired_lease
    )
  );

  RETURN jsonb_build_object(
    'dispatchId', v_dispatch.id,
    'claimToken', v_token,
    'textContent', v_dispatch.text_content,
    'channelConnectionId', v_dispatch.channel_connection_id,
    'contactId', v_dispatch.contact_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.claim_outbound_dispatch(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_dispatch(UUID, TEXT, INTEGER)
  TO service_role;
