-- =============================================================================
-- SOS SALES — P0: OPERAÇÃO DE COCKPIT
-- Pipeline comercial, política de SLA e follow-ups auditáveis.
-- `pipeline_stage` é operacional e não substitui `decision_states.current_stage`,
-- que continua sendo a projeção cognitiva.
-- =============================================================================

ALTER TABLE public.commercial_journeys
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'NEW'
  CHECK (pipeline_stage IN ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'));

CREATE INDEX IF NOT EXISTS idx_commercial_journeys_workspace_pipeline_stage
  ON public.commercial_journeys(workspace_id, pipeline_stage, updated_at DESC)
  WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS public.pipeline_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL CHECK (to_stage IN ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION')),
  reason TEXT,
  actor_user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_pipeline_stage_events_journey_same_workspace
    FOREIGN KEY (workspace_id, journey_id)
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_pipeline_stage_events_idempotency
    UNIQUE (workspace_id, journey_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stage_events_journey_created_at
  ON public.pipeline_stage_events(journey_id, created_at DESC);

CREATE TRIGGER trg_pipeline_stage_events_immutable
  BEFORE UPDATE OR DELETE ON public.pipeline_stage_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

CREATE TABLE IF NOT EXISTS public.workspace_sla_policies (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  first_response_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (first_response_minutes BETWEEN 1 AND 1440),
  changed_by_user_id UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.follow_up_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  assigned_to_user_id UUID,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'DUE', 'DONE', 'CANCELLED')),
  due_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 1000),
  created_by_user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  completed_by_user_id UUID,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_follow_up_tasks_journey_same_workspace
    FOREIGN KEY (workspace_id, journey_id)
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT ck_follow_up_completion CHECK (
    (status = 'DONE' AND completed_at IS NOT NULL AND completed_by_user_id IS NOT NULL)
    OR (status <> 'DONE' AND completed_at IS NULL AND completed_by_user_id IS NULL)
  ),
  CONSTRAINT uq_follow_up_tasks_idempotency
    UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_workspace_status_due
  ON public.follow_up_tasks(workspace_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_journey_due
  ON public.follow_up_tasks(journey_id, due_at DESC);

CREATE TRIGGER trg_follow_up_tasks_updated_at
  BEFORE UPDATE ON public.follow_up_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pipeline_stage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_pipeline_stage_events
  ON public.pipeline_stage_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_workspace_sla_policies
  ON public.workspace_sla_policies FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_follow_up_tasks
  ON public.follow_up_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY tenant_select_pipeline_stage_events
  ON public.pipeline_stage_events FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));
CREATE POLICY owner_select_workspace_sla_policies
  ON public.workspace_sla_policies FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));
CREATE POLICY tenant_select_follow_up_tasks
  ON public.follow_up_tasks FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

-- Cockpit writes travel only through the guarded routines below. This avoids
-- direct client mutation of stages/tasks while retaining the immutable audit.
DROP POLICY IF EXISTS operator_update_journeys ON public.commercial_journeys;

CREATE OR REPLACE FUNCTION public.require_workspace_operator(
  p_workspace_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL
    OR NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'operator'])
    OR NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND active) THEN
    RAISE EXCEPTION 'Unauthorized workspace operation';
  END IF;
  RETURN v_actor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.set_journey_pipeline_stage(
  p_workspace_id UUID,
  p_journey_id UUID,
  p_stage TEXT,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID;
  v_journey public.commercial_journeys%ROWTYPE;
  v_existing public.pipeline_stage_events%ROWTYPE;
BEGIN
  IF p_stage NOT IN ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION') THEN
    RAISE EXCEPTION 'Invalid pipeline stage';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  v_actor := public.require_workspace_operator(p_workspace_id);

  SELECT * INTO v_existing
  FROM public.pipeline_stage_events
  WHERE workspace_id = p_workspace_id AND journey_id = p_journey_id
    AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('journeyId', p_journey_id, 'stage', v_existing.to_stage, 'idempotent', true);
  END IF;

  SELECT * INTO v_journey
  FROM public.commercial_journeys
  WHERE id = p_journey_id AND workspace_id = p_workspace_id AND status = 'OPEN'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Open journey not found'; END IF;

  UPDATE public.commercial_journeys
  SET pipeline_stage = p_stage
  WHERE id = p_journey_id AND workspace_id = p_workspace_id;

  INSERT INTO public.pipeline_stage_events (
    workspace_id, journey_id, from_stage, to_stage, reason, actor_user_id, idempotency_key
  ) VALUES (
    p_workspace_id, p_journey_id, v_journey.pipeline_stage, p_stage, NULLIF(btrim(p_reason), ''), v_actor, p_idempotency_key
  );

  RETURN jsonb_build_object('journeyId', p_journey_id, 'stage', p_stage, 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

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

  SELECT * INTO v_task FROM public.follow_up_tasks
  WHERE workspace_id = p_workspace_id AND idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('followUpTaskId', v_task.id, 'status', v_task.status, 'idempotent', true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_journeys
    WHERE id = p_journey_id AND workspace_id = p_workspace_id AND status = 'OPEN'
  ) THEN RAISE EXCEPTION 'Open journey not found'; END IF;

  INSERT INTO public.follow_up_tasks (
    workspace_id, journey_id, assigned_to_user_id, due_at, reason, created_by_user_id, idempotency_key
  ) VALUES (
    p_workspace_id, p_journey_id, v_actor, p_due_at, btrim(p_reason), v_actor, p_idempotency_key
  ) RETURNING * INTO v_task;

  RETURN jsonb_build_object('followUpTaskId', v_task.id, 'status', v_task.status, 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.get_workspace_priorities(
  p_workspace_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  journey_id UUID,
  contact_id UUID,
  contact_name TEXT,
  contact_phone TEXT,
  pipeline_stage TEXT,
  handoff_case_id UUID,
  handoff_status TEXT,
  assigned_to_user_id UUID,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  follow_up_due_at TIMESTAMPTZ,
  sla_deadline TIMESTAMPTZ,
  sla_state TEXT,
  priority_reason TEXT,
  unread_count BIGINT
) AS $$
BEGIN
  IF NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'operator', 'viewer']) THEN
    RAISE EXCEPTION 'Unauthorized workspace access';
  END IF;

  RETURN QUERY
  WITH latest_messages AS (
    SELECT DISTINCT ON (m.journey_id) m.journey_id, m.text_content, m.sent_at, m.direction
    FROM public.conversation_messages m
    WHERE m.workspace_id = p_workspace_id
    ORDER BY m.journey_id, m.sent_at DESC
  ), active_handoffs AS (
    SELECT DISTINCT ON (h.journey_id) h.journey_id, h.id, h.status, h.assigned_to_user_id
    FROM public.handoff_cases h
    WHERE h.workspace_id = p_workspace_id AND h.status IN ('PENDING', 'ACCEPTED')
    ORDER BY h.journey_id, h.opened_at DESC
  ), pending_follow_ups AS (
    SELECT DISTINCT ON (f.journey_id) f.journey_id, f.due_at
    FROM public.follow_up_tasks f
    WHERE f.workspace_id = p_workspace_id AND f.status IN ('PENDING', 'DUE')
    ORDER BY f.journey_id, f.due_at ASC
  ), policy AS (
    SELECT COALESCE((SELECT first_response_minutes FROM public.workspace_sla_policies WHERE workspace_id = p_workspace_id), 15) AS first_response_minutes
  )
  SELECT
    j.id, c.id, c.name, c.phone, j.pipeline_stage,
    h.id, h.status, h.assigned_to_user_id,
    m.text_content, m.sent_at, f.due_at,
    COALESCE(f.due_at, m.sent_at + make_interval(mins => policy.first_response_minutes), j.started_at + make_interval(mins => policy.first_response_minutes)) AS deadline,
    CASE
      WHEN COALESCE(f.due_at, m.sent_at + make_interval(mins => policy.first_response_minutes), j.started_at + make_interval(mins => policy.first_response_minutes)) < NOW() THEN 'OVERDUE'
      WHEN COALESCE(f.due_at, m.sent_at + make_interval(mins => policy.first_response_minutes), j.started_at + make_interval(mins => policy.first_response_minutes)) < NOW() + INTERVAL '5 minutes' THEN 'DUE'
      ELSE 'OK'
    END,
    CASE
      WHEN h.status = 'PENDING' THEN 'Handoff aguardando operador'
      WHEN f.due_at IS NOT NULL THEN 'Follow-up agendado'
      WHEN m.direction = 'inbound' THEN 'Mensagem do cliente sem próxima ação registrada'
      ELSE 'Jornada comercial aberta'
    END,
    COALESCE((SELECT count(*) FROM public.conversation_messages unread WHERE unread.workspace_id = p_workspace_id AND unread.journey_id = j.id AND unread.direction = 'inbound' AND unread.sent_at > COALESCE((SELECT max(e.created_at) FROM public.handoff_case_events e WHERE e.handoff_case_id = h.id AND e.to_status = 'ACCEPTED'), '-infinity'::timestamptz)), 0)
  FROM public.commercial_journeys j
  JOIN public.contacts c ON c.id = j.contact_id AND c.workspace_id = j.workspace_id
  LEFT JOIN latest_messages m ON m.journey_id = j.id
  LEFT JOIN active_handoffs h ON h.journey_id = j.id
  LEFT JOIN pending_follow_ups f ON f.journey_id = j.id
  CROSS JOIN policy
  WHERE j.workspace_id = p_workspace_id AND j.status = 'OPEN'
  ORDER BY
    CASE WHEN h.status = 'PENDING' THEN 0 WHEN f.due_at IS NOT NULL THEN 1 ELSE 2 END,
    COALESCE(f.due_at, m.sent_at, j.started_at) ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 100));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON public.pipeline_stage_events, public.workspace_sla_policies, public.follow_up_tasks FROM anon;
GRANT SELECT ON public.pipeline_stage_events, public.workspace_sla_policies, public.follow_up_tasks TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pipeline_stage_events, public.workspace_sla_policies, public.follow_up_tasks FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.require_workspace_operator(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_journey_pipeline_stage(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_follow_up_task(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_workspace_priorities(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_journey_pipeline_stage(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_follow_up_task(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_priorities(UUID, INTEGER) TO authenticated;
