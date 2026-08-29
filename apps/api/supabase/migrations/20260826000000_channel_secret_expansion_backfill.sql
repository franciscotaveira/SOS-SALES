-- Migration: channel secret expansion + convergence backfill (forward-only)
--
-- CONTEXTO (existing mechanism -> extension -> duplication avoided):
--   O contrato de secrets (secret_kind TEXT + secret_payload JSONB, unique
--   (channel_connection_id, secret_kind) e index idx_channel_secrets_kind) JA
--   EXISTE em 20260822091851_runtime_role_and_security_hardening.sql, que tambem
--   ja faz o backfill nao-destrutivo dos tres kinds a partir de
--   channel_connections.public_config. Esta migration NAO cria uma segunda
--   arquitectura: ela apenas CONVERGE o estado de forma estritamente aditiva e
--   idempotente, para o caso de um ambiente ter aplicado apenas um subconjunto
--   das migrations historicas (ver QA ISSUE-007: coluna cs.secret_kind ausente
--   em producao => gap de APLICACAO, nao de autoria).
--
--   Diferenca deliberada face a 20260817000009_fix_channel_secrets_schema.sql:
--   aquela migration e DESTRUTIVA (DROP COLUMN api_key_vault_secret_id /
--   webhook_vault_secret_id) e NAO tem backfill. Esta migration NAO repete esses
--   drops (o Adendo manda preservar as colunas Vault) e NAO remove _secret_token.
--
--   Regras honradas: adicionar colunas IF NOT EXISTS; unique condicional; index
--   IF NOT EXISTS; backfill explicito com ON CONFLICT DO NOTHING; NAO alterar
--   grants/RLS; NAO remover colunas Vault; NAO sobrescrever secret novo por valor
--   legado vazio. Segura para correr duas vezes sem erro.

BEGIN;

-- 1. Colunas de contrato (idempotente). NOT NULL ja garantido pelo DEFAULT.
ALTER TABLE public.channel_connection_secrets
  ADD COLUMN IF NOT EXISTS secret_kind TEXT NOT NULL DEFAULT 'meta_bearer_token';

ALTER TABLE public.channel_connection_secrets
  ADD COLUMN IF NOT EXISTS secret_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Unicidade (channel_connection_id, secret_kind) — condicional, sem tocar na
--    pkey/uq legada se ja tiver sido convertida por migrations anteriores.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_channel_secrets_conn_kind'
      AND conrelid = 'public.channel_connection_secrets'::regclass
  ) THEN
    ALTER TABLE public.channel_connection_secrets
      ADD CONSTRAINT uq_channel_secrets_conn_kind
      UNIQUE (channel_connection_id, secret_kind);
  END IF;
END $$;

-- 3. Index de lookup por kind (idempotente).
CREATE INDEX IF NOT EXISTS idx_channel_secrets_kind
  ON public.channel_connection_secrets(secret_kind);

-- 4. Backfill de convergencia a partir de channel_connections.public_config.
--    Cada kind so e inserido se o valor legado nao for vazio; ON CONFLICT DO
--    NOTHING garante que um secret ja migrado NUNCA e sobrescrito por valor
--    legado. Nunca imprime nem move o valor para fora da coluna.

-- 4a. meta_bearer_token <- _secret_token OU pageAccessToken
INSERT INTO public.channel_connection_secrets
  (channel_connection_id, workspace_id, secret_kind, secret_payload)
SELECT
  cc.id,
  cc.workspace_id,
  'meta_bearer_token',
  jsonb_build_object(
    'accessToken',
    COALESCE(cc.public_config->>'_secret_token', cc.public_config->>'pageAccessToken')
  )
FROM public.channel_connections cc
WHERE COALESCE(cc.public_config->>'_secret_token', cc.public_config->>'pageAccessToken', '') <> ''
ON CONFLICT (channel_connection_id, secret_kind) DO NOTHING;

-- 4b. meta_capi_token <- metaAccessToken OU meta_capi_access_token
INSERT INTO public.channel_connection_secrets
  (channel_connection_id, workspace_id, secret_kind, secret_payload)
SELECT
  cc.id,
  cc.workspace_id,
  'meta_capi_token',
  jsonb_build_object(
    'accessToken',
    COALESCE(cc.public_config->>'metaAccessToken', cc.public_config->>'meta_capi_access_token')
  )
FROM public.channel_connections cc
WHERE COALESCE(cc.public_config->>'metaAccessToken', cc.public_config->>'meta_capi_access_token', '') <> ''
ON CONFLICT (channel_connection_id, secret_kind) DO NOTHING;

-- 4c. meta_webhook_verify_token <- verifyToken
INSERT INTO public.channel_connection_secrets
  (channel_connection_id, workspace_id, secret_kind, secret_payload)
SELECT
  cc.id,
  cc.workspace_id,
  'meta_webhook_verify_token',
  jsonb_build_object('verifyToken', cc.public_config->>'verifyToken')
FROM public.channel_connections cc
WHERE COALESCE(cc.public_config->>'verifyToken', '') <> ''
ON CONFLICT (channel_connection_id, secret_kind) DO NOTHING;

COMMIT;
