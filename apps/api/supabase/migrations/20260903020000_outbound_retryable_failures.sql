-- =============================================================================
-- SOS Sales — retry only explicitly retryable WAHA failures
--
-- A provider response classified as RETRYABLE must return to the durable
-- APPROVED queue with a bounded backoff. Fatal failures and ambiguous calls
-- stay terminal: an ambiguous request may already have been accepted by the
-- provider and must not be replayed automatically.
-- =============================================================================

ALTER TABLE public.outbound_dispatches
  ADD COLUMN IF NOT EXISTS provider_failure_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

ALTER TABLE public.outbound_dispatches
  DROP CONSTRAINT IF EXISTS ck_outbound_provider_failure_attempts;
ALTER TABLE public.outbound_dispatches
  ADD CONSTRAINT ck_outbound_provider_failure_attempts
  CHECK (provider_failure_attempts >= 0);

-- Preserve the current queue state for rows created before this migration.
UPDATE public.outbound_dispatches
SET next_attempt_at = COALESCE(approved_at, created_at)
WHERE status = 'APPROVED' AND next_attempt_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbound_dispatches_next_attempt
  ON public.outbound_dispatches(status, next_attempt_at)
  WHERE status = 'APPROVED';

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
    (
      v_dispatch.status = 'APPROVED'
      AND (v_dispatch.next_attempt_at IS NULL OR v_dispatch.next_attempt_at <= NOW())
    )
    OR v_reclaimed_expired_lease
  ) OR v_dispatch.approved_by_user_id IS NULL OR v_dispatch.approved_at IS NULL THEN
    RAISE EXCEPTION 'Outbound dispatch is not human-approved, is backoff-gated, or its active claim is still valid';
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
      claim_expires_at = NOW() + make_interval(secs => p_lease_seconds),
      next_attempt_at = NULL
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
      'reclaimedExpiredLease', v_reclaimed_expired_lease,
      'providerFailureAttempts', v_dispatch.provider_failure_attempts
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

DROP FUNCTION IF EXISTS public.record_outbound_provider_failure(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.record_outbound_provider_failure(
  p_dispatch_id UUID,
  p_claim_token UUID,
  p_worker_id TEXT,
  p_failure_code TEXT,
  p_retryable BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_dispatch public.outbound_dispatches%ROWTYPE;
  v_attempts INTEGER;
  v_next_attempt TIMESTAMPTZ;
  v_delay_seconds INTEGER;
  v_terminal BOOLEAN;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: provider failure requires service_role';
  END IF;
  IF p_failure_code IS NULL OR char_length(btrim(p_failure_code)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Invalid provider failure code';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.outbound_dispatches
  WHERE id = p_dispatch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Outbound dispatch not found';
  END IF;
  IF v_dispatch.status = 'FAILED' AND v_dispatch.provider_failure_code = btrim(p_failure_code) THEN
    RETURN jsonb_build_object('dispatchId', v_dispatch.id, 'status', 'FAILED', 'idempotent', true);
  END IF;
  IF v_dispatch.status <> 'CLAIMED'
    OR v_dispatch.claim_token IS DISTINCT FROM p_claim_token
    OR v_dispatch.claimed_by IS DISTINCT FROM btrim(p_worker_id)
    OR v_dispatch.claim_expires_at < NOW() THEN
    RAISE EXCEPTION 'Stale or invalid outbound claim';
  END IF;

  v_attempts := COALESCE(v_dispatch.provider_failure_attempts, 0) + 1;
  v_terminal := NOT p_retryable OR v_attempts >= 5;

  IF NOT v_terminal THEN
    v_delay_seconds := CASE v_attempts
      WHEN 1 THEN 5
      WHEN 2 THEN 15
      WHEN 3 THEN 45
      ELSE 120
    END;
    v_next_attempt := NOW() + make_interval(secs => v_delay_seconds);

    UPDATE public.outbound_dispatches
    SET status = 'APPROVED',
        provider_failure_code = NULL,
        provider_failure_at = NULL,
        provider_failure_attempts = v_attempts,
        next_attempt_at = v_next_attempt,
        claim_token = NULL,
        claimed_by = NULL,
        claim_expires_at = NULL
    WHERE id = v_dispatch.id;
  ELSE
    UPDATE public.outbound_dispatches
    SET status = 'FAILED',
        provider_failure_code = btrim(p_failure_code),
        provider_failure_at = NOW(),
        provider_failure_attempts = v_attempts,
        next_attempt_at = NULL,
        claim_token = NULL,
        claimed_by = NULL,
        claim_expires_at = NULL
    WHERE id = v_dispatch.id;
  END IF;

  INSERT INTO public.outbound_dispatch_events(
    workspace_id, outbound_dispatch_id, event_type, worker_id, idempotency_key, detail
  ) VALUES (
    v_dispatch.workspace_id,
    v_dispatch.id,
    'PROVIDER_FAILED',
    btrim(p_worker_id),
    'failed:' || btrim(p_failure_code) || ':' || p_claim_token::text,
    jsonb_build_object(
      'failureCode', btrim(p_failure_code),
      'retryable', p_retryable,
      'attempt', v_attempts,
      'terminal', v_terminal,
      'nextAttemptAt', v_next_attempt
    )
  );

  RETURN jsonb_build_object(
    'dispatchId', v_dispatch.id,
    'status', CASE WHEN v_terminal THEN 'FAILED' ELSE 'APPROVED' END,
    'idempotent', false,
    'retryable', p_retryable,
    'attempt', v_attempts
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.claim_outbound_dispatch(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_dispatch(UUID, TEXT, INTEGER)
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.record_outbound_provider_failure(UUID, UUID, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_outbound_provider_failure(UUID, UUID, TEXT, TEXT, BOOLEAN)
  TO service_role;
