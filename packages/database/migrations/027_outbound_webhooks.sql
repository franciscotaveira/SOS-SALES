-- Migration 027: Outbound Webhooks Infrastructure
-- Supports event subscriptions (lead.created, message.received, proposal.created, payment.settled, stage.changed)
-- With HMAC-SHA256 signature, fail-closed RLS, delivery tracking and test ping capabilities.

CREATE TABLE IF NOT EXISTS public.outbound_webhook_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    url text NOT NULL,
    secret text NOT NULL,
    description text,
    events text[] NOT NULL DEFAULT ARRAY['*']::text[],
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_webhooks_workspace_active 
    ON public.outbound_webhook_subscriptions(workspace_id, is_active);

CREATE TABLE IF NOT EXISTS public.outbound_webhook_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id uuid NOT NULL REFERENCES public.outbound_webhook_subscriptions(id) ON DELETE CASCADE,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL CHECK (status IN ('delivered', 'failed')),
    status_code integer,
    response_body text,
    error_message text,
    duration_ms integer,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_deliveries_subscription 
    ON public.outbound_webhook_deliveries(subscription_id, created_at DESC);

-- Ownership
ALTER TABLE public.outbound_webhook_subscriptions OWNER TO sos_migration_owner;
ALTER TABLE public.outbound_webhook_deliveries OWNER TO sos_migration_owner;

-- RLS Enforcement
ALTER TABLE public.outbound_webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhook_subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.outbound_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhook_deliveries FORCE ROW LEVEL SECURITY;

-- Migration Owner Full Access
CREATE POLICY migration_owner_outbound_webhooks ON public.outbound_webhook_subscriptions
    TO sos_migration_owner USING (true) WITH CHECK (true);

CREATE POLICY migration_owner_outbound_deliveries ON public.outbound_webhook_deliveries
    TO sos_migration_owner USING (true) WITH CHECK (true);

-- App User Tenant Isolation
CREATE POLICY app_user_outbound_webhooks ON public.outbound_webhook_subscriptions
    FOR ALL TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY app_user_outbound_deliveries ON public.outbound_webhook_deliveries
    FOR SELECT TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY app_user_outbound_deliveries_insert ON public.outbound_webhook_deliveries
    FOR INSERT TO sos_app_user
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- Worker User Access
CREATE POLICY worker_user_outbound_webhooks ON public.outbound_webhook_subscriptions
    FOR SELECT TO sos_worker_user
    USING (true);

CREATE POLICY worker_user_outbound_deliveries ON public.outbound_webhook_deliveries
    FOR INSERT TO sos_worker_user
    WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.outbound_webhook_subscriptions TO sos_app_user;
GRANT SELECT, INSERT ON TABLE public.outbound_webhook_deliveries TO sos_app_user;
GRANT SELECT ON TABLE public.outbound_webhook_subscriptions TO sos_worker_user;
GRANT INSERT ON TABLE public.outbound_webhook_deliveries TO sos_worker_user;

REVOKE ALL ON TABLE public.outbound_webhook_subscriptions FROM sos_ingress_user;
REVOKE ALL ON TABLE public.outbound_webhook_deliveries FROM sos_ingress_user;
