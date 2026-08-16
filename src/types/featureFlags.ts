import { OperatorRole } from './cockpit';

export type FeatureFlagKey =
  | 'traffic_proof'
  | 'owner_only_analytics'
  | 'financial_metrics'
  | 'roas_deep_analytics'
  | 'audit_trail'
  | 'agency_groups'
  | 'commercial_kanban'
  | 'qa_simulator'
  | 'autonomous_safe_ai'
  | 'advanced_routing'
  | 'macro_shortcuts';

export type FeatureFlagLevel = 'P0_CORE' | 'P1_OPERATIONAL' | 'P2_AGENCY' | 'DEV_QA';

export type WorkspaceTier = 'standard' | 'agency' | 'enterprise';

export interface FeatureFlagDefinition {
  key: FeatureFlagKey;
  name: string;
  description: string;
  level: FeatureFlagLevel;
  defaultForStandard: boolean;
  defaultForAgency: boolean;
  defaultForEnterprise: boolean;
  requiredRole?: OperatorRole; // Minimum role required if role-gating is enforced
  tags: string[];
}

export const ROLE_HIERARCHY: Record<OperatorRole, number> = {
  admin: 5,
  owner: 4,
  supervisor: 3,
  operator: 2,
  viewer: 1,
};

export const FEATURE_FLAG_REGISTRY: Record<FeatureFlagKey, FeatureFlagDefinition> = {
  traffic_proof: {
    key: 'traffic_proof',
    name: 'Proof of Traffic (Atribuição ROAS & Vendas)',
    description:
      'Painel executivo de transparência de tráfego que cruza investimento de mídia Meta Ads CTWA com fechamento de vendas reais no WhatsApp.',
    level: 'P0_CORE',
    defaultForStandard: true,
    defaultForAgency: true,
    defaultForEnterprise: true,
    requiredRole: 'owner',
    tags: ['ROAS', 'Meta Ads', 'P0', 'Owner'],
  },
  owner_only_analytics: {
    key: 'owner_only_analytics',
    name: 'Restrição de Análises Exclusiva para Owner',
    description:
      'Quando ativo, bloqueia o acesso a painéis de faturamento, Proof of Traffic e métricas financeiras sensíveis para operadores comuns e viewers.',
    level: 'P1_OPERATIONAL',
    defaultForStandard: false,
    defaultForAgency: true,
    defaultForEnterprise: true,
    requiredRole: 'owner',
    tags: ['Segurança', 'Governança', 'Owner', 'P1'],
  },
  financial_metrics: {
    key: 'financial_metrics',
    name: 'Métricas Financeiras & Faturamento Bruto',
    description:
      'Exibição de valores monetários absolutos (receita total BRL, ticket médio, gasto em anúncios e margens de conversão) na interface.',
    level: 'P1_OPERATIONAL',
    defaultForStandard: true,
    defaultForAgency: true,
    defaultForEnterprise: true,
    requiredRole: 'owner',
    tags: ['Financeiro', 'Faturamento', 'Owner', 'P1'],
  },
  roas_deep_analytics: {
    key: 'roas_deep_analytics',
    name: 'Análise Avançada de ROAS por Anúncio & Criativo',
    description:
      'Métricas aprofundadas de Custo Por Lead Qualificado (CPL), taxa de conversão por criativo e retorno sobre investimento publicitário.',
    level: 'P1_OPERATIONAL',
    defaultForStandard: false,
    defaultForAgency: true,
    defaultForEnterprise: true,
    requiredRole: 'owner',
    tags: ['ROAS', 'Analytics', 'Criativos', 'P1'],
  },
  audit_trail: {
    key: 'audit_trail',
    name: 'Trilha de Auditoria & Governança de SLA',
    description:
      'Histórico de auditoria de alterações de status comercial, pausas de canais e acessos de operadores.',
    level: 'P1_OPERATIONAL',
    defaultForStandard: false,
    defaultForAgency: true,
    defaultForEnterprise: true,
    requiredRole: 'owner',
    tags: ['Auditoria', 'SLA', 'Segurança', 'P1'],
  },
  agency_groups: {
    key: 'agency_groups',
    name: 'Módulo Agência & Grupos WhatsApp',
    description:
      'Monitoramento de SLA em grupos de suporte de clientes, avisos em lote, relatórios e governança multi-stakeholder.',
    level: 'P2_AGENCY',
    defaultForStandard: true,
    defaultForAgency: true,
    defaultForEnterprise: true,
    tags: ['Grupos', 'Agência', 'P2'],
  },
  commercial_kanban: {
    key: 'commercial_kanban',
    name: 'Funil Kanban de Vendas',
    description:
      'Quadro visual de oportunidades com drag & drop entre estágios comerciais, KPIs de pipeline e desfechos.',
    level: 'P1_OPERATIONAL',
    defaultForStandard: true,
    defaultForAgency: true,
    defaultForEnterprise: true,
    tags: ['Vendas', 'Pipeline', 'P1'],
  },
  qa_simulator: {
    key: 'qa_simulator',
    name: 'Simulador QA & Testes de Resiliência',
    description:
      'Ferramentas para simular mensagens de leads em tempo real, injeção de falhas de rede e troca manual de permissões.',
    level: 'DEV_QA',
    defaultForStandard: false,
    defaultForAgency: false,
    defaultForEnterprise: false,
    tags: ['Desenvolvimento', 'QA', 'Golden Path'],
  },
  autonomous_safe_ai: {
    key: 'autonomous_safe_ai',
    name: 'Modo Autônomo Seguro da IA (Autonomous Safe)',
    description:
      'Capacidade da IA responder e fechar agendamentos automaticamente dentro dos limites estritos do Playbook Comercial.',
    level: 'P1_OPERATIONAL',
    defaultForStandard: false,
    defaultForAgency: true,
    defaultForEnterprise: true,
    tags: ['IA', 'Automação', 'P1'],
  },
  advanced_routing: {
    key: 'advanced_routing',
    name: 'Roteamento Avançado & Infraestrutura Híbrida',
    description:
      'Balanceamento e chaveamento técnico entre instâncias WAHA e WABA Meta Cloud API.',
    level: 'P2_AGENCY',
    defaultForStandard: false,
    defaultForAgency: true,
    defaultForEnterprise: true,
    tags: ['Infraestrutura', 'WABA', 'WAHA', 'P2'],
  },
  macro_shortcuts: {
    key: 'macro_shortcuts',
    name: 'Atalhos Rápidos de Mensagens (Macros /)',
    description:
      'Menu rápido de respostas padronizadas e templates de fechamento acionados pelo caractere barra (/).',
    level: 'P1_OPERATIONAL',
    defaultForStandard: true,
    defaultForAgency: true,
    defaultForEnterprise: true,
    tags: ['Produtividade', 'Compositor', 'P1'],
  },
};
