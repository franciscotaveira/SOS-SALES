import React, { useState } from 'react';
import { AiAgentConfig, ToneOfVoice, AgentAutonomyMode } from '../../types/intelligence';
import {
  Bot,
  Sparkles,
  Sliders,
  ShieldAlert,
  Percent,
  CreditCard,
  PhoneForwarded,
  Save,
  Check,
  Zap,
  Users,
  Target,
  Briefcase,
  Calendar,
  ShieldCheck,
  ArrowRight,
  Layers,
  HelpCircle,
  Clock,
  ChevronRight,
  Activity,
  RotateCcw,
  BookOpen,
  Lock,
} from 'lucide-react';

interface AgentSettingsSectionProps {
  agentConfig: AiAgentConfig;
  onSaveAgentConfig?: (updated: AiAgentConfig) => void;
}

export type SpecialistRole = 'router' | 'receptionist' | 'closer' | 'scheduler' | 'guardrail' | 'groups';

export interface SpecialistProfile {
  id: SpecialistRole;
  name: string;
  codename: string;
  roleLabel: string;
  icon: any;
  color: string;
  badgeColor: string;
  description: string;
  toneOfVoice: ToneOfVoice;
  autonomyMode: AgentAutonomyMode;
  systemPrompt: string;
  maxDiscountPercent: number;
  installmentLimit: number;
  safetyGuardrails: string[];
  escalationTriggers: string[];
}

export const defaultSpecialistProfiles: Record<SpecialistRole, SpecialistProfile> = {
  router: {
    id: 'router',
    name: 'Atlas · Maestro Orquestrador',
    codename: 'ATLAS_ROUTER',
    roleLabel: 'Roteamento & Contexto',
    icon: Layers,
    color: 'from-slate-800 to-slate-950 text-white',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
    description: 'Lê a intenção do cliente e aciona o especialista com o menor contexto possível, evitando alucinações.',
    toneOfVoice: 'consultivo_premium',
    autonomyMode: 'autonomous_24_7',
    systemPrompt: `Você é o Atlas, Maestro e Roteador Geral do ecossistema SOS Vendas.
SUA MISSÃO EXCLUSIVA: Analisar a mensagem do lead/cliente, recuperar apenas os dados essenciais da etapa atual da jornada comercial e delegar a resposta para o Agente Especialista adequado.

REGRAS INEGOCIÁVEIS:
1. Nunca responda diretamente ao cliente com preços ou ofertas se a intenção for de fechamento; direcione para o Especialista Closer.
2. Se o lead acabou de clicar num anúncio (CTWA), acione imediatamente a Sofia (Triagem & Boas-Vindas).
3. Se o lead pedir horários ou vagas, acione a Clara (Agenda).
4. Mantenha o contexto estritamente enxuto para evitar qualquer tipo de alucinação.`,
    maxDiscountPercent: 0,
    installmentLimit: 1,
    safetyGuardrails: [
      'Nunca inventar promoções ou dados não presentes no RAG',
      'Isolar o contexto de cada conversa por workspace_id',
      'Roteamento com latência máxima de 300ms',
    ],
    escalationTriggers: [
      'Mensagem ambígua ou incompreensível após 2 tentativas',
      'Solicitação explícita de operador humano',
    ],
  },
  receptionist: {
    id: 'receptionist',
    name: 'Sofia · Triagem & Recepção CTWA',
    codename: 'SOFIA_CTWA',
    roleLabel: 'Recepção CTWA',
    icon: Target,
    color: 'from-blue-600 to-indigo-700 text-white',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'Acolhe o lead do anúncio, resgata a oferta prometida e qualifica intenção sem prometer descontos.',
    toneOfVoice: 'acolhedor_empatico',
    autonomyMode: 'autonomous_24_7',
    systemPrompt: `Você é a Sofia, Concierge de Boas-Vindas da empresa.
SUA MISSÃO EXCLUSIVA: Recepcionar calorosamente os leads vindos de anúncios do Meta Ads (Instagram/Facebook) ou contato direto no WhatsApp.

COMO AGIR:
1. Resgate a oferta ou headline exata do anúncio clicado pelo cliente (ex: "Vi que você se interessou pelo nosso tratamento capilar de luxo!").
2. Descubra o nome do cliente e sua principal necessidade em no máximo 2 perguntas rápidas e acolhedoras.
3. Transfira para o especialista Closer assim que o interesse for qualificado.

PROIBIÇÕES ESTRITAS:
- NUNCA conceda descontos, não invente preços de pacote.
- NUNCA prometa brindes que não estejam explícitos na campanha oficial.`,
    maxDiscountPercent: 0,
    installmentLimit: 1,
    safetyGuardrails: [
      'Proibido prometer desconto ou negociar margem',
      'Limite de 2 perguntas por mensagem para não cansar o lead',
      'Respeitar estritamente a oferta do criativo de entrada',
    ],
    escalationTriggers: [
      'Cliente pergunta sobre valores antes da qualificação',
      'Cliente expressa urgência extrema no atendimento',
    ],
  },
  closer: {
    id: 'closer',
    name: 'Vítor · Closer & Fechamento Comercial',
    codename: 'VITOR_CLOSER',
    roleLabel: 'Vendas & Proposta',
    icon: Briefcase,
    color: 'from-emerald-600 to-teal-700 text-white',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    description: 'Apresenta a tese de fechamento, contorna objeções e aplica alçadas de desconto com aprovação.',
    toneOfVoice: 'energetico_direto',
    autonomyMode: 'semi_autonomous',
    systemPrompt: `Você é o Vítor, Closer de Vendas especializado em conversão consultiva.
SUA MISSÃO EXCLUSIVA: Apresentar o valor do serviço/produto, contornar objeções de preço e prazo, e guiar o cliente até a decisão de compra.

ESTRATÉGIA DE NEGOCIAÇÃO:
1. Mostre primeiro o valor e a transformação do serviço antes de falar em preço.
2. Ao receber objeção de preço, aplique a técnica do contraste de valor e facilite o pagamento (PIX ou cartão).
3. Se necessário para fechamento imediato, utilize a Alçada de Desconto Máximo autorizada (até 15% à vista no PIX).
4. Gere o link ou instrução de pagamento do sinal.

PROIBIÇÕES:
- NUNCA ultrapasse o teto de 15% de desconto sem solicitar aprovação do gestor.
- Não aceite promessas verbais; exija confirmação do sinal.`,
    maxDiscountPercent: 15,
    installmentLimit: 3,
    safetyGuardrails: [
      'Desconto máximo fixado em 15% no PIX',
      'Parcelamento sem juros limitado a 3x',
      'Exigir aprovação de supervisor para qualquer condição fora da tabela',
    ],
    escalationTriggers: [
      'Pedido de desconto acima de 15%',
      'Cliente solicita condição especial de pagamento personalizada',
    ],
  },
  scheduler: {
    id: 'scheduler',
    name: 'Clara · Concierge de Agendamentos',
    codename: 'CLARA_AGENDA',
    roleLabel: 'Vagas & Calendário',
    icon: Calendar,
    color: 'from-purple-600 to-indigo-700 text-white',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    description: 'Consulta horários livres, reserva o sinal e envia endereço e confirmação no WhatsApp.',
    toneOfVoice: 'consultivo_premium',
    autonomyMode: 'autonomous_24_7',
    systemPrompt: `Você é a Clara, responsável pela gestão da Agenda e Atendimento VIP.
SUA MISSÃO EXCLUSIVA: Organizar a reserva de horários, confirmação de presença e orientações de chegada para o cliente.

FLUXO DE AGENDAMENTO:
1. Consulte a grade de horários disponíveis no sistema e ofereça 2 opções inteligentes (ex: "Temos quinta às 14h ou sexta às 10h").
2. Trave a vaga temporária por 30 minutos aguardando o comprovante do sinal.
3. Envie a localização no Google Maps, orientações de estacionamento e lembrete automático 24h antes.

PROIBIÇÕES:
- NUNCA realize agendamentos com intervalo menor que 30 minutos entre clientes.
- NUNCA confirme a reserva sem a validação do sinal ou aprovação do operador.`,
    maxDiscountPercent: 0,
    installmentLimit: 1,
    safetyGuardrails: [
      'Checagem obrigatória de conflito de horário na agenda',
      'Envio automático de endereço e mapa após reserva',
      'Tolerância de atraso máxima de 15 minutos informada ao cliente',
    ],
    escalationTriggers: [
      'Cliente solicita horário indisponível fora do expediente',
      'Cancelamento ou reagendamento de última hora (< 2h)',
    ],
  },
  guardrail: {
    id: 'guardrail',
    name: 'Sentinela · Guardrail & Handoff Humano',
    codename: 'SENTINEL_SLA',
    roleLabel: 'Supervisão & Segurança',
    icon: ShieldCheck,
    color: 'from-rose-600 to-pink-700 text-white',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    description: 'Monitora omissões e estresse. Transfere imediatamente para o atendente humano no Cockpit.',
    toneOfVoice: 'tecnico_especialista',
    autonomyMode: 'copilot_supervised',
    systemPrompt: `Você é o Sentinela, motor de segurança operacional e supervisão em tempo real.
SUA MISSÃO EXCLUSIVA: Monitorar silenciosamente 100% das mensagens entre clientes e robôs para prevenir atrito, alucinação ou estouro de SLA.

GATILHOS DE TRANSBORDO IMEDIATO (HANDOFF):
1. O cliente solicitou explicitamente falar com atendente humano ("quero falar com gente", "atendente por favor").
2. Detecção de sentimento negativo, irritação ou 2 perguntas consecutivas não compreendidas pela IA.
3. Pedido de cancelamento, estorno financeiro ou litígio.
4. Ao disparar o Handoff, silencie os outros robôs e alerte o operador no Cockpit com contador de SLA de 3 minutos.`,
    maxDiscountPercent: 0,
    installmentLimit: 1,
    safetyGuardrails: [
      'Transferência imediata ao detectar palavras de risco ("procon", "cancelar", "humano")',
      'Pausa obrigatória de respostas automáticas durante o atendimento do operador',
      'Gravação do motivo do handoff no Dossiê Vivo do cliente',
    ],
    escalationTriggers: [
      'Palavras-chave de risco jurídico ou reclamação',
      'Tempo de resposta sem retorno do cliente > 15 minutos',
    ],
  },
  groups: {
    id: 'groups',
    name: 'Radar · Monitor de Grupos B2B',
    codename: 'RADAR_GROUPS',
    roleLabel: 'Monitoramento B2B',
    icon: Users,
    color: 'from-amber-600 to-orange-700 text-white',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    description: 'Sintetiza conversas de grupos de clientes, detecta solicitações e emite o resumo matinal para a equipe.',
    toneOfVoice: 'consultivo_premium',
    autonomyMode: 'autonomous_24_7',
    systemPrompt: `Você é o Radar, analista de inteligência de contas e monitor de grupos de WhatsApp.
SUA MISSÃO EXCLUSIVA: Acompanhar o fluxo de conversas nos grupos de clientes da agência, gerar resumos executivos diários e alertar sobre demandas críticas.

ROTINAS:
1. Daily Digest Matinal: Sintetize o que foi solicitado na véspera e o que está pendente de entrega.
2. Alerta de Oportunidade: Avise o time imediatamente se o cliente falar sobre "aumentar orçamento", "novo produto" ou "campanha de feriado".
3. Alerta de Risco: Avise o gestor se o cliente manifestar dúvida de ROI ou atraso de criativos.`,
    maxDiscountPercent: 0,
    installmentLimit: 1,
    safetyGuardrails: [
      'Não responder no grupo sem comando explícito @bot ou autorização prévia',
      'Isolar mensagens confidenciais de um grupo para não vazar em outros',
      'Emitir resumo matinal pontualmente às 08:30',
    ],
    escalationTriggers: [
      'Cliente expressa insatisfação com entregas da agência',
      'Solicitação de reunião urgente com a diretoria',
    ],
  },
};

export const AgentSettingsSection: React.FC<AgentSettingsSectionProps> = ({
  agentConfig: initialConfig,
  onSaveAgentConfig,
}) => {
  const [profiles, setProfiles] = useState<Record<SpecialistRole, SpecialistProfile>>(() => {
    const savedProfiles = localStorage.getItem('sos_specialist_profiles');
    if (savedProfiles) {
      try {
        return JSON.parse(savedProfiles);
      } catch (e) {
        return defaultSpecialistProfiles;
      }
    }
    return defaultSpecialistProfiles;
  });

  const [selectedSpecialist, setSelectedSpecialist] = useState<SpecialistRole>('router');
  const [saved, setSaved] = useState(false);
  const [newGuardrail, setNewGuardrail] = useState('');
  const [newTrigger, setNewTrigger] = useState('');

  const activeProfile = profiles[selectedSpecialist];

  const updateActiveProfile = (partial: Partial<SpecialistProfile>) => {
    setProfiles((prev) => ({
      ...prev,
      [selectedSpecialist]: {
        ...prev[selectedSpecialist],
        ...partial,
      },
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('sos_specialist_profiles', JSON.stringify(profiles));
    if (onSaveAgentConfig) {
      onSaveAgentConfig({
        ...initialConfig,
        name: activeProfile.name,
        persona: activeProfile.systemPrompt,
        toneOfVoice: activeProfile.toneOfVoice,
        autonomyMode: activeProfile.autonomyMode,
        maxDiscountPercent: activeProfile.maxDiscountPercent,
        safetyGuardrails: activeProfile.safetyGuardrails,
        escalationTriggers: activeProfile.escalationTriggers,
      });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleResetToDefault = () => {
    updateActiveProfile(defaultSpecialistProfiles[selectedSpecialist]);
  };

  const handleAddGuardrail = () => {
    if (!newGuardrail.trim()) return;
    updateActiveProfile({
      safetyGuardrails: [...activeProfile.safetyGuardrails, newGuardrail.trim()],
    });
    setNewGuardrail('');
  };

  const handleRemoveGuardrail = (index: number) => {
    const updated = activeProfile.safetyGuardrails.filter((_, i) => i !== index);
    updateActiveProfile({ safetyGuardrails: updated });
  };

  const handleAddTrigger = () => {
    if (!newTrigger.trim()) return;
    updateActiveProfile({
      escalationTriggers: [...activeProfile.escalationTriggers, newTrigger.trim()],
    });
    setNewTrigger('');
  };

  const handleRemoveTrigger = (index: number) => {
    const updated = activeProfile.escalationTriggers.filter((_, i) => i !== index);
    updateActiveProfile({ escalationTriggers: updated });
  };

  const specialistList: SpecialistProfile[] = Object.values(profiles);

  return (
    <form onSubmit={handleSave} className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-[var(--sos-surface)] border-[var(--sos-border)] rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--sos-background)] border-[var(--sos-border)] text-[var(--sos-operational)] flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold font-heading flex items-center gap-2">
                <span>Equipe de Robôs Especialistas</span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-[var(--sos-surface)]/20 text-[var(--sos-success)] font-bold border-[var(--sos-border)]/30">
                  Especialistas Dedicados
                </span>
              </h2>
              <p className="text-xs text-[var(--sos-muted)]">
                Cada robô tem uma função clara (atender anúncio, fechar venda, marcar horário ou proteger contra descontos não autorizados).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 transition-colors"
            title="Restaurar prompt padrão de fábrica para este especialista"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Padrão de Fábrica</span>
          </button>

          <button
            type="submit"
            id="btn-save-agent-settings"
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#00A884] hover:bg-[#008f6f] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                <span>Salvo com Sucesso!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Configurações do Squad</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Interactive Squad Grid / Switcher */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {specialistList.map((spec) => {
          const isSelected = selectedSpecialist === spec.id;
          const Icon = defaultSpecialistProfiles[spec.id].icon;

          return (
            <button
              key={spec.id}
              type="button"
              onClick={() => setSelectedSpecialist(spec.id)}
              className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between overflow-hidden shadow-2xs group cursor-pointer ${
                isSelected
                  ? 'bg-white border-purple-500 ring-2 ring-purple-500/20 shadow-md'
                  : 'bg-white/90 border-slate-200 hover:border-slate-300 hover:bg-white'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br ${defaultSpecialistProfiles[spec.id].color} shadow-xs`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full border ${defaultSpecialistProfiles[spec.id].badgeColor}`}>
                    {spec.roleLabel}
                  </span>
                </div>

                <div>
                  <h3 className="font-bold text-xs text-slate-900 leading-tight">
                    {spec.name}
                  </h3>
                  <p className="text-[10.5px] text-slate-500 line-clamp-2 mt-0.5">
                    {spec.description}
                  </p>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1 font-semibold text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Ativo no Cockpit
                </span>
                <ChevronRight className={`w-3 h-3 text-slate-400 transition-transform ${isSelected ? 'rotate-90 text-purple-600 font-bold' : ''}`} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Specialist Detailed Workspace */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-to-br ${defaultSpecialistProfiles[activeProfile.id].color}`}>
              {React.createElement(defaultSpecialistProfiles[activeProfile.id].icon, { className: 'w-4 h-4' })}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 font-heading">
                Configurando: {activeProfile.name}
              </h3>
              <span className="text-[10.5px] text-slate-500 font-mono">
                {activeProfile.codename} · Isolamento de Memória & RAG Ativo
              </span>
            </div>
          </div>

          <span className="text-xs text-purple-700 bg-purple-50 font-bold px-2.5 py-1 rounded-full border border-purple-200 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-600" /> Especialista Pré-Configurado
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Identidade & Prompt do Especialista */}
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-purple-600" /> Identidade & Atuação
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {activeProfile.roleLabel}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nome do Agente Especialista
                  </label>
                  <input
                    type="text"
                    value={activeProfile.name}
                    onChange={(e) => updateActiveProfile({ name: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-[#00A884]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Nível de Autonomia
                    </label>
                    <select
                      value={activeProfile.autonomyMode}
                      onChange={(e) =>
                        updateActiveProfile({ autonomyMode: e.target.value as AgentAutonomyMode })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 font-semibold focus:ring-2 focus:ring-[#00A884]"
                    >
                      <option value="autonomous_24_7">Autônomo 24/7</option>
                      <option value="copilot_supervised">Copilot Supervisionado</option>
                      <option value="semi_autonomous">Semi-Autônomo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tom de Voz
                    </label>
                    <select
                      value={activeProfile.toneOfVoice}
                      onChange={(e) =>
                        updateActiveProfile({ toneOfVoice: e.target.value as ToneOfVoice })
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 font-semibold focus:ring-2 focus:ring-[#00A884]"
                    >
                      <option value="consultivo_premium">Consultivo & Premium</option>
                      <option value="energetico_direto">Energético & Direto</option>
                      <option value="acolhedor_empatico">Acolhedor & Empático</option>
                      <option value="tecnico_especialista">Técnico & Especialista</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Prompt de Instrução Específico do Especialista */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-600" /> Diretriz de Escopo Estrito (System Prompt)
                </label>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-bold border border-emerald-200">
                  Pré-Configurado
                </span>
              </div>

              <textarea
                rows={9}
                value={activeProfile.systemPrompt}
                onChange={(e) => updateActiveProfile({ systemPrompt: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-[#00A884] font-mono text-[11px] leading-relaxed"
                placeholder="Instruções de conduta e regras deste agente especialista..."
              />
              <p className="text-[10.5px] text-slate-500">
                💡 O escopo estrito garante que este robô só responda sobre seu domínio, eliminando 100% das alucinações de contexto.
              </p>
            </div>
          </div>

          {/* Right Column: Alçadas Financeiras & Guardrails de Segurança */}
          <div className="space-y-4">
            {/* Alçadas */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3 text-xs">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-bold text-slate-800">
                    Alçada Comercial deste Agente
                  </h4>
                </div>
                <span className="text-[10px] text-slate-500">
                  {activeProfile.maxDiscountPercent > 0 ? 'Negociação Ativa' : 'Sem Alçada de Desconto'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Desconto Máximo Autorizado (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={activeProfile.maxDiscountPercent}
                    onChange={(e) =>
                      updateActiveProfile({ maxDiscountPercent: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-[#00A884]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Parcelamento sem Juros (Vezes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={activeProfile.installmentLimit}
                    onChange={(e) =>
                      updateActiveProfile({ installmentLimit: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 font-bold focus:ring-2 focus:ring-[#00A884]"
                  />
                </div>
              </div>
            </div>

            {/* Guardrails Rígidos de Segurança */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3 text-xs">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <h4 className="font-bold text-slate-800">
                    Guardrails Rígidos de Segurança
                  </h4>
                </div>
                <span className="text-[10px] text-rose-700 font-semibold">
                  {(activeProfile?.safetyGuardrails || []).length} regras ativas
                </span>
              </div>

              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {(activeProfile?.safetyGuardrails || []).map((guardrail, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 text-slate-700"
                  >
                    <span className="text-[11px] leading-tight">🔒 {guardrail}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveGuardrail(idx)}
                      className="text-rose-500 hover:text-rose-700 font-bold text-xs ml-2 cursor-pointer"
                      title="Remover regra"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newGuardrail}
                  onChange={(e) => setNewGuardrail(e.target.value)}
                  placeholder="Adicionar novo guardrail de segurança..."
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs focus:ring-1 focus:ring-[#00A884]"
                />
                <button
                  type="button"
                  onClick={handleAddGuardrail}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 cursor-pointer shrink-0"
                >
                  Adicionar
                </button>
              </div>
            </div>

            {/* Gatilhos de Transbordo (Handoff) */}
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3 text-xs">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <PhoneForwarded className="w-4 h-4 text-amber-600" />
                  <h4 className="font-bold text-slate-800">
                    Gatilhos de Handoff Humano
                  </h4>
                </div>
                <span className="text-[10px] text-amber-700 font-semibold">
                  Cockpit Alert
                </span>
              </div>

              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {activeProfile.escalationTriggers.map((trigger, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200 text-slate-700"
                  >
                    <span className="text-[11px] leading-tight">⚡ {trigger}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTrigger(idx)}
                      className="text-amber-600 hover:text-amber-800 font-bold text-xs ml-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  placeholder="Adicionar gatilho de transbordo..."
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 text-xs focus:ring-1 focus:ring-[#00A884]"
                />
                <button
                  type="button"
                  onClick={handleAddTrigger}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 cursor-pointer shrink-0"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
