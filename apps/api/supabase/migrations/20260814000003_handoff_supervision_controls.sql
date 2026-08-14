-- =============================================================================
-- SALES OS — P0.4A: HANDOFF SUPERVISION & OUTBOUND KILL SWITCHES
-- Forward-only migration. This migration deliberately does not dispatch media
-- or messages. It establishes the audit and authorization boundary required
-- before any outbound provider can be introduced.
-- =============================================================================

-- A journey originating from a channel must retain that channel boundary. The
-- column stays nullable only for pre-P0.4 historical journeys; new ingest will
-- populate it in a subsequent backward-compatible projection change.
ALTER TABLE public.commercial_journeys
  ADD COLUMN IF NOT EXISTS channel_connection_id UUID;

-- The v2 helper originally returned NEW during an authorised DELETE. In a
-- BEFORE DELETE trigger NEW is NULL, which silently cancels the deletion.
-- Redaction is an explicit maintenance path, so preserve the correct tuple
-- semantics while keeping all normal mutations immutable.
CREATE OR REPLACE FUNCTION public.prevent_immutable_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('sales_os.allow_redaction', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Immutable record: UPDATE and DELETE operations are forbidden on table %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql SET search_path = '';

ALTER TABLE public.commercial_journeys
  DROP CONSTRAINT IF EXISTS fk_journeys_channel_same_workspace;

ALTER TABLE public.commercial_journeys
  ADD CONSTRAINT fk_journeys_channel_same_workspace
  FOREIGN KEY (workspace_id, channel_connection_id)
  REFERENCES public.channel_connections(workspace_id, id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_commercial_journeys_channel_connection_id
  ON public.commercial_journeys(channel_connection_id)
  WHERE channel_connection_id IS NOT NULL;

-- Absence of a control is deliberately fail-closed: outbound is disabled.
CREATE TABLE IF NOT EXISTS public.workspace_operation_controls (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  outbound_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  changed_by_user_id UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.channel_operation_controls (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_connection_id UUID NOT NULL,
  outbound_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  changed_by_user_id UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, channel_connection_id),
  CONSTRAINT fk_channel_controls_same_workspace
    FOREIGN KEY (workspace_id, channel_connection_id)
    REFERENCES public.channel_connections(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.operation_control_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_connection_id UUID,
  scope TEXT NOT NULL CHECK (scope IN ('WORKSPACE', 'CHANNEL')),
  previous_outbound_enabled BOOLEAN,
  outbound_enabled BOOLEAN NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  actor_user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_operation_control_event_scope CHECK (
    (scope = 'WORKSPACE' AND channel_connection_id IS NULL)
    OR (scope = 'CHANNEL' AND channel_connection_id IS NOT NULL)
  ),
  CONSTRAINT fk_operation_control_event_channel_same_workspace
    FOREIGN KEY (workspace_id, channel_connection_id)
    REFERENCES public.channel_connections(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_operation_control_events_idempotency
    UNIQUE (workspace_id, scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_operation_control_events_workspace_created_at
  ON public.operation_control_events(workspace_id, created_at DESC);

-- The original handoff table predates composite FK hardening. Add the parent
-- key before recording workspace-scoped handoff events.
ALTER TABLE public.handoff_cases
  ADD CONSTRAINT uq_handoff_cases_workspace_id_id UNIQUE (workspace_id, id);

CREATE TABLE IF NOT EXISTS public.handoff_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  handoff_case_id UUID NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL CHECK (to_status IN ('ACCEPTED', 'RETURNED_TO_AI', 'RESOLVED')),
  reason TEXT,
  actor_user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_handoff_case_events_same_workspace
    FOREIGN KEY (workspace_id, handoff_case_id)
    REFERENCES public.handoff_cases(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_handoff_case_events_idempotency
    UNIQUE (workspace_id, handoff_case_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_handoff_case_events_handoff_created_at
  ON public.handoff_case_events(handoff_case_id, created_at DESC);

CREATE TRIGGER trg_operation_control_events_immutable
  BEFORE UPDATE OR DELETE ON public.operation_control_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

CREATE TRIGGER trg_handoff_case_events_immutable
  BEFORE UPDATE OR DELETE ON public.handoff_case_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

ALTER TABLE public.workspace_operation_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_operation_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_control_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_workspace_operation_controls
  ON public.workspace_operation_controls FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_channel_operation_controls
  ON public.channel_operation_controls FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_operation_control_events
  ON public.operation_control_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_handoff_case_events
  ON public.handoff_case_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY owner_select_workspace_operation_controls
  ON public.workspace_operation_controls FOR SELECT TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']));
CREATE POLICY owner_select_channel_operation_controls
  ON public.channel_operation_controls FOR SELECT TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']));
CREATE POLICY owner_select_operation_control_events
  ON public.operation_control_events FOR SELECT TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']));
CREATE POLICY tenant_select_handoff_case_events
  ON public.handoff_case_events FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

-- Hand-off rows are mutable only within the guarded state-machine functions.
DROP POLICY IF EXISTS operator_update_handoff ON public.handoff_cases;

CREATE OR REPLACE FUNCTION public.require_handoff_operator(
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
    RAISE EXCEPTION 'Unauthorized handoff operation';
  END IF;
  RETURN v_actor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

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

  SELECT * INTO v_existing
  FROM public.handoff_case_events
  WHERE workspace_id = p_workspace_id
    AND handoff_case_id = p_handoff_case_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object('handoffCaseId', p_handoff_case_id, 'status', v_existing.to_status,
      'assignedToUserId', v_existing.actor_user_id, 'idempotent', true);
  END IF;

  SELECT * INTO v_case
  FROM public.handoff_cases
  WHERE id = p_handoff_case_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Handoff case not found';
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

  RETURN jsonb_build_object('handoffCaseId', p_handoff_case_id, 'status', 'ACCEPTED',
    'assignedToUserId', v_actor, 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.resolve_handoff(
  p_workspace_id UUID,
  p_handoff_case_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID;
  v_case public.handoff_cases%ROWTYPE;
  v_is_owner BOOLEAN;
  v_existing public.handoff_case_events%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  v_actor := public.require_handoff_operator(p_workspace_id);
  v_is_owner := public.user_has_workspace_role(p_workspace_id, ARRAY['owner']);

  SELECT * INTO v_existing FROM public.handoff_case_events
  WHERE workspace_id = p_workspace_id AND handoff_case_id = p_handoff_case_id
    AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('handoffCaseId', p_handoff_case_id, 'status', v_existing.to_status,
      'idempotent', true);
  END IF;

  SELECT * INTO v_case FROM public.handoff_cases
  WHERE id = p_handoff_case_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Handoff case not found'; END IF;
  IF v_case.status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'Handoff transition conflict: expected ACCEPTED, got %', v_case.status;
  END IF;
  IF NOT v_is_owner AND v_case.assigned_to_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Only the assigned operator or owner can resolve this handoff';
  END IF;

  UPDATE public.handoff_cases SET status = 'RESOLVED', resolved_at = NOW()
  WHERE id = p_handoff_case_id AND workspace_id = p_workspace_id;
  INSERT INTO public.handoff_case_events (
    workspace_id, handoff_case_id, from_status, to_status, actor_user_id, idempotency_key
  ) VALUES (p_workspace_id, p_handoff_case_id, 'ACCEPTED', 'RESOLVED', v_actor, p_idempotency_key);
  RETURN jsonb_build_object('handoffCaseId', p_handoff_case_id, 'status', 'RESOLVED', 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.return_handoff_to_ai(
  p_workspace_id UUID,
  p_handoff_case_id UUID,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID;
  v_case public.handoff_cases%ROWTYPE;
  v_is_owner BOOLEAN;
  v_existing public.handoff_case_events%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A return reason is required';
  END IF;
  v_actor := public.require_handoff_operator(p_workspace_id);
  v_is_owner := public.user_has_workspace_role(p_workspace_id, ARRAY['owner']);

  SELECT * INTO v_existing FROM public.handoff_case_events
  WHERE workspace_id = p_workspace_id AND handoff_case_id = p_handoff_case_id
    AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('handoffCaseId', p_handoff_case_id, 'status', v_existing.to_status,
      'idempotent', true);
  END IF;
  SELECT * INTO v_case FROM public.handoff_cases
  WHERE id = p_handoff_case_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Handoff case not found'; END IF;
  IF v_case.status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'Handoff transition conflict: expected ACCEPTED, got %', v_case.status;
  END IF;
  IF NOT v_is_owner AND v_case.assigned_to_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Only the assigned operator or owner can return this handoff';
  END IF;

  UPDATE public.handoff_cases
  SET status = 'RETURNED_TO_AI', assigned_to_user_id = NULL, resolved_at = NULL
  WHERE id = p_handoff_case_id AND workspace_id = p_workspace_id;
  INSERT INTO public.handoff_case_events (
    workspace_id, handoff_case_id, from_status, to_status, reason, actor_user_id, idempotency_key
  ) VALUES (p_workspace_id, p_handoff_case_id, 'ACCEPTED', 'RETURNED_TO_AI', btrim(p_reason), v_actor, p_idempotency_key);
  RETURN jsonb_build_object('handoffCaseId', p_handoff_case_id, 'status', 'RETURNED_TO_AI', 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.set_workspace_outbound_control(
  p_workspace_id UUID,
  p_outbound_enabled BOOLEAN,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID;
  v_previous BOOLEAN;
  v_existing public.operation_control_events%ROWTYPE;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL OR NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Unauthorized outbound control operation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND active) THEN
    RAISE EXCEPTION 'Workspace is inactive or not found';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid outbound control request';
  END IF;
  SELECT * INTO v_existing FROM public.operation_control_events
  WHERE workspace_id = p_workspace_id AND scope = 'WORKSPACE' AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('outboundEnabled', v_existing.outbound_enabled, 'idempotent', true); END IF;

  SELECT outbound_enabled INTO v_previous FROM public.workspace_operation_controls
  WHERE workspace_id = p_workspace_id FOR UPDATE;
  INSERT INTO public.workspace_operation_controls (workspace_id, outbound_enabled, reason, changed_by_user_id)
  VALUES (p_workspace_id, p_outbound_enabled, btrim(p_reason), v_actor)
  ON CONFLICT (workspace_id) DO UPDATE SET outbound_enabled = EXCLUDED.outbound_enabled,
    reason = EXCLUDED.reason, changed_by_user_id = EXCLUDED.changed_by_user_id, changed_at = NOW();
  INSERT INTO public.operation_control_events (
    workspace_id, scope, previous_outbound_enabled, outbound_enabled, reason, actor_user_id, idempotency_key
  ) VALUES (p_workspace_id, 'WORKSPACE', v_previous, p_outbound_enabled, btrim(p_reason), v_actor, p_idempotency_key);
  RETURN jsonb_build_object('outboundEnabled', p_outbound_enabled, 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.set_channel_outbound_control(
  p_workspace_id UUID,
  p_channel_connection_id UUID,
  p_outbound_enabled BOOLEAN,
  p_reason TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID;
  v_previous BOOLEAN;
  v_existing public.operation_control_events%ROWTYPE;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL OR NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Unauthorized outbound control operation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id AND active) THEN
    RAISE EXCEPTION 'Workspace is inactive or not found';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Invalid outbound control request';
  END IF;
  SELECT * INTO v_existing FROM public.operation_control_events
  WHERE workspace_id = p_workspace_id AND scope = 'CHANNEL' AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('outboundEnabled', v_existing.outbound_enabled, 'idempotent', true); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.channel_connections WHERE id = p_channel_connection_id AND workspace_id = p_workspace_id) THEN
    RAISE EXCEPTION 'Channel connection not found';
  END IF;
  SELECT outbound_enabled INTO v_previous FROM public.channel_operation_controls
  WHERE workspace_id = p_workspace_id AND channel_connection_id = p_channel_connection_id FOR UPDATE;
  INSERT INTO public.channel_operation_controls (workspace_id, channel_connection_id, outbound_enabled, reason, changed_by_user_id)
  VALUES (p_workspace_id, p_channel_connection_id, p_outbound_enabled, btrim(p_reason), v_actor)
  ON CONFLICT (workspace_id, channel_connection_id) DO UPDATE SET outbound_enabled = EXCLUDED.outbound_enabled,
    reason = EXCLUDED.reason, changed_by_user_id = EXCLUDED.changed_by_user_id, changed_at = NOW();
  INSERT INTO public.operation_control_events (
    workspace_id, channel_connection_id, scope, previous_outbound_enabled, outbound_enabled, reason, actor_user_id, idempotency_key
  ) VALUES (p_workspace_id, p_channel_connection_id, 'CHANNEL', v_previous, p_outbound_enabled, btrim(p_reason), v_actor, p_idempotency_key);
  RETURN jsonb_build_object('outboundEnabled', p_outbound_enabled, 'idempotent', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- The effective control is intentionally false unless both independent toggles
-- are explicitly enabled. This function is for trusted workers only.
CREATE OR REPLACE FUNCTION public.is_outbound_enabled(
  p_workspace_id UUID,
  p_channel_connection_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE((SELECT outbound_enabled FROM public.workspace_operation_controls WHERE workspace_id = p_workspace_id), FALSE)
    AND COALESCE((SELECT outbound_enabled FROM public.channel_operation_controls
                  WHERE workspace_id = p_workspace_id AND channel_connection_id = p_channel_connection_id), FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '';

REVOKE ALL ON FUNCTION public.require_handoff_operator(UUID) FROM public, anon;
REVOKE ALL ON FUNCTION public.accept_handoff(UUID, UUID, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.resolve_handoff(UUID, UUID, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.return_handoff_to_ai(UUID, UUID, TEXT, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.set_workspace_outbound_control(UUID, BOOLEAN, TEXT, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.set_channel_outbound_control(UUID, UUID, BOOLEAN, TEXT, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.is_outbound_enabled(UUID, UUID) FROM public, anon, authenticated;

-- Default privileges intentionally deny authenticated users on new tables.
-- Give visibility only where the RLS policy permits it; all mutations remain
-- inside the security-definer RPCs above.
GRANT SELECT ON public.workspace_operation_controls TO authenticated;
GRANT SELECT ON public.channel_operation_controls TO authenticated;
GRANT SELECT ON public.operation_control_events TO authenticated;
GRANT SELECT ON public.handoff_case_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_handoff(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_handoff(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.return_handoff_to_ai(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_workspace_outbound_control(UUID, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_channel_outbound_control(UUID, UUID, BOOLEAN, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_outbound_enabled(UUID, UUID) TO service_role;
