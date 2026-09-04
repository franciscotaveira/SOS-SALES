-- Repair the workspace-agent contract in installations that created only the
-- runtime columns (autonomy/runtime/behavior) and missed the published profile
-- columns consumed by ReceptionistAgent.  This migration is intentionally
-- additive and idempotent so it can be applied to both older VPS databases and
-- clean databases that already have the complete table.

ALTER TABLE public.workspace_agent_config
  ADD COLUMN IF NOT EXISTS agent_name text NOT NULL DEFAULT 'Assistente',
  ADD COLUMN IF NOT EXISTS business_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS services_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS working_hours text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS booking_url text,
  ADD COLUMN IF NOT EXISTS booking_flow_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extra_context text,
  ADD COLUMN IF NOT EXISTS meta_agent_channel_connection_id uuid;

-- The agent is configured for one concrete WABA phone, not for an abstract
-- workspace.  Keeping that binding beside the workspace state prevents a
-- second/legacy Meta connection from inheriting the first phone's agent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_agent_config_meta_channel_same_workspace'
  ) THEN
    ALTER TABLE public.workspace_agent_config
      ADD CONSTRAINT workspace_agent_config_meta_channel_same_workspace
      FOREIGN KEY (workspace_id, meta_agent_channel_connection_id)
      REFERENCES public.channel_connections(workspace_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspace_agent_config_meta_channel
  ON public.workspace_agent_config(meta_agent_channel_connection_id)
  WHERE meta_agent_channel_connection_id IS NOT NULL;

-- Never make an incomplete row look published merely because an older table
-- used NOW() as the published_at default.  A real owner must publish a
-- complete profile before autonomous replies are allowed.
ALTER TABLE public.workspace_agent_config
  ALTER COLUMN runtime_enabled SET DEFAULT false,
  ALTER COLUMN autonomy_mode SET DEFAULT 'copilot_supervised',
  ALTER COLUMN published_at DROP DEFAULT;

-- Rows created by the older runtime-only contract do not have enough profile
-- data for us to reconstruct a business persona. Keep an already published
-- row's visible/runtime state intact so this additive repair cannot turn a
-- running tenant off as a side effect. Regardless of that legacy state, the
-- new autonomous runtime is forced back to supervised mode until an owner
-- completes and republishes the profile; rows without a publication are also
-- made inert.
UPDATE public.workspace_agent_config
SET runtime_enabled = CASE
      WHEN published_at IS NULL THEN false
      ELSE runtime_enabled
    END,
    autonomy_mode = 'copilot_supervised',
    published_at = CASE
      WHEN published_at IS NULL THEN NULL
      ELSE published_at
    END,
    published_by = CASE
      WHEN published_at IS NULL THEN NULL
      ELSE published_by
    END
WHERE COALESCE(NULLIF(pg_catalog.btrim(business_type), ''), '') = ''
  AND services_json = '[]'::jsonb
  AND COALESCE(NULLIF(pg_catalog.btrim(working_hours), ''), '') = ''
  AND booking_url IS NULL
  AND COALESCE(NULLIF(pg_catalog.btrim(extra_context), ''), '') = '';
