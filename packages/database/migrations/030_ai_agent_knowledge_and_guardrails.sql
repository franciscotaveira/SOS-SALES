-- Migration 030: AI Agent Knowledge Grounding and Anti-Hallucination Guardrails
-- Implements AI Assurance Platform v0.2 specifications:
-- 1. Factual business rules (hours, location, cancellation, payment terms)
-- 2. Structured FAQ & authorized responses
-- 3. Strict anti-hallucination mode and low temperature (0.1)

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS ai_business_rules jsonb NOT NULL DEFAULT '{"opening_hours": "", "address": "", "cancellation_policy": "", "payment_methods": "", "general_rules": ""}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_strict_mode boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_temperature numeric(3,2) NOT NULL DEFAULT 0.1;

COMMENT ON COLUMN public.workspaces.ai_business_rules IS 'Factual business policies, operating hours, address, and conditions for strict AI grounding';
COMMENT ON COLUMN public.workspaces.ai_faq IS 'Structured list of authorized question-and-answer pairs for official brand responses';
COMMENT ON COLUMN public.workspaces.ai_strict_mode IS 'Enforces ignorance protocol: AI rejects guessing and mandates human handoff when facts are missing';
COMMENT ON COLUMN public.workspaces.ai_temperature IS 'LLM sampling temperature (0.1 for deterministic, factual commercial responses)';
