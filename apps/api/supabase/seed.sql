-- ==============================================================================
-- TX COMMERCIAL CORE — SEED DATA V2
-- Pilot Context: Haven Escovaria (Chapecó - BR)
-- ==============================================================================

-- 1. Workspace
INSERT INTO workspaces (id, name, slug, active)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Haven Escovaria',
  'haven-escovaria',
  true
) ON CONFLICT (id) DO NOTHING;

-- 2. Workspace Membership (Owner User)
INSERT INTO workspace_memberships (id, workspace_id, user_id, role)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001', -- Sample auth user
  'owner'
) ON CONFLICT DO NOTHING;

-- 3. Channel Connection (WhatsApp WAHA / Meta Cloud)
INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, public_config, status)
VALUES (
  'a2000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'waha',
  '+5549999112233',
  'WhatsApp Recepção Haven',
  '{"session": "haven_main", "endpoint": "http://localhost:8081"}'::jsonb,
  'CONNECTED'
) ON CONFLICT DO NOTHING;

-- 3.1 Channel Connection Secret References
INSERT INTO channel_connection_secrets (
  channel_connection_id, workspace_id, secret_kind, secret_payload
)
VALUES (
  'a2000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'meta_bearer_token',
  '{"token": "sample-waha-token"}'::jsonb
) ON CONFLICT DO NOTHING;

-- 4. Contact
INSERT INTO contacts (id, workspace_id, phone, whatsapp_id, name, email)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  '+5549999887766',
  '5549999887766@s.whatsapp.net',
  'Juliana Rossi',
  'juliana.rossi@exemplo.com.br'
) ON CONFLICT DO NOTHING;

-- 5. Commercial Journey
INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, primary_service_or_product, total_revenue_minor, currency, started_at)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'OPEN',
  'Escova Lisa & Hidratação Express',
  5900, -- R$ 59,00
  'BRL',
  NOW() - INTERVAL '15 minutes'
) ON CONFLICT (id) DO NOTHING;

-- 6. Inbound Channel Event (Envelope Bruto WAHA)
INSERT INTO inbound_channel_events (id, workspace_id, channel_connection_id, provider, provider_event_id, event_type, raw_payload, received_at)
VALUES (
  'c1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  'waha',
  'message:wamid_Juliana_001',
  'message',
  '{"event": "message", "id": "01J5K4M7N8P9Q0R1S2T3U4V5SE", "payload": {"id": "wamid_Juliana_001", "from": "5549999887766@s.whatsapp.net", "body": "Olá! Vi o anúncio da escova por R$ 59 e queria saber se tem vaga hoje à tarde.", "referral": {"source_id": "ad_video_transformacao_03", "headline": "Escova lisa sem hora marcada"}}}'::jsonb,
  NOW() - INTERVAL '15 minutes'
) ON CONFLICT DO NOTHING;

-- 7. Conversation Message (Mensagem Normalizada)
INSERT INTO conversation_messages (id, workspace_id, channel_connection_id, journey_id, contact_id, direction, sender_type, provider_message_id, text_content, sent_at)
VALUES (
  'c2000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'inbound',
  'customer',
  'wamid_Juliana_001',
  'Olá! Vi o anúncio da escova por R$ 59 e queria saber se tem vaga hoje à tarde.',
  NOW() - INTERVAL '15 minutes'
) ON CONFLICT DO NOTHING;

-- 8. Acquisition Context (Meta Ads CTWA)
INSERT INTO acquisition_contexts (
  id, workspace_id, journey_id, source, campaign_id, campaign_name,
  ad_set_id, ad_id, creative_code, offer_hook, entry_message,
  click_ids, tracking_code, confidence, occurred_at
) VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'meta_ads',
  'cmp_haven_promocional_2026',
  'Escova Express Sem Hora Marcada',
  'adset_chapeco_centro',
  'ad_video_transformacao_03',
  'CRTV_ESC_03',
  'Escova lisa sem hora marcada por R$ 59',
  'Olá! Vi o anúncio da escova por R$ 59 e queria saber se tem vaga hoje.',
  '{"ctwaClid": "ctwa_984729184712", "fbclid": "fb_83749182374"}'::jsonb,
  'trk_haven_esc_03',
  'HIGH_CTWA',
  NOW() - INTERVAL '15 minutes'
) ON CONFLICT (id) DO NOTHING;

-- 9. Known Facts (Namespaced)
INSERT INTO known_facts (id, workspace_id, journey_id, key, value, source, confidence, confirmed_by_customer, observed_at)
VALUES 
(
  'e0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'profile.name',
  '"Juliana Rossi"'::jsonb,
  'customer_explicit_text',
  1.00,
  true,
  NOW() - INTERVAL '14 minutes'
),
(
  'e0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'offer.quoted_price',
  '5900'::jsonb,
  'ad_payload',
  0.95,
  true,
  NOW() - INTERVAL '15 minutes'
),
(
  'e0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'schedule.preferred_period',
  '"tarde"'::jsonb,
  'customer_explicit_text',
  1.00,
  true,
  NOW() - INTERVAL '12 minutes'
) ON CONFLICT (id) DO NOTHING;

-- 10. Decision State & Friction
INSERT INTO decision_states (
  journey_id, workspace_id, current_stage, stage_confidence,
  primary_friction, secondary_frictions, friction_evidence, friction_confidence, friction_resolved, updated_at
) VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'BUSCA_OBJETIVA',
  0.92,
  'availability',
  '["deadline"]'::jsonb,
  'Cliente perguntou se tem vaga hoje à tarde.',
  0.88,
  false,
  NOW() - INTERVAL '10 minutes'
) ON CONFLICT (journey_id) DO NOTHING;

-- 11. Decision Event
INSERT INTO decision_events (
  id, workspace_id, journey_id, actor, actor_id, from_state, to_state, reason,
  inferred_friction, evidence_snippet, confidence, correlation_id, projection_version, idempotency_key, created_at
) VALUES (
  'f0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'ai',
  'cognitive-engine-v1',
  'INTERESSE_INICIAL',
  'BUSCA_OBJETIVA',
  'Cliente validou o gancho e solicitou verificação de disponibilidade para o mesmo dia.',
  'availability',
  'queria saber se tem vaga hoje à tarde',
  0.92,
  'corr_juliana_init_001',
  1,
  'idemp_juliana_dec_001',
  NOW() - INTERVAL '10 minutes'
) ON CONFLICT (id) DO NOTHING;

-- 12. Recommended Action
INSERT INTO recommended_actions (
  id, workspace_id, journey_id, suggested_action, suggested_draft_text, micro_commitment_goal, confidence, policy_status, created_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'OFFER_TIME_SLOTS',
  'Temos sim, Juliana! Conseguimos te encaixar hoje às 14h30 ou às 16h00. Qual fica mais confortável pra você?',
  'Confirmar horário de atendimento preferido',
  0.95,
  'ALLOWED',
  NOW() - INTERVAL '8 minutes'
) ON CONFLICT (id) DO NOTHING;

-- 13. Projection Checkpoint
INSERT INTO projection_checkpoints (journey_id, workspace_id, last_event_id, last_message_id, projection_version, updated_at)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001',
  1,
  NOW() - INTERVAL '8 minutes'
) ON CONFLICT (journey_id) DO NOTHING;

-- 14. Outbox Event (Pending sync)
INSERT INTO outbox_events (id, workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key, status, created_at)
VALUES (
  'f1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'journey.started',
  'CommercialJourney',
  'c0000000-0000-0000-0000-000000000001',
  '{"journeyId": "c0000000-0000-0000-0000-000000000001", "source": "meta_ads", "campaign": "cmp_haven_promocional_2026"}'::jsonb,
  'outbox_journey_started_c0000000',
  'PENDING',
  NOW() - INTERVAL '15 minutes'
) ON CONFLICT (id) DO NOTHING;
