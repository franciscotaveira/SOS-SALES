-- =========================================================================
-- SOS Sales V3 — Migration 016: E1.1 Final Ajuste — CAPI Concurrency & Pix Message Metadata
-- =========================================================================
-- Context:
--   1. Messages metadata column for canonical chargeId attachment.
--   2. Conversion events atomic lease claiming (status PROCESSING + lease_token + lease_expires_at).
--   3. Alignment of conversion_events status constraint with TypeScript contract (including DISCARDED).
--   4. Worker RLS update to allow claiming and resolving PROCESSING leases.
-- =========================================================================

-- 1. Metadata on messages for structured event/charge tracking
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_metadata_charge_id
    ON public.messages (workspace_id, thread_id, ((metadata->>'chargeId')::text))
    WHERE metadata ? 'chargeId';

-- 2. CAPI Concurrency & Lease Tracking on conversion_events
ALTER TABLE public.conversion_events
    ADD COLUMN IF NOT EXISTS lease_token text,
    ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_conversion_events_lease 
    ON public.conversion_events (status, lease_expires_at);

-- 3. Update status constraint to include PROCESSING and DISCARDED
ALTER TABLE public.conversion_events 
    DROP CONSTRAINT IF EXISTS conversion_events_status_check;

ALTER TABLE public.conversion_events 
    ADD CONSTRAINT conversion_events_status_check 
    CHECK (status IN (
        'QUEUED',
        'PROCESSING',
        'ACCEPTED',
        'FAILED',
        'NOT_APPLICABLE',
        'SIMULATED',
        'NOT_CONFIGURED',
        'DISCARDED'
    ));

-- 4. Update Worker RLS Policy for atomic claiming & processing
DROP POLICY IF EXISTS worker_user_conversions ON public.conversion_events;

CREATE POLICY worker_user_conversions ON public.conversion_events TO sos_worker_user
    USING (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                status IN ('QUEUED', 'PROCESSING')
        END
    )
    WITH CHECK (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                status IN ('QUEUED', 'PROCESSING', 'ACCEPTED', 'FAILED', 'SIMULATED', 'NOT_CONFIGURED', 'DISCARDED')
        END
    );
