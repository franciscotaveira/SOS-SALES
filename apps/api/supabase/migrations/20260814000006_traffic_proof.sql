-- =============================================================================
-- SOS SALES — PROVA DE TRÁFEGO AUDITÁVEL
-- Importações diárias append-only de gasto por campanha. Esta tabela não é uma
-- integração de credencial: cada fato preserva origem e momento de observação.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.campaign_spend_daily_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('meta_ads', 'google_ads', 'instagram_organic', 'google_business', 'referral', 'other')),
  campaign_id TEXT,
  campaign_name TEXT,
  fact_date DATE NOT NULL,
  spend_minor BIGINT NOT NULL CHECK (spend_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  provider_observed_at TIMESTAMPTZ NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_import_key TEXT NOT NULL CHECK (char_length(btrim(source_import_key)) BETWEEN 8 AND 200),
  CONSTRAINT uq_campaign_spend_daily_facts_import
    UNIQUE (workspace_id, source, source_import_key)
);

CREATE INDEX IF NOT EXISTS idx_campaign_spend_daily_facts_workspace_date
  ON public.campaign_spend_daily_facts(workspace_id, fact_date, source, campaign_id);

CREATE TRIGGER trg_campaign_spend_daily_facts_immutable
  BEFORE UPDATE OR DELETE ON public.campaign_spend_daily_facts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

ALTER TABLE public.campaign_spend_daily_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_campaign_spend_daily_facts
  ON public.campaign_spend_daily_facts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY tenant_select_campaign_spend_daily_facts
  ON public.campaign_spend_daily_facts FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

GRANT SELECT ON public.campaign_spend_daily_facts TO authenticated;
GRANT ALL ON public.campaign_spend_daily_facts TO service_role;
