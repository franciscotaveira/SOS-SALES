-- The general handoff model intentionally allows more than one case per journey.
-- Serialize only AI-created escalation so concurrent inbound messages cannot
-- create duplicate active operator work.
DROP INDEX IF EXISTS public.uq_handoff_cases_one_active_per_journey;

CREATE OR REPLACE FUNCTION public.pause_receptionist_and_open_handoff(
  p_workspace_id UUID,
  p_journey_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_handoff_id UUID;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_workspace_id::TEXT || ':' || p_journey_id::TEXT, 0)
  );

  UPDATE public.commercial_journeys
  SET bot_paused_at = NOW(), bot_pause_reason = p_reason, updated_at = NOW()
  WHERE workspace_id = p_workspace_id AND id = p_journey_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_handoff_id
  FROM public.handoff_cases
  WHERE workspace_id = p_workspace_id
    AND journey_id = p_journey_id
    AND status IN ('PENDING', 'ACCEPTED')
  ORDER BY opened_at DESC
  LIMIT 1;

  IF v_handoff_id IS NULL THEN
    INSERT INTO public.handoff_cases (
      workspace_id, journey_id, status, briefing, trigger_reason
    ) VALUES (
      p_workspace_id,
      p_journey_id,
      'PENDING',
      pg_catalog.jsonb_build_object('origin', 'ai_receptionist', 'reason', p_reason),
      p_reason
    )
    RETURNING id INTO v_handoff_id;
  END IF;

  RETURN v_handoff_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pause_receptionist_and_open_handoff(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pause_receptionist_and_open_handoff(UUID, UUID, TEXT) TO postgres, service_role;
