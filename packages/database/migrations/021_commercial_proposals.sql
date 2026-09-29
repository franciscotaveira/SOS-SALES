-- =========================================================================
-- SOS Sales V3 — Migration 021: Commercial Proposals & Immutable Snapshots (M6)
-- =========================================================================
-- Context: Commercial flow, catalog snapshotting, and commercial proposals
-- Compliance:
--   - Truth in Data: Proposal items, prices and conditions are saved as an
--     immutable snapshot (JSONB) that does NOT mutate if catalog items change later.
--   - Multi-item support with quantities, unit price, and total in cents.
--   - Explicit link between proposals, journeys, threads and Pix charges.
--   - Tenant Isolation: FORCE ROW LEVEL SECURITY (RLS) under app.current_workspace_id
--   - Least-privilege grants (REVOKE DELETE for application user).
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.commercial_proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    thread_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    journey_id uuid REFERENCES public.commercial_journeys(id) ON DELETE SET NULL,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled')),
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_cents integer NOT NULL CHECK (total_cents >= 0),
    currency text NOT NULL DEFAULT 'BRL',
    conditions text,
    valid_until timestamptz,
    sent_at timestamptz,
    accepted_at timestamptz,
    rejected_at timestamptz,
    cancelled_at timestamptz,
    created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_commercial_proposals_thread FOREIGN KEY (workspace_id, thread_id)
        REFERENCES public.commercial_threads(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_commercial_proposals_contact FOREIGN KEY (workspace_id, contact_id)
        REFERENCES public.contacts(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_commercial_proposals_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_proposals_workspace ON public.commercial_proposals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_commercial_proposals_thread ON public.commercial_proposals(workspace_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_commercial_proposals_contact ON public.commercial_proposals(workspace_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_commercial_proposals_status ON public.commercial_proposals(workspace_id, status);

-- Link pix_charges to commercial_proposals
ALTER TABLE public.pix_charges
    ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.commercial_proposals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pix_charges_proposal 
    ON public.pix_charges(workspace_id, proposal_id);

-- -------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY & LEAST PRIVILEGE
-- -------------------------------------------------------------------------

ALTER TABLE public.commercial_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_proposals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS migration_owner_proposals ON public.commercial_proposals;
CREATE POLICY migration_owner_proposals ON public.commercial_proposals 
    TO sos_migration_owner USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS app_user_proposals ON public.commercial_proposals;
CREATE POLICY app_user_proposals ON public.commercial_proposals 
    TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

DROP POLICY IF EXISTS worker_user_proposals ON public.commercial_proposals;
CREATE POLICY worker_user_proposals ON public.commercial_proposals 
    TO sos_worker_user
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

-- Defense-in-depth: Grant only SELECT, INSERT, UPDATE (no DELETE) to app user
REVOKE ALL ON TABLE public.commercial_proposals FROM PUBLIC, sos_app_user, sos_worker_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_proposals TO sos_app_user;
GRANT SELECT ON TABLE public.commercial_proposals TO sos_worker_user;
