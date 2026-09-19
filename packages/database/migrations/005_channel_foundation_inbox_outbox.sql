-- =========================================================================
-- SOS Sales V3 — Migration 005: Channel Foundation, Ingress Shielding & Transactional Inbox/Outbox
-- =========================================================================
-- Context: Greenfield Sovereign Architecture (Iteration 4 - Slice 1)
-- Compliance:
--   - ADR-005 (Channel Gateway, Transactional Ingress Shielding & Deduplication)
--   - Truth in Data (Append-only delivery tracking, encrypted payload retention)
--   - Tenant Isolation (FORCE RLS, composite foreign keys with workspace_id and channel_instance_id)
--   - Immutable migrations guarantee: This migration is pré-consolidação and has only
--     been applied in isolated disposable test runner sessions.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. ROLES PROVISIONING & LEAST PRIVILEGE PREPARATION
-- -------------------------------------------------------------------------
-- Securely create required service roles without hardcoded passwords in SQL.
-- Passwords/credentials must be injected exclusively via runtime environment.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sos_ingress_user') THEN
        CREATE ROLE sos_ingress_user NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sos_worker_user') THEN
        CREATE ROLE sos_worker_user NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    END IF;
END $$;

-- Allow test environment migration owner to test role switches without concurrent catalog collisions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid = m.roleid
        JOIN pg_roles member ON member.oid = m.member
        WHERE r.rolname = 'sos_ingress_user' AND member.rolname = 'sos_migration_owner'
    ) THEN
        GRANT sos_ingress_user TO sos_migration_owner;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid = m.roleid
        JOIN pg_roles member ON member.oid = m.member
        WHERE r.rolname = 'sos_worker_user' AND member.rolname = 'sos_migration_owner'
    ) THEN
        GRANT sos_worker_user TO sos_migration_owner;
    END IF;
END $$;

-- -------------------------------------------------------------------------
-- 2. TABLE DEFINITIONS WITH COMPOSITE TENANT & CHANNEL KEYS
-- -------------------------------------------------------------------------

-- 2.0 Ensure provider_credentials exposes composite uniqueness for tenant-safe FK references
ALTER TABLE public.provider_credentials 
    ADD CONSTRAINT uq_provider_credentials_workspace_id UNIQUE (workspace_id, id);

-- 2.1 Channel Instances (WhatsApp / Messenger lines)
CREATE TABLE IF NOT EXISTS public.channel_instances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('meta_waba', 'waha', 'evolution', 'meta_messenger', 'meta_instagram')),
    display_name text NOT NULL,
    phone_number_e164 text CHECK (phone_number_e164 IS NULL OR phone_number_e164 ~ '^\+[1-9][0-9]{6,14}$'),
    endpoint_token_hash text NOT NULL UNIQUE CHECK (endpoint_token_hash ~ '^[0-9a-f]{64}$'),
    previous_token_hash text CHECK (previous_token_hash IS NULL OR previous_token_hash ~ '^[0-9a-f]{64}$'),
    previous_token_valid_until timestamptz,
    verify_token_hash text CHECK (verify_token_hash IS NULL OR verify_token_hash ~ '^[0-9a-f]{64}$'),
    credential_id uuid,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_previous_token_consistency CHECK (
        (previous_token_hash IS NULL AND previous_token_valid_until IS NULL) OR
        (previous_token_hash IS NOT NULL AND previous_token_valid_until IS NOT NULL)
    ),
    CONSTRAINT fk_channel_instances_credential FOREIGN KEY (workspace_id, credential_id)
        REFERENCES public.provider_credentials(workspace_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_channel_instances_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_channel_instances_workspace ON public.channel_instances(workspace_id);
CREATE INDEX IF NOT EXISTS idx_channel_instances_token_hash ON public.channel_instances(endpoint_token_hash);

-- 2.2 Contacts (Human identity decoupled from channel)
CREATE TABLE IF NOT EXISTS public.contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
    name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_contacts_workspace_phone UNIQUE (workspace_id, phone_e164),
    CONSTRAINT uq_contacts_workspace_id UNIQUE (workspace_id, id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_workspace_phone ON public.contacts(workspace_id, phone_e164);

-- 2.3 Commercial Threads (Conversation context per channel and contact)
CREATE TABLE IF NOT EXISTS public.commercial_threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    channel_instance_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waiting_client', 'waiting_human', 'closed')),
    last_message_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_commercial_threads_channel_contact UNIQUE (workspace_id, channel_instance_id, contact_id),
    CONSTRAINT uq_commercial_threads_workspace_id UNIQUE (workspace_id, id),
    CONSTRAINT uq_commercial_threads_workspace_channel_id UNIQUE (workspace_id, channel_instance_id, id),
    CONSTRAINT fk_commercial_threads_channel FOREIGN KEY (workspace_id, channel_instance_id)
        REFERENCES public.channel_instances(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_commercial_threads_contact FOREIGN KEY (workspace_id, contact_id)
        REFERENCES public.contacts(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_commercial_threads_lookup ON public.commercial_threads(workspace_id, channel_instance_id, contact_id);

-- 2.4 Transactional Webhook Inbox (Persisted raw ingress events with AES encryption)
CREATE TABLE IF NOT EXISTS public.channel_webhook_inbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_instance_id uuid NOT NULL,
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    provider_event_key text NOT NULL,
    raw_payload_hash text NOT NULL CHECK (raw_payload_hash ~ '^[0-9a-f]{64}$'),
    encrypted_payload text NOT NULL,
    payload_iv text NOT NULL,
    payload_auth_tag text NOT NULL,
    key_version integer NOT NULL DEFAULT 1 CHECK (key_version >= 1),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
    retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    max_retries integer NOT NULL DEFAULT 5 CHECK (max_retries >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    lease_until timestamptz,
    lease_token uuid,
    worker_id text,
    error_message text,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    CONSTRAINT check_inbox_retry_limit CHECK (retry_count <= max_retries),
    CONSTRAINT uq_inbox_channel_event UNIQUE (channel_instance_id, provider_event_key),
    CONSTRAINT fk_inbox_channel FOREIGN KEY (workspace_id, channel_instance_id)
        REFERENCES public.channel_instances(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inbox_dispatch ON public.channel_webhook_inbox(status, next_attempt_at)
    WHERE status IN ('pending', 'failed', 'processing');

-- 2.5 Messages (Conversational messages)
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    channel_instance_id uuid NOT NULL,
    thread_id uuid NOT NULL,
    provider text NOT NULL CHECK (provider IN ('meta_waba', 'waha', 'evolution', 'meta_messenger', 'meta_instagram')),
    direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    sender_e164 text NOT NULL CHECK (sender_e164 ~ '^\+[1-9][0-9]{6,14}$'),
    recipient_e164 text NOT NULL CHECK (recipient_e164 ~ '^\+[1-9][0-9]{6,14}$'),
    content_type text NOT NULL CHECK (content_type IN ('text', 'image', 'audio', 'video', 'document', 'location', 'template', 'interactive')),
    body text,
    media_url text,
    provider_message_id text,
    delivery_status text NOT NULL DEFAULT 'queued' CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
    status_rank integer NOT NULL DEFAULT 0 CHECK (status_rank IN (-1, 0, 10, 20, 30)),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_messages_channel_provider_msg UNIQUE (channel_instance_id, provider_message_id),
    CONSTRAINT uq_messages_workspace_id UNIQUE (workspace_id, id),
    CONSTRAINT uq_messages_workspace_channel_id UNIQUE (workspace_id, channel_instance_id, id),
    CONSTRAINT fk_messages_channel FOREIGN KEY (workspace_id, channel_instance_id)
        REFERENCES public.channel_instances(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_thread_composite FOREIGN KEY (workspace_id, channel_instance_id, thread_id)
        REFERENCES public.commercial_threads(workspace_id, channel_instance_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON public.messages(thread_id, created_at DESC);

-- 2.6 Provider Delivery Events (Strictly append-only log with PII encrypted)
CREATE TABLE IF NOT EXISTS public.provider_delivery_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    channel_instance_id uuid NOT NULL,
    message_id uuid,
    external_message_id text NOT NULL,
    external_event_id text NOT NULL,
    recipient_e164 text NOT NULL CHECK (recipient_e164 ~ '^\+[1-9][0-9]{6,14}$'),
    provider text NOT NULL CHECK (provider IN ('meta_waba', 'waha', 'evolution', 'meta_messenger', 'meta_instagram')),
    status text NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
    error_code text,
    error_message text,
    raw_payload_hash text NOT NULL CHECK (raw_payload_hash ~ '^[0-9a-f]{64}$'),
    encrypted_payload text NOT NULL,
    payload_iv text NOT NULL,
    payload_auth_tag text NOT NULL,
    occurred_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_delivery_events_channel_event UNIQUE (channel_instance_id, external_event_id),
    CONSTRAINT fk_delivery_events_channel FOREIGN KEY (workspace_id, channel_instance_id)
        REFERENCES public.channel_instances(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_delivery_events_message_composite FOREIGN KEY (workspace_id, channel_instance_id, message_id)
        REFERENCES public.messages(workspace_id, channel_instance_id, id) ON DELETE SET NULL (message_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_message ON public.provider_delivery_events(workspace_id, external_message_id);

-- 2.7 Transactional Outbox Commands (Guaranteed message dispatch queue)
CREATE TABLE IF NOT EXISTS public.outbound_commands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    channel_instance_id uuid NOT NULL,
    thread_id uuid,
    message_id uuid NOT NULL,
    recipient_e164 text NOT NULL CHECK (recipient_e164 ~ '^\+[1-9][0-9]{6,14}$'),
    body text NOT NULL,
    media_url text,
    template_name text,
    template_language text,
    template_components jsonb,
    idempotency_key text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'dead_letter', 'reconciliation_required')),
    retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    max_retries integer NOT NULL DEFAULT 3 CHECK (max_retries >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    external_message_id text,
    sent_at timestamptz,
    lease_until timestamptz,
    lease_token uuid,
    worker_id text,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT check_outbound_retry_limit CHECK (retry_count <= max_retries),
    CONSTRAINT uq_outbound_workspace_idempotency UNIQUE (workspace_id, idempotency_key),
    CONSTRAINT fk_outbound_channel FOREIGN KEY (workspace_id, channel_instance_id)
        REFERENCES public.channel_instances(workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_outbound_thread_composite FOREIGN KEY (workspace_id, channel_instance_id, thread_id)
        REFERENCES public.commercial_threads(workspace_id, channel_instance_id, id) ON DELETE SET NULL (thread_id),
    CONSTRAINT fk_outbound_message_composite FOREIGN KEY (workspace_id, channel_instance_id, message_id)
        REFERENCES public.messages(workspace_id, channel_instance_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_outbound_message ON public.outbound_commands(workspace_id, message_id);
CREATE INDEX IF NOT EXISTS idx_outbound_dispatch ON public.outbound_commands(status, next_attempt_at)
    WHERE status IN ('pending', 'failed', 'processing');

-- -------------------------------------------------------------------------
-- 3. TABLE OWNERSHIP & FORCE ROW LEVEL SECURITY
-- -------------------------------------------------------------------------
ALTER TABLE public.channel_instances OWNER TO sos_migration_owner;
ALTER TABLE public.contacts OWNER TO sos_migration_owner;
ALTER TABLE public.commercial_threads OWNER TO sos_migration_owner;
ALTER TABLE public.channel_webhook_inbox OWNER TO sos_migration_owner;
ALTER TABLE public.messages OWNER TO sos_migration_owner;
ALTER TABLE public.provider_delivery_events OWNER TO sos_migration_owner;
ALTER TABLE public.outbound_commands OWNER TO sos_migration_owner;

ALTER TABLE public.channel_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_instances FORCE ROW LEVEL SECURITY;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts FORCE ROW LEVEL SECURITY;

ALTER TABLE public.commercial_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_threads FORCE ROW LEVEL SECURITY;

ALTER TABLE public.channel_webhook_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_webhook_inbox FORCE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.provider_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_delivery_events FORCE ROW LEVEL SECURITY;

ALTER TABLE public.outbound_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_commands FORCE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 4. HARDENED INGRESS RESOLVER FUNCTION
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lookup_channel_ingress(p_endpoint_token_hash pg_catalog.text)
RETURNS TABLE (
    channel_instance_id pg_catalog.uuid,
    workspace_id pg_catalog.uuid,
    provider pg_catalog.text,
    is_active pg_catalog.bool
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Strict hex format check (exactly 64 lowercase hexadecimal characters)
    IF p_endpoint_token_hash IS NULL OR p_endpoint_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'INVALID_ENDPOINT_TOKEN_HASH: Token hash must be exactly 64 lowercase hexadecimal characters';
    END IF;

    RETURN QUERY
    SELECT 
        ci.id AS channel_instance_id,
        ci.workspace_id,
        ci.provider,
        ci.is_active
    FROM public.channel_instances ci
    WHERE ci.is_active = true
      AND (
        ci.endpoint_token_hash = p_endpoint_token_hash
        OR (ci.previous_token_hash = p_endpoint_token_hash AND ci.previous_token_valid_until > clock_timestamp())
      )
    LIMIT 1;
END;
$$;

ALTER FUNCTION public.lookup_channel_ingress(pg_catalog.text) OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.lookup_channel_ingress(pg_catalog.text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_channel_ingress(pg_catalog.text) TO sos_ingress_user;

CREATE OR REPLACE FUNCTION public.resolve_channel_signing_credential(
    p_channel_instance_id pg_catalog.uuid,
    p_workspace_id pg_catalog.uuid
)
RETURNS TABLE (
    encrypted_payload pg_catalog.text,
    payload_iv pg_catalog.text,
    payload_auth_tag pg_catalog.text,
    verify_token_hash pg_catalog.text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pc.encrypted_payload,
        pc.iv::text AS payload_iv,
        pc.auth_tag::text AS payload_auth_tag,
        ci.verify_token_hash
    FROM public.channel_instances ci
    LEFT JOIN public.provider_credentials pc
        ON pc.id = ci.credential_id AND pc.workspace_id = ci.workspace_id
    WHERE ci.id = p_channel_instance_id
      AND ci.workspace_id = p_workspace_id
      AND ci.is_active = true
    LIMIT 1;
END;
$$;

ALTER FUNCTION public.resolve_channel_signing_credential(pg_catalog.uuid, pg_catalog.uuid) OWNER TO sos_migration_owner;
REVOKE ALL ON FUNCTION public.resolve_channel_signing_credential(pg_catalog.uuid, pg_catalog.uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_channel_signing_credential(pg_catalog.uuid, pg_catalog.uuid) TO sos_ingress_user, sos_worker_user;

-- -------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY POLICIES
-- -------------------------------------------------------------------------

-- 5.1 Policies for sos_migration_owner (bypass in maintenance and tests)
CREATE POLICY migration_owner_channel_instances ON public.channel_instances TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_contacts ON public.contacts TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_commercial_threads ON public.commercial_threads TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_inbox ON public.channel_webhook_inbox TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_messages ON public.messages TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_delivery_events ON public.provider_delivery_events TO sos_migration_owner USING (true) WITH CHECK (true);
CREATE POLICY migration_owner_outbound ON public.outbound_commands TO sos_migration_owner USING (true) WITH CHECK (true);

-- 5.2 Policies for sos_app_user (Tenant Isolation based on app.current_workspace_id)
CREATE POLICY app_user_channel_instances ON public.channel_instances
    FOR ALL TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY app_user_contacts ON public.contacts
    FOR ALL TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY app_user_commercial_threads ON public.commercial_threads
    FOR ALL TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY app_user_messages ON public.messages
    FOR ALL TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY app_user_delivery_events ON public.provider_delivery_events
    FOR SELECT TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY app_user_outbound ON public.outbound_commands
    FOR ALL TO sos_app_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- 5.3 Policies for sos_worker_user (Queue consumption and event ingestion)
-- Fail-Closed Tenant Isolation: Application data tables REQUIRE explicit app.current_workspace_id.
-- If app.current_workspace_id is NULL, zero rows are visible or modifiable.

CREATE POLICY worker_user_channel_instances ON public.channel_instances
    FOR ALL TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY worker_user_contacts ON public.contacts
    FOR ALL TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY worker_user_commercial_threads ON public.commercial_threads
    FOR ALL TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY worker_user_messages ON public.messages
    FOR ALL TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY worker_user_delivery_events ON public.provider_delivery_events
    FOR ALL TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid)
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY worker_user_provider_credentials ON public.provider_credentials
    FOR SELECT TO sos_worker_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY worker_user_workspaces ON public.workspaces
    FOR SELECT TO sos_worker_user
    USING (id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- Queue Tables (channel_webhook_inbox & outbound_commands):
-- In tenant context (app.current_workspace_id is set): strictly scoped to tenant.
-- In global polling/claim context (app.current_workspace_id IS NULL): restricted to claimable/active lease items;
-- NEVER exposes completed/terminal records (processed, sent, dead_letter) across workspaces.

CREATE POLICY worker_user_inbox ON public.channel_webhook_inbox
    FOR ALL TO sos_worker_user
    USING (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                (
                    (status IN ('pending', 'failed') AND (lease_until IS NULL OR lease_until < clock_timestamp()))
                    OR status = 'processing'
                )
        END
    )
    WITH CHECK (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                status IN ('processing', 'failed', 'dead_letter')
        END
    );

CREATE POLICY worker_user_outbound ON public.outbound_commands
    FOR ALL TO sos_worker_user
    USING (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                (
                    (status IN ('pending', 'failed') AND (lease_until IS NULL OR lease_until < clock_timestamp()))
                    OR status IN ('processing', 'reconciliation_required')
                )
        END
    )
    WITH CHECK (
        CASE 
            WHEN NULLIF(current_setting('app.current_workspace_id', true), '') IS NOT NULL THEN
                workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
            ELSE
                status IN ('processing', 'failed', 'dead_letter', 'reconciliation_required', 'pending')
        END
    );

-- 5.4 Policies for sos_ingress_user (Strictly scoped INSERT into inbox with RETURNING id support)
CREATE POLICY ingress_user_inbox_insert ON public.channel_webhook_inbox
    FOR INSERT TO sos_ingress_user
    WITH CHECK (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

CREATE POLICY ingress_user_inbox_select ON public.channel_webhook_inbox
    FOR SELECT TO sos_ingress_user
    USING (workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid);

-- -------------------------------------------------------------------------
-- 6. EXPLICIT MINIMAL PRIVILEGE GRANTS & REVOCATIONS
-- -------------------------------------------------------------------------

-- Revoke default DML granted to sos_app_user from migration 002 on sensitive tables
REVOKE ALL ON TABLE public.channel_webhook_inbox FROM sos_app_user;
REVOKE ALL ON TABLE public.provider_delivery_events FROM sos_app_user;
REVOKE ALL ON TABLE public.outbound_commands FROM sos_app_user;

-- Remove DELETE where unnecessary on app tables
REVOKE DELETE ON TABLE public.channel_instances FROM sos_app_user;
REVOKE DELETE ON TABLE public.contacts FROM sos_app_user;
REVOKE DELETE ON TABLE public.commercial_threads FROM sos_app_user;
REVOKE DELETE ON TABLE public.messages FROM sos_app_user;

-- Grant minimal explicit DML to sos_app_user
GRANT SELECT ON TABLE public.provider_delivery_events TO sos_app_user;
GRANT SELECT, INSERT ON TABLE public.outbound_commands TO sos_app_user;

-- Privilege configuration for sos_worker_user
GRANT USAGE ON SCHEMA public TO sos_worker_user;
GRANT SELECT, UPDATE ON TABLE public.channel_webhook_inbox TO sos_worker_user;
GRANT SELECT, UPDATE ON TABLE public.outbound_commands TO sos_worker_user;
GRANT SELECT, INSERT, UPDATE (message_id) ON TABLE public.provider_delivery_events TO sos_worker_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.messages TO sos_worker_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_threads TO sos_worker_user;
GRANT SELECT, INSERT, UPDATE ON TABLE public.contacts TO sos_worker_user;
GRANT SELECT ON TABLE public.channel_instances TO sos_worker_user;
GRANT SELECT ON TABLE public.provider_credentials TO sos_worker_user;
GRANT SELECT ON TABLE public.workspaces TO sos_worker_user;

-- Explicit column-level references only (no broad REFERENCES ON ALL TABLES)
GRANT REFERENCES (id) ON TABLE public.workspaces TO sos_worker_user;
GRANT REFERENCES (id, workspace_id) ON TABLE public.provider_credentials TO sos_worker_user;
GRANT REFERENCES (id, workspace_id) ON TABLE public.channel_instances TO sos_worker_user;
GRANT REFERENCES (id, workspace_id) ON TABLE public.contacts TO sos_worker_user;
GRANT REFERENCES (id, workspace_id, channel_instance_id) ON TABLE public.commercial_threads TO sos_worker_user;
GRANT REFERENCES (id, workspace_id, channel_instance_id) ON TABLE public.messages TO sos_worker_user;

-- Privilege configuration for sos_ingress_user
GRANT USAGE ON SCHEMA public TO sos_ingress_user;
GRANT INSERT, SELECT (id, channel_instance_id, provider_event_key) ON TABLE public.channel_webhook_inbox TO sos_ingress_user;
GRANT REFERENCES (id, workspace_id) ON TABLE public.channel_instances TO sos_ingress_user;
GRANT REFERENCES (id) ON TABLE public.workspaces TO sos_ingress_user;

-- Grant sequence usage
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sos_worker_user, sos_ingress_user;
