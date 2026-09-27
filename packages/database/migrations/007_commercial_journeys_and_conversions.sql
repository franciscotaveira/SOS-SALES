-- =========================================================================
-- SOS Sales V3 — Migration 007: Commercial Journeys, Outcomes & Conversions
-- =========================================================================
-- Context: Commercial Core & Meta CAPI Return Loop (ADR-001)
-- Compliance:
--   - ADR-001 (Closed Commercial Loop: Lead -> Thread -> Outcome -> CAPI)
--   - Truth in Data (Real monetary values in cents, immutable auditability)
--   - Tenant Isolation (FORCE RLS, composite foreign keys with workspace_id)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. TABLE DEFINITIONS
-- -------------------------------------------------------------------------

-- 1.1 Commercial Journeys (Opportunities / Deals)
CREATE TABLE IF NOT EXISTS public.commercial_journeys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    contact_id uuid NOT NULL,
    thread_id uuid,
    assigned_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    title text NOT NULL DEFAULT 'Oportunidade Comercial',
    stage text NOT NULL DEFAULT 'lead' CHECK (stage IN ('lead', 'qualified', 'proposal', 'scheduled', 'won', 'lost')),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost', 'archived')),
    attribution_source text NOT NULL DEFAULT 'organic_whatsapp' CHECK (attribution_source IN ('ctwa_meta', 'lead_ads_meta', 'tracked_link_meta', 'organic_whatsapp', 'manual_input')),
    campaign_id text,
    ad_id text,
    ctwa_clid text,
    estimated_value_cents integer NOT NULL DEFAULT 0 CHECK (estimated_value_cents >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_commercial_journeys_contact FOREIGN KEY (workspace_id, contact_id)
        REFERENCES public.contacts(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_commercial_journeys_thread FOREIGN KEY (workspace_id, thread_id)
        REFERENCES public.commercial_threads(workspace_id, id) ON DELETE SET NULL,
    CONSTRAINT uq_commercial_journeys_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_journeys_contact ON public.commercial_journeys(workspace_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_commercial_journeys_status ON public.commercial_journeys(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_commercial_journeys_stage ON public.commercial_journeys(workspace_id, stage);

-- 1.2 Commercial Outcomes (Closed Deals with Real Financial Value)
CREATE TABLE IF NOT EXISTS public.commercial_outcomes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    journey_id uuid NOT NULL,
    status text NOT NULL CHECK (status IN ('won', 'lost')),
    value_cents integer NOT NULL DEFAULT 0 CHECK (value_cents >= 0),
    currency text NOT NULL DEFAULT 'BRL',
    reason text,
    registered_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_commercial_outcomes_journey FOREIGN KEY (workspace_id, journey_id)
        REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_commercial_outcomes_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_outcomes_journey ON public.commercial_outcomes(workspace_id, journey_id);

-- 1.3 Conversion Events (Meta CAPI Outbox / Dispatch Log)
CREATE TABLE IF NOT EXISTS public.conversion_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    journey_id uuid NOT NULL,
    outcome_id uuid,
    event_name text NOT NULL CHECK (event_name IN ('LeadCaptured', 'LeadQualified', 'AppointmentScheduled', 'ProposalAccepted', 'PurchaseCompleted', 'PurchaseRefunded')),
    event_time timestamptz NOT NULL DEFAULT now(),
    value_cents integer CHECK (value_cents IS NULL OR value_cents >= 0),
    currency text NOT NULL DEFAULT 'BRL',
    user_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'ACCEPTED', 'FAILED', 'NOT_APPLICABLE')),
    provider_receipt jsonb,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_conversion_events_journey FOREIGN KEY (workspace_id, journey_id)
        REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_conversion_events_outcome FOREIGN KEY (workspace_id, outcome_id)
        REFERENCES public.commercial_outcomes(workspace_id, id) ON DELETE SET NULL,
    CONSTRAINT uq_conversion_events_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_conversion_events_status ON public.conversion_events(workspace_id, status);

-- -------------------------------------------------------------------------
-- 2. FORCE ROW LEVEL SECURITY (RLS) POLICIES
-- -------------------------------------------------------------------------

ALTER TABLE public.commercial_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_journeys FORCE ROW LEVEL SECURITY;

ALTER TABLE public.commercial_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_outcomes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversion_events FORCE ROW LEVEL SECURITY;

-- Migration owner full maintenance access
CREATE POLICY migration_owner_journeys ON public.commercial_journeys TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_outcomes ON public.commercial_outcomes TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_conversions ON public.conversion_events TO sos_migration_owner USING (true) WITH CHECK (true);

-- App user tenant isolation (fail-closed)
CREATE POLICY app_user_journeys ON public.commercial_journeys TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY app_user_outcomes ON public.commercial_outcomes TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY app_user_conversions ON public.conversion_events TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- Worker user tenant + queue processing policy
CREATE POLICY worker_user_journeys ON public.commercial_journeys TO sos_worker_user
    USING (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                true
        END
    )
    WITH CHECK (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                true
        END
    );

CREATE POLICY worker_user_outcomes ON public.commercial_outcomes TO sos_worker_user
    USING (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                true
        END
    )
    WITH CHECK (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                true
        END
    );

CREATE POLICY worker_user_conversions ON public.conversion_events TO sos_worker_user
    USING (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                status = 'QUEUED'
        END
    )
    WITH CHECK (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                status IN ('ACCEPTED', 'FAILED')
        END
    );

-- -------------------------------------------------------------------------
-- 3. LEAST PRIVILEGE GRANTS & REVOCATIONS
-- -------------------------------------------------------------------------

-- sos_app_user grants
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_journeys TO sos_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_outcomes TO sos_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversion_events TO sos_app_user;

REVOKE DELETE ON TABLE public.commercial_journeys FROM sos_app_user;
REVOKE DELETE ON TABLE public.commercial_outcomes FROM sos_app_user;
REVOKE DELETE ON TABLE public.conversion_events FROM sos_app_user;

-- sos_worker_user grants
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_journeys TO sos_worker_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_outcomes TO sos_worker_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversion_events TO sos_worker_user;

REVOKE DELETE ON TABLE public.commercial_journeys FROM sos_worker_user;
REVOKE DELETE ON TABLE public.commercial_outcomes FROM sos_worker_user;
REVOKE DELETE ON TABLE public.conversion_events FROM sos_worker_user;

-- Column-level reference grants for composite FK safety
GRANT REFERENCES (id, workspace_id) ON TABLE public.commercial_journeys TO sos_app_user, sos_worker_user;
GRANT REFERENCES (id, workspace_id) ON TABLE public.commercial_outcomes TO sos_app_user, sos_worker_user;
