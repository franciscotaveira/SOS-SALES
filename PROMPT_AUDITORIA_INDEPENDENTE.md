# 🏛️ PROMPT DE AUDITORIA INDEPENDENTE 360° — SOS SALES v2.0
> **Instruções para o Francisco:** Copie o bloco de prompt abaixo e envie diretamente para o Claude Code (ou outro agente de auditoria).

---

# 🛡️ MISSÃO: AUDITORIA INDEPENDENTE E ADVERSARIAL — SOS SALES v2.0

Você é um Engenheiro de Software Sênior e Auditor de Segurança/Arquitetura especializado em sistemas SaaS Multi-Tenant de alta escala, Node.js/Fastify, PostgreSQL/Supabase RLS, React 19 e WhatsApp (Meta Cloud WABA + WAHA).

Sua missão é realizar uma **AUDITORIA COMPLETA, INDEPENDENTE E SEM COMPLACÊNCIA** no repositório **SOS Sales** (`/Users/franciscotaveira.ads/Projetos/SOS-SALES`).
Nenhuma declaração prévia deve ser aceita como verdade: **prove cada afirmação executando código, testes e inspecionando arquivos**.

---

## 📌 1. CONTEXTO DO SISTEMA
- **Projeto:** SOS Sales — CRM Operacional de Alta Performance para WhatsApp.
- **Produção:** `https://crm.iaparavendas.tech` (VPS: 179.197.72.221)
- **Stack:** React 19 + Vite + TypeScript + Fastify 4 + PostgreSQL (Supabase Pooler) + Redis + WAHA + Meta Cloud API v20.0
- **Diretriz Soberana (MCT OS):** Zero dados mock/fake em produção; Isolamento absoluto por Workspace/Tenant (zero conceito de conta padrão); Nenhum ruído de Stories/Grupos (@g.us) no funil comercial 1:1.

---

## 🔬 2. ROTEIRO DE VERIFICAÇÃO OBRIGATÓRIO

Execute rigorosamente cada um dos passos abaixo no terminal e reporte os resultados:

### PASSO 1: Integridade de Tipos & Compilação
```bash
# 1.1 Verificação estrita de TypeScript no Frontend e Backend
npx tsc --noEmit
npm --prefix apps/api run check

# 1.2 Build completo de produção
npm run build
npm --prefix apps/api run build
```
- **Critério de Aceite:** 0 erros de TypeScript, 0 falhas de compilação.

---

### PASSO 2: Suíte de Testes Automatizados (Vitest)
```bash
# Executar a suíte completa de testes de integração e unitários (40 arquivos)
npm run check:api
```
- **Critério de Aceite:** 40 arquivos de teste passando (257+ testes), 0 falhas.

---

### PASSO 3: Auditoria E2E em Produção & Motores Oficiais Meta
```bash
# 3.1 Auditoria de todas as 9 rotas E2E
node scripts/test-e2e-all-routes.js

# 3.2 Validação de Criptografia RSA & WhatsApp Flows Meta
node scripts/test-flows-crypto.mjs

# 3.3 Auditoria E2E do Canal WABA Oficial (Haven Escovaria)
node scripts/test-haven-waba-e2e.mjs

# 3.4 Varredura funcional de todos os 9 subsistemas e isolamento
API_BASE=https://crm.iaparavendas.tech node scripts/test-all-system-features.js
```
- **Critério de Aceite:** Todos os 4 scripts devem retornar código 0 (Exit Code 0).

---

### PASSO 4: Auditoria de Código Crítico & Isolamento Multi-Tenant

Inspecione os seguintes arquivos e confirme:

1. **`apps/api/src/interfaces/http/routes/whatsapp-channel-routes.ts`**:
   - As sessões do WAHA são resolvidas dinamicamente por workspace (`ws_{workspace_id}`)?
   - Sessões não registradas ou desconhecidas são descartadas sem poluir workspaces alheios?
   - Mensagens de `status@broadcast` e de grupos (`@g.us`) são bloqueadas de criar jornadas 1:1 no Cockpit?

2. **`apps/api/src/infrastructure/database/postgres-workspace-provisioning-gateway.ts`**:
   - Ao provisionar um novo workspace para um novo cliente, a sessão criada é exclusiva (`ws_{workspace_id}`) e nunca `default`?

3. **`apps/api/src/interfaces/http/routes/webhooks/waba-webhook.ts`**:
   - O webhook da Meta Cloud WABA resolve o workspace estritamente pelo `phone_number_id` cadastrado na tabela `channel_connections`?

4. **Frontend & Componentes de Tela (`src/components/`)**:
   - Os 10 módulos (`AppShell`, `LiveCockpitView`, `LiveCommercialKanbanView`, `ConversationsHubView`, `AgendaView`, `GroupsHubView`, `LiveResultsView`, `IntelligenceHubView`, `LiveSettingsView`, `NotesView`) possuem handlers de clique válidos e sem botões mortos?

---

### PASSO 5: Verificação de Saúde do Servidor de Produção (VPS)
```bash
curl -s https://crm.iaparavendas.tech/health
curl -s https://crm.iaparavendas.tech/ready
```
- **Critério de Aceite:** Retorno HTTP 200 `{ status: "ok" }` e `{ status: "ready", dependencies: [{ name: "database", status: "ok" }, ...] }`.

---

## 📊 3. FORMATO EXIGIDO PARA O SEU RELATÓRIO FINAL

Ao concluir, responda em formato estruturado:

1. **Veredito Geral:** `[APROVADO PARA ESCALA]` ou `[REPROVADO COM RESSALVAS]`.
2. **Tabela de Evidências:** Listando cada teste executado, comando e resultado.
3. **Análise de Multi-Tenancy & Segurança:** Confirmação se o isolamento entre empresas é 100% estrito.
4. **Eventuais Gaps ou Recomendações:** O que pode ser melhorado para as próximas versões.
