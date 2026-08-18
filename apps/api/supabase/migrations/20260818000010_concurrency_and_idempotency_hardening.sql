-- Migration 010: Concurrency & Idempotency Hardening (Phase 4 Hardening)
-- Solves race conditions under high-frequency double-clicks & concurrent workers

-- 1. Harden create_follow_up_task
CREATE OR REPLACE FUNCTION public.create_follow_up_task(
  p_workspace_id UUID,
  p_journey_id UUID,
  p_due_at TIMESTAMPTZ,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID;
  v_task public.follow_up_tasks%ROWTYPE;
BEGIN
  IF p_due_at IS NULL OR p_due_at <= NOW() THEN
    RAISE EXCEPTION 'Follow-up due date must be in the future';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Invalid follow-up reason';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  v_actor := public.require_workspace_operator(p_workspace_id);

  -- Fast path check
  SELECT * INTO v_task FROM public.follow_up_tasks
  WHERE workspace_id = p_workspace_id AND idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('taskId', v_task.id, 'followUpTaskId', v_task.id, 'status', v_task.status, 'idempotent', true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_journeys
    WHERE id = p_journey_id AND workspace_id = p_workspace_id AND status = 'OPEN'
  ) THEN RAISE EXCEPTION 'Open journey not found'; END IF;

  BEGIN
    INSERT INTO public.follow_up_tasks (
      workspace_id, journey_id, assigned_to_user_id, due_at, reason, created_by_user_id, idempotency_key
    ) VALUES (
      p_workspace_id, p_journey_id, v_actor, p_due_at, btrim(p_reason), v_actor, p_idempotency_key
    ) RETURNING * INTO v_task;

    RETURN jsonb_build_object('taskId', v_task.id, 'followUpTaskId', v_task.id, 'status', v_task.status, 'idempotent', false);
  EXCEPTION WHEN unique_violation THEN
    -- Race condition: another concurrent transaction inserted with the same idempotency_key
    SELECT * INTO v_task FROM public.follow_up_tasks
    WHERE workspace_id = p_workspace_id AND idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('taskId', v_task.id, 'followUpTaskId', v_task.id, 'status', v_task.status, 'idempotent', true);
    ELSE
      RAISE;
    END IF;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2. Harden accept_handoff
CREATE OR REPLACE FUNCTION public.accept_handoff(
  p_workspace_id UUID,
  p_handoff_case_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID;
  v_case public.handoff_cases%ROWTYPE;
  v_existing public.handoff_case_events%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  v_actor := public.require_handoff_operator(p_workspace_id);

  SELECT * INTO v_case
  FROM public.handoff_cases
  WHERE id = p_handoff_case_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Handoff case not found';
  END IF;

  -- Check if already processed with this idempotency key
  SELECT * INTO v_existing
  FROM public.handoff_case_events
  WHERE workspace_id = p_workspace_id
    AND handoff_case_id = p_handoff_case_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object('handoffId', p_handoff_case_id, 'handoffCaseId', p_handoff_case_id, 'status', v_existing.to_status,
      'assignedToUserId', v_existing.actor_user_id, 'idempotent', true);
  END IF;

  IF v_case.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Handoff transition conflict: expected PENDING, got %', v_case.status;
  END IF;

  UPDATE public.handoff_cases
  SET status = 'ACCEPTED', assigned_to_user_id = v_actor, accepted_at = NOW(), resolved_at = NULL
  WHERE id = p_handoff_case_id AND workspace_id = p_workspace_id;

  INSERT INTO public.handoff_case_events (
    workspace_id, handoff_case_id, from_status, to_status, actor_user_id, idempotency_key
  ) VALUES (
    p_workspace_id, p_handoff_case_id, 'PENDING', 'ACCEPTED', v_actor, p_idempotency_key
  );

  RETURN jsonb_build_object('handoffId', p_handoff_case_id, 'handoffCaseId', p_handoff_case_id, 'status', 'ACCEPTED',
    'assignedToUserId', v_actor, 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
