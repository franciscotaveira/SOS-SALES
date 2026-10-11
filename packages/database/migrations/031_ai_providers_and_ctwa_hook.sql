-- Migration 031: AI Provider Selection (Nvidia NIM / OpenRouter) and CTWA Hook Memory
-- Implements multi-provider LLM support, handoff executive briefing, and ad hook context

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'nvidia' CHECK (ai_provider IN ('nvidia', 'openrouter')),
  ADD COLUMN IF NOT EXISTS ai_model text NOT NULL DEFAULT 'nvidia/nemotron-3-super-120b-a12b',
  ADD COLUMN IF NOT EXISTS ai_api_key text;

ALTER TABLE public.commercial_threads
  ADD COLUMN IF NOT EXISTS handoff_reason text,
  ADD COLUMN IF NOT EXISTS handoff_at timestamptz;

ALTER TABLE public.commercial_journeys
  ADD COLUMN IF NOT EXISTS ad_headline text,
  ADD COLUMN IF NOT EXISTS ad_body text;

COMMENT ON COLUMN public.workspaces.ai_provider IS 'Active LLM Provider: nvidia (Nvidia NIM) or openrouter';
COMMENT ON COLUMN public.workspaces.ai_model IS 'Selected model identifier for the active provider';
COMMENT ON COLUMN public.workspaces.ai_api_key IS 'Workspace-specific API key for Nvidia NIM or OpenRouter (optional override)';
COMMENT ON COLUMN public.commercial_threads.handoff_reason IS 'Structured briefing of why AI transferred this conversation to a human';
COMMENT ON COLUMN public.commercial_threads.handoff_at IS 'Timestamp when AI handoff was triggered';
COMMENT ON COLUMN public.commercial_journeys.ad_headline IS 'Meta CTWA ad headline that acquired this lead';
COMMENT ON COLUMN public.commercial_journeys.ad_body IS 'Meta CTWA ad body text for AI Hook Memory';
