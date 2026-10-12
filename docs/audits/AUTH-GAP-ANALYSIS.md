# Análise de Lacunas de Autenticação e Prontidão de Produção (AUTH-GAP-ANALYSIS)

> **Data:** 2026-10-05
> **Status:** Gap Analysis Concluída | Requisitos Técnicos Satisfeitos | Dependências Operacionais Identificadas
> **Referência:** Soberania MCT OS v2.0 (Zero Dados Mock em Produção)

---

## 1. Resumo Executivo das Lacunas Identificadas e Resolvidas

Antes desta remediação, a arquitetura apresentava quatro lacunas críticas para entrada em produção:

1. **Vazamento e Bypass por Parâmetros de URL:** Parâmetros `?token=` e `?auth=` podiam ser injetados na URL em qualquer ambiente, gerando risco de exposição de tokens em logs de proxy, histórico de navegação e cabeçalhos HTTP `Referer`.
2. **Exposição de Ferramentas de Laboratório em Produção:** A barra de testes (`DevLabToolbar`) era suscetível a aparecer se não houvesse segregação estrita de variáveis de build.
3. **Incompatibilidade no Script de Seed Haven:** `scripts/seed-haven-waba.ts` referenciava colunas e tabelas inexistentes no schema V3 (`users.role`, `memberships`), além de tentar inserir dados fictícios não vinculados a uma conta real no provedor Supabase Auth.
4. **Ausência de Ferramenta Administrativa Segura:** Não existia uma ferramenta segura, transacional e idempotente para associar operadores reais verificados aos seus respectivos workspaces.

---

## 2. Status dos Critérios de Aceite

### AC13 — Interface de Login Comercial & Client Supabase Auth
- **Estado Anterior:** Login de desenvolvimento com bypass e credenciais sintéticas expostas na tela.
- **Estado Atual:** `CONCLUÍDO TECNICAMENTE`
  - Implementada `LoginPage.tsx` com envio de magic link via `supabase-auth.ts`.
  - Tratamento da resposta de confirmação de e-mail e extração limpa de tokens a partir do fragment hash (`#access_token=...`).
  - Parâmetros `?token=` e `?auth=` completamente desativados em builds comerciais (qualquer ocorrência é expurgada da barra de endereços).
  - Componentes de desenvolvimento isolados sob verificação de `isLabDistribution()`.

### AC14 — Validação Criptográfica de Tokens no Backend
- **Estado Anterior:** Verificação de token simplificada ou com chave estática de desenvolvimento.
- **Estado Atual:** `CONCLUÍDO TECNICAMENTE`
  - Validação de JWT via `packages/auth` com suporte a HMAC e JWKS emitidos pelo Supabase GoTrue.
  - Associação mandatória do sujeito (`sub`) com a tabela soberana `workspace_memberships` antes de conceder acesso aos endpoints da API.
  - Fail-closed: tokens adulterados, expirados ou de emissores desconhecidos são rejeitados com HTTP 401.

### AC15 — Provisionamento Administrativo de Membros
- **Estado Anterior:** Script de seed quebrado tentando escrever em tabelas e colunas legadas.
- **Estado Atual:** `ESTRUTURADO TECNICAMENTE / BLOQUEADO EXTERNAMENTE EM PRODUÇÃO`
  - Criado o script `scripts/admin-upsert-member.ts` com validações rigorosas (Zod), verificação de colisão de identidade, execução em transação atômica e dry-run por padrão.
  - Criado o runbook `docs/runbooks/ADMIN-MEMBER-PROVISIONING-RUNBOOK.md`.
  - Criada suíte de testes unitários `scripts/__tests__/admin-upsert-member.test.ts` (8 testes aprovados).
  - **Bloqueio Externo:** A aplicação em produção requer a criação dos usuários no console do Supabase e o fornecimento dos Subject UUIDs reais.

---

## 3. Matriz de Prontidão e Bloqueadores Externos

```
[ Frontend: LoginPage & Auth ] ──────────────► [ PRONTO PARA PRODUÇÃO ]
[ Backend: JWT & RLS Enforce ] ──────────────► [ PRONTO PARA PRODUÇÃO ]
[ Tooling: admin-upsert-member.ts ] ─────────► [ PRONTO PARA PRODUÇÃO ]
[ Supabase Auth (Produção) ] ────────────────► [ BLOQUEADO: Aguarda Envs no Host VPS ]
[ Operadores Haven Reais ] ──────────────────► [ BLOQUEADO: Aguarda Cadastro no GoTrue ]
```

### Próximos Passos Operacionais (Fora do Escopo de Código Local):
1. No host de produção (VPS), configurar as variáveis `SUPABASE_URL`, `SUPABASE_JWT_SECRET` e `SUPABASE_ANON_KEY`.
2. Registrar o primeiro operador/administrador no Supabase Auth GoTrue.
3. Copiar o Subject UUID gerado e executar o runbook `ADMIN-MEMBER-PROVISIONING-RUNBOOK.md` com `--apply`.
