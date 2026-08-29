-- Internal provisioning and receptionist runtime need explicit table access.
-- RLS continues to govern authenticated browser users.
GRANT SELECT, INSERT, UPDATE ON public.workspace_agent_config TO service_role;

-- A versão inicial desta tabela incluía um seed da Haven antes da criação do
-- workspace no seed.sql. Em bancos novos, migrations rodam antes dos seeds e
-- essa única linha ficava órfã. Remova somente esse seed legado quando o
-- workspace correspondente ainda não existe; outras inconsistências devem
-- continuar falhando para não esconder perda de dados.
DELETE FROM public.workspace_agent_config AS config
WHERE config.workspace_id = 'a0000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    WHERE workspace.id = config.workspace_id
  );

ALTER TABLE public.workspace_agent_config
  DROP CONSTRAINT IF EXISTS fk_workspace_agent_config_workspace;
ALTER TABLE public.workspace_agent_config
  ADD CONSTRAINT fk_workspace_agent_config_workspace
  FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
