-- Make intelligence publication explicit and auditable. The JSON bundle is
-- still forward-compatible, but an operator can now see which schema was
-- published, by whom and when instead of treating every edit as live state.

ALTER TABLE public.workspace_intelligence_bundles
  ADD COLUMN IF NOT EXISTS schema_version text NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid;

CREATE INDEX IF NOT EXISTS idx_workspace_intelligence_bundles_published
  ON public.workspace_intelligence_bundles(workspace_id, published_at DESC);
