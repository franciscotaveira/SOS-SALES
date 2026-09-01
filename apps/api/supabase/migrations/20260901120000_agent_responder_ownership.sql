-- Agent responder ownership.
--
-- A connected WABA can have Meta Business Agent or the SOS Sales runtime as
-- the automatic responder.  This state must be durable and server-enforced;
-- a browser toggle must never be able to make both agents answer a thread.

ALTER TABLE public.workspace_agent_config
  ADD COLUMN IF NOT EXISTS responder_mode text NOT NULL DEFAULT 'sos_sales',
  ADD COLUMN IF NOT EXISTS meta_agent_id text,
  ADD COLUMN IF NOT EXISTS meta_agent_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meta_agent_eligibility_status text NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS meta_agent_checked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_agent_config_responder_mode_check'
  ) THEN
    ALTER TABLE public.workspace_agent_config
      ADD CONSTRAINT workspace_agent_config_responder_mode_check
      CHECK (responder_mode IN ('sos_sales', 'meta_business_agent', 'auto_fallback', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_agent_config_meta_eligibility_check'
  ) THEN
    ALTER TABLE public.workspace_agent_config
      ADD CONSTRAINT workspace_agent_config_meta_eligibility_check
      CHECK (meta_agent_eligibility_status IN ('ELIGIBLE', 'INELIGIBLE', 'UNKNOWN'));
  END IF;
END $$;

ALTER TABLE public.commercial_journeys
  ADD COLUMN IF NOT EXISTS responder_owner text NOT NULL DEFAULT 'sos_sales',
  ADD COLUMN IF NOT EXISTS responder_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS responder_change_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commercial_journeys_responder_owner_check'
  ) THEN
    ALTER TABLE public.commercial_journeys
      ADD CONSTRAINT commercial_journeys_responder_owner_check
      CHECK (responder_owner IN ('sos_sales', 'meta_business_agent', 'human'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commercial_journeys_responder_owner
  ON public.commercial_journeys(workspace_id, responder_owner);

-- Existing conversations keep their current SOS ownership.  New workspaces
-- also default to SOS until an owner explicitly completes Meta onboarding and
-- selects a responder mode.  This is intentionally fail-closed and preserves
-- the behavior of already-running MVP tenants.
