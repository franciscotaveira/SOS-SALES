# PROMPT PARA GEMINI — Task 6: LiveSettingsView

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Atual: Aba "Configurações" mostra placeholder
Objetivo: Central de gestão do workspace (canais, SLA, membros)

## ARQUIVO A CRIAR
`src/components/settings/LiveSettingsView.tsx`

## REQUISITOS FUNCIONAIS

### 1. Abas / Seções
```tsx
type SettingsTab = 'canais' | 'sla' | 'membros';
const [activeTab, setActiveTab] = useState<SettingsTab>('canais');
```

---

### 2. Aba "Canais Conectados"
**Fonte:** `gateway.listChannelConnections(workspaceId)` (precisa criar no gateway)

| Campo | Exibição |
|-------|----------|
| **Tipo** | Badge: `WAHA` / `WABA` / `MANUAL` |
| **Número** | Telefone E.164 formatado |
| **Status** | `CONNECTED` (verde) / `DISCONNECTED` (cinza) / `PAIRING` (amarelo) / `ERROR` (vermelho) |
| **Última Atividade** | Timestamp relativo |
| **Ações** | - `CONNECTED`: "Desconectar" (POST /channels/:id/disconnect) |
| | - `DISCONNECTED`: "Conectar QR" (abre modal com QR code WAHA) |
| | - `PAIRING`: "Cancelar" |
| | - Todas: "Remover" (DELETE /channels/:id — só owner) |

**Modal QR Code:** Se WAHA + status `PAIRING` → `GET /channels/:id/qr` → exibe imagem + polling status até `CONNECTED`

---

### 3. Aba "Política de SLA"
**Fonte:** `gateway.getSlaPolicy(workspaceId)` + `gateway.updateSlaPolicy(workspaceId, policy)` (só owner)

```tsx
interface SlaPolicy {
  firstResponseMinutes: number;      // default 15
  resolutionHours: number;           // default 24
  businessHours: {                   // opcional v2
    enabled: boolean;
    timezone: string;
    days: number[];                  // 0=Dom ... 6=Sáb
    start: string;                   // "09:00"
    end: string;                     // "18:00"
  };
}
```

**UI:**
- Input numérico: "Primeiro atendimento (minutos)" — min 1, max 1440
- Input numérico: "Resolução (horas)" — min 1, max 720
- Botão "Salvar" → `updateSlaPolicy` → toast success/error
- **Regra:** Só `role === 'owner'` vê botão salvar; `operator`/`viewer` veem read-only

---

### 4. Aba "Membros & Operadores"
**Fonte:** `gateway.listWorkspaceMembers(workspaceId)` (precisa criar no gateway)

| Coluna | Conteúdo |
|--------|----------|
| **Avatar** | Inicial do email/nome |
| **Nome / Email** | Do `operatorActor` (JWT) |
| **Role** | Badge: `owner` (coroa), `operator` (usuário), `viewer` (olho) |
| **Status** | `active` / `invited` / `revoked` |
| **Último Acesso** | Timestamp relativo |
| **Ações (só owner)** | - `operator` → "Promover a Owner" / "Rebaixar a Viewer" |
| | - `viewer` → "Promover a Operator" |
| | - `invited` → "Reenviar convite" / "Revogar" |
| | - `revoked` → "Restaurar" |

**Convite Novo Membro (só owner):**
- Modal: email + role (`operator` | `viewer`)
- POST `/workspaces/:id/members/invite` → envia email Supabase Auth invite

---

### 5. Header da Página
- Título: "Configurações do Workspace"
- Badge do workspace atual (nome)
- Botão "Trocar Workspace" (se >1 workspace)

## INTEGRAÇÃO NO GATEWAY (Métodos Novos Necessários)

```typescript
// Em HttpSalesOsGateway (salesOsGateway.ts)
async listChannelConnections(workspaceId: string): Promise<ChannelConnection[]>
async getChannelQrCode(workspaceId: string, channelId: string): Promise<{ qrCode: string; expiresAt: string }>
async disconnectChannel(workspaceId: string, channelId: string): Promise<void>
async deleteChannel(workspaceId: string, channelId: string): Promise<void>

async getSlaPolicy(workspaceId: string): Promise<SlaPolicy>
async updateSlaPolicy(workspaceId: string, policy: Partial<SlaPolicy>): Promise<SlaPolicy>

async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]>
async inviteMember(workspaceId: string, email: string, role: 'operator' | 'viewer'): Promise<void>
async updateMemberRole(workspaceId: string, memberId: string, role: 'owner' | 'operator' | 'viewer'): Promise<void>
async revokeMember(workspaceId: string, memberId: string): Promise<void>
```

## INTEGRAÇÃO NO APP

```tsx
// src/App.tsx - aba 'configuracoes'
import { LiveSettingsView } from './components/settings/LiveSettingsView';

<TabPanel value="configuracoes">
  <LiveSettingsView 
    workspaceId={selectedWorkspaceId}
    gateway={gateway}
    currentUserRole={currentUserRole} // do JWT
  />
</TabPanel>
```

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **Permissões** | UI reflete role do usuário logado (JWT) — owner vê tudo, operator/visitor read-only |
| **Validação** | Zod schemas nos inputs (SLA minutes > 0, email válido) |
| **Estados** | Loading skeletons, empty states, error toasts |
| **QR Modal** | Polling a cada 3s até CONNECTED ou EXPIRED (max 60s) |

## ARQUIVOS DE REFERÊNCIA
- `src/components/cockpit/LiveCockpitView.tsx` (padrão modais, toasts, gateway)
- `src/services/salesOsGateway.ts` (adicionar métodos acima)
- `src/components/settings/SettingsShell.tsx` (placeholder atual)

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. Aba "Configurações" carrega 3 sub-abas funcionais
3. **Canais:** Lista canais, mostra QR se pairing, conecta/desconecta
4. **SLA:** Owner edita e salva; operator/visitor veem read-only
5. **Membros:** Owner convida, promove, rebaixa, revoga
6. `@browse` valida 3 sub-abas → 0 erros console

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
npm run dev  # validar visualmente aba Configurações
```