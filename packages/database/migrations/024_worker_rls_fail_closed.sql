-- =========================================================================
-- SOS Sales V3 — Migration 024: Worker RLS Fail-Closed Hardening (R2)
-- =========================================================================
-- Context: S-04 Worker Least Privilege & Strict Multi-Tenant Isolation
-- Compliance:
--   - Remove all permissive 'ELSE true' policies for sos_worker_user.
--   - Without explicit app.current_workspace_id, access to commercial journeys,
--     outcomes, proposals, pix charges, and flows strictly fails closed (0 rows).
--   - Worker must operate strictly inside tenant transaction context per item.
-- =========================================================================

-- 1. Commercial Journeys: Strict workspace scoping for worker
DROP POLICY IF EXISTS worker_user_journeys ON public.commercial_journeys;
CREATE POLICY worker_user_journeys ON public.commercial_journeys
    TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- 2. Commercial Outcomes: Strict workspace scoping for worker
DROP POLICY IF EXISTS worker_user_outcomes ON public.commercial_outcomes;
CREATE POLICY worker_user_outcomes ON public.commercial_outcomes
    TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- 3. Pix Charges: Strict workspace scoping for worker
DROP POLICY IF EXISTS worker_user_pix_charges ON public.pix_charges;
CREATE POLICY worker_user_pix_charges ON public.pix_charges
    TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- 4. Commercial Proposals: Strict workspace scoping for worker
DROP POLICY IF EXISTS worker_user_proposals ON public.commercial_proposals;
CREATE POLICY worker_user_proposals ON public.commercial_proposals
    TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- 5. WhatsApp Flows: Strict workspace scoping for worker
DROP POLICY IF EXISTS worker_user_flows ON public.whatsapp_flows;
CREATE POLICY worker_user_flows ON public.whatsapp_flows
    TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- 6. Integration Suggestions: Strict workspace scoping for worker
DROP POLICY IF EXISTS worker_user_suggestions ON public.integration_suggestions;
CREATE POLICY worker_user_suggestions ON public.integration_suggestions
    TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);
