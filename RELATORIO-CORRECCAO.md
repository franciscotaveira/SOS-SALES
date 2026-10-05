# Relatório de Diagnóstico e Correção de Gaps — SOS Sales V3

> **Data:** 04 de Outubro de 2026  
> **Sistema:** SOS Sales V3 (Chat & Sales Commercial Engine)  
> **Status Geral:** Core operacional, Gaps D, G2, G3, G5 e G6 implementados e validados com testes automatizados; G1 documentado em Runbook isolado; G4 documentado com roadmap de SSE.

---

## 1. Resumo Executivo

| Item | Domínio | Status | Evidência / Arquivos Principais |
|---|---|---|---|
| **D** | API Contacts | **Resolvido** | Deduplicação de `sendProblem` em [contacts.routes.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/routes/contacts.routes.ts); 8/8 testes passando em [contacts.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/contacts.test.ts). |
| **G1** | Infra Caddy Bundle | **Documentado (Runbook)** | [RUNBOOK-G1-BUNDLE.md](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/RUNBOOK-G1-BUNDLE.md); zero intervenção na VPS sem autorização explícita. |
| **G2** | WAHA QR Pairing Ingress | **Resolvido** | Migration [025_waha_pairing_ingress.sql](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/database/migrations/025_waha_pairing_ingress.sql); resolvers dedicados em [client.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/database/src/client.ts); rota [webhook.routes.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/routes/webhook.routes.ts); 6/6 testes em [webhook-pairing.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/webhook-pairing.test.ts) + 19/19 em [webhook-ingress.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/webhook-ingress.test.ts). |
| **G3** | Oportunidades | **Resolvido** | Rota `/opportunities` integrada ao router em [App.tsx](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/App.tsx) e componente [OpportunitiesPage.tsx](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/pages/opportunities/OpportunitiesPage.tsx); 100% de conformidade de tokens UI. |
| **G4** | Real-time Inbox | **Em Roadmap / Polling Ativo** | O inbox atual opera via polling resiliente com backoff; arquitetura de SSE + Redis pub/sub desenhada e preparada. |
| **G5** | Upload de Mídia (Composer Clip) | **Resolvido** | Endpoint `POST /v1/workspaces/:id/media` em [media-upload.routes.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/routes/media-upload.routes.ts); adapter Supabase Storage em [media-storage.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/services/media-storage.ts); método no [api-client.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/services/api-client.ts); clip com file picker, preview e remoção no [Composer.tsx](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/pages/cockpit/Conversation/Composer.tsx); 12/12 testes de API em [media-upload.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/media-upload.test.ts) e 25/25 testes web. |
| **G6** | Liquidação Webhook Pix (PSP) | **Resolvido** | `confirmPixChargeBankWebhook` em [pix.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/database/src/pix.ts); rota segura com HMAC-SHA256, janela temporal e anti-replay em [pix-webhook.routes.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/routes/pix-webhook.routes.ts); 11/11 testes em [pix-webhook.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/pix-webhook.test.ts). |

---

## 2. Detalhamento Técnico das Implementações

### Gap D — Normalização de Erros RFC 7807 em Contatos
- **Diagnóstico:** Havia declarações duplicadas do helper `sendProblem` no escopo do arquivo [contacts.routes.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/routes/contacts.routes.ts).
- **Ação:** Unificação em uma única função tipada respeitando RFC 7807 (Problem Details).
- **Validação:** Compilação limpa no TypeScript (`tsc --noEmit`) e 8 testes passando em [contacts.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/contacts.test.ts).

### Gap G1 — Runbook de Correção do Bundle no Caddy
- **Diagnóstico:** O proxy Caddy na VPS continuava servindo uma compilação antiga dos arquivos estáticos.
- **Ação:** Elaboração do [RUNBOOK-G1-BUNDLE.md](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/RUNBOOK-G1-BUNDLE.md) contendo etapas de diagnóstico (inspeção de root, hashes de assets) e correção (build, sincronização de volume Docker e reload limpo do Caddy).
- **Segurança:** Nenhuma tentativa de conexão direta à VPS foi realizada. Cada comando no runbook possui a anotação `[REQUER AUTORIZAÇÃO VPS]`.

### Gap G2 — Ingress Seguro para Canais WAHA em Emparelhamento QR
- **Diagnóstico:** A constraint `chk_channel_instances_active_status` exige `is_active = false` enquanto o canal está em `status = 'pairing'`. No entanto, as funções `lookup_channel_ingress` e `resolve_channel_signing_credential` filtravam por `is_active = true`, rejeitando com HTTP 404 eventos legítimos de `session.status` emitidos pelo WAHA durante a leitura do QR Code.
- **Decisão:** Criação de funções separadas `SECURITY DEFINER` exclusivas para emparelhamento ([025_waha_pairing_ingress.sql](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/database/migrations/025_waha_pairing_ingress.sql)), com permissão concedida unicamente ao usuário `sos_ingress_user`. Na rota [webhook.routes.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/routes/webhook.routes.ts), canais em pairing só aceitam requisições assinadas contendo estritamente o evento `session.status`. Qualquer outro evento ou requisição inválida retorna 404/401 sem vazar tokens.
- **Validação:** 6 testes em [webhook-pairing.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/webhook-pairing.test.ts) e 19 testes em [webhook-ingress.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/webhook-ingress.test.ts).

### Gap G3 — Módulo de Oportunidades no Frontend
- **Diagnóstico:** O componente `OpportunitiesPage.tsx` estava implementado, mas não constava no roteamento do aplicativo React.
- **Ação:** Adicionada a rota `/opportunities` em [App.tsx](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/App.tsx) protegida com autenticação e layout principal.
- **Validação:** Conformidade de 100% no script de auditoria de design tokens (`pnpm lint:ui`).

### Gap G5 — Upload de Mídia e Integração no Composer
- **Diagnóstico:** O Composer permitia apenas envio de mensagens de texto, sem capacidade de anexar imagens, documentos em PDF, áudios ou vídeos.
- **Ação:**
  1. **Backend:** Rota `POST /v1/workspaces/:workspaceId/media` em [media-upload.routes.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/routes/media-upload.routes.ts). Validação estrita por allowlist de MIME (JPEG, PNG, WebP, PDF, MP4, OGG, MP3), limite por tamanho (5 MB para imagens, 16 MB para documentos/mídias), e verificação obrigatória de magic bytes nos buffers recebidos.
  2. **Storage:** Interface `MediaStorage` desacoplada em [media-storage.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/services/media-storage.ts), com adapter para Supabase Storage (gerando URLs assinadas com TTL) e suporte a injeção em testes (Zero-Network).
  3. **Frontend:**
     - Adicionado método `uploadMedia` no [api-client.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/services/api-client.ts).
     - Hook [useConversation.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/pages/cockpit/hooks/useConversation.ts) atualizado para gerenciar estado de anexo, realizar upload prévio e despachar mensagem outbound com `contentType` correspondente e `mediaUrl`.
     - Componente [Composer.tsx](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/pages/cockpit/Conversation/Composer.tsx) com botão de clipe (Paperclip) conectado ao file picker, exibição de card de anexo com nome/tamanho e botão de remoção rápida.
- **Validação:** 12 testes no backend em [media-upload.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/media-upload.test.ts) e 25 testes no frontend em [api-client-and-session.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/__tests__/api-client-and-session.test.ts).

### Gap G6 — Liquidação Automática via Webhook Pix de PSP
- **Diagnóstico:** Cobranças Pix só podiam ser liquidadas manualmente por operadores no cockpit; faltava o endpoint de recebimento de confirmações de bancos/gateways.
- **Ação:**
  1. Criada a função `confirmPixChargeBankWebhook` em [pix.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/database/src/pix.ts), aplicando `verification_method = 'BANK_WEBHOOK'` (já suportado no enum do banco pela migration 015), com verificação de divergência de valores e idempotência estrita.
  2. Implementada a rota `POST /v1/webhooks/pix/:workspaceId` em [pix-webhook.routes.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/routes/pix-webhook.routes.ts) exigindo assinatura HMAC-SHA256 em tempo constante (`crypto.timingSafeEqual`), validação de janela temporal de até 5 minutos e barreira anti-replay de `eventId`.
- **Validação:** 11 testes em [pix-webhook.test.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/__tests__/pix-webhook.test.ts).

---

## 3. Matriz de Gates de Qualidade (§6)

- **Build de Pacotes:**
  - `@sos-sales/database` -> ✅ Sucesso (`tsup` ESM/CJS/DTS)
  - `@sos-sales/contracts` -> ✅ Sucesso (`tsup` ESM/CJS/DTS)
  - `@sos-sales/auth` -> ✅ Sucesso (`tsup` ESM/CJS/DTS)
- **Verificação de Tipos (TypeScript):**
  - `@sos-sales/api` -> ✅ `tsc --noEmit` passou com 0 erros
  - `@sos-sales/web` -> ✅ `tsc --noEmit` passou com 0 erros
- **UI Architecture & Tokens:**
  - `check-ui-tokens.ts` -> ✅ 100% de conformidade (65 arquivos TS/TSX inspecionados)
- **Suíte de Testes Automatizados:**
  - `apps/web` -> ✅ 25/25 testes passando
  - `apps/api` (webhook pairing, ingress, pix webhook, media upload, contacts) -> ✅ Todos os testes unitários e de integração com BD isolada validados

---

## 4. Próximos Passos Recomendados

1. **Aplicação de Migrations na Produção:** Executar a migration `025_waha_pairing_ingress.sql` no banco de dados da VPS assim que o acesso for normalizado.
2. **Configuração de Variáveis de Ambiente na VPS:**
   - `PIX_WEBHOOK_SECRET`: Definir chave secreta segura (mínimo 32 caracteres) para validação HMAC do PSP.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` e `MEDIA_STORAGE_BUCKET`: Definir credenciais do bucket de storage para upload de mídias.
3. **Execução do Runbook G1:** Seguir as instruções em [RUNBOOK-G1-BUNDLE.md](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/RUNBOOK-G1-BUNDLE.md) para atualizar os arquivos estáticos servidos pelo Caddy na VPS.

<!-- GOAL_COMPLETE -->
