-- Migration 011: Bot Pause Controls
-- agent-routes.ts (bot/status, bot/pause, bot/resume) and receptionist-agent.ts
-- read/write these columns but no migration ever created them, so the routes
-- 500 in production while the receptionist silently no-ops via its catch fallback.

ALTER TABLE public.commercial_journeys
  ADD COLUMN IF NOT EXISTS bot_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bot_pause_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_commercial_journeys_workspace_bot_paused
  ON public.commercial_journeys(workspace_id, bot_paused_at)
  WHERE bot_paused_at IS NOT NULL;
