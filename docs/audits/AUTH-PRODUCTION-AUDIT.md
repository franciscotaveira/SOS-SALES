# Auditoria de Autenticação e Autorização em Produção (AUTH-PRODUCTION-AUDIT)

> **Data:** 2026-10-05
> **Status Geral:** AC13 e AC14 Concluídos Tecnicamente | AC15 Estruturado Tecnicamente (Bloqueado Externamente em Produção)
> **Classificação de Segurança:** Soberana MCT OS v2.0 (Zero Mocks em Produção / Fail-Closed)

---

## 1. Matriz de Aceite de Autenticação (AC13 – AC15)

| Critério | Descrição | Status Técnico | Status Produção | Dependência Externa / Bloqueador |
| :--- | :--- | :---: | :---: | :--- |
| **AC13** | **Interface de Login Comercial & Supabase Auth Client** | `PASSED` | `READY` | Nenhuma. Build comercial higieniza query params e rejeita bypass. |
| **AC14** | **Validação Criptográfica de Tokens Supabase (JWKS/HMAC) no Backend** | `PASSED` | `READY` | Configuração das envs `SUPABASE_JWT_SECRET` / `SUPABASE_URL` no host de produção. |
| **AC15** | **Provisionamento Administrativo Seguro de Membros & Workspaces** | `PASSED` | `BLOCKED_EXTERNAL` | Cadastro dos usuários reais no Supabase Auth GoTrue da Haven e provisionamento dos Subject UUIDs via `admin-upsert-member.ts`. |

---

## 2. Detalhamento por Critério

### AC13 — Interface de Login Comercial & Bootstrap de Sessão
- **Implementação:**
  - `apps/web/src/pages/LoginPage.tsx`: Formulário de autenticação corporativo limpo, focado em Magic Link por e-mail via `supabase-auth.ts` (`signInWithOtp`).
  - Sem dados fictícios, senhas mockadas ou botões de preenchimento automático em produção.
  - Tela de confirmação "Verifique seu e-mail corporativo" com opção de reenvio com cooldown e retorno.
  - **Segurança de URL & Token Bootstrap (`apps/web/src/App.tsx`):**
    - Parâmetros `?token=` e `?auth=` restritos estritamente ao modo laboratório (`isLabDistribution()`).
    - Em ambiente comercial, qualquer token em query params é imediatamente purgado do histórico e descartado, evitando vazamento via referrer/histórico.
    - Suporte ao redirecionamento de Magic Link via fragment hash (`#access_token=...`), extraído de forma segura por `extractHashAccessToken()` e limpo da URL.
  - **Isolamento de Ferramentas de Desenvolvimento:**
    - A toolbar de testes/lab (`DevLabToolbar`) é renderizada estritamente sob `isLabDistribution()`, garantindo que operadores em produção vejam apenas a interface limpa do sistema.

### AC14 — Validação Criptográfica de Tokens Supabase no Backend
- **Implementação:**
  - `packages/auth`: Suporte à verificação de assinaturas JWT (RS256 via JWKS ou HS256 via segredo do projeto Supabase).
  - Validação estrita de claims: `sub` (UUID do usuário), `email`, `aud` (`authenticated`), expiração (`exp`) e emissor.
  - **Resolução de Papel e Tenancy via Banco Soberano:**
    - O papel (`role`) do operador não é aceito cegamente a partir do payload do cliente; ele é consultado e validado em tempo de execução na tabela `workspace_memberships`.
    - O middleware `authenticate` e `enforceRole` injeta as variáveis de sessão RLS (`app.current_workspace_id`, `app.current_user_id`, `app.current_user_role`) na conexão transacional PostgreSQL.

### AC15 — Provisionamento Administrativo Seguro de Membros
- **Implementação:**
  - Script administrativo soberano: `scripts/admin-upsert-member.ts`.
  - Utiliza o schema V3 real: tabelas `users` e `workspace_memberships` (não utiliza `users.role` nem tabela obsoleta `memberships`).
  - **Controles de Integridade:**
    - Validação de UUIDs (Subject UUID e Workspace UUID).
    - Validação de formato de e-mail e papéis permitidos (`RoleEnum`).
    - Detecção de colisão de identidade (e-mail duplicado em UUIDs distintos).
    - Modo **Dry-Run por padrão**: nenhuma alteração é persistida sem `--apply`.
    - Proteção contra troca acidental de papel: exige `--allow-role-change`.
    - Capacidade de auditoria/listagem (`--list`) e revogação atômica (`--revoke`).
  - **Descontinuação do Script Quebrado:**
    - O arquivo `scripts/seed-haven-waba.ts` foi saneado: removidas as inserções de usuários fictícios da Haven e referências ao schema antigo.
  - **Runbook Operacional:**
    - Documentado detalhadamente em `docs/runbooks/ADMIN-MEMBER-PROVISIONING-RUNBOOK.md`.
  - **Status de Bloqueio Externo:**
    - O script e a suite de testes foram aprovados (`8/8 tests passed`). O procedimento NÃO foi executado no banco de produção, aguardando que os sujeitos reais da clínica Haven sejam cadastrados no Supabase Auth GoTrue.

---

## 3. Delimitação Honesta: Pronto vs Pendente

| Componente | O que está 100% pronto no repositório | O que depende de ação externa em produção |
| :--- | :--- | :--- |
| **Frontend Web** | UI de login, captura de magic link, proteção de tokens em URL, isolamento da DevToolbar. | Domínio de produção configurado com certificados TLS e URL de redirecionamento autorizada no painel Supabase. |
| **Backend API** | Middleware de validação JWT, RLS multi-tenant, autorização RBAC, fail-closed em chaves ausentes. | Injeção das credenciais `SUPABASE_JWT_SECRET` e `SUPABASE_URL` no `.env` do servidor de produção. |
| **Provisionamento** | Script `admin-upsert-member.ts`, testes unitários, validações transacionais, runbook completo. | Coleta dos Subject UUIDs reais dos colaboradores da Haven e execução de `--apply` pelo administrador do sistema. |
