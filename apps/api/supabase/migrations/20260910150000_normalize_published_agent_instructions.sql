-- Normalize old field names without overwriting explicitly published canonical values.
UPDATE public.workspace_intelligence_bundles
SET bundle = jsonb_set(bundle, '{agentConfig}',
  (bundle->'agentConfig')
  || CASE WHEN NOT (bundle->'agentConfig' ? 'allowedPaymentMethods')
          AND jsonb_typeof(bundle #> '{agentConfig,paymentMethods}') = 'array'
     THEN jsonb_build_object('allowedPaymentMethods', bundle #> '{agentConfig,paymentMethods}') ELSE '{}'::jsonb END
  || CASE WHEN NOT (bundle->'agentConfig' ? 'installmentLimitWithoutInterest')
          AND jsonb_typeof(bundle #> '{agentConfig,maxInstallmentsWithoutInterest}') = 'number'
     THEN jsonb_build_object('installmentLimitWithoutInterest', bundle #> '{agentConfig,maxInstallmentsWithoutInterest}') ELSE '{}'::jsonb END
), updated_at = NOW()
WHERE EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=workspace_intelligence_bundles.workspace_id)
 AND published_at IS NOT NULL AND jsonb_typeof(bundle->'agentConfig') = 'object'
  AND ((NOT (bundle->'agentConfig' ? 'allowedPaymentMethods') AND bundle->'agentConfig' ? 'paymentMethods')
    OR (NOT (bundle->'agentConfig' ? 'installmentLimitWithoutInterest') AND bundle->'agentConfig' ? 'maxInstallmentsWithoutInterest'));

-- Reconcile the exact obsolete Sofia rule observed in production with the
-- owner's existing single-question/no-questionnaire instruction. No price changes.
UPDATE public.workspace_intelligence_bundles
SET bundle = jsonb_set(bundle, '{agentConfig,safetyGuardrails}', (
  SELECT jsonb_agg(CASE WHEN value = to_jsonb('Nunca encerrar a resposta sem propor uma escolha fechada (Menor Próximo Passo).'::text)
    THEN to_jsonb('Faça no máximo uma pergunta necessária por turno, sem múltipla escolha forçada. Não force perguntas após despedida, confirmação ou encaminhamento.'::text)
    ELSE value END ORDER BY ordinality)
  FROM jsonb_array_elements(bundle #> '{agentConfig,safetyGuardrails}') WITH ORDINALITY
)), updated_at = NOW()
WHERE workspace_id = '11111111-1111-1111-1111-111111111111'
 AND EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=workspace_intelligence_bundles.workspace_id)
 AND published_at IS NOT NULL
 AND jsonb_typeof(bundle #> '{agentConfig,safetyGuardrails}') = 'array'
 AND (bundle #> '{agentConfig,safetyGuardrails}') @> '["Nunca encerrar a resposta sem propor uma escolha fechada (Menor Próximo Passo)."]'::jsonb;
