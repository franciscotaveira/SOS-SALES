# PROMPT PARA GEMINI — Task 13: Integration Registry + MCP Server (Onda 1)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Pós-MVP: Arquitetura hexagonal pronta (ports/adapters/outbox)
Objetivo: **Registry dinâmico de ferramentas** para IA chamar APIs externas (ERP, Estoque, Catálogo, Pagamentos, Calendário)

## ARQUIVOS A CRIAR

### 1. Port: `apps/api/src/application/ports/integration-registry.ts`
```typescript
interface IntegrationTool {
  name: string;                    // "check_stock", "create_payment", "schedule_appointment"
  description: string;             // Para LLM function calling
  parameters: JsonSchema;          // Zod schema → JSON Schema
  requiredPermissions: string[];   // ["integration:read", "integration:write"]
  execute: (args: unknown, context: ToolContext) => Promise<ToolResult>;
}

interface ToolContext {
  workspaceId: string;
  actorId: string;
  journeyId?: string;
  knownFacts: Record<string, KnownFact>;
}

interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  nextActions?: string[];          // Sugestões para DecisionEngine
}

interface IntegrationRegistry {
  register(tool: IntegrationTool): void;
  unregister(name: string): void;
  getForWorkspace(workspaceId: string): IntegrationTool[];
  execute(name: string, args: unknown, context: ToolContext): Promise<ToolResult>;
}
```

### 2. Implementação: `apps/api/src/infrastructure/integrations/integration-registry.ts`
- In-memory registry (inicial) → futuro: persistir em `workspace_integrations` table
- Validação de permissões por role
- Timeout + retry policy por tool
- Logging estruturado (auditoria)

### 3. MCP Server Adapter: `apps/api/src/infrastructure/integrations/mcp-adapter.ts`
```typescript
// Conecta a servidores MCP externos (stdin/stdout ou HTTP)
interface McpServerConfig {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;           // para stdio
  url?: string;               // para HTTP
  tools: string[];            // nomes das tools expostas
}

class McpAdapter {
  async connect(config: McpServerConfig): Promise<void>;
  async listTools(): Promise<IntegrationTool[]>;
  async callTool(name: string, args: unknown): Promise<ToolResult>;
}
```

### 4. Integração no DecisionEngine
```typescript
// Em NextBestActionEngine
async function suggestActions(context: DecisionContext): Promise<NextBestAction[]> {
  const tools = integrationRegistry.getForWorkspace(context.workspaceId);
  // LLM decide quais tools chamar baseado em knownFacts + jornada
  const toolCalls = await llm.decideToolCalls(context, tools);
  const results = await Promise.all(toolCalls.map(tc => 
    integrationRegistry.execute(tc.name, tc.args, context)
  ));
  // Converter results em NextBestAction
}
```

### 5. Configuração por Workspace: `apps/api/src/infrastructure/database/postgres-workspace-integrations.ts`
- Tabela `workspace_integrations` (workspace_id, tool_name, config_json, enabled, credentials_ref)
- Credentials em `vault` (Supabase Vault ou env criptografado)

### 6. Tools Piloto (Onda 1)
| Tool | Fonte | Descrição |
|------|-------|-----------|
| `check_stock` | ERP/Estoque API | `sku` → `{ available: 10, reserved: 2 }` |
| `create_payment_link` | Asaas/AbacatePay | `amount, dueDate, customer` → `{ url, chargeId }` |
| `schedule_appointment` | Google Calendar | `dateTime, duration, attendeeEmail` → `{ eventId, meetLink }` |

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. Registry carrega tools configuradas para workspace
3. DecisionEngine chama `check_stock` → retorna dado real → sugere "Temos 10 unidades, confirmar reserva?"
4. MCP server externo conectado (ex: filesystem MCP para ler catálogo local)
3. Auditoria: toda execução logada em `integration_audit_log`

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
```