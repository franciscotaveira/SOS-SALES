-- =========================================================================
-- SOS Sales V3 — Migration 029: Meta 2026 Architecture (WAME, BSUID, FEP 7-Day)
-- =========================================================================
-- Context: Meta Business Platform October 2026 Architecture Alignment
-- Features:
--   1. BSUID & Usernames: Decouple human contact identity from mandatory phone_e164
--   2. WAME (WhatsApp Account Model Evolution): Support WAAC, PMA, and Business Portfolio IDs
--   3. CTWA FEP 7-Day Window: Track 168-hour free messaging window on commercial journeys
-- =========================================================================

-- 1. Contacts: BSUID and Username support (phone_e164 becomes nullable when BSUID/username present)
ALTER TABLE public.contacts 
    ADD COLUMN IF NOT EXISTS bsuid text,
    ADD COLUMN IF NOT EXISTS username text;

-- Allow phone_e164 to be null if bsuid or username is provided
ALTER TABLE public.contacts 
    ALTER COLUMN phone_e164 DROP NOT NULL;

-- Ensure at least one identity anchor exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_contacts_identity'
    ) THEN
        ALTER TABLE public.contacts 
            ADD CONSTRAINT chk_contacts_identity 
            CHECK (phone_e164 IS NOT NULL OR bsuid IS NOT NULL OR username IS NOT NULL);
    END IF;
END $$;

-- Unique partial indexes for BSUID and Username within tenant workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_workspace_bsuid 
    ON public.contacts(workspace_id, bsuid) 
    WHERE bsuid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_workspace_username 
    ON public.contacts(workspace_id, username) 
    WHERE username IS NOT NULL;

-- 2. Channel Instances: WAME (WhatsApp Account Model Evolution) fields
ALTER TABLE public.channel_instances
    ADD COLUMN IF NOT EXISTS waac_id text,
    ADD COLUMN IF NOT EXISTS pma_id text,
    ADD COLUMN IF NOT EXISTS business_portfolio_id text;

CREATE INDEX IF NOT EXISTS idx_channel_instances_waac 
    ON public.channel_instances(workspace_id, waac_id) 
    WHERE waac_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_channel_instances_pma 
    ON public.channel_instances(workspace_id, pma_id) 
    WHERE pma_id IS NOT NULL;

-- 3. Commercial Journeys: CTWA 7-Day Free Entry Point (FEP) Window (168 hours)
ALTER TABLE public.commercial_journeys
    ADD COLUMN IF NOT EXISTS fep_expires_at timestamptz;

-- Backfill existing CTWA journeys with 7-day expiration from creation
UPDATE public.commercial_journeys
SET fep_expires_at = created_at + INTERVAL '7 days'
WHERE attribution_source = 'ctwa_meta' AND fep_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_commercial_journeys_fep 
    ON public.commercial_journeys(workspace_id, fep_expires_at) 
    WHERE fep_expires_at IS NOT NULL;
