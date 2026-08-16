# PROMPT PARA GEMINI — Task 7: Workspace Init API (Provisioning Controlado)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Problema: Operador autentica via Supabase Auth mas não tem workspace → tela vazia
Solução: **API endpoint controlado** (não trigger no `auth.users`) chamado no primeiro login

## ARQUIVOS A CRIAR / MODIFICAR

### 1. Nova Rota: `apps/api/src/interfaces/http/routes/workspace-init.ts`
```typescript
// POST /api/v1/workspaces/init
// Body: { workspaceName?: string }
// Auth: JWT válido (operatorActor)
// Idempotente: se já tem workspace → retorna existing
```

### 2. Gateway Port: `apps/api/src/application/ports/workspace-provisioning-gateway.ts`
```typescript
interface WorkspaceProvisioningGateway {
  initializeForActor(actor: AuthenticatedActor, workspaceName?: string): Promise<WorkspaceInitResult>;
  actorHasWorkspace(actor: AuthenticatedActor): Promise<boolean>;
}

interface WorkspaceInitResult {
  workspaceId: string;
  workspaceName: string;
  membershipId: string;
  role: 'owner';
  channelConnectionId: string; // WAHA disconnected pronto para QR
}
```

### 3. Implementação: `apps/api/src/infrastructure/database/postgres-workspace-provisioning-gateway.ts`
- Transação atômica:
  1. INSERT `workspaces` (name = `workspaceName` || email.split('@')[0] + "'s Workspace")
  2. INSERT `workspace_memberships` (workspace_id, user_id=actor.userId, role='owner')
  3. INSERT `workspace_sla_policies` (defaults: 15min, 24h)
  4. INSERT `channel_connections` (type='WAHA', status='DISCONNECTED', workspace_id)
- Retorna IDs criados

### 4. Registro no `operator-auth-routes.ts`
```typescript
app.post('/workspaces/init', async (request, reply) => {
  const actor = request.operatorActor;
  if (!actor) return unauthorized(reply);
  // ... chamar gateway.initializeForActor
});
```

### 5. Frontend: Hook `useWorkspaceInit` + Auto-call
```typescript
// src/hooks/useWorkspaceInit.ts
export function useWorkspaceInit(gateway: HttpSalesOsGateway, workspaceId?: string) {
  const [needsInit, setNeedsInit] = useState(false);
  
  useEffect(() => {
    if (!workspaceId) {
      // Verificar se tem workspaces
      gateway.listWorkspaces().then(ws => {
        if (ws.data.length === 0) setNeedsInit(true);
      });
    }
  }, [workspaceId, gateway]);
  
  const init = async (name?: string) => {
    const result = await gateway.initializeWorkspace(name);
    // Recarregar workspaces
    return result;
  };
  
  return { needsInit, init };
}
```

### 6. Integração no `App.tsx` / Layout
```tsx
// No componente que gerencia workspace selection
const { needsInit, init } = useWorkspaceInit(gateway, selectedWorkspaceId);

if (needsInit) {
  return <WorkspaceInitModal onInit={init} />;
}
```

### 7. Modal: `src/components/workspace/WorkspaceInitModal.tsx`
- Input: "Nome do seu negócio" (opcional, default do email)
- Botão: "Criar Workspace"
- Loading state durante init
- Success → fecha modal → recarrega app

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **Idempotência** | `actorHasWorkspace` check antes de criar; se já tem → 409 ou retorna existing |
| **Transação** | Tudo em `BEGIN`/`COMMIT` — rollback se qualquer INSERT falhar |
| **RLS** | Novas rows criadas com `workspace_id` → owner tem acesso total via policies |
| **Canal WAHA** | `status='DISCONNECTED'` → usuário vê "Conectar QR" em Configurações |
| **Validação** | `workspaceName` max 100 chars, sanitizado |

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. Novo usuário (sem workspace) loga → vê modal "Configure seu Workspace"
3. Preenche nome → clica "Criar" → workspace criado + membership owner + canal WAHA disconnected
4. Redirecionado para Cockpit → fila vazia mas funcional
5. Em Configurações → Canais → vê canal WAHA "Desconectado" → pode clicar "Conectar QR"
6. Segundo login mesmo usuário → **não** vê modal (já tem workspace)

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
npm run dev  # testar fluxo novo usuário
```