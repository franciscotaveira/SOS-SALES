-- Migration 028: Workspace AI Receptionist & Commercial Skills Configuration
-- Enables tenants to configure their autonomous AI sales persona, prompt instructions,
-- personality archetype, and selective commercial skills (lead qualification, catalog offers, pix, appointments, CAPI).

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS ai_receptionist_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_agent_name text NOT NULL DEFAULT 'Assistente Virtual',
  ADD COLUMN IF NOT EXISTS ai_system_prompt text NOT NULL DEFAULT 'Você é a atendente de vendas e relacionamento da empresa no WhatsApp. Atenda com cordialidade, objetividade e simpatia. Apresente serviços e produtos do catálogo com clareza, esclareça dúvidas, qualifique o interesse do cliente e conduza com naturalidade para o agendamento de horários ou emissão de proposta/Pix para fechamento.',
  ADD COLUMN IF NOT EXISTS ai_personality text NOT NULL DEFAULT 'cordial_comercial',
  ADD COLUMN IF NOT EXISTS ai_skills jsonb NOT NULL DEFAULT '{"qualify_lead": true, "catalog_offers": true, "pix_charges": true, "appointments": true, "capi_tracking": true}'::jsonb;

COMMENT ON COLUMN public.workspaces.ai_receptionist_enabled IS 'Controls if autonomous AI receptionist responds to inbound leads';
COMMENT ON COLUMN public.workspaces.ai_agent_name IS 'Display name of the AI sales attendant in chats';
COMMENT ON COLUMN public.workspaces.ai_system_prompt IS 'Custom instructions and sales guidelines for the AI assistant';
COMMENT ON COLUMN public.workspaces.ai_personality IS 'Personality archetype for communication tone';
COMMENT ON COLUMN public.workspaces.ai_skills IS 'Toggles for active commercial skills';
