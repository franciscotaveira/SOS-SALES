-- ============================================================================
-- Workspace intelligence persistence contract
--
-- The Intelligence/Knowledge screens are backed by the authenticated API.  The
-- bundle is deliberately JSONB because the published contract evolves with
-- the product (company profile, agent settings, catalog and learning facts),
-- while individual knowledge documents remain queryable for ingestion and
-- audit.  Neither table is seeded with demo content.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_intelligence_bundles (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bundle JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_intelligence_bundles_updated
  ON public.workspace_intelligence_bundles(updated_at DESC);

ALTER TABLE public.workspace_intelligence_bundles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_workspace_intelligence_bundles
  ON public.workspace_intelligence_bundles;
CREATE POLICY service_role_workspace_intelligence_bundles
  ON public.workspace_intelligence_bundles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_select_workspace_intelligence_bundles
  ON public.workspace_intelligence_bundles;
CREATE POLICY tenant_select_workspace_intelligence_bundles
  ON public.workspace_intelligence_bundles FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

DROP POLICY IF EXISTS owner_insert_workspace_intelligence_bundles
  ON public.workspace_intelligence_bundles;
CREATE POLICY owner_insert_workspace_intelligence_bundles
  ON public.workspace_intelligence_bundles FOR INSERT TO authenticated
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

DROP POLICY IF EXISTS owner_update_workspace_intelligence_bundles
  ON public.workspace_intelligence_bundles;
CREATE POLICY owner_update_workspace_intelligence_bundles
  ON public.workspace_intelligence_bundles FOR UPDATE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']))
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

REVOKE INSERT, UPDATE, DELETE ON public.workspace_intelligence_bundles FROM public, anon;
GRANT SELECT ON public.workspace_intelligence_bundles TO authenticated;
GRANT ALL ON public.workspace_intelligence_bundles TO service_role;

DROP TRIGGER IF EXISTS trg_workspace_intelligence_bundles_updated_at
  ON public.workspace_intelligence_bundles;
CREATE TRIGGER trg_workspace_intelligence_bundles_updated_at
  BEFORE UPDATE ON public.workspace_intelligence_bundles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.workspace_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  content TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  file_size TEXT,
  chunks_count INTEGER NOT NULL DEFAULT 1 CHECK (chunks_count >= 0),
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'processing', 'failed', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_knowledge_documents_workspace
  ON public.workspace_knowledge_documents(workspace_id, created_at DESC);

ALTER TABLE public.workspace_knowledge_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_workspace_knowledge_documents
  ON public.workspace_knowledge_documents;
CREATE POLICY service_role_workspace_knowledge_documents
  ON public.workspace_knowledge_documents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_select_workspace_knowledge_documents
  ON public.workspace_knowledge_documents;
CREATE POLICY tenant_select_workspace_knowledge_documents
  ON public.workspace_knowledge_documents FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.current_user_workspace_ids()));

DROP POLICY IF EXISTS owner_insert_workspace_knowledge_documents
  ON public.workspace_knowledge_documents;
CREATE POLICY owner_insert_workspace_knowledge_documents
  ON public.workspace_knowledge_documents FOR INSERT TO authenticated
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

DROP POLICY IF EXISTS owner_update_workspace_knowledge_documents
  ON public.workspace_knowledge_documents;
CREATE POLICY owner_update_workspace_knowledge_documents
  ON public.workspace_knowledge_documents FOR UPDATE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']))
  WITH CHECK (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

DROP POLICY IF EXISTS owner_delete_workspace_knowledge_documents
  ON public.workspace_knowledge_documents;
CREATE POLICY owner_delete_workspace_knowledge_documents
  ON public.workspace_knowledge_documents FOR DELETE TO authenticated
  USING (public.user_has_workspace_role(workspace_id, ARRAY['owner']));

REVOKE INSERT, UPDATE, DELETE ON public.workspace_knowledge_documents FROM public, anon;
GRANT SELECT ON public.workspace_knowledge_documents TO authenticated;
GRANT ALL ON public.workspace_knowledge_documents TO service_role;

DROP TRIGGER IF EXISTS trg_workspace_knowledge_documents_updated_at
  ON public.workspace_knowledge_documents;
CREATE TRIGGER trg_workspace_knowledge_documents_updated_at
  BEFORE UPDATE ON public.workspace_knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
