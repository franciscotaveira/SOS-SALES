-- Forward-only repair for Meta Messenger/Instagram companion tables.
--
-- Migration 20260818000011 is present in some remote ledgers while the
-- companion tables are absent (schema drift).  Reconcile that drift without
-- deleting data or resetting the database.  CREATE/ALTER ... IF NOT EXISTS
-- keeps this migration safe to resume on a partially repaired installation.

CREATE TABLE IF NOT EXISTS public.nlp_extracted_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  -- Meta provider identifiers are opaque strings, not UUIDs.
  message_id TEXT,
  entity_type TEXT NOT NULL,
  entity_value JSONB NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mme_tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  page_name TEXT NOT NULL,
  ref_code TEXT NOT NULL,
  full_url TEXT NOT NULL,
  label TEXT,
  click_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.messenger_insights_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_connection_id UUID NOT NULL,
  fact_date DATE NOT NULL,
  metric_name TEXT NOT NULL,
  metric_value BIGINT NOT NULL DEFAULT 0,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_messenger_insights UNIQUE(workspace_id, channel_connection_id, fact_date, metric_name)
);

-- Additive completion for installations that contain a partially-created
-- table but are missing one of the columns used by the API.
ALTER TABLE public.nlp_extracted_entities ADD COLUMN IF NOT EXISTS message_id TEXT;
ALTER TABLE public.mme_tracking_links ADD COLUMN IF NOT EXISTS page_name TEXT;
ALTER TABLE public.mme_tracking_links ADD COLUMN IF NOT EXISTS ref_code TEXT;
ALTER TABLE public.mme_tracking_links ADD COLUMN IF NOT EXISTS full_url TEXT;
ALTER TABLE public.mme_tracking_links ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE public.mme_tracking_links ADD COLUMN IF NOT EXISTS click_count INT DEFAULT 0;
ALTER TABLE public.mme_tracking_links ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.mme_tracking_links ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.messenger_insights_daily ADD COLUMN IF NOT EXISTS channel_connection_id UUID;
ALTER TABLE public.messenger_insights_daily ADD COLUMN IF NOT EXISTS fact_date DATE;
ALTER TABLE public.messenger_insights_daily ADD COLUMN IF NOT EXISTS metric_name TEXT;
ALTER TABLE public.messenger_insights_daily ADD COLUMN IF NOT EXISTS metric_value BIGINT DEFAULT 0;
ALTER TABLE public.messenger_insights_daily ADD COLUMN IF NOT EXISTS raw_payload JSONB;
ALTER TABLE public.messenger_insights_daily ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_nlp_entities_workspace ON public.nlp_extracted_entities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_nlp_entities_journey ON public.nlp_extracted_entities(journey_id);
CREATE INDEX IF NOT EXISTS idx_nlp_entities_type ON public.nlp_extracted_entities(entity_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mme_links_ref ON public.mme_tracking_links(workspace_id, ref_code);
CREATE INDEX IF NOT EXISTS idx_messenger_insights_workspace ON public.messenger_insights_daily(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messenger_insights_date ON public.messenger_insights_daily(fact_date DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.mme_tracking_links'::regclass
      AND tgname = 'trg_mme_tracking_links_updated_at'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_mme_tracking_links_updated_at
      BEFORE UPDATE ON public.mme_tracking_links
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.nlp_extracted_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mme_tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_insights_daily ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nlp_extracted_entities' AND policyname = 'service_role_nlp_entities') THEN
    CREATE POLICY service_role_nlp_entities ON public.nlp_extracted_entities
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mme_tracking_links' AND policyname = 'service_role_mme_links') THEN
    CREATE POLICY service_role_mme_links ON public.mme_tracking_links
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messenger_insights_daily' AND policyname = 'service_role_messenger_insights') THEN
    CREATE POLICY service_role_messenger_insights ON public.messenger_insights_daily
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'nlp_extracted_entities' AND policyname = 'authenticated_read_nlp_entities') THEN
    CREATE POLICY authenticated_read_nlp_entities ON public.nlp_extracted_entities
      FOR SELECT TO authenticated
      USING (workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mme_tracking_links' AND policyname = 'authenticated_read_mme_links') THEN
    CREATE POLICY authenticated_read_mme_links ON public.mme_tracking_links
      FOR SELECT TO authenticated
      USING (workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mme_tracking_links' AND policyname = 'authenticated_manage_mme_links') THEN
    CREATE POLICY authenticated_manage_mme_links ON public.mme_tracking_links
      FOR ALL TO authenticated
      USING (workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships
        WHERE user_id = auth.uid() AND role IN ('owner', 'operator')
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'messenger_insights_daily' AND policyname = 'authenticated_read_messenger_insights') THEN
    CREATE POLICY authenticated_read_messenger_insights ON public.messenger_insights_daily
      FOR SELECT TO authenticated
      USING (workspace_id IN (
        SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()
      ));
  END IF;
END $$;
