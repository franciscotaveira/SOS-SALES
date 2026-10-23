# Runbook: Provisionamento, Conferência e Revogação de Membros (AC15)

Este runbook descreve o procedimento operacional padrão para conceder, auditar e revogar acessos de operadores e administradores nos workspaces do **SOS Sales V3**, utilizando o schema soberano (`users` e `workspace_memberships`).

---

## 1. Princípios de Segurança e Pré-Requisitos

1. **Identidade Primária Descentralizada**: O usuário deve ter sua identidade previamente criada/verificada no provedor de autenticação (Supabase Auth GoTrue), obtendo seu **Subject UUID**.
2. **Autorização Centralizada via RLS**: O papel operacional (`role`) não é autodeclarado pelo navegador nem gravado no JWT do cliente; ele é consultado e aplicado estritamente a partir da tabela `workspace_memberships`.
3. **Dry-Run por Padrão**: O script `scripts/admin-upsert-member.ts` roda em modo somente leitura (dry-run). Nenhuma gravação ocorre sem o argumento explícito `--apply`.
4. **Proteção contra Troca Silenciosa de Papel**: Se o usuário já possuir um papel no workspace, a alteração exige o parâmetro `--allow-role-change`.
5. **Papéis Permitidos**: `owner`, `admin`, `manager`, `operator`, `analyst`, `integration_service`, `support_auditor`.

---

## 2. Cadastro / Provisionamento de Membro

### Passo 1: Simulação Segura (Dry-Run)
Antes de qualquer gravação, execute a simulação para verificar integridade de UUIDs, colisões de e-mail e planejamento de transação:

```bash
pnpm tsx scripts/admin-upsert-member.ts \
  --subject-id "22222222-2222-4222-8222-222222222222" \
  --email "operador@suaempresa.com.br" \
  --name "Nome do Operador" \
  --workspace-id "11111111-1111-4111-8111-111111111111" \
  --role "operator"
```

A saída exibirá o plano de execução sem abrir transação de escrita.

### Passo 2: Aplicação em Banco de Dados (`--apply`)
Após validar o plano e confirmar que o Subject UUID pertence ao operador correto:

```bash
pnpm tsx scripts/admin-upsert-member.ts \
  --subject-id "22222222-2222-4222-8222-222222222222" \
  --email "operador@suaempresa.com.br" \
  --name "Nome do Operador" \
  --workspace-id "11111111-1111-4111-8111-111111111111" \
  --role "operator" \
  --apply
```

O script executa um bloco atômico `BEGIN ... COMMIT` garantindo `users` e `workspace_memberships`.

---

## 3. Conferência de Membros no Workspace

Para listar todos os membros ativos vinculados a um workspace e auditar seus respectivos papéis:

```bash
pnpm tsx scripts/admin-upsert-member.ts \
  --workspace-id "11111111-1111-4111-8111-111111111111" \
  --list
```

A listagem apresentará papel, nome, e-mail e o User ID (UUID) associado.

---

## 4. Alteração de Papel (Promoção / Rebaixamento)

Para alterar o papel de um membro já cadastrado (ex: de `operator` para `manager`), o parâmetro de segurança `--allow-role-change` é mandatório para evitar reconfigurações acidentais:

```bash
pnpm tsx scripts/admin-upsert-member.ts \
  --subject-id "22222222-2222-4222-8222-222222222222" \
  --email "operador@suaempresa.com.br" \
  --name "Nome do Operador" \
  --workspace-id "11111111-1111-4111-8111-111111111111" \
  --role "manager" \
  --allow-role-change \
  --apply
```

---

## 5. Revogação de Acesso

### Passo 1: Simulação da Revogação (Dry-Run)
```bash
pnpm tsx scripts/admin-upsert-member.ts \
  --subject-id "22222222-2222-4222-8222-222222222222" \
  --workspace-id "11111111-1111-4111-8111-111111111111" \
  --revoke
```

### Passo 2: Aplicação da Revogação (`--apply`)
```bash
pnpm tsx scripts/admin-upsert-member.ts \
  --subject-id "22222222-2222-4222-8222-222222222222" \
  --workspace-id "11111111-1111-4111-8111-111111111111" \
  --revoke \
  --apply
```

A associação na tabela `workspace_memberships` é removida imediatamente sob transação. Todas as requisições subsequentes do usuário para este workspace serão bloqueadas pelo middleware de autorização RLS.
