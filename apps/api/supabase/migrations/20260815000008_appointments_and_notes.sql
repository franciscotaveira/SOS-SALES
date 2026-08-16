-- =============================================================================
-- SOS SALES — APPOINTMENTS & OPERATIONAL NOTES
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commercial_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID REFERENCES public.commercial_journeys(id) ON DELETE SET NULL,
  lead_name TEXT NOT NULL,
  lead_phone TEXT NOT NULL,
  service_name TEXT NOT NULL,
  service_value_minor BIGINT NOT NULL DEFAULT 0 CHECK (service_value_minor >= 0),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending_deposit', 'rescheduled', 'completed', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'operator' CHECK (source IN ('bot_ai', 'operator')),
  operator_name TEXT,
  notes TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commercial_appointments_workspace_schedule
  ON public.commercial_appointments(workspace_id, scheduled_at ASC);

CREATE INDEX IF NOT EXISTS idx_commercial_appointments_status
  ON public.commercial_appointments(workspace_id, status);

ALTER TABLE public.commercial_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_commercial_appointments
  ON public.commercial_appointments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY tenant_select_commercial_appointments
  ON public.commercial_appointments FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_insert_commercial_appointments
  ON public.commercial_appointments FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_update_commercial_appointments
  ON public.commercial_appointments FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_delete_commercial_appointments
  ON public.commercial_appointments FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_appointments TO authenticated;
GRANT ALL ON public.commercial_appointments TO service_role;


CREATE TABLE IF NOT EXISTS public.operational_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('script', 'meeting', 'lead_vip', 'goal', 'general')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  pinned BOOLEAN NOT NULL DEFAULT false,
  color TEXT DEFAULT 'slate' CHECK (color IN ('emerald', 'purple', 'amber', 'blue', 'rose', 'slate')),
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_notes_workspace_updated
  ON public.operational_notes(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_notes_category
  ON public.operational_notes(workspace_id, category);

ALTER TABLE public.operational_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_operational_notes
  ON public.operational_notes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY tenant_select_operational_notes
  ON public.operational_notes FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_insert_operational_notes
  ON public.operational_notes FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_update_operational_notes
  ON public.operational_notes FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_delete_operational_notes
  ON public.operational_notes FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_notes TO authenticated;
GRANT ALL ON public.operational_notes TO service_role;
