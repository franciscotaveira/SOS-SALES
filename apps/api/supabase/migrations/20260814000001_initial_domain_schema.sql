-- ==============================================================================
-- TX COMMERCIAL CORE — HARDENED DOMAIN SCHEMA V2 (SALES OS)
-- Architecture: Clean Architecture & DDD Sovereign Kernel
-- Multi-Tenancy: Composite Foreign Keys, Granular RBAC, Strict Last Owner Guard
-- Security: Physical Secret Segregation, Claim Token Fencing, Guarded RPCs, LGPD Audit
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. HELPER FUNCTIONS

-- 2.1 Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- 2.2 Trigger function to block UPDATE and DELETE on immutable historical facts
CREATE OR REPLACE FUNCTION public.prevent_immutable_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('sales_os.allow_redaction', true) = 'true' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Immutable record: UPDATE and DELETE operations are forbidden on table %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- 2.3 Helper function to check if caller is the internal service_role
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN AS $$
DECLARE
  jwt_role TEXT;
BEGIN
  jwt_role := COALESCE(
    NULLIF(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    ''
  );
  RETURN jwt_role = 'service_role';
END;
$$ LANGUAGE plpgsql STABLE SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.is_service_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_service_role() TO authenticated, service_role;

-- 3. WORKSPACES (Multi-Tenancy Root)
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 4. WORKSPACE MEMBERSHIPS (RBAC: owner, operator, viewer)
CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- Supabase Auth auth.uid()
  role TEXT NOT NULL CHECK (role IN ('owner', 'operator', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_workspace_memberships UNIQUE(workspace_id, user_id)
);

CREATE INDEX idx_workspace_memberships_workspace_id ON public.workspace_memberships(workspace_id);
CREATE INDEX idx_workspace_memberships_user_id ON public.workspace_memberships(user_id);

CREATE TRIGGER trg_workspace_memberships_updated_at
  BEFORE UPDATE ON public.workspace_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 4.1 STRICT LAST OWNER GUARD TRIGGER (Zero bypass via session settings)
CREATE OR REPLACE FUNCTION public.guard_last_workspace_owner()
RETURNS TRIGGER AS $$
DECLARE
  remaining_owners INT;
BEGIN
  -- If workspace itself was deleted in cascade, allow
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = OLD.workspace_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (OLD.role = 'owner' AND (TG_OP = 'DELETE' OR NEW.role != 'owner')) THEN
    SELECT COUNT(*) INTO remaining_owners
    FROM (
      SELECT id
      FROM public.workspace_memberships
      WHERE workspace_id = OLD.workspace_id
        AND role = 'owner'
        AND id != OLD.id
      ORDER BY id
      FOR UPDATE
    ) AS locked_remaining_owners;
      
    IF remaining_owners = 0 THEN
      RAISE EXCEPTION 'Operation blocked: Cannot remove or demote the last owner of workspace %', OLD.workspace_id;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER trg_guard_last_workspace_owner
  BEFORE UPDATE OR DELETE ON public.workspace_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_last_workspace_owner();

-- 5. CHANNEL CONNECTIONS (Metadados Públicos Não-Sensíveis)
CREATE TABLE IF NOT EXISTS public.channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('waha', 'meta_cloud', 'evolution', 'other')),
  phone_number TEXT NOT NULL,
  name TEXT NOT NULL,
  public_config JSONB NOT NULL DEFAULT '{}'::jsonb, -- Configurações não-sensíveis
  status TEXT NOT NULL DEFAULT 'CONNECTED' CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'QR_REQUIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_channels_workspace_id_id UNIQUE (workspace_id, id)
);

CREATE INDEX idx_channel_connections_workspace_id ON public.channel_connections(workspace_id);

CREATE TRIGGER trg_channel_connections_updated_at
  BEFORE UPDATE ON public.channel_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 5.1 CHANNEL CONNECTION SECRETS (Segregação Física de Segredos - Apenas Service Role)
CREATE TABLE IF NOT EXISTS public.channel_connection_secrets (
  channel_connection_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  api_key_vault_secret_id UUID,
  webhook_vault_secret_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_channel_secret_reference CHECK (
    api_key_vault_secret_id IS NOT NULL OR webhook_vault_secret_id IS NOT NULL
  ),
  CONSTRAINT fk_secrets_channel_same_workspace 
    FOREIGN KEY (workspace_id, channel_connection_id) 
    REFERENCES public.channel_connections(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_channel_secrets_workspace_id ON public.channel_connection_secrets(workspace_id);

CREATE TRIGGER trg_channel_secrets_updated_at
  BEFORE UPDATE ON public.channel_connection_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 6. OBJECT 1: CONTACTS (Fato Mutável com Unicidade Composta)
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phone TEXT NOT NULL, -- Formato E.164 (+5549999999999) ou Pseudônimo
  whatsapp_id TEXT,
  name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_contacts_workspace_phone UNIQUE(workspace_id, phone),
  CONSTRAINT uq_contacts_workspace_id_id UNIQUE(workspace_id, id)
);

CREATE INDEX idx_contacts_workspace_id ON public.contacts(workspace_id);
CREATE INDEX idx_contacts_phone ON public.contacts(phone);
CREATE INDEX idx_contacts_whatsapp_id ON public.contacts(whatsapp_id);

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 7. OBJECT 2: COMMERCIAL_JOURNEYS (Entidade Raiz com FK Composta por Workspace)
CREATE TABLE IF NOT EXISTS public.commercial_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'WON', 'LOST', 'ABANDONED')),
  primary_service_or_product TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  total_revenue_minor BIGINT NOT NULL DEFAULT 0, -- Centavos inteiros (R$ 59,00 = 5900)
  currency TEXT NOT NULL DEFAULT 'BRL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_journeys_workspace_id_id UNIQUE (workspace_id, id),
  CONSTRAINT fk_journeys_contact_same_workspace 
    FOREIGN KEY (workspace_id, contact_id) 
    REFERENCES public.contacts(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_commercial_journeys_workspace_id ON public.commercial_journeys(workspace_id);
CREATE INDEX idx_commercial_journeys_contact_id ON public.commercial_journeys(contact_id);
CREATE INDEX idx_commercial_journeys_status ON public.commercial_journeys(status);
CREATE INDEX idx_commercial_journeys_started_at ON public.commercial_journeys(started_at DESC);

CREATE TRIGGER trg_commercial_journeys_updated_at
  BEFORE UPDATE ON public.commercial_journeys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 8. INBOUND CHANNEL EVENTS (Envelope Bruto com FK Composta e Deduplicação por Workspace)
CREATE TABLE IF NOT EXISTS public.inbound_channel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_connection_id UUID,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_inbound_channel_same_workspace 
    FOREIGN KEY (workspace_id, channel_connection_id) 
    REFERENCES public.channel_connections(workspace_id, id) ON DELETE SET NULL,
  CONSTRAINT uq_inbound_provider_event UNIQUE(workspace_id, provider, provider_event_id)
);

CREATE INDEX idx_inbound_events_workspace_id ON public.inbound_channel_events(workspace_id);
CREATE INDEX idx_inbound_events_received_at ON public.inbound_channel_events(received_at DESC);

CREATE TRIGGER trg_inbound_channel_events_immutable
  BEFORE UPDATE OR DELETE ON public.inbound_channel_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 9. CONVERSATION MESSAGES (Mensagem Normalizada com FKs Compostas)
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_connection_id UUID NOT NULL,
  journey_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'ai', 'operator', 'system')),
  provider_message_id TEXT NOT NULL,
  text_content TEXT,
  media_payload JSONB,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_messages_workspace_id_id UNIQUE (workspace_id, id),
  CONSTRAINT fk_messages_channel_same_workspace
    FOREIGN KEY (workspace_id, channel_connection_id)
    REFERENCES public.channel_connections(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_journey_same_workspace
    FOREIGN KEY (workspace_id, journey_id)
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_contact_same_workspace
    FOREIGN KEY (workspace_id, contact_id)
    REFERENCES public.contacts(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_messages_provider_msg UNIQUE(channel_connection_id, provider_message_id)
);

CREATE INDEX idx_conversation_messages_workspace_id ON public.conversation_messages(workspace_id);
CREATE INDEX idx_conversation_messages_journey_id ON public.conversation_messages(journey_id);
CREATE INDEX idx_conversation_messages_sent_at ON public.conversation_messages(sent_at DESC);

CREATE TRIGGER trg_conversation_messages_immutable
  BEFORE UPDATE OR DELETE ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 10. CONVERSATION MESSAGE EVENTS (Ciclo de Vida de Mensagens Append-Only)
CREATE TABLE IF NOT EXISTS public.conversation_message_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_connection_id UUID NOT NULL,
  message_id UUID NOT NULL,
  provider_event_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SENT', 'DELIVERED', 'READ', 'FAILED', 'REVOKED')),
  provider_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_code TEXT,
  error_message TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_msg_events_msg_ws 
    FOREIGN KEY (workspace_id, message_id) 
    REFERENCES public.conversation_messages(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_events_channel_ws 
    FOREIGN KEY (workspace_id, channel_connection_id) 
    REFERENCES public.channel_connections(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_msg_events_provider_event UNIQUE(channel_connection_id, provider_event_id)
);

CREATE INDEX idx_msg_events_workspace_id ON public.conversation_message_events(workspace_id);
CREATE INDEX idx_msg_events_message_id ON public.conversation_message_events(message_id);

CREATE TRIGGER trg_conversation_message_events_immutable
  BEFORE UPDATE OR DELETE ON public.conversation_message_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 11. OBJECT 3: ACQUISITION_CONTEXTS (Fato Imutável com FK Composta)
CREATE TABLE IF NOT EXISTS public.acquisition_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('meta_ads', 'google_ads', 'instagram_organic', 'google_business', 'referral', 'other')),
  campaign_id TEXT,
  campaign_name TEXT,
  ad_set_id TEXT,
  ad_id TEXT,
  creative_code TEXT,
  offer_hook TEXT,
  entry_message TEXT,
  click_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  tracking_code TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('HIGH_CTWA', 'HIGH_TRACKING_LINK', 'MEDIUM_TEXT_CODE', 'LOW_TIME_WINDOW', 'MANUAL_DECLARED')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_acq_journey_same_workspace 
    FOREIGN KEY (workspace_id, journey_id) 
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_acquisition_contexts_workspace_id ON public.acquisition_contexts(workspace_id);
CREATE INDEX idx_acquisition_contexts_journey_id ON public.acquisition_contexts(journey_id);
CREATE INDEX idx_acquisition_contexts_campaign_id ON public.acquisition_contexts(campaign_id);
CREATE INDEX idx_acquisition_contexts_tracking_code ON public.acquisition_contexts(tracking_code);

CREATE TRIGGER trg_acquisition_contexts_immutable
  BEFORE UPDATE OR DELETE ON public.acquisition_contexts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 12. OBJECT 4: KNOWN_FACTS (Fato com Proveniência e FK Composta)
CREATE TABLE IF NOT EXISTS public.known_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  key TEXT NOT NULL, -- Namespace: profile.*, offer.*, service.*, schedule.*, vehicle.*
  value JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ad_payload', 'customer_explicit_text', 'ai_inference', 'human_operator', 'system_action')),
  evidence_message_id TEXT,
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  confirmed_by_customer BOOLEAN NOT NULL DEFAULT false,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_by UUID REFERENCES public.known_facts(id) ON DELETE SET NULL,
  CONSTRAINT fk_facts_journey_same_workspace 
    FOREIGN KEY (workspace_id, journey_id) 
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_known_facts_workspace_id ON public.known_facts(workspace_id);
CREATE INDEX idx_known_facts_journey_id ON public.known_facts(journey_id);
CREATE INDEX idx_known_facts_key ON public.known_facts(key);
CREATE INDEX idx_known_facts_superseded_by ON public.known_facts(superseded_by);

-- 13. OBJECT 5: DECISION_EVENTS (Fato + Inferência com FK Composta)
CREATE TABLE IF NOT EXISTS public.decision_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('ai', 'operator', 'customer', 'system')),
  actor_id TEXT,
  from_state TEXT CHECK (from_state IN ('DESCONHECIMENTO', 'INTERESSE_INICIAL', 'BUSCA_OBJETIVA', 'COMPARACAO', 'DECISAO_PRONTA', 'POS_VENDA')),
  to_state TEXT NOT NULL CHECK (to_state IN ('DESCONHECIMENTO', 'INTERESSE_INICIAL', 'BUSCA_OBJETIVA', 'COMPARACAO', 'DECISAO_PRONTA', 'POS_VENDA')),
  reason TEXT NOT NULL,
  inferred_friction TEXT CHECK (inferred_friction IN ('price', 'availability', 'trust', 'choice', 'payment', 'deadline', 'approval', 'uncertainty')),
  evidence_snippet TEXT,
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  correlation_id TEXT,
  projection_version INT NOT NULL DEFAULT 1,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_dec_events_journey_same_workspace 
    FOREIGN KEY (workspace_id, journey_id) 
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_decision_events_workspace_id ON public.decision_events(workspace_id);
CREATE INDEX idx_decision_events_journey_id ON public.decision_events(journey_id);
CREATE INDEX idx_decision_events_created_at ON public.decision_events(created_at DESC);

CREATE TRIGGER trg_decision_events_immutable
  BEFORE UPDATE OR DELETE ON public.decision_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 14. OBJECT 6 & 7: DECISION_STATES (Inferência / Projeção com FK Composta)
CREATE TABLE IF NOT EXISTS public.decision_states (
  journey_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL DEFAULT 'DESCONHECIMENTO' CHECK (current_stage IN ('DESCONHECIMENTO', 'INTERESSE_INICIAL', 'BUSCA_OBJETIVA', 'COMPARACAO', 'DECISAO_PRONTA', 'POS_VENDA')),
  stage_confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.50 CHECK (stage_confidence >= 0.0 AND stage_confidence <= 1.0),
  primary_friction TEXT CHECK (primary_friction IN ('price', 'availability', 'trust', 'choice', 'payment', 'deadline', 'approval', 'uncertainty')),
  secondary_frictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  friction_evidence TEXT,
  friction_confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.50 CHECK (friction_confidence >= 0.0 AND friction_confidence <= 1.0),
  friction_resolved BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_dec_states_journey_same_workspace 
    FOREIGN KEY (workspace_id, journey_id) 
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_decision_states_workspace_id ON public.decision_states(workspace_id);

CREATE TRIGGER trg_decision_states_updated_at
  BEFORE UPDATE ON public.decision_states
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 15. OBJECT 8: RECOMMENDED_ACTIONS (Hipótese IA com Unicidade Composta)
CREATE TABLE IF NOT EXISTS public.recommended_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  suggested_action TEXT NOT NULL CHECK (suggested_action IN ('ANSWER_PRICE', 'OFFER_TIME_SLOTS', 'REQUEST_PREFERENCE', 'SHOW_PROOF', 'HANDLE_OBJECTION', 'SEND_PAYMENT', 'CONFIRM_BOOKING', 'REQUEST_HUMAN_HANDOFF', 'WAIT_CUSTOMER')),
  suggested_draft_text TEXT,
  micro_commitment_goal TEXT NOT NULL,
  confidence NUMERIC(3, 2) NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  policy_status TEXT NOT NULL DEFAULT 'ALLOWED' CHECK (policy_status IN ('ALLOWED', 'REQUIRES_HUMAN_APPROVAL', 'BLOCKED_BY_POLICY')),
  policy_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_rec_actions_workspace_id_id UNIQUE (workspace_id, id),
  CONSTRAINT fk_rec_actions_journey_same_workspace 
    FOREIGN KEY (workspace_id, journey_id) 
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_recommended_actions_workspace_id ON public.recommended_actions(workspace_id);
CREATE INDEX idx_recommended_actions_journey_id ON public.recommended_actions(journey_id);
CREATE INDEX idx_recommended_actions_policy_status ON public.recommended_actions(policy_status);

-- 16. OBJECT 9: EXECUTED_ACTIONS (Fato Operacional com FKs Compostas e Idempotência)
CREATE TABLE IF NOT EXISTS public.executed_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  recommended_action_id UUID,
  executed_action TEXT NOT NULL CHECK (executed_action IN ('ANSWER_PRICE', 'OFFER_TIME_SLOTS', 'REQUEST_PREFERENCE', 'SHOW_PROOF', 'HANDLE_OBJECTION', 'SEND_PAYMENT', 'CONFIRM_BOOKING', 'REQUEST_HUMAN_HANDOFF', 'WAIT_CUSTOMER')),
  executed_by TEXT NOT NULL CHECK (executed_by IN ('ai', 'operator', 'system')),
  message_id TEXT,
  idempotency_key TEXT,
  request_fingerprint TEXT NOT NULL,
  approved_by_user_id UUID,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_exec_actions_journey_same_workspace 
    FOREIGN KEY (workspace_id, journey_id) 
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_exec_actions_rec_action_same_workspace 
    FOREIGN KEY (workspace_id, recommended_action_id) 
    REFERENCES public.recommended_actions(workspace_id, id) ON DELETE SET NULL (recommended_action_id),
  CONSTRAINT uq_exec_actions_workspace_idempotency UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX idx_executed_actions_workspace_id ON public.executed_actions(workspace_id);
CREATE INDEX idx_executed_actions_journey_id ON public.executed_actions(journey_id);
CREATE INDEX idx_executed_actions_executed_at ON public.executed_actions(executed_at DESC);

CREATE TRIGGER trg_executed_actions_immutable
  BEFORE UPDATE OR DELETE ON public.executed_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 17. OBJECT 10: HANDOFF_CASES (Dossiê Estruturado com FK Composta)
CREATE TABLE IF NOT EXISTS public.handoff_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'RETURNED_TO_AI', 'RESOLVED')),
  assigned_to_user_id UUID,
  briefing JSONB NOT NULL,
  trigger_reason TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  CONSTRAINT fk_handoff_journey_same_workspace 
    FOREIGN KEY (workspace_id, journey_id) 
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_handoff_cases_workspace_id ON public.handoff_cases(workspace_id);
CREATE INDEX idx_handoff_cases_journey_id ON public.handoff_cases(journey_id);
CREATE INDEX idx_handoff_cases_status ON public.handoff_cases(status);

-- 18. OBJECT 11: COMMERCIAL_OUTCOMES (Fato de Negócio com FK Composta e Idempotência)
CREATE TABLE IF NOT EXISTS public.commercial_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL UNIQUE, -- Uma jornada possui no máximo um desfecho final
  result TEXT NOT NULL CHECK (result IN ('WON', 'LOST', 'UNRESPONSIVE')),
  final_revenue_minor BIGINT,
  currency TEXT NOT NULL DEFAULT 'BRL',
  closed_reason TEXT,
  feedback_learning JSONB,
  capi_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (capi_status IN ('PENDING', 'QUEUED', 'DISPATCHED', 'FAILED', 'NOT_APPLICABLE')),
  capi_event_id TEXT,
  idempotency_key TEXT,
  request_fingerprint TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_outcomes_journey_same_workspace 
    FOREIGN KEY (workspace_id, journey_id) 
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT uq_outcomes_workspace_idempotency UNIQUE (workspace_id, idempotency_key),
  CONSTRAINT ck_outcomes_non_negative_revenue CHECK (final_revenue_minor IS NULL OR final_revenue_minor >= 0),
  CONSTRAINT ck_outcomes_currency_code CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX idx_commercial_outcomes_workspace_id ON public.commercial_outcomes(workspace_id);
CREATE INDEX idx_commercial_outcomes_journey_id ON public.commercial_outcomes(journey_id);
CREATE INDEX idx_commercial_outcomes_result ON public.commercial_outcomes(result);

CREATE TRIGGER trg_commercial_outcomes_immutable
  BEFORE UPDATE OR DELETE ON public.commercial_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 19. PROJECTION CHECKPOINTS (Reprocessabilidade com FK Composta)
CREATE TABLE IF NOT EXISTS public.projection_checkpoints (
  journey_id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  last_event_id UUID,
  last_message_id UUID,
  projection_version INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_checkpoints_journey_same_workspace 
    FOREIGN KEY (workspace_id, journey_id) 
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_projection_checkpoints_workspace_id ON public.projection_checkpoints(workspace_id);

CREATE TRIGGER trg_projection_checkpoints_updated_at
  BEFORE UPDATE ON public.projection_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 20. OUTBOX EVENTS (Transactional Outbox com Fencing Token & Lease)
CREATE TABLE IF NOT EXISTS public.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  claim_token UUID, -- Fencing token para proteção contra stale workers
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Campo canônico unificado
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  CONSTRAINT uq_outbox_workspace_idempotency UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX idx_outbox_events_workspace_id ON public.outbox_events(workspace_id);
CREATE INDEX idx_outbox_fetch_job 
  ON public.outbox_events(status, scheduled_for) 
  WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX idx_outbox_processing_lease 
  ON public.outbox_events(status, locked_at) 
  WHERE status = 'PROCESSING';

-- 20.1 OUTBOX CLAIM BATCH RPC (Production Algorithm with FOR UPDATE SKIP LOCKED & Fencing)
CREATE OR REPLACE FUNCTION public.claim_outbox_batch(
  p_worker_id TEXT,
  p_batch_size INT DEFAULT 10,
  p_lease_seconds INT DEFAULT 60
)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  event_name TEXT,
  aggregate_type TEXT,
  aggregate_id UUID,
  payload JSONB,
  idempotency_key TEXT,
  claim_token UUID,
  attempts INT
) AS $$
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: outbox worker RPC requires service_role';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_worker_id), '') IS NULL THEN
    RAISE EXCEPTION 'worker_id is required';
  END IF;

  IF p_batch_size < 1 OR p_batch_size > 100 THEN
    RAISE EXCEPTION 'batch_size must be between 1 and 100';
  END IF;

  IF p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'lease_seconds must be between 5 and 3600';
  END IF;

  UPDATE public.outbox_events e
  SET status = 'DEAD_LETTER',
      last_error = COALESCE(e.last_error, 'Maximum delivery attempts exceeded'),
      locked_at = NULL,
      locked_by = NULL,
      claim_token = NULL
  WHERE e.status = 'PROCESSING'
    AND e.attempts >= e.max_attempts
    AND e.locked_at < NOW() - (p_lease_seconds || ' seconds')::interval;

  RETURN QUERY
  WITH candidates AS (
    SELECT e.id
    FROM public.outbox_events e
    WHERE (e.status = 'PENDING' AND e.scheduled_for <= NOW())
       OR (e.status = 'FAILED' AND e.attempts < e.max_attempts AND e.scheduled_for <= NOW())
       OR (e.status = 'PROCESSING' AND e.attempts < e.max_attempts AND e.locked_at < NOW() - (p_lease_seconds || ' seconds')::interval)
    ORDER BY e.scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events target
  SET status = 'PROCESSING',
      locked_at = NOW(),
      locked_by = p_worker_id,
      claim_token = gen_random_uuid(),
      attempts = target.attempts + 1
  FROM candidates c
  WHERE target.id = c.id
  RETURNING target.id, target.workspace_id, target.event_name, target.aggregate_type,
            target.aggregate_id, target.payload, target.idempotency_key, target.claim_token, target.attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INT, INT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(TEXT, INT, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_outbox_event(
  p_event_id UUID,
  p_claim_token UUID,
  p_worker_id TEXT
)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: outbox worker RPC requires service_role';
  END IF;

  UPDATE public.outbox_events
  SET status = 'PUBLISHED',
      published_at = NOW(),
      last_error = NULL,
      locked_at = NULL,
      locked_by = NULL,
      claim_token = NULL
  WHERE id = p_event_id
    AND status = 'PROCESSING'
    AND claim_token = p_claim_token
    AND locked_by = p_worker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stale or invalid outbox claim for event %', p_event_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.renew_outbox_lease(
  p_event_id UUID,
  p_claim_token UUID,
  p_worker_id TEXT
)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: outbox worker RPC requires service_role';
  END IF;

  UPDATE public.outbox_events
  SET locked_at = NOW()
  WHERE id = p_event_id
    AND status = 'PROCESSING'
    AND claim_token = p_claim_token
    AND locked_by = p_worker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stale or invalid outbox claim for event %', p_event_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION public.fail_outbox_event(
  p_event_id UUID,
  p_claim_token UUID,
  p_worker_id TEXT,
  p_error TEXT,
  p_retry_delay_seconds INT DEFAULT 5
)
RETURNS TEXT AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Unauthorized: outbox worker RPC requires service_role';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_error), '') IS NULL THEN
    RAISE EXCEPTION 'error is required';
  END IF;

  IF p_retry_delay_seconds < 0 OR p_retry_delay_seconds > 86400 THEN
    RAISE EXCEPTION 'retry_delay_seconds must be between 0 and 86400';
  END IF;

  UPDATE public.outbox_events
  SET status = CASE WHEN attempts >= max_attempts THEN 'DEAD_LETTER' ELSE 'FAILED' END,
      last_error = p_error,
      scheduled_for = CASE
        WHEN attempts >= max_attempts THEN scheduled_for
        ELSE NOW() + (p_retry_delay_seconds || ' seconds')::interval
      END,
      locked_at = NULL,
      locked_by = NULL,
      claim_token = NULL
  WHERE id = p_event_id
    AND status = 'PROCESSING'
    AND claim_token = p_claim_token
    AND locked_by = p_worker_id
  RETURNING status INTO v_status;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Stale or invalid outbox claim for event %', p_event_id;
  END IF;

  RETURN v_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.complete_outbox_event(UUID, UUID, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.renew_outbox_lease(UUID, UUID, TEXT) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_outbox_event(UUID, UUID, TEXT, TEXT, INT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_outbox_event(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_outbox_lease(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_outbox_event(UUID, UUID, TEXT, TEXT, INT) TO service_role;

-- 21. COMPLIANCE & LGPD REDACTION AUDIT
CREATE TABLE IF NOT EXISTS public.compliance_redaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  reason TEXT NOT NULL,
  requested_by_user_id UUID,
  requested_by_actor TEXT NOT NULL CHECK (requested_by_actor IN ('user', 'service_role')),
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_redaction_ws ON public.compliance_redaction_events(workspace_id);

CREATE TRIGGER trg_compliance_redaction_immutable
  BEFORE UPDATE OR DELETE ON public.compliance_redaction_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_mutation();

-- 21.1 LGPD PSEUDONYMIZATION & REDACTION PROCEDURE
CREATE OR REPLACE FUNCTION public.anonymize_contact_pii(
  p_contact_id UUID, 
  p_workspace_id UUID,
  p_reason TEXT DEFAULT 'Solicitação de direito ao esquecimento LGPD'
)
RETURNS VOID AS $$
BEGIN
  -- Strict Authorization: Only workspace owner or service_role
  IF NOT (
    public.user_has_workspace_role(p_workspace_id, ARRAY['owner'])
    OR public.is_service_role()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only workspace owners or service_role can anonymize contact data';
  END IF;

  IF NULLIF(pg_catalog.btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Redaction reason is required';
  END IF;

  PERFORM 1
  FROM public.contacts
  WHERE id = p_contact_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found in workspace %', p_contact_id, p_workspace_id;
  END IF;

  -- Enable session redaction mode to bypass immutability trigger
  PERFORM pg_catalog.set_config('sales_os.allow_redaction', 'true', true);

  -- True Irreversible Pseudonymization with dynamic random token (zero rainbow attack surface)
  UPDATE public.contacts
  SET phone = 'REDACTED_' || pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
      name = NULL,
      email = NULL,
      whatsapp_id = NULL
  WHERE id = p_contact_id AND workspace_id = p_workspace_id;

  -- Redact conversation messages text content
  UPDATE public.conversation_messages
  SET text_content = '[CONTEUDO_ANONIMIZADO_LGPD]'
  WHERE contact_id = p_contact_id AND workspace_id = p_workspace_id;

  -- Record audit event
  INSERT INTO public.compliance_redaction_events (
    workspace_id, contact_id, reason, requested_by_user_id, requested_by_actor
  ) VALUES (
    p_workspace_id,
    p_contact_id,
    p_reason,
    auth.uid(),
    CASE WHEN public.is_service_role() THEN 'service_role' ELSE 'user' END
  );

  -- Reset session redaction mode
  PERFORM pg_catalog.set_config('sales_os.allow_redaction', 'false', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.anonymize_contact_pii(UUID, UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.anonymize_contact_pii(UUID, UUID, TEXT) TO authenticated, service_role;

-- 22. RPCs GUARDIÃS DE TRANSAÇÃO COMERCIAL

-- 22.1 EXECUTE COMMERCIAL ACTION RPC
CREATE OR REPLACE FUNCTION public.execute_commercial_action(
  p_workspace_id UUID,
  p_journey_id UUID,
  p_action TEXT,
  p_recommended_action_id UUID DEFAULT NULL,
  p_message_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_action_id UUID;
  v_journey_status TEXT;
  v_executed_by TEXT;
  v_rec_ws UUID;
  v_rec_journey UUID;
  v_rec_policy TEXT;
  v_rec_action TEXT;
  v_approved_by UUID;
  v_fingerprint TEXT;
  v_existing_fingerprint TEXT;
BEGIN
  -- 1. Authorization: Operator, Owner, or Service Role (Derive caller identity strictly)
  IF public.is_service_role() THEN
    v_executed_by := 'system';
  ELSIF public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'operator']) THEN
    v_executed_by := 'operator';
  ELSE
    RAISE EXCEPTION 'Unauthorized: User does not have operator or owner role in workspace %', p_workspace_id;
  END IF;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'workspaceId', p_workspace_id,
          'journeyId', p_journey_id,
          'action', p_action,
          'recommendedActionId', p_recommended_action_id,
          'messageId', p_message_id
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  -- 2. Serialize and verify idempotent requests.
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_idempotency_key, 0)
    );

    SELECT id, request_fingerprint INTO v_action_id, v_existing_fingerprint
    FROM public.executed_actions
    WHERE workspace_id = p_workspace_id AND idempotency_key = p_idempotency_key;
    
    IF v_action_id IS NOT NULL THEN
      IF v_existing_fingerprint != v_fingerprint THEN
        RAISE EXCEPTION 'Idempotency conflict: key % was already used with a different action request', p_idempotency_key;
      END IF;
      RETURN v_action_id;
    END IF;
  END IF;

  -- 3. Lock & check journey
  SELECT status INTO v_journey_status
  FROM public.commercial_journeys
  WHERE id = p_journey_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_journey_status IS NULL THEN
    RAISE EXCEPTION 'Journey % not found in workspace %', p_journey_id, p_workspace_id;
  END IF;

  IF v_journey_status != 'OPEN' THEN
    RAISE EXCEPTION 'Cannot execute action on closed journey with status %', v_journey_status;
  END IF;

  -- 4. Validate recommended action if referenced
  IF p_recommended_action_id IS NOT NULL THEN
    SELECT workspace_id, journey_id, policy_status, suggested_action
    INTO v_rec_ws, v_rec_journey, v_rec_policy, v_rec_action
    FROM public.recommended_actions
    WHERE id = p_recommended_action_id;

    IF v_rec_ws IS NULL OR v_rec_ws != p_workspace_id OR v_rec_journey != p_journey_id THEN
      RAISE EXCEPTION 'Recommended action % does not belong to journey % in workspace %', p_recommended_action_id, p_journey_id, p_workspace_id;
    END IF;

    IF v_rec_action != p_action THEN
      RAISE EXCEPTION 'Action % does not match recommended action %', p_action, v_rec_action;
    END IF;

    IF v_rec_policy = 'BLOCKED_BY_POLICY' THEN
      RAISE EXCEPTION 'Action is blocked by safety policy';
    END IF;

    IF v_rec_policy = 'REQUIRES_HUMAN_APPROVAL' THEN
      IF v_executed_by != 'operator' OR auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Action requires approval by an authenticated operator';
      END IF;
      v_approved_by := auth.uid();
    END IF;
  ELSIF v_executed_by = 'system' THEN
    RAISE EXCEPTION 'Automated execution requires a governed recommended action';
  END IF;

  -- 5. Insert executed action
  INSERT INTO public.executed_actions (
    workspace_id, journey_id, recommended_action_id, executed_action, executed_by,
    message_id, idempotency_key, request_fingerprint, approved_by_user_id
  ) VALUES (
    p_workspace_id, p_journey_id, p_recommended_action_id, p_action, v_executed_by,
    p_message_id, p_idempotency_key, v_fingerprint, v_approved_by
  ) RETURNING id INTO v_action_id;

  -- 6. Queue Outbox Event
  INSERT INTO public.outbox_events (
    workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key
  ) VALUES (
    p_workspace_id,
    'action.executed',
    'ExecutedAction',
    v_action_id,
    jsonb_build_object(
      'actionId', v_action_id,
      'journeyId', p_journey_id,
      'action', p_action,
      'executedBy', v_executed_by,
      'actorUserId', auth.uid()
    ),
    COALESCE('action.executed:' || p_idempotency_key, 'action.executed:' || v_action_id::text)
  );

  RETURN v_action_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.execute_commercial_action(UUID, UUID, TEXT, UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.execute_commercial_action(UUID, UUID, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

-- 22.2 RECORD COMMERCIAL OUTCOME RPC
CREATE OR REPLACE FUNCTION public.record_commercial_outcome(
  p_workspace_id UUID,
  p_journey_id UUID,
  p_result TEXT,
  p_revenue_minor BIGINT DEFAULT 0,
  p_currency TEXT DEFAULT 'BRL',
  p_reason TEXT DEFAULT NULL,
  p_feedback JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_outcome_id UUID;
  v_journey_status TEXT;
  v_mapped_status TEXT;
  v_fingerprint TEXT;
  v_existing_fingerprint TEXT;
BEGIN
  -- 1. Authorization: Operator, Owner, or Service Role
  IF NOT (
    public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'operator'])
    OR public.is_service_role()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: User does not have operator or owner role in workspace %', p_workspace_id;
  END IF;

  -- 2. Validate outcome result
  IF p_result NOT IN ('WON', 'LOST', 'UNRESPONSIVE') THEN
    RAISE EXCEPTION 'Invalid outcome result: %. Must be WON, LOST or UNRESPONSIVE', p_result;
  END IF;

  IF p_revenue_minor IS NULL OR p_revenue_minor < 0 THEN
    RAISE EXCEPTION 'revenue_minor must be zero or greater';
  END IF;

  IF p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'currency must be a three-letter uppercase ISO code';
  END IF;

  v_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'workspaceId', p_workspace_id,
          'journeyId', p_journey_id,
          'result', p_result,
          'revenueMinor', p_revenue_minor,
          'currency', p_currency,
          'reason', p_reason,
          'feedback', p_feedback
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  -- 3. Serialize and verify idempotent requests.
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_workspace_id::text || ':' || p_idempotency_key, 0)
    );

    SELECT id, request_fingerprint INTO v_outcome_id, v_existing_fingerprint
    FROM public.commercial_outcomes
    WHERE workspace_id = p_workspace_id AND idempotency_key = p_idempotency_key;

    IF v_outcome_id IS NOT NULL THEN
      IF v_existing_fingerprint != v_fingerprint THEN
        RAISE EXCEPTION 'Idempotency conflict: key % was already used with a different outcome request', p_idempotency_key;
      END IF;
      RETURN v_outcome_id;
    END IF;
  END IF;

  -- 4. Lock & check journey (FOR UPDATE to prevent concurrent outcome creation)
  SELECT status INTO v_journey_status
  FROM public.commercial_journeys
  WHERE id = p_journey_id AND workspace_id = p_workspace_id
  FOR UPDATE;

  IF v_journey_status IS NULL THEN
    RAISE EXCEPTION 'Journey % not found in workspace %', p_journey_id, p_workspace_id;
  END IF;

  IF v_journey_status != 'OPEN' THEN
    RAISE EXCEPTION 'Journey % is already closed with status %', p_journey_id, v_journey_status;
  END IF;

  -- 5. Prevent duplicate outcomes on the same journey
  IF EXISTS (SELECT 1 FROM public.commercial_outcomes WHERE journey_id = p_journey_id) THEN
    RAISE EXCEPTION 'Outcome already exists for journey %', p_journey_id;
  END IF;

  -- 6. Map outcome result to journey status (UNRESPONSIVE maps to ABANDONED)
  v_mapped_status := CASE 
    WHEN p_result = 'UNRESPONSIVE' THEN 'ABANDONED'
    ELSE p_result
  END;

  -- 7. Insert Outcome
  INSERT INTO public.commercial_outcomes (
    workspace_id, journey_id, result, final_revenue_minor, currency, closed_reason,
    feedback_learning, idempotency_key, request_fingerprint
  ) VALUES (
    p_workspace_id, p_journey_id, p_result, p_revenue_minor, p_currency, p_reason,
    p_feedback, p_idempotency_key, v_fingerprint
  ) RETURNING id INTO v_outcome_id;

  -- 8. Update Commercial Journey Status
  UPDATE public.commercial_journeys
  SET status = v_mapped_status,
      total_revenue_minor = COALESCE(p_revenue_minor, total_revenue_minor),
      closed_at = NOW()
  WHERE id = p_journey_id AND workspace_id = p_workspace_id;

  -- 9. Queue Outbox Event for CAPI / Telemetry
  INSERT INTO public.outbox_events (
    workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key
  ) VALUES (
    p_workspace_id,
    'commercial.outcome_recorded',
    'CommercialOutcome',
    v_outcome_id,
    jsonb_build_object(
      'outcomeId', v_outcome_id,
      'journeyId', p_journey_id,
      'result', p_result,
      'mappedJourneyStatus', v_mapped_status,
      'revenueMinor', p_revenue_minor,
      'actorUserId', auth.uid()
    ),
    COALESCE('commercial.outcome:' || p_idempotency_key, 'commercial.outcome:' || v_outcome_id::text)
  );

  RETURN v_outcome_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.record_commercial_outcome(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, JSONB, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_commercial_outcome(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, JSONB, TEXT) TO authenticated, service_role;

-- 23. ROW LEVEL SECURITY (RLS) POLICIES & FUNCTIONS

-- 23.1 Helper function for accessible workspaces
CREATE OR REPLACE FUNCTION public.current_user_workspace_ids()
RETURNS SETOF UUID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT wm.workspace_id 
  FROM public.workspace_memberships wm 
  WHERE wm.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.current_user_workspace_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_user_workspace_ids() TO authenticated, service_role;

-- 23.2 Helper function for RBAC role checking
CREATE OR REPLACE FUNCTION public.user_has_workspace_role(p_workspace_id UUID, p_roles TEXT[])
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role = ANY(p_roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.user_has_workspace_role(UUID, TEXT[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.user_has_workspace_role(UUID, TEXT[]) TO authenticated, service_role;

-- 23.3 Enable RLS on all 20 tables
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_channel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_message_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acquisition_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.known_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recommended_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.executed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_redaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projection_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

-- 23.4 Service Role Full Access (Internal Workers)
CREATE POLICY service_role_workspaces ON public.workspaces FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_workspace_memberships ON public.workspace_memberships FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_channel_connections ON public.channel_connections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_channel_secrets ON public.channel_connection_secrets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_contacts ON public.contacts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_commercial_journeys ON public.commercial_journeys FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_inbound_channel_events ON public.inbound_channel_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_conversation_messages ON public.conversation_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_conversation_message_events ON public.conversation_message_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_acquisition_contexts ON public.acquisition_contexts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_known_facts ON public.known_facts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_decision_events ON public.decision_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_decision_states ON public.decision_states FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_recommended_actions ON public.recommended_actions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_executed_actions ON public.executed_actions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_handoff_cases ON public.handoff_cases FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_commercial_outcomes ON public.commercial_outcomes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_compliance_redaction ON public.compliance_redaction_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_projection_checkpoints ON public.projection_checkpoints FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_outbox_events ON public.outbox_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 23.5 Granular Authenticated Multi-Tenant RLS Policies

-- WORKSPACES
CREATE POLICY tenant_select_workspaces ON public.workspaces FOR SELECT TO authenticated
  USING (id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY owner_update_workspaces ON public.workspaces FOR UPDATE TO authenticated
  USING (public.user_has_workspace_role(id, ARRAY['owner']))
  WITH CHECK (public.user_has_workspace_role(id, ARRAY['owner']));

-- MEMBERSHIPS (Protected by Last Owner Guard)
CREATE POLICY tenant_select_memberships ON public.workspace_memberships FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY owner_insert_memberships ON public.workspace_memberships FOR INSERT TO authenticated
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

CREATE POLICY owner_update_memberships ON public.workspace_memberships FOR UPDATE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']))
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

CREATE POLICY owner_delete_memberships ON public.workspace_memberships FOR DELETE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

-- CHANNELS (Public Config Only)
CREATE POLICY tenant_select_channels ON public.channel_connections FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY owner_insert_channels ON public.channel_connections FOR INSERT TO authenticated
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

CREATE POLICY owner_update_channels ON public.channel_connections FOR UPDATE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']))
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

CREATE POLICY owner_delete_channels ON public.channel_connections FOR DELETE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

-- CONTACTS
CREATE POLICY tenant_select_contacts ON public.contacts FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY operator_insert_contacts ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']));

CREATE POLICY operator_update_contacts ON public.contacts FOR UPDATE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']))
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']));

-- JOURNEYS
CREATE POLICY tenant_select_journeys ON public.commercial_journeys FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY operator_insert_journeys ON public.commercial_journeys FOR INSERT TO authenticated
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']));

CREATE POLICY operator_update_journeys ON public.commercial_journeys FOR UPDATE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']))
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']));

-- INBOUND EVENTS & MESSAGES (Read-Only for Authenticated Users)
CREATE POLICY tenant_select_inbound ON public.inbound_channel_events FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_select_messages ON public.conversation_messages FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_select_msg_events ON public.conversation_message_events FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_select_acq_contexts ON public.acquisition_contexts FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

-- KNOWN FACTS
CREATE POLICY tenant_select_facts ON public.known_facts FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY operator_insert_facts ON public.known_facts FOR INSERT TO authenticated
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']));

CREATE POLICY operator_update_facts ON public.known_facts FOR UPDATE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']))
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']));

-- DECISION EVENTS
CREATE POLICY tenant_select_dec_events ON public.decision_events FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY operator_insert_dec_events ON public.decision_events FOR INSERT TO authenticated
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']));

-- DECISION STATES & RECOMMENDED ACTIONS (Read-Only for Operators)
CREATE POLICY tenant_select_dec_states ON public.decision_states FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_select_rec_actions ON public.recommended_actions FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

-- EXECUTED ACTIONS & COMMERCIAL OUTCOMES (Read-Only for Authenticated; Inserts strictly via RPC)
CREATE POLICY tenant_select_exec_actions ON public.executed_actions FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY tenant_select_outcomes ON public.commercial_outcomes FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

-- HANDOFF CASES
CREATE POLICY tenant_select_handoff ON public.handoff_cases FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

CREATE POLICY operator_update_handoff ON public.handoff_cases FOR UPDATE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']))
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner', 'operator']));

-- COMPLIANCE AUDIT EVENTS (Owner Read-Only)
CREATE POLICY owner_select_compliance ON public.compliance_redaction_events FOR SELECT TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

-- PROJECTION CHECKPOINTS (Internal Only)
CREATE POLICY tenant_select_checkpoints ON public.projection_checkpoints FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

-- 24. ROLE PRIVILEGES (Defense-in-Depth Principle of Least Privilege)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- These append-only transactional tables are mutated only through guarded
-- SECURITY DEFINER routines, including by internal workers.
REVOKE INSERT, UPDATE, DELETE ON public.executed_actions FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON public.commercial_outcomes FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON public.outbox_events FROM service_role;

-- Public API allowlist. Internal worker/trigger helpers remain unavailable to
-- authenticated clients even when a new routine is added later.
GRANT EXECUTE ON FUNCTION public.current_user_workspace_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_workspace_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_contact_pii(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_commercial_action(UUID, UUID, TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_commercial_outcome(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, JSONB, TEXT) TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
