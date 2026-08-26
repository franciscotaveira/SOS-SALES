-- AI Receptionist: explicit per-journey enablement.
-- Existing and future journeys remain disabled until an authorized operator
-- explicitly enables the bot for that single journey.

ALTER TABLE public.commercial_journeys
  ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE public.commercial_journeys
SET bot_enabled = false
WHERE bot_enabled IS DISTINCT FROM false;

CREATE INDEX IF NOT EXISTS idx_commercial_journeys_workspace_bot_enabled
  ON public.commercial_journeys(workspace_id, bot_enabled)
  WHERE bot_enabled = true;
