-- =============================================================================
-- SALES OS — P0.4B: KNOWN FACTS AUDIT HARDENING
-- Facts are append-only. A correction is a new fact plus an immutable
-- supersession relation; the original fact is never modified or deleted.
-- =============================================================================

-- `evidence_message_id` was originally a text field and could point at an
-- unrelated message. Convert it before introducing a composite FK that proves
-- the evidence belongs to the same workspace and commercial journey.
ALTER TABLE public.known_facts
  ALTER COLUMN evidence_message_id TYPE UUID
  USING NULLIF(pg_catalog.btrim(evidence_message_id), '')::UUID;

ALTER TABLE public.known_facts
  ADD CONSTRAINT uq_known_facts_workspace_id_id UNIQUE (workspace_id, id);

ALTER TABLE public.conversation_messages
  ADD CONSTRAINT uq_conversation_messages_workspace_journey_id
  UNIQUE (workspace_id, journey_id, id);

ALTER TABLE public.known_facts
  ADD CONSTRAINT fk_known_facts_evidence_same_journey
  FOREIGN KEY (workspace_id, journey_id, evidence_message_id)
  REFERENCES public.conversation_messages(workspace_id, journey_id, id)
  ON DELETE RESTRICT;

-- The old `superseded_by` column cannot be safely populated after facts become
-- immutable. Keep it for backward-compatible reads, but record all new
-- corrections in a dedicated append-only relation instead.
CREATE TABLE public.known_fact_supersessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  superseded_fact_id UUID NOT NULL,
  replacement_fact_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_known_fact_supersession_distinct CHECK (superseded_fact_id <> replacement_fact_id),
  CONSTRAINT uq_known_fact_supersession_original UNIQUE (workspace_id, superseded_fact_id),
  CONSTRAINT uq_known_fact_supersession_replacement UNIQUE (workspace_id, replacement_fact_id),
  CONSTRAINT fk_known_fact_supersession_journey_same_workspace
    FOREIGN KEY (workspace_id, journey_id)
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_known_fact_supersession_original_same_workspace
    FOREIGN KEY (workspace_id, superseded_fact_id)
    REFERENCES public.known_facts(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_known_fact_supersession_replacement_same_workspace
    FOREIGN KEY (workspace_id, replacement_fact_id)
    REFERENCES public.known_facts(workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_known_fact_supersessions_journey_created
  ON public.known_fact_supersessions(journey_id, created_at DESC);
CREATE TRIGGER trg_known_fact_supersessions_immutable
  BEFORE UPDATE OR DELETE ON public.known_fact_supersessions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

-- Command ledger makes retries deterministic and rejects a reused key with a
-- different payload. It intentionally has no application-facing write policy.
CREATE TABLE public.known_fact_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL,
  fact_id UUID NOT NULL,
  supersedes_fact_id UUID,
  actor_user_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_known_fact_commands_workspace_idempotency UNIQUE (workspace_id, idempotency_key),
  CONSTRAINT fk_known_fact_commands_journey_same_workspace
    FOREIGN KEY (workspace_id, journey_id)
    REFERENCES public.commercial_journeys(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_known_fact_commands_fact_same_workspace
    FOREIGN KEY (workspace_id, fact_id)
    REFERENCES public.known_facts(workspace_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_known_fact_commands_supersedes_same_workspace
    FOREIGN KEY (workspace_id, supersedes_fact_id)
    REFERENCES public.known_facts(workspace_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_known_fact_commands_journey_created
  ON public.known_fact_commands(journey_id, created_at DESC);
CREATE TRIGGER trg_known_fact_commands_immutable
  BEFORE UPDATE OR DELETE ON public.known_fact_commands
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

ALTER TABLE public.known_fact_supersessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.known_fact_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_known_fact_supersessions ON public.known_fact_supersessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_known_fact_commands ON public.known_fact_commands
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_select_known_fact_supersessions ON public.known_fact_supersessions
  FOR SELECT TO authenticated USING (workspace_id IN (SELECT public.current_user_workspace_ids()));
CREATE POLICY tenant_select_known_fact_commands ON public.known_fact_commands
  FOR SELECT TO authenticated USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

-- Direct mutation bypasses the audit protocol, so authenticated clients can
-- only read facts. Internal workers retain their service_role policy.
DROP POLICY IF EXISTS operator_insert_facts ON public.known_facts;
DROP POLICY IF EXISTS operator_update_facts ON public.known_facts;
REVOKE INSERT, UPDATE, DELETE ON public.known_facts FROM authenticated;
REVOKE ALL ON public.known_fact_supersessions, public.known_fact_commands FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.known_fact_supersessions, public.known_fact_commands FROM authenticated;
GRANT SELECT ON public.known_facts, public.known_fact_supersessions, public.known_fact_commands TO authenticated;

CREATE TRIGGER trg_known_facts_immutable
  BEFORE UPDATE OR DELETE ON public.known_facts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_mutation();

CREATE OR REPLACE FUNCTION public.record_known_fact(
  p_workspace_id UUID,
  p_journey_id UUID,
  p_key TEXT,
  p_value JSONB,
  p_evidence_message_id UUID,
  p_confidence NUMERIC,
  p_confirmed_by_customer BOOLEAN,
  p_supersedes_fact_id UUID,
  p_idempotency_key TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_actor UUID;
  v_fact public.known_facts%ROWTYPE;
  v_existing public.known_fact_commands%ROWTYPE;
  v_fingerprint TEXT;
  v_value_kind TEXT;
BEGIN
  IF p_key IS NULL
    OR p_key !~ '^[a-z][a-z0-9_]{0,31}(\.[a-z][a-z0-9_]{0,63})+$' THEN
    RAISE EXCEPTION 'Invalid fact key';
  END IF;
  IF p_value IS NULL OR pg_column_size(p_value) > 8192 THEN
    RAISE EXCEPTION 'Invalid fact value';
  END IF;
  v_value_kind := jsonb_typeof(p_value);
  IF v_value_kind = 'string' AND char_length(p_value #>> '{}') > 2000 THEN
    RAISE EXCEPTION 'Invalid fact value';
  END IF;
  IF v_value_kind = 'array' AND jsonb_array_length(p_value) > 64 THEN
    RAISE EXCEPTION 'Invalid fact value';
  END IF;
  IF v_value_kind = 'object' AND (SELECT count(*) FROM jsonb_object_keys(p_value)) > 64 THEN
    RAISE EXCEPTION 'Invalid fact value';
  END IF;
  IF p_confidence IS NULL OR p_confidence < 0 OR p_confidence > 1 THEN
    RAISE EXCEPTION 'Invalid fact confidence';
  END IF;
  IF p_confirmed_by_customer IS NULL THEN
    RAISE EXCEPTION 'Invalid fact confirmation';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'Invalid idempotency key';
  END IF;

  v_actor := public.require_workspace_operator(p_workspace_id);
  v_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'journeyId', p_journey_id,
        'key', btrim(p_key),
        'value', p_value,
        'evidenceMessageId', p_evidence_message_id,
        'confidence', p_confidence,
        'confirmedByCustomer', p_confirmed_by_customer,
        'supersedesFactId', p_supersedes_fact_id,
        'source', 'human_operator'
      )::text,
      'sha256'
    ),
    'hex'
  );

  -- Serialise the command key before checking/inserting so concurrent retries
  -- cannot create two facts or silently accept payload drift.
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text || ':' || btrim(p_idempotency_key), 0));
  SELECT * INTO v_existing FROM public.known_fact_commands
  WHERE workspace_id = p_workspace_id AND idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'Idempotency conflict';
    END IF;
    RETURN jsonb_build_object(
      'factId', v_existing.fact_id,
      'journeyId', v_existing.journey_id,
      'supersedesFactId', v_existing.supersedes_fact_id,
      'source', 'human_operator',
      'idempotent', true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.commercial_journeys
    WHERE id = p_journey_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Commercial journey not found';
  END IF;

  IF p_evidence_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.conversation_messages
    WHERE id = p_evidence_message_id
      AND workspace_id = p_workspace_id
      AND journey_id = p_journey_id
  ) THEN
    RAISE EXCEPTION 'Evidence message not found';
  END IF;

  IF p_supersedes_fact_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.known_facts
      WHERE id = p_supersedes_fact_id
        AND workspace_id = p_workspace_id
        AND journey_id = p_journey_id
    ) THEN
      RAISE EXCEPTION 'Known fact not found';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.known_fact_supersessions
      WHERE workspace_id = p_workspace_id AND superseded_fact_id = p_supersedes_fact_id
    ) THEN
      RAISE EXCEPTION 'Known fact already superseded';
    END IF;
  END IF;

  INSERT INTO public.known_facts (
    workspace_id, journey_id, key, value, source, evidence_message_id,
    confidence, confirmed_by_customer
  ) VALUES (
    p_workspace_id, p_journey_id, btrim(p_key), p_value, 'human_operator',
    p_evidence_message_id, p_confidence, p_confirmed_by_customer
  ) RETURNING * INTO v_fact;

  IF p_supersedes_fact_id IS NOT NULL THEN
    INSERT INTO public.known_fact_supersessions (
      workspace_id, journey_id, superseded_fact_id, replacement_fact_id, actor_user_id
    ) VALUES (
      p_workspace_id, p_journey_id, p_supersedes_fact_id, v_fact.id, v_actor
    );
  END IF;

  INSERT INTO public.known_fact_commands (
    workspace_id, journey_id, fact_id, supersedes_fact_id, actor_user_id,
    idempotency_key, request_fingerprint
  ) VALUES (
    p_workspace_id, p_journey_id, v_fact.id, p_supersedes_fact_id, v_actor,
    btrim(p_idempotency_key), v_fingerprint
  );

  RETURN jsonb_build_object(
    'factId', v_fact.id,
    'journeyId', p_journey_id,
    'supersedesFactId', p_supersedes_fact_id,
    'source', 'human_operator',
    'idempotent', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.record_known_fact(UUID, UUID, TEXT, JSONB, UUID, NUMERIC, BOOLEAN, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_known_fact(UUID, UUID, TEXT, JSONB, UUID, NUMERIC, BOOLEAN, UUID, TEXT) TO authenticated;
