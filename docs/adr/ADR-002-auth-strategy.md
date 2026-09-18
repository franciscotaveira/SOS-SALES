# ADR-002: Estratégia de Autenticação e Autorização (Identity & Workspace)

- **Status**: Aprovado
- **Data**: 18 de setembro de 2026
- **Decisores**: Francisco Taveira Rios (MCT LTDA) & Orchestrator MCT OS v2.0
- **Contexto**: A V2 apresentava vulnerabilidades de acoplamento com queries diretas e dependência fragmentada de estado de autenticação entre frontend e backend. No V3, o isolamento multi-tenant precisa ser matematicamente garantido em todas as camadas.

---

## Decisão

1. **Abstração por Ports & Adapters (`packages/auth`)**:
   - O domínio e a aplicação conhecem apenas a interface `IIdentityProvider` e `IAuthorizationPolicy`.
   - **Identity Provider Inicial**: Supabase Auth (utilizando emissão de JWT).
   - **Validação Local no Fastify**: O backend valida o token JWT usando chave pública / JWKS local sem realizar chamadas HTTP síncronas de rede por requisição.
   - **Mapeamento de Contexto**: Cada requisição autenticada extrai:
     - `userId: string`
     - `workspaceId: string` (via cabeçalho `X-Workspace-Id` validado contra as memberships do usuário)
     - `roles: Role[]` e `permissions: Set<Permission>`

2. **Autorização em Duas Camadas Obrigatórias**:
   - **Camada de Aplicação (RBAC)**: Casos de uso verificam permissões granulares no handler (ex: `canAccessCockpit`, `canManageIntegrations`, `canDispatchCapi`). Esconder botão na UI **não** substitui verificação no backend.
   - **Camada de Banco de Dados (RLS)**: Toda tabela tenant-owned possui coluna `workspace_id NOT NULL`.
     - Antes de qualquer query em transação, a conexão executa:
       ```sql
       SET LOCAL app.current_workspace_id = 'uuid-do-workspace';
       ```
     - Políticas de Row Level Security (RLS) bloqueiam rigorosamente qualquer leitura ou escrita com `workspace_id` discordante.
     - Chaves estrangeiras compostas `(id, workspace_id)` impedem que entidades de um tenant referenciem recursos de outro.

3. **Impersonation e Suporte**:
   - O acesso de operador de suporte só pode ocorrer mediante geração de token com prazo determinado, autorização explícita e registro obrigatório e imutável em `audit_events`.

---

## Consequências

### Positivas
- Zero tolerância para vazamento cross-tenant (falhas são capturadas pelo PostgreSQL antes de retornarem à memória).
- Autonomia para substituir o provedor de identidade no futuro sem refatorar o núcleo comercial.
- Testes negativos automatizados testam tentativas maliciosas de acesso cruzado.

### Negativas / Mitigações
- Necessidade de gerenciar a variável de sessão do Postgres (`app.current_workspace_id`) em cada checkout de pool.
- Mitigado criando wrapper seguro de transação em `packages/database`.
