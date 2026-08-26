-- ==============================================================================
-- MESSENGER & INSTAGRAM DM CHANNEL EXPANSION
-- Adds messenger/instagram_dm providers, NLP entities, m.me tracking, insights cache
-- ==============================================================================

-- 1. Expand provider enum to include messenger and instagram_dm
ALTER TABLE public.channel_connections 
  DROP CONSTRAINT IF EXISTS channel_connections_provider_check;

ALTER TABLE public.channel_connections 
  ADD CONSTRAINT channel_connections_provider_check 
  CHECK (provider IN ('waha', 'meta_cloud', 'evolution', 'messenger', 'instagram_dm', 'other'));

-- 2. Add optional psid/igsid to contacts for cross-channel identity merge
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS messenger_psid TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram_igsid TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_messenger_psid ON public.contacts(messenger_psid) WHERE messenger_psid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_instagram_igsid ON public.contacts(instagram_igsid) WHERE instagram_igsid IS NOT NULL;

-- 3. NLP entities extracted from Meta webhooks
CREATE TABLE IF NOT EXISTS public.nlp_extracted_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  message_id UUID,
  entity_type TEXT NOT NULL,  -- wit$datetime, wit$amount_of_money, wit$phone_number, wit$email, wit$location
  entity_value JSONB NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nlp_entities_workspace ON public.nlp_extracted_entities(workspace_id);
CREATE INDEX idx_nlp_entities_journey ON public.nlp_extracted_entities(journey_id);
CREATE INDEX idx_nlp_entities_type ON public.nlp_extracted_entities(entity_type);

-- 4. m.me tracking links
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

CREATE UNIQUE INDEX idx_mme_links_ref ON public.mme_tracking_links(workspace_id, ref_code);

CREATE TRIGGER trg_mme_tracking_links_updated_at
  BEFORE UPDATE ON public.mme_tracking_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5. Messenger insights cache (daily snapshots)
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

CREATE INDEX idx_messenger_insights_workspace ON public.messenger_insights_daily(workspace_id);
CREATE INDEX idx_messenger_insights_date ON public.messenger_insights_daily(fact_date DESC);

-- 6. Expand acquisition_contexts source enum if CHECK exists
-- (acquisition_contexts uses TEXT without CHECK, so this is safe)

-- 7. RLS Policies for new tables
ALTER TABLE public.nlp_extracted_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mme_tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messenger_insights_daily ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_nlp_entities" ON public.nlp_extracted_entities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_mme_links" ON public.mme_tracking_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_messenger_insights" ON public.messenger_insights_daily
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: workspace-scoped read
CREATE POLICY "authenticated_read_nlp_entities" ON public.nlp_extracted_entities
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_memberships
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "authenticated_read_mme_links" ON public.mme_tracking_links
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_memberships
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "authenticated_manage_mme_links" ON public.mme_tracking_links
  FOR ALL TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_memberships
      WHERE user_id = auth.uid() AND role IN ('owner', 'operator')
    )
  );

CREATE POLICY "authenticated_read_messenger_insights" ON public.messenger_insights_daily
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_memberships
      WHERE user_id = auth.uid()
    )
  );
