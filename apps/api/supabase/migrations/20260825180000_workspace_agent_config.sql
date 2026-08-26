-- ==============================================================================
-- TX COMMERCIAL CORE — MIGRATION: workspace_agent_config
-- Permite configurar o agente IA por workspace diretamente no banco.
-- O ReceptionistAgent carrega esta tabela em tempo de execução;
-- se não houver linha publicada para o workspace, o runtime falha fechado.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_agent_config (
  workspace_id         uuid        NOT NULL,
  agent_name           text        NOT NULL DEFAULT 'Assistente',
  business_type        text        NOT NULL DEFAULT 'Prestação de serviços',
  services_json        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  working_hours        text        NOT NULL DEFAULT 'Segunda a Sexta, das 9h às 18h',
  phone                text        NOT NULL DEFAULT '',
  city                 text        NOT NULL DEFAULT 'Brasil',
  booking_url          text,
  booking_flow_enabled boolean     NOT NULL DEFAULT false,
  extra_context        text,
  updated_at           timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id)
);

-- RLS: apenas membros do workspace podem ler/escrever sua própria config
ALTER TABLE public.workspace_agent_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_agent_config_select" ON public.workspace_agent_config;
CREATE POLICY "workspace_agent_config_select"
  ON public.workspace_agent_config FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_memberships WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "workspace_agent_config_upsert" ON public.workspace_agent_config;
CREATE POLICY "workspace_agent_config_upsert"
  ON public.workspace_agent_config FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_memberships
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_memberships
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Seed: Haven Escovaria (workspace real do lab + produção)
INSERT INTO public.workspace_agent_config (
  workspace_id,
  agent_name,
  business_type,
  services_json,
  working_hours,
  phone,
  city,
  booking_url,
  booking_flow_enabled,
  extra_context
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Camila',
  'Escovaria e salão de beleza premium',
  '[
    {"name":"Escova Modelada","duration":"45-60 min"},
    {"name":"Esmaltação em Gel","duration":"60 min"},
    {"name":"Spa dos Pés","duration":"60 min"},
    {"name":"Terapia Capilar","duration":"90 min"},
    {"name":"Manicure + Pedicure","duration":"60 min"},
    {"name":"Progressiva / Relaxamento","duration":"120-180 min"},
    {"name":"Coloração / Luzes","duration":"variável"}
  ]'::jsonb,
  'Segunda a Sábado, das 9h às 19h',
  '+55 49 8837-0054',
  'Chapecó, SC',
  'https://www.trinks.com/haven-escovaria',
  true,
  'Ambiente premium e acolhedor. Aceitamos PIX, cartão de débito e crédito. Estacionamento gratuito. Os valores dos serviços estão sempre atualizados em: https://www.trinks.com/haven-escovaria'
) ON CONFLICT (workspace_id) DO UPDATE SET
  agent_name           = EXCLUDED.agent_name,
  business_type        = EXCLUDED.business_type,
  services_json        = EXCLUDED.services_json,
  working_hours        = EXCLUDED.working_hours,
  phone                = EXCLUDED.phone,
  city                 = EXCLUDED.city,
  booking_url          = EXCLUDED.booking_url,
  booking_flow_enabled = EXCLUDED.booking_flow_enabled,
  extra_context        = EXCLUDED.extra_context,
  updated_at           = NOW();
