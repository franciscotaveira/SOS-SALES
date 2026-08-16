# PROMPT PARA GEMINI — Task 8: Frontend Auto-Redirect to Workspace Init

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Dependência: Task 7 (Workspace Init API) implementada
Objetivo: Frontend detecta usuário sem workspace → redireciona para modal de init

## ARQUIVOS A MODIFICAR / CRIAR

### 1. Hook: `src/hooks/useWorkspaceInit.ts` (criar)
```typescript
import { useEffect, useState } from 'react';
import { HttpSalesOsGateway } from '../services/salesOsGateway';

export function useWorkspaceInit(gateway: HttpSalesOsGateway) {
  const [workspaces, setWorkspaces] = useState<ApiWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsInit, setNeedsInit] = useState(false);

  useEffect(() => {
    let mounted = true;
    gateway.listWorkspaces().then(({ data }) => {
      if (mounted) {
        setWorkspaces(data);
        setNeedsInit(data.length === 0);
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [gateway]);

  const initWorkspace = async (name?: string) => {
    const result = await gateway.initializeWorkspace(name);
    setWorkspaces(prev => [...prev, result.workspace]);
    setNeedsInit(false);
    return result;
  };

  return { workspaces, loading, needsInit, initWorkspace };
}
```

### 2. Modal: `src/components/workspace/WorkspaceInitModal.tsx` (criar)
```tsx
interface WorkspaceInitModalProps {
  onInit: (name?: string) => Promise<void>;
  onCancel?: () => void; // só se opcional
}

export const WorkspaceInitModal: React.FC<WorkspaceInitModalProps> = ({ onInit }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onInit(name.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-slate-900">Bem-vindo ao SOS Sales</h2>
        <p className="mt-2 text-sm text-slate-600">
          Vamos configurar seu primeiro workspace para começar.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nome do seu negócio
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Escovaria Haven"
              className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
              maxLength={100}
            />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Criando...' : 'Criar Workspace'}
          </button>
        </form>
      </div>
    </div>
  );
};
```

### 3. Integração no `App.tsx` (ou layout principal)
```tsx
// No componente root que tem acesso ao gateway
const { workspaces, loading, needsInit, initWorkspace } = useWorkspaceInit(gateway);

if (loading) return <GlobalLoadingSkeleton />;

if (needsInit) {
  return <WorkspaceInitModal onInit={initWorkspace} />;
}

// Render normal do app com workspace selector...
```

### 4. Gateway Method: `src/services/salesOsGateway.ts` (adicionar)
```typescript
// Em HttpSalesOsGateway
async initializeWorkspace(name?: string): Promise<WorkspaceInitResult> {
  return this.request('/workspaces/init', {
    method: 'POST',
    body: JSON.stringify({ workspaceName: name }),
  });
}
```

## FLUXO COMPLETO

```
1. Usuário loga (Supabase Auth) → JWT válido
2. App carrega → useWorkspaceInit chama listWorkspaces()
3. Se workspaces.length === 0 → needsInit = true
4. Render WorkspaceInitModal (modal centralizado, backdrop)
5. Usuário preenche nome → clica "Criar Workspace"
6. POST /workspaces/init → backend cria workspace + membership owner + canal WAHA
7. Sucesso → modal fecha → workspaces recarregado → App normal renderiza
8. Usuário vê Cockpit vazio mas funcional + Configurações → Canais → "Conectar QR"
```

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **Modal Bloqueante** | `fixed inset-0 z-50` — impede interação com resto do app |
| **Sem Cancel** | Workspace é obrigatório para operar — não há "pular" |
| **Loading States** | Botão desabilitado + "Criando..." durante request |
| **Error Handling** | Toast/inline error se 409 (já tem), 500, network |
| **Acessibilidade** | `role="dialog"`, `aria-modal="true"`, focus trap |

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. Novo usuário (DB limpo) loga → vê modal "Bem-vindo ao SOS Sales"
3. Preenche "Escovaria Haven" → clica criar → workspace criado
4. Redirecionado para Cockpit → aba Funil vazia mas funcional
5. Configurações → Canais → vê "WAHA Desconectado" + botão "Conectar QR"
6. Refresh página → **não** vê modal novamente (workspaces.length > 0)
7. `@browse` valida fluxo completo → 0 erros console

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
npm run dev  # testar em aba anônima (novo usuário)
```