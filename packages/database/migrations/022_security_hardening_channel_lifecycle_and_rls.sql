-- =========================================================================
-- SOS Sales V3 — Migration 022: Security Hardening, Channel Lifecycle & RLS (R2)
-- =========================================================================
-- Context: Phase R2 Remediation (S-02 Channel State Machine, S-04 Least Privilege)
-- Compliance:
--   - Explicit Channel State Machine ('unconfigured', 'validating', 'pairing', 'connected', 'error', 'revoked')
--   - Active status bidirectional sync:
--       * status = 'connected' <=> is_active = true
--       * legacy/unconfigured inserts with is_active = true auto-sync to status = 'connected'
--       * updating is_active = false auto-syncs status = 'revoked'
--   - Financial Immutability: Revoke DELETE on pix_charges, commercial_proposals,
--     and commercial_outcomes for app and worker operational roles.
--   - Tenant isolation & fail-closed security.
-- =========================================================================

-- 1. Add status column to channel_instances with governed enum values
ALTER TABLE public.channel_instances
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'unconfigured'
    CHECK (status IN ('unconfigured', 'validating', 'pairing', 'connected', 'error', 'revoked'));

ALTER TABLE public.channel_instances
    ALTER COLUMN is_active SET DEFAULT false;

-- Backfill existing channels: active channels require validation ('validating'), inactive are 'unconfigured'
UPDATE public.channel_instances
SET status = CASE WHEN is_active = true THEN 'validating' ELSE 'unconfigured' END
WHERE status = 'unconfigured';

-- 2. Trigger function to ensure status and is_active stay strictly synchronized
CREATE OR REPLACE FUNCTION public.sync_channel_instance_status()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- If status is explicitly connected or legacy insert provided is_active = true
        IF NEW.status = 'connected' OR (NEW.status IS NULL AND NEW.is_active = true) OR (NEW.status = 'unconfigured' AND NEW.is_active = true) THEN
            NEW.status := 'connected';
            NEW.is_active := true;
        ELSE
            IF NEW.status IS NULL THEN
                NEW.status := 'unconfigured';
            END IF;
            NEW.is_active := (NEW.status = 'connected');
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            NEW.is_active := (NEW.status = 'connected');
        ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
            IF NEW.is_active = true THEN
                NEW.status := 'connected';
            ELSE
                IF NEW.status = 'connected' THEN
                    NEW.status := 'revoked';
                END IF;
            END IF;
        ELSE
            NEW.is_active := (NEW.status = 'connected');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_channel_instances_sync_status ON public.channel_instances;
CREATE TRIGGER trg_channel_instances_sync_status
    BEFORE INSERT OR UPDATE ON public.channel_instances
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_channel_instance_status();

-- Add check constraint ensuring consistency
ALTER TABLE public.channel_instances
    DROP CONSTRAINT IF EXISTS chk_channel_instances_active_status;

ALTER TABLE public.channel_instances
    ADD CONSTRAINT chk_channel_instances_active_status
    CHECK ((is_active = true AND status = 'connected') OR (is_active = false AND status != 'connected'));

CREATE INDEX IF NOT EXISTS idx_channel_instances_status
    ON public.channel_instances(workspace_id, status);

-- -------------------------------------------------------------------------
-- 3. FINANCIAL & TRANSACTIONAL IMMUTABILITY (LEAST PRIVILEGE)
-- -------------------------------------------------------------------------

-- Pix Charges: Revoke DELETE from operational roles (financial immutability)
REVOKE DELETE ON TABLE public.pix_charges FROM PUBLIC, sos_app_user, sos_worker_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pix_charges TO sos_app_user;
GRANT SELECT, UPDATE ON TABLE public.pix_charges TO sos_worker_user;

-- Commercial Proposals: Ensure DELETE is revoked
REVOKE DELETE ON TABLE public.commercial_proposals FROM PUBLIC, sos_app_user, sos_worker_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_proposals TO sos_app_user;
GRANT SELECT ON TABLE public.commercial_proposals TO sos_worker_user;

-- Commercial Outcomes: Ensure DELETE is revoked
REVOKE DELETE ON TABLE public.commercial_outcomes FROM PUBLIC, sos_app_user, sos_worker_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_outcomes TO sos_app_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_outcomes TO sos_worker_user;
