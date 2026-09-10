-- Explicit fatal transition. fail_outbox_event's fifth argument is a retry
-- delay, so callers must not overload it as a maximum-attempt override.
CREATE OR REPLACE FUNCTION public.dead_letter_outbox_event(
  p_event_id UUID,
  p_claim_token UUID,
  p_worker_id TEXT,
  p_error TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: outbox worker RPC requires service_role';
  END IF;
  IF NULLIF(pg_catalog.btrim(p_error), '') IS NULL THEN
    RAISE EXCEPTION 'error is required';
  END IF;

  UPDATE public.outbox_events
  SET status = 'DEAD_LETTER',
      last_error = p_error,
      locked_at = NULL,
      locked_by = NULL,
      claim_token = NULL
  WHERE id = p_event_id
    AND status = 'PROCESSING'
    AND claim_token = p_claim_token
    AND locked_by = p_worker_id
  RETURNING status INTO v_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stale or invalid outbox claim for event %', p_event_id;
  END IF;
  RETURN v_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dead_letter_outbox_event(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dead_letter_outbox_event(UUID, UUID, TEXT, TEXT)
  TO service_role;
