-- DECISÃO ARQUITETURAL: Dual-Engine é intencional.
-- WAHA (WhatsApp Web) e Meta Cloud (WABA oficial) complementam-se:
--   - WAHA: sync de histórico, recebimento de mensagens em tempo real
--   - Meta Cloud: templates HSM, CAPI, mensagens ativas com botões
-- A constraint anterior bloqueava os dois ao mesmo tempo para o mesmo número.
-- Esta migration relaxa para permitir (número, provider) único — ou seja,
-- um número pode ter um canal WAHA ativo E um canal meta_cloud ativo,
-- mas não dois canais do mesmo provider para o mesmo número.

BEGIN;

-- Remove a constraint antiga que bloqueava dual-engine
DROP INDEX IF EXISTS uq_active_whatsapp_display_phone_provider;

-- Recria com provider incluído na chave — permite dual-engine por design
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_whatsapp_display_phone_per_provider
  ON public.channel_connections (
    NULLIF(regexp_replace(COALESCE(phone_number, ''), '\D', '', 'g'), ''),
    provider
  )
  WHERE provider IN ('waha', 'meta_cloud')
    AND status = 'CONNECTED'
    AND NULLIF(regexp_replace(COALESCE(phone_number, ''), '\D', '', 'g'), '') IS NOT NULL;

COMMIT;
