# PROMPT PARA GEMINI — Task 16: Advanced AI Agent (Onda 2-3)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Base: `DecisionEngine` + `NextBestAction` + `KnownFacts` + `IntegrationRegistry` (Task 13) prontos
Objetivo: **IA Agente Autônoma** que aprende o negócio, sugere e executa próximos passos

## ARQUIVOS A CRIAR

### 1. Knowledge Base por Workspace: `apps/api/src/infrastructure/ai/workspace-knowledge-base.ts`
```typescript
// RAG sobre documentos do cliente (PDF, site, FAQ, catálogo)
interface WorkspaceKnowledgeBase {
  ingest(source: KnowledgeSource): Promise<void>;      // PDF, URL, texto
  query(question: string, context: DecisionContext): Promise<RAGResult>;
  listSources(): Promise<KnowledgeSource[]>;
}

interface KnowledgeSource {
  id: string;
  type: 'pdf' | 'url' | 'text' | 'faq' | 'catalog';
  name: string;
  contentHash: string;        // para detectar mudanças
  lastIndexedAt: string;
  metadata?: Record<string, unknown>;
}

interface RAGResult {
  answer: string;
  citations: Citation[];
  confidence: number;         // 0-1
  suggestedTools?: string[];  // tools do IntegrationRegistry para chamar
}
```

### 2. Agent Loop: `apps/api/src/infrastructure/ai/autonomous-agent.ts`
```typescript
class AutonomousSalesAgent {
  async runCycle(context: DecisionContext): Promise<AgentCycleResult> {
    // 1. OBSERVE: knownFacts + journey + knowledgeBase + integrações
    const observation = await this.observe(context);
    
    // 2. THINK: LLM com system prompt do negócio + tools disponíveis
    const plan = await this.think(observation);
    
    // 3. ACT: Executar tools (check_stock, create_payment, schedule, etc.)
    const actions = await this.act(plan, context);
    
    // 4. REFLECT: Avaliar resultado → atualizar knownFacts → próximo ciclo
    const reflection = await this.reflect(actions, context);
    
    return { observation, plan, actions, reflection };
  }
  
  // Modo supervisionado: retorna NextBestAction para operador aprovar
  async suggestNextActions(context: DecisionContext): Promise<NextBestAction[]> {
    const cycle = await this.runCycle(context);
    return cycle.actions.map(a => ({
      type: a.type,
      label: a.label,
      confidence: a.confidence,
      requiresApproval: a.requiresApproval,  // true por padrão
      toolCall: a.toolCall,                  // { name, args }
      preview: a.preview                     // "Verificar estoque SKU-123"
    }));
  }
}
```

### 3. Business Context Learning: `apps/api/src/infrastructure/ai/business-context-learner.ts`
```typescript
// Aprende com cada interação
interface BusinessContextLearner {
  learnFromOutcome(outcome: CommercialOutcome, journey: Journey): Promise<void>;
  learnFromConversation(messages: Message[], journey: Journey): Promise<void>;
  learnFromIntegrationResult(tool: string, result: ToolResult): Promise<void>;
  getBusinessProfile(workspaceId: string): BusinessProfile;
}

interface BusinessProfile {
  // Extraído automaticamente
  commonObjections: string[];
  successfulPitches: string[];
  averageDealSize: number;
  typicalSalesCycleDays: number;
  bestContactTimes: string[];        // "10:00-11:00", "14:00-16:00"
  productInterestBySegment: Record<string, string[]>;
  paymentPreferences: string[];      // "PIX", "Boleto 30d"
  seasonalPatterns: Record<string, number>;
}
```

### 4. System Prompt Dinâmico (por workspace)
```typescript
function buildSystemPrompt(profile: BusinessProfile, tools: IntegrationTool[]): string {
  return `
Você é o assistente de vendas da ${profile.businessName}.
Seu negócio: ${profile.description}
Produtos/serviços principais: ${profile.topProducts.join(', ')}
Ticket médio: R$ ${profile.averageDealSize/100}
Ciclo de venda: ${profile.typicalSalesCycleDays} dias

Ferramentas disponíveis:
${tools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

Regras:
1. SEMPRE verifique fatos conhecidos (known_facts) antes de assumir
2. Use tools para dados externos (estoque, pagamento, calendário)
3. Sugira próximos passos baseados no perfil do cliente
4. Nunca invente preços, prazos ou disponibilidade
5. Se inseguro, peça confirmação ao operador
`;
}
```

### 5. Integração no Cockpit (UI)
- Painel "IA Sugere" no lado direito do Cockpit
- Cards: "Verificar estoque SKU-123" → botão "Executar" → mostra resultado
- "Criar link pagamento R$ 2.000" → botão "Aprovar" → envia WhatsApp
- "Agendar follow-up dia 15" → botão "Confirmar" → cria no Calendar
- Feedback loop: operador aceita/rejeita → melhora confiança

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **Modelo** | GPT-4o / Claude 3.5 Sonnet / Gemini 1.5 Pro (configurável) |
| **Function Calling** | OpenAI tools format / Anthropic tool use / Gemini function calling |
| **Contexto** | knownFacts + journey + últimos 20 mensagens + businessProfile + tools |
| **Latência** | < 3s para sugestão (streaming) |
| **Privacidade** | Dados do cliente NÃO vão para treino — apenas contexto da sessão |
| **Auditoria** | Toda sugestão + ação + resultado logada em `ai_agent_audit_log` |
| **Human-in-the-loop** | Default: `requiresApproval=true` — só auto-executa se `confidence > 0.95` + config |

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. Agente lê catálogo (PDF/URL) → responde "Temos o modelo X em estoque?"
3. Sugere "Criar cobrança PIX R$ 1.500" → operador aprova → link gerado
4. Aprende com outcome WON → atualiza businessProfile (ticket médio, produto)
5. Próxima sugestão usa aprendizado: "Clientes desse segmento preferem PIX 30d"
6. Audit log completo: sugestão → aprovação → execução → resultado

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
# Configurar LLM:
# OPENAI_API_KEY=... ANTHROPIC_API_KEY=... GEMINI_API_KEY=... npm run dev
```