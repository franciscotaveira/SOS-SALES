-- Persist cockpit business settings that were previously kept in browser
-- localStorage.  Empty values are intentional: production must never invent
-- a Pix key, price, address, target or loyalty classification.

CREATE TABLE IF NOT EXISTS public.workspace_operational_settings (
  workspace_id                uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  commercial_config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  loyalty_overrides            jsonb NOT NULL DEFAULT '{}'::jsonb,
  daily_target_revenue_minor   bigint NOT NULL DEFAULT 0 CHECK (daily_target_revenue_minor >= 0),
  created_at                   timestamptz NOT NULL DEFAULT NOW(),
  updated_at                   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_operational_settings_updated
  ON public.workspace_operational_settings(workspace_id, updated_at DESC);

ALTER TABLE public.workspace_operational_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_operational_settings_select
  ON public.workspace_operational_settings;
CREATE POLICY workspace_operational_settings_select
  ON public.workspace_operational_settings FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

DROP POLICY IF EXISTS workspace_operational_settings_write
  ON public.workspace_operational_settings;
CREATE POLICY workspace_operational_settings_write
  ON public.workspace_operational_settings FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT public.current_user_workspace_ids()));

DROP POLICY IF EXISTS workspace_operational_settings_update
  ON public.workspace_operational_settings;
CREATE POLICY workspace_operational_settings_update
  ON public.workspace_operational_settings FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.current_user_workspace_ids()));

DROP POLICY IF EXISTS workspace_operational_settings_delete
  ON public.workspace_operational_settings;
CREATE POLICY workspace_operational_settings_delete
  ON public.workspace_operational_settings FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.workspace_operational_settings TO authenticated;
GRANT ALL ON public.workspace_operational_settings TO service_role;
