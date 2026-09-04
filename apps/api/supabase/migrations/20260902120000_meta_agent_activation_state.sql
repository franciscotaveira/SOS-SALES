-- Meta Business Agent activation is asynchronous: an agent_id returned by
-- onboarding is not proof that the official responder is ready. Keep this
-- state in a new migration so installations that already applied the
-- responder-ownership migration do not need to replay an old file.

ALTER TABLE public.workspace_agent_config
  ADD COLUMN IF NOT EXISTS meta_agent_activation_status text NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS meta_agent_onboarding_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_agent_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_agent_last_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_agent_config_meta_activation_check'
  ) THEN
    ALTER TABLE public.workspace_agent_config
      ADD CONSTRAINT workspace_agent_config_meta_activation_check
      CHECK (meta_agent_activation_status IN ('NOT_STARTED', 'PENDING', 'READY', 'FAILED'));
  END IF;
END $$;
