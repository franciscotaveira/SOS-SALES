-- Workspace agent runtime contract.
-- The browser is never the source of truth for autonomous behavior.

ALTER TABLE public.workspace_agent_config
  ADD COLUMN IF NOT EXISTS autonomy_mode text NOT NULL DEFAULT 'copilot_supervised',
  ADD COLUMN IF NOT EXISTS runtime_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS behavior_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'workspace_agent_config_autonomy_mode_check'
  ) THEN
    ALTER TABLE public.workspace_agent_config
      ADD CONSTRAINT workspace_agent_config_autonomy_mode_check
      CHECK (autonomy_mode IN ('copilot_supervised', 'semi_autonomous', 'autonomous_24_7'));
  END IF;
END $$;

-- Existing rows remain fail-closed until an authorized admin publishes them.
UPDATE public.workspace_agent_config
SET runtime_enabled = false,
    autonomy_mode = 'copilot_supervised'
WHERE published_at IS NULL;
