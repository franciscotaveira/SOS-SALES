-- Cakto becomes the source of truth for SOS Vendas SaaS subscriptions.
-- Provider credentials never live in these tables; only public provider IDs do.

CREATE TABLE IF NOT EXISTS public.billing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('standard', 'agency', 'enterprise')),
  provider TEXT NOT NULL DEFAULT 'cakto' CHECK (provider = 'cakto'),
  provider_product_id TEXT NOT NULL,
  provider_offer_id TEXT NOT NULL,
  checkout_url TEXT NOT NULL CHECK (checkout_url ~ '^https://'),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  interval_unit TEXT NOT NULL CHECK (interval_unit IN ('day', 'week', 'month', 'year')),
  interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_billing_plans_provider_offer UNIQUE (provider, provider_offer_id)
);

CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  billing_plan_id UUID NOT NULL REFERENCES public.billing_plans(id),
  provider TEXT NOT NULL DEFAULT 'cakto' CHECK (provider = 'cakto'),
  provider_subscription_id TEXT,
  provider_order_id TEXT NOT NULL,
  provider_customer_id TEXT,
  customer_email TEXT NOT NULL CHECK (customer_email = lower(customer_email)),
  customer_name TEXT,
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'trialing', 'active', 'past_due', 'paused',
    'canceled', 'expired', 'refunded', 'chargeback'
  )),
  payment_method TEXT,
  current_period INTEGER,
  current_period_end TIMESTAMPTZ,
  access_until TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  last_provider_event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_workspace_subscriptions_provider_order UNIQUE (provider, provider_order_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_subscriptions_provider_subscription
  ON public.workspace_subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_workspace
  ON public.workspace_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_customer_email
  ON public.workspace_subscriptions(customer_email);

CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'cakto' CHECK (provider = 'cakto'),
  provider_event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_order_id TEXT,
  payload JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'ignored', 'failed')),
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT uq_billing_webhook_event UNIQUE (provider, provider_event_key)
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_status
  ON public.billing_webhook_events(processing_status, received_at);

INSERT INTO public.billing_plans (
  code, name, tier, provider_product_id, provider_offer_id, checkout_url,
  amount_minor, currency, interval_unit, interval_count, active
) VALUES
  ('standard-monthly', 'SOS Vendas Mensal', 'standard',
   '864d8956-46ff-4e2a-9b03-304d756f755d', 'rjp9yrg_1086792',
   'https://pay.cakto.com.br/rjp9yrg_1086792', 9700, 'BRL', 'month', 1, true),
  ('standard-annual-pix', 'SOS Vendas Anual Pix', 'standard',
   '864d8956-46ff-4e2a-9b03-304d756f755d', 'hi6kzc3',
   'https://pay.cakto.com.br/hi6kzc3', 58200, 'BRL', 'year', 1, true),
  ('standard-annual-card', 'SOS Vendas Anual Cartão', 'standard',
   '864d8956-46ff-4e2a-9b03-304d756f755d', 'azum85z',
   'https://pay.cakto.com.br/azum85z', 69840, 'BRL', 'year', 1, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  tier = EXCLUDED.tier,
  provider_product_id = EXCLUDED.provider_product_id,
  provider_offer_id = EXCLUDED.provider_offer_id,
  checkout_url = EXCLUDED.checkout_url,
  amount_minor = EXCLUDED.amount_minor,
  currency = EXCLUDED.currency,
  interval_unit = EXCLUDED.interval_unit,
  interval_count = EXCLUDED.interval_count,
  active = EXCLUDED.active;

CREATE TRIGGER trg_billing_plans_updated_at
  BEFORE UPDATE ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_workspace_subscriptions_updated_at
  BEFORE UPDATE ON public.workspace_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_plans_authenticated_read
  ON public.billing_plans FOR SELECT TO authenticated
  USING (active = true);

CREATE POLICY workspace_subscriptions_member_read
  ON public.workspace_subscriptions FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspace_memberships membership
      WHERE membership.workspace_id = workspace_subscriptions.workspace_id
        AND membership.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.billing_plans, public.workspace_subscriptions, public.billing_webhook_events FROM anon;
GRANT SELECT ON public.billing_plans, public.workspace_subscriptions TO authenticated;
GRANT ALL ON public.billing_plans, public.workspace_subscriptions, public.billing_webhook_events TO service_role;
