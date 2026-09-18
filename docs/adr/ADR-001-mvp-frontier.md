# ADR-001: Fronteira e Escopo Fechado do MVP V3

- **Status**: Aprovado
- **Data**: 18 de setembro de 2026
- **Decisores**: Francisco Taveira Rios (MCT LTDA) & Orchestrator MCT OS v2.0
- **Contexto**: A V2 acumulou mais de 81 mil linhas de código com componentes e rotas altamente acoplados (`LiveCockpitView` com 3.743 linhas, `whatsapp-channel-routes` com 2.924 linhas). Há o risco de um rewrite greenfield expandir escopo indefinidamente ou reintroduzir funcionalidades dispersas.

---

## Decisão

O MVP do **SOS Sales V3** é delimitado com fronteira fechada em torno do **Ciclo Comercial E2E com Prova e Retorno à Mídia**:

```text
Aquisição (Meta Ads / CTWA / Lead Ads)
      ↓
Identificação e Atribuição com Hierarquia de Evidências
      ↓
Conversa Omnichannel (WhatsApp WABA Oficial & WAHA)
      ↓
Atendimento Cockpit (Humano + IA Supervisionada com Handoff Determinístico)
      ↓
Qualificação, Funil Comercial e Agendamento
      ↓
Fechamento de Venda (Outcome Registrado com Valor e Identidade)
      ↓
Feedback CAPI (Conversions API com Recibo do Provedor e Validação de Limites)
```

### Funcionalidades Fora do Escopo do MVP (Non-Goals)
1. **Nenhum construtor visual de automações**: Proibição de fluxos genéricos no estilo low-code.
2. **Nenhum uso de n8n**: Proibição arquitetural permanente MCT OS v2.0.
3. **Canais secundários na primeira fase**: Foco exclusivo em Meta Cloud API (WABA) e WAHA. Instagram Direct e Messenger entram via adapters em iterações posteriores.
4. **Billing/Cobrança complexa no dia 1**: Entitlements server-side simples baseados em feature flags por workspace.
5. **Fixtures e dados fake em produção**: Adesão irrestrita ao princípio *Truth in Data*.

---

## Consequências

### Positivas
- Redução drástica da superfície de ataque e da complexidade de código.
- Capacidade de comprovar o valor de negócio essencial (leads qualificados e retorno de sinal CAPI) antes de expandir.
- Testes unitários, de contrato e E2E focados exclusivamente no fluxo de receita.

### Negativas / Mitigações
- Clientes com fluxos periféricos não padronizados permanecerão na V2 até fases posteriores. A mitigação é a migração progressiva por workspace (ADR-004).
