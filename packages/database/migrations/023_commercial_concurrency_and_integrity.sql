-- =========================================================================
-- SOS Sales V3 — Migration 023: Commercial Concurrency & Integrity (R3)
-- =========================================================================
-- Context: Phase R3 Remediation (S-06 Proposals State Machine, S-07 Outcomes Idempotency)
-- Compliance:
--   - Proposal state machine governance:
--       * Valid transitions: draft -> sent | cancelled
--       * Valid transitions: sent -> accepted | rejected | expired | cancelled
--       * Terminal states: accepted, rejected, expired, cancelled cannot transition
--   - Optimistic locking: state_version incremented on every update
--   - Commercial outcomes idempotency: unique won outcome per journey
--   - Immutability and RLS fail-closed
-- =========================================================================

-- 1. Add state_version column to commercial_proposals for optimistic locking
ALTER TABLE public.commercial_proposals
    ADD COLUMN IF NOT EXISTS state_version integer NOT NULL DEFAULT 1;

-- 2. State transition and optimistic locking trigger function
CREATE OR REPLACE FUNCTION public.check_commercial_proposal_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- If status is changing, enforce the governed state machine
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            -- Check terminal states
            IF OLD.status IN ('accepted', 'rejected', 'expired', 'cancelled') THEN
                RAISE EXCEPTION 'INVALID_TRANSITION: Proposta em estado terminal (%) não pode ser alterada para %', OLD.status, NEW.status
                    USING ERRCODE = '22023';
            END IF;

            -- Check draft transitions
            IF OLD.status = 'draft' AND NEW.status NOT IN ('sent', 'cancelled') THEN
                RAISE EXCEPTION 'INVALID_TRANSITION: Proposta em rascunho só pode transicionar para sent ou cancelled, não para %', NEW.status
                    USING ERRCODE = '22023';
            END IF;

            -- Check sent transitions
            IF OLD.status = 'sent' AND NEW.status NOT IN ('accepted', 'rejected', 'expired', 'cancelled') THEN
                RAISE EXCEPTION 'INVALID_TRANSITION: Proposta enviada só pode transicionar para accepted, rejected, expired ou cancelled, não para %', NEW.status
                    USING ERRCODE = '22023';
            END IF;

            -- Automatically populate milestone timestamps if not provided
            IF NEW.status = 'sent' AND NEW.sent_at IS NULL THEN
                NEW.sent_at := now();
            ELSIF NEW.status = 'accepted' AND NEW.accepted_at IS NULL THEN
                NEW.accepted_at := now();
            ELSIF NEW.status = 'rejected' AND NEW.rejected_at IS NULL THEN
                NEW.rejected_at := now();
            ELSIF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
                NEW.cancelled_at := now();
            END IF;
        END IF;

        -- Auto-increment state_version on every update
        NEW.state_version := OLD.state_version + 1;
        NEW.updated_at := now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_commercial_proposals_transition ON public.commercial_proposals;
CREATE TRIGGER trg_commercial_proposals_transition
    BEFORE UPDATE ON public.commercial_proposals
    FOR EACH ROW
    EXECUTE FUNCTION public.check_commercial_proposal_transition();

-- 3. Outcomes Idempotency: Archive duplicate records before creating unique index
CREATE TABLE IF NOT EXISTS public.commercial_outcomes_reconciliation_archive (
    archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    archive_reason text NOT NULL,
    original_outcome_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    journey_id uuid NOT NULL,
    status varchar(32) NOT NULL,
    value_cents bigint NOT NULL,
    currency varchar(3) NOT NULL,
    reason text,
    registered_by_user_id text,
    created_at timestamptz NOT NULL
);

ALTER TABLE public.commercial_outcomes_reconciliation_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_outcomes_reconciliation_archive FORCE ROW LEVEL SECURITY;

CREATE POLICY migration_owner_archive ON public.commercial_outcomes_reconciliation_archive
    TO sos_migration_owner USING (true) WITH CHECK (true);

GRANT SELECT, INSERT ON TABLE public.commercial_outcomes_reconciliation_archive TO sos_migration_owner;

DO $$
DECLARE
    r RECORD;
    canonical_id uuid;
BEGIN
    FOR r IN (
        SELECT workspace_id, journey_id
        FROM public.commercial_outcomes
        WHERE status = 'won'
        GROUP BY workspace_id, journey_id
        HAVING count(*) > 1
    ) LOOP
        SELECT id INTO canonical_id
        FROM public.commercial_outcomes
        WHERE workspace_id = r.workspace_id AND journey_id = r.journey_id AND status = 'won'
        ORDER BY created_at ASC, id ASC
        LIMIT 1;

        -- Safely archive duplicate outcomes prior to deletion
        INSERT INTO public.commercial_outcomes_reconciliation_archive (
            archive_reason, original_outcome_id, workspace_id, journey_id, status, value_cents, currency, reason, registered_by_user_id, created_at
        )
        SELECT 'deduplication_pre_index_023', id, workspace_id, journey_id, status, value_cents, currency, reason, registered_by_user_id, created_at
        FROM public.commercial_outcomes
        WHERE workspace_id = r.workspace_id
          AND journey_id = r.journey_id
          AND status = 'won'
          AND id <> canonical_id;

        UPDATE public.conversion_events
        SET outcome_id = canonical_id
        WHERE workspace_id = r.workspace_id
          AND outcome_id IN (
              SELECT id FROM public.commercial_outcomes
              WHERE workspace_id = r.workspace_id AND journey_id = r.journey_id AND status = 'won' AND id <> canonical_id
          );

        DELETE FROM public.commercial_outcomes
        WHERE workspace_id = r.workspace_id
          AND journey_id = r.journey_id
          AND status = 'won'
          AND id <> canonical_id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commercial_outcomes_journey_won
    ON public.commercial_outcomes(workspace_id, journey_id)
    WHERE status = 'won';

