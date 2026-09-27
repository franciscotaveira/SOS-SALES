# CH-13 — Adaptador Nativo Evolution API v2 (Soberania MCT OS)

> Nome do arquivo: `CH-13-EVOLUTION.md`  
> Estado: `COMPLETED`  
> Data de Início: 27 de setembro de 2026  
> Data de Conclusão: 27 de setembro de 2026  
> Baseline de referência: `7ffb571`  

---

## 1. Identidade e Metadados do Pacote

- **Parent Objective:** Programa SOS Sales V3 — Motor de Canais de Comunicação (Fase CH & Kernel MCT OS v2.0)
- **Estado:** `COMPLETED`
- **Lead / Agente:** @orchestrator & @backend-specialist (Antigravity)
- **Reviewers:** Architecture Specialist, Security Auditor, QA Reviewer
- **Dependências Upstream:**
  - `CH-00` a `CH-12` (Infraestrutura de Canais, Ingress Criptográfico, Rate Limiting, SSRF Guard, Dual-Engine e Outbound Transacional)
  - `CRM-01` (CRM Core, Fechamento de Venda no Cockpit e Meta CAPI Return Loop)
- **Kernel MCT OS v2.0 Standard:**
  ```yaml
  whatsapp:
    engine: Evolution API
    porta_externa: 8081
    porta_interna_docker: 8080
    auth_header: "apikey: mothership_master_2026"
    mcp_tools: [fetch_instances, create_instance, instance_connect]
    nota: "Sempre usar nome do container em Docker, nunca localhost"
  ```
- **Risco Primário Mitigado:** Falta de suporte de primeira classe ao motor oficial e soberano do ecossistema MCT (Evolution API v2), forçando dependência exclusiva de provedores secundários.

---

## 2. Decisões Arquiteturais e Implementação

1. **EvolutionAdapter Operacional (`packages/application/src/channels/adapters/evolution.adapter.ts`):**
   - Implementa a interface canônica `IChannelAdapter` sob o provedor `"evolution"`.
   - Suporte nativo a envio de texto (`/message/sendText/:instance`) e mídias (`/message/sendMedia/:instance`).
   - Validação perimétrica de segurança contra Server-Side Request Forgery (`validateEvolutionBaseUrl` e `validateMediaUrl`).
   - Prevenção de bloqueio em falhas e suporte a cancelamento atômico em voo (`FENCING_IN_FLIGHT_ABORT`).
   - Classificação determinística de erros da Evolution API (401/403 -> permanent, 400/404/422 -> permanent, 429 -> transient com Retry-After, 5xx -> transient, timeout/rede -> ambiguous).

2. **EvolutionWebhookNormalizer (`packages/application/src/channels/normalizers/evolution-normalizer.ts`):**
   - Normalizador puro e determinístico sem efeitos colaterais de I/O, rede ou banco.
   - Extrai e valida eventos `messages.upsert` (mensagens inbound e outbound de chat direto, ignorando broadcasts/grupos).
   - Extrai e valida eventos `messages.update` mapeando ACKs para transições monotônicas (`delivered`, `read`).
   - Mapeia eventos `connection.update` para ciclo de vida do canal (`connected`, `disconnected`, `qr_received`).
   - Garante estrita conformidade com o princípio *Truth in Data* e verificação do hash SHA-256 do payload cru.

3. **Verificação Criptográfica de Assinatura (`SignatureVerificationService`):**
   - Atualizado em `packages/application/src/channels/services/signature-verification.service.ts`.
   - Adicionada rotina `verifyEvolution` com comparação em tempo constante (`crypto.timingSafeEqual`) dos digests SHA-256 dos tokens de autenticação (`apikey`, `x-api-key`, `Authorization: Bearer`), eliminando vulnerabilidades de timing attack.

4. **Integração no Runtime do Worker e Inbox (`apps/worker`):**
   - Registro automático do `EvolutionAdapter` no `WorkerRuntime` (`apps/worker/src/index.ts`).
   - Roteamento transparente de webhooks do provedor `evolution` no `InboxProcessor` (`apps/worker/src/processors/inbox-processor.ts`).

---

## 3. Matriz de Evidências e Gates

- **Testes Unitários e de Integração:**
  - `evolution-adapter.test.ts` (4 testes passando).
  - `evolution-normalizer.test.ts` (5 testes passando).
  - `channel-gateway.test.ts` (53 testes passando, incluindo 2 novos testes de verificação do header de apikey da Evolution API).
- **Monorepo:**
  - 45 suítes de teste (610 asserções) 100% aprovadas.
  - Todos os 6 Gates do CI local (`pnpm ci:gate`) verificados com sucesso em 55 segundos.
