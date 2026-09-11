ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS outbound_opted_out_at timestamptz;

CREATE TABLE IF NOT EXISTS public.agent_run_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 journey_id uuid NOT NULL,
 conversation_message_id uuid,
 result text NOT NULL,
 model text,
 latency_ms integer,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_run_audit_workspace_time ON public.agent_run_audit(workspace_id,created_at DESC);
ALTER TABLE public.agent_run_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.agent_run_audit TO sos_sales_runtime,service_role;
CREATE POLICY agent_run_audit_server ON public.agent_run_audit TO sos_sales_runtime,service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.agent_turn_usage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 contact_id uuid NOT NULL,
 conversation_message_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_turn_usage_limits ON public.agent_turn_usage(workspace_id,created_at,contact_id);
ALTER TABLE public.agent_turn_usage ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.agent_turn_usage TO sos_sales_runtime,service_role;
CREATE POLICY agent_turn_usage_server ON public.agent_turn_usage TO sos_sales_runtime,service_role USING (true);

CREATE OR REPLACE FUNCTION public.claim_agent_turn(p_workspace uuid,p_contact uuid,p_message uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF session_user NOT IN ('postgres','service_role','supabase_admin','sos_sales_runtime') AND NOT public.is_service_role() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace::text,0));
 IF NOT EXISTS(SELECT 1 FROM public.conversation_messages m JOIN public.contacts c ON c.id=m.contact_id AND c.workspace_id=m.workspace_id WHERE m.id=p_message AND m.workspace_id=p_workspace AND m.contact_id=p_contact AND c.outbound_opted_out_at IS NULL) THEN RETURN false; END IF;
 -- Bound inference calls, including retries. This is a usage cap, not a monetary bill estimate.
 IF (SELECT count(*) FROM public.agent_turn_usage WHERE workspace_id=p_workspace AND created_at>=now()-interval '24 hours')>=1000
 OR (SELECT count(*) FROM public.agent_turn_usage WHERE workspace_id=p_workspace AND contact_id=p_contact AND created_at>=now()-interval '24 hours')>=60 THEN RETURN false; END IF;
 INSERT INTO public.agent_turn_usage(workspace_id,contact_id,conversation_message_id) VALUES(p_workspace,p_contact,p_message);
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.claim_agent_turn(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_turn(uuid,uuid,uuid) TO sos_sales_runtime,service_role;

CREATE OR REPLACE FUNCTION public.enforce_contact_outbound_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE opted_out timestamptz;
BEGIN
 IF TG_TABLE_NAME='outbound_dispatches' THEN
   IF NEW.status NOT IN ('APPROVED','CLAIMED') THEN RETURN NEW; END IF;
 ELSE
   IF NEW.status <> 'SENDING' THEN RETURN NEW; END IF;
 END IF;
 SELECT c.outbound_opted_out_at INTO opted_out FROM public.contacts c WHERE c.id=NEW.contact_id AND c.workspace_id=NEW.workspace_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Outbound contact does not belong to workspace'; END IF;
 IF opted_out IS NOT NULL THEN RAISE EXCEPTION 'CONTACT_OPTED_OUT'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER agent_consent_reservation BEFORE INSERT OR UPDATE OF status ON public.receptionist_outbound_reservations FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_outbound_consent();
CREATE TRIGGER agent_consent_dispatch BEFORE INSERT OR UPDATE OF status ON public.outbound_dispatches FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_outbound_consent();
REVOKE ALL ON FUNCTION public.enforce_contact_outbound_consent() FROM PUBLIC,anon,authenticated;

-- Retain an audit trail of every published bundle revision, including calibration.
CREATE TABLE IF NOT EXISTS public.agent_configuration_revisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 bundle jsonb NOT NULL, published_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_configuration_revisions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.agent_configuration_revisions TO sos_sales_runtime,service_role;
CREATE POLICY agent_revision_server ON public.agent_configuration_revisions TO sos_sales_runtime,service_role USING (true);
CREATE OR REPLACE FUNCTION public.archive_agent_configuration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.published_at IS NOT NULL THEN
  INSERT INTO public.agent_configuration_revisions(workspace_id,bundle,published_by) VALUES(NEW.workspace_id,NEW.bundle,NEW.published_by);
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER archive_agent_configuration_revision AFTER INSERT OR UPDATE ON public.workspace_intelligence_bundles FOR EACH ROW EXECUTE FUNCTION public.archive_agent_configuration();
REVOKE ALL ON FUNCTION public.archive_agent_configuration() FROM PUBLIC,anon,authenticated;
INSERT INTO public.agent_configuration_revisions(workspace_id,bundle,published_by) SELECT b.workspace_id,b.bundle,b.published_by FROM public.workspace_intelligence_bundles b JOIN public.workspaces w ON w.id=b.workspace_id WHERE b.published_at IS NOT NULL;

-- Consent is recorded on ingestion, even with the AI disabled or paused.
CREATE OR REPLACE FUNCTION public.record_inbound_contact_refusal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.direction='inbound' AND NEW.sender_type='customer'
 AND coalesce(NEW.text_content,'') ~* '(^[[:space:]]*(stop|sair)[.![:space:]]*$|cancelar mensagens|(n[aã]o quero|pare de|n[aã]o me|remova meu|exclua meu).{0,55}(contato|mensage|mandar|envi|n[uú]mero|lista)|(me tire|me remova).{0,25}lista)' THEN
  UPDATE public.contacts SET outbound_opted_out_at=coalesce(outbound_opted_out_at,NOW())
  WHERE id=NEW.contact_id AND workspace_id=NEW.workspace_id AND coalesce(phone,'') NOT LIKE '%@g.us';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER record_contact_refusal AFTER INSERT ON public.conversation_messages FOR EACH ROW EXECUTE FUNCTION public.record_inbound_contact_refusal();
REVOKE ALL ON FUNCTION public.record_inbound_contact_refusal() FROM PUBLIC,anon,authenticated;
