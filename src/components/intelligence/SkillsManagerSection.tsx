import React from 'react';
import { 
  Calendar, 
  ShoppingBag, 
  ShieldAlert, 
  Ghost, 
  Eye, 
  CreditCard, 
  Truck, 
  FileText, 
  Search,
  Sparkles,
  CheckCircle2,
  Lock,
  Zap
} from 'lucide-react';

export interface CommercialSkillDefinition {
  id: string;
  name: string;
  category: 'core' | 'closing' | 'retention' | 'operations' | 'integration';
  description: string;
  icon: React.ElementType;
  badge: string;
  status: 'active' | 'available' | 'locked';
  defaultEnabled: boolean;
  capabilities: string[];
}

export const CANONICAL_COMMERCIAL_SKILLS: CommercialSkillDefinition[] = [
  {
    id: 'skill-smart-schedule',
    name: 'Espelhamento & Agendamento Inteligente',
    category: 'core',
    description: 'Verifica horários, agenda compromissos em tempo real e envia links externos (Trinks / Google Agenda) de forma contextual.',
    icon: Calendar,
    badge: 'Core Nativo',
    status: 'active',
    defaultEnabled: true,
    capabilities: [
      'Leitura de horários de funcionamento e dias úteis',
      'Inserção automática na Agenda Cockpit',
      'Envio de link de agendamento online com parâmetro de rastreio',
      'Confirmação de pré-reserva com lembrete'
    ]
  },
  {
    id: 'skill-catalog-closing',
    name: 'Catálogo Dinâmico & Alçadas de Fechamento',
    category: 'closing',
    description: 'Apresenta produtos e serviços com valores oficiais, respeitando limites de desconto e parcelamento sem alucinação de preço.',
    icon: ShoppingBag,
    badge: 'EKO Engine',
    status: 'active',
    defaultEnabled: true,
    capabilities: [
      'Apresentação de planos/produtos ativos no catálogo',
      'Aplicação de até X% de desconto pré-autorizado',
      'Cálculo de parcelas sem juros',
      'Diferenciação clara entre preço à vista Pix e parcelado'
    ]
  },
  {
    id: 'skill-safety-handoff',
    name: 'Auditoria CDC & Handoff Humano Seguro',
    category: 'core',
    description: 'Monitora sentimentos de risco, direito de arrependimento (Art. 49 CDC) e transfere o atendimento para operadores com 1 clique.',
    icon: ShieldAlert,
    badge: 'Segurança P0',
    status: 'active',
    defaultEnabled: true,
    capabilities: [
      'Gatilho automático ao detectar pedido de humano ou insatisfação',
      'Pausa instantânea do bot (fail-closed)',
      'Notificação sonora e visual de alerta no Cockpit',
      'Respeito rigoroso aos 7 dias de arrependimento do CDC'
    ]
  },
  {
    id: 'skill-ghosting-resurrection',
    name: 'Reanimação de Vácuo (Anti-Ghosting)',
    category: 'retention',
    description: 'Identifica leads que pararam de responder após o envio de preço ou proposta e envia ganchos de retomada no timing ideal.',
    icon: Ghost,
    badge: 'Conversão +35%',
    status: 'active',
    defaultEnabled: true,
    capabilities: [
      'Monitoramento de vácuo após 2h, 24h e 48h',
      'Ganchos curiosos e não invasivos (ex: "Conseguiu ver a proposta?")',
      'Prevenção de spam respeitando a política da Meta',
      'Cancelamento automático caso o lead responda'
    ]
  },
  {
    id: 'skill-multimodal-vision',
    name: 'Leitura & OCR de Comprovantes (Visão IA)',
    category: 'operations',
    description: 'Analisa capturas de tela e comprovantes Pix enviados no WhatsApp, validando valor, data e favorecido via Llama 3.2 Vision.',
    icon: Eye,
    badge: 'Multimodal',
    status: 'active',
    defaultEnabled: true,
    capabilities: [
      'OCR em tempo real de comprovantes bancários e Pix',
      'Conferência automática com o valor do pedido',
      'Aceleração da liberação de pedidos ou confirmação de vagas',
      'Alerta de comprovante suspeito ou com data divergente'
    ]
  },
  {
    id: 'skill-payment-links',
    name: 'Cobrança Pix Copia-e-Cola & Checkout',
    category: 'closing',
    description: 'Gera chave Pix com QR Code Copia-e-Cola ou link de checkout Cakto/Asaas diretamente na conversa do WhatsApp.',
    icon: CreditCard,
    badge: 'Financeiro',
    status: 'active',
    defaultEnabled: true,
    capabilities: [
      'Emissão de Pix dinâmico com valor exato',
      'Geração de link de checkout protegido com UTM tracking',
      'Sincronização imediata de status Pago no Kanban',
      'Disparo de evento Purchase no Meta CAPI'
    ]
  },
  {
    id: 'skill-order-tracking',
    name: 'Rastreio de Pedidos & Logística',
    category: 'operations',
    description: 'Permite ao cliente consultar o status de entrega do seu pedido informando apenas o CPF ou número do pedido.',
    icon: Truck,
    badge: 'Operacional',
    status: 'available',
    defaultEnabled: false,
    capabilities: [
      'Integração com Correios, Melhor Envio e transportadoras',
      'Resposta imediata com código e link de rastreio',
      'Redução de até 60% de tickets repetitivos no suporte'
    ]
  },
  {
    id: 'skill-smart-knowledge-search',
    name: 'Busca Semântica na Base de Conhecimento',
    category: 'core',
    description: 'RAG vetorial avançado para consultar manuais técnicos, PDFs, políticas internas e responder dúvidas técnicas específicas.',
    icon: Search,
    badge: 'RAG 2.0',
    status: 'active',
    defaultEnabled: true,
    capabilities: [
      'Busca semântica de alta precisão em documentos indexados',
      'Citação factual sem alucinar procedimentos técnicos',
      'Isolamento estrito entre workspaces multi-tenant'
    ]
  },
  {
    id: 'skill-document-invoice-issuer',
    name: 'Emissão de 2ª Via & Documentos Fiscais',
    category: 'operations',
    description: 'Busca faturas pendentes, 2ª via de boletos ou notas fiscais em PDF e entrega como anexo oficial no WhatsApp.',
    icon: FileText,
    badge: 'Automação ERP',
    status: 'available',
    defaultEnabled: false,
    capabilities: [
      'Consulta ao ERP financeiro da empresa',
      'Download e envio do PDF como mídia nativa WABA',
      'Confirmação de autenticidade do pagador'
    ]
  }
];

interface SkillsManagerSectionProps {
  enabledSkillIds?: string[];
  onToggleSkill?: (skillId: string, enabled: boolean) => void;
  canManage?: boolean;
}

export const SkillsManagerSection: React.FC<SkillsManagerSectionProps> = ({
  enabledSkillIds = CANONICAL_COMMERCIAL_SKILLS.filter(s => s.defaultEnabled).map(s => s.id),
  onToggleSkill,
  canManage = true,
}) => {
  const [activeSkills, setActiveSkills] = React.useState<Set<string>>(new Set(enabledSkillIds));

  React.useEffect(() => {
    setActiveSkills(new Set(enabledSkillIds));
  }, [enabledSkillIds]);

  const handleToggle = (skill: CommercialSkillDefinition) => {
    if (!canManage || skill.status === 'locked') return;
    const next = new Set(activeSkills);
    const willEnable = !next.has(skill.id);
    if (willEnable) {
      next.add(skill.id);
    } else {
      next.delete(skill.id);
    }
    setActiveSkills(next);
    if (onToggleSkill) {
      onToggleSkill(skill.id, willEnable);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner do Hub de Skills */}
      <div className="bg-gradient-to-r from-[var(--sos-ai)]/10 via-purple-50 to-blue-50 dark:from-[var(--sos-ai)]/20 dark:via-slate-900 dark:to-slate-900 border border-[var(--sos-ai)]/30 rounded-xl p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--sos-ai)] text-white flex items-center justify-center shadow-xs shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--sos-ink)] font-heading flex items-center gap-2">
                <span>Habilidades do Agente (Skills & Tools)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--sos-ai)] text-white font-mono font-bold">
                  Motor NVIDIA Nemotron 120B
                </span>
              </h2>
              <p className="text-xs text-[var(--sos-muted)] mt-0.5">
                Ative ou desative capacidades sob demanda. O atendente unificado executa cada habilidade no momento exato da conversa com o lead.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-[var(--sos-ai)] bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-[var(--sos-ai)]/20 shadow-2xs self-start sm:self-auto">
            <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>{activeSkills.size} de {CANONICAL_COMMERCIAL_SKILLS.length} Habilidades Ativas</span>
          </div>
        </div>
      </div>

      {/* Grid de Cards de Skills */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CANONICAL_COMMERCIAL_SKILLS.map((skill) => {
          const Icon = skill.icon;
          const isEnabled = activeSkills.has(skill.id);
          const isLocked = skill.status === 'locked';

          return (
            <div
              key={skill.id}
              className={`rounded-xl border p-4 transition-all duration-200 flex flex-col justify-between ${
                isEnabled
                  ? 'bg-white dark:bg-slate-900 border-[var(--sos-ai)]/40 shadow-xs ring-1 ring-[var(--sos-ai)]/20'
                  : 'bg-[var(--sos-surface)] border-[var(--sos-border)] opacity-85 hover:opacity-100'
              }`}
            >
              <div className="space-y-3">
                {/* Header do Card */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isEnabled 
                        ? 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)]' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[var(--sos-ink)] font-heading leading-tight">
                        {skill.name}
                      </h3>
                      <span className="text-[9.5px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[var(--sos-muted)] border border-[var(--sos-border)] inline-block mt-0.5">
                        {skill.badge}
                      </span>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => handleToggle(skill)}
                    disabled={!canManage || isLocked}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isEnabled ? 'bg-[var(--sos-ai)]' : 'bg-slate-300 dark:bg-slate-700'
                    } ${(!canManage || isLocked) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        isEnabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Descrição */}
                <p className="text-[11.5px] text-[var(--sos-muted)] leading-relaxed">
                  {skill.description}
                </p>

                {/* Capacidades Específicas */}
                <div className="pt-2 border-t border-[var(--sos-border)] space-y-1">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--sos-muted)] block">
                    Capacidades inclusas:
                  </span>
                  <ul className="space-y-0.5">
                    {skill.capabilities.slice(0, 3).map((cap, idx) => (
                      <li key={idx} className="text-[10.5px] text-[var(--sos-ink)] flex items-start gap-1.5">
                        <CheckCircle2 className={`w-3 h-3 mt-0.5 shrink-0 ${isEnabled ? 'text-[var(--sos-ai)]' : 'text-slate-400'}`} />
                        <span className="leading-tight">{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Rodapé do Card */}
              <div className="pt-3 mt-3 border-t border-[var(--sos-border)] flex items-center justify-between text-[10px]">
                <span className={`font-semibold ${isEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                  {isEnabled ? '● Habilitada no Atendimento' : '○ Em espera / Desativada'}
                </span>
                {isLocked && (
                  <span className="flex items-center gap-1 text-slate-400 font-mono">
                    <Lock className="w-2.5 h-2.5" /> Requer Add-on
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
