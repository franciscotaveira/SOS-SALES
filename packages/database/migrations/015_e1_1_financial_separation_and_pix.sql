-- =========================================================================
-- SOS Sales V3 — Migration 015: E1.1 Financial Separation & Pix Verification
-- =========================================================================
-- Context: Truth in Data & Financial Separation (MCT OS v2.0)
-- 1. Pix Charges Verification Separation:
--    - verification_method ('UNVERIFIED', 'MANUAL_CASHIER', 'BANK_WEBHOOK')
--    - verified_by_user_id (User who verified the funds)
--    - verified_at
--    - verification_notes
-- 2. Conversion Events Honest Status:
--    - Expand status check to include 'SIMULATED' and 'NOT_CONFIGURED'
-- =========================================================================

ALTER TABLE public.pix_charges
    ADD COLUMN IF NOT EXISTS verification_method text NOT NULL DEFAULT 'UNVERIFIED' 
        CHECK (verification_method IN ('UNVERIFIED', 'MANUAL_CASHIER', 'BANK_WEBHOOK')),
    ADD COLUMN IF NOT EXISTS verified_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS verification_notes text;

ALTER TABLE public.conversion_events 
    DROP CONSTRAINT IF EXISTS conversion_events_status_check;

ALTER TABLE public.conversion_events 
    ADD CONSTRAINT conversion_events_status_check 
    CHECK (status IN ('QUEUED', 'ACCEPTED', 'FAILED', 'NOT_APPLICABLE', 'SIMULATED', 'NOT_CONFIGURED'));

DROP POLICY IF EXISTS worker_user_conversions ON public.conversion_events;

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
                status IN ('ACCEPTED', 'FAILED', 'SIMULATED', 'NOT_CONFIGURED')
        END
    );
