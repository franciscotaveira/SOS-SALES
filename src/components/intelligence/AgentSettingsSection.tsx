import React, { useState, useEffect } from 'react';
import { AiAgentConfig, ToneOfVoice, AgentAutonomyMode } from '../../types/intelligence';
import {
  Bot,
  Sparkles,
  Sliders,
  ShieldCheck,
  Percent,
  CreditCard,
  PhoneForwarded,
  Save,
  Check,
  Zap,
  Plus,
  Trash2,
  Lock,
  Clock,
  MessageSquare,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface AgentSettingsSectionProps {
  agentConfig: AiAgentConfig;
  onSaveAgentConfig?: (updated: AiAgentConfig) => void | Promise<boolean>;
  canManage?: boolean;
}

export const AgentSettingsSection: React.FC<AgentSettingsSectionProps> = ({
  agentConfig: initialConfig,
  onSaveAgentConfig,
  canManage = true,
}) => {
  const [config, setConfig] = useState<AiAgentConfig>(initialConfig);
  const [saved, setSaved] = useState(false);
  const [newGuardrail, setNewGuardrail] = useState('');
  const [newTrigger, setNewTrigger] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('');

  useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    if (onSaveAgentConfig) {
      const ok = await onSaveAgentConfig(config);
      if (ok !== false) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const handleAddGuardrail = () => {
    if (!newGuardrail.trim()) return;
    setConfig((prev) => ({
      ...prev,
      safetyGuardrails: [...(prev.safetyGuardrails || []), newGuardrail.trim()],
    }));
    setNewGuardrail('');
  };

  const handleRemoveGuardrail = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      safetyGuardrails: (prev.safetyGuardrails || []).filter((_, i) => i !== index),
    }));
  };

  const handleAddTrigger = () => {
    if (!newTrigger.trim()) return;
    setConfig((prev) => ({
      ...prev,
      escalationTriggers: [...(prev.escalationTriggers || []), newTrigger.trim()],
    }));
    setNewTrigger('');
  };

  const handleRemoveTrigger = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      escalationTriggers: (prev.escalationTriggers || []).filter((_, i) => i !== index),
    }));
  };

  const handleTogglePaymentMethod = (method: string) => {
    setConfig((prev) => {
      const current = prev.allowedPaymentMethods || [];
      const exists = current.includes(method);
      return {
        ...prev,
        allowedPaymentMethods: exists ? current.filter((m) => m !== method) : [...current, method],
      };
    });
  };

  const handleAddCustomPaymentMethod = () => {
    if (!newPaymentMethod.trim()) return;
    if (!config.allowedPaymentMethods.includes(newPaymentMethod.trim())) {
      setConfig((prev) => ({
        ...prev,
        allowedPaymentMethods: [...(prev.allowedPaymentMethods || []), newPaymentMethod.trim()],
      }));
    }
    setNewPaymentMethod('');
  };

  const toneOptions: { value: ToneOfVoice; label: string; desc: string }[] = [
    {
      value: 'comercial_fechador',
      label: 'Comercial Fechador (Recomendado)',
      desc: 'Ágil, persuasivo, focado no menor próximo passo e fechamento de vendas.',
    },
    {
      value: 'consultivo_premium',
      label: 'Consultivo Premium',
      desc: 'Elegante, focado em agregar valor e diagnóstico aprofundado.',
    },
    {
      value: 'acolhedor_empatico',
      label: 'Acolhedor & Empático',
      desc: 'Caloroso, atencioso, ideal para clínicas, saúde e estética.',
    },
    {
      value: 'direto_objetivo',
      label: 'Direto & Objetivo',
      desc: 'Respostas ultra-rápidas, sem rodeios, ideal para suporte e operações dinâmicas.',
    },
    {
      value: 'tecnico_especialista',
      label: 'Técnico Especialista',
      desc: 'Vocabulário preciso, formal e com autoridade em especificações técnicas.',
    },
  ];

  const autonomyOptions: { value: AgentAutonomyMode; label: string; desc: string }[] = [
    {
      value: 'copilot_supervised',
      label: 'Copiloto Supervisionado',
      desc: 'A IA gera a melhor resposta e aguarda aprovação humana antes do envio.',
    },
    {
      value: 'semi_autonomous',
      label: 'Autônomo Supervisionado',
      desc: 'Responde dúvidas comuns automaticamente e escala para a equipe se houver fricção.',
    },
    {
      value: 'autonomous_24_7',
      label: '100% Autônomo 24/7',
      desc: 'Conduz o atendimento completo de ponta a ponta sem intervenção humana obrigatória.',
    },
  ];

  const standardPaymentMethods = ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Boleto Bancário', 'Link de Pagamento'];

  return (
    <form onSubmit={handleSave} className="space-y-6 animate-in fade-in duration-200">
      <fieldset disabled={!canManage} className="contents">
        {/* Header Banner */}
        <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-[var(--sos-ai)]/20 text-[var(--sos-ai)] flex items-center justify-center font-bold shadow-2xs">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold font-heading flex items-center gap-2 text-[var(--sos-ink)]">
                  <span>{config.name || 'Agente Comercial IA 24/7'}</span>
                  <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] font-bold border border-[var(--sos-ai)]/30 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" /> Motor NVIDIA Nemotron 3.5
                  </span>
                </h2>
                <p className="text-xs text-[var(--sos-muted)]">
                  Configuração soberana da atendente virtual que opera no Cockpit e no WhatsApp oficial da empresa.
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            id="btn-save-agent-settings"
            disabled={!canManage}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Salvo com Sucesso!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Configurações da Agente</span>
              </>
            )}
          </button>
        </div>

        {/* Bloco 1: Identidade, Persona & Tom de Voz */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[var(--sos-border)] rounded-xl p-4 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--sos-border)]">
              <Sparkles className="w-4 h-4 text-[var(--sos-ai)]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--sos-ink)] font-heading">
                Identidade & Papel Comercial
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[var(--sos-ink)] mb-1">
                  Nome da Atendente / Consultora Virtual
                </label>
                <input
                  type="text"
                  value={config.name || ''}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  placeholder="Ex: Sofia · Consultora SOS Vendas"
                  className="w-full text-xs px-3 py-2 border border-[var(--sos-border)] rounded-lg bg-[var(--sos-surface)] text-[var(--sos-ink)] focus:border-[var(--sos-ai)] focus:outline-none"
                />
                <span className="text-[10px] text-[var(--sos-muted)] mt-0.5 block">
                  Nome com o qual o agente se apresentará no início dos atendimentos no WhatsApp.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--sos-ink)] mb-1">
                  Persona & Diretrizes de Postura
                </label>
                <textarea
                  rows={4}
                  value={config.persona || ''}
                  onChange={(e) => setConfig({ ...config, persona: e.target.value })}
                  placeholder="Ex: Consultora comercial experiente, ágil, acolhedora e focada em entender a necessidade do cliente para apresentar a melhor solução de forma transparente."
                  className="w-full text-xs px-3 py-2 border border-[var(--sos-border)] rounded-lg bg-[var(--sos-surface)] text-[var(--sos-ink)] focus:border-[var(--sos-ai)] focus:outline-none resize-y"
                />
                <span className="text-[10px] text-[var(--sos-muted)] mt-0.5 block">
                  Define a personalidade e mentalidade do agente durante todas as conversas.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--sos-ink)] mb-1">
                  Modo de Autonomia Operacional
                </label>
                <div className="space-y-2">
                  {autonomyOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition ${
                        config.autonomyMode === opt.value
                          ? 'border-[var(--sos-ai)] bg-[var(--sos-ai-subtle)]/30 text-[var(--sos-ink)]'
                          : 'border-[var(--sos-border)] bg-[var(--sos-surface)] hover:bg-slate-50 text-[var(--sos-muted)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="autonomyMode"
                        value={opt.value}
                        checked={config.autonomyMode === opt.value}
                        onChange={() => setConfig({ ...config, autonomyMode: opt.value })}
                        className="mt-0.5 accent-[var(--sos-ai)]"
                      />
                      <div>
                        <span className="text-xs font-bold text-[var(--sos-ink)] block">{opt.label}</span>
                        <span className="text-[10.5px] text-[var(--sos-muted)] leading-relaxed">{opt.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-[var(--sos-border)] rounded-xl p-4 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--sos-border)]">
              <Sliders className="w-4 h-4 text-[var(--sos-operational)]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--sos-ink)] font-heading">
                Tom de Voz & Criatividade
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--sos-ink)] mb-1">
                  Tom de Voz Predominante
                </label>
                <div className="space-y-2">
                  {toneOptions.map((tone) => (
                    <label
                      key={tone.value}
                      className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition ${
                        config.toneOfVoice === tone.value
                          ? 'border-[var(--sos-operational)] bg-blue-50/50 text-[var(--sos-ink)]'
                          : 'border-[var(--sos-border)] bg-[var(--sos-surface)] hover:bg-slate-50 text-[var(--sos-muted)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="toneOfVoice"
                        value={tone.value}
                        checked={config.toneOfVoice === tone.value}
                        onChange={() => setConfig({ ...config, toneOfVoice: tone.value })}
                        className="mt-0.5 accent-[var(--sos-operational)]"
                      />
                      <div>
                        <span className="text-xs font-bold text-[var(--sos-ink)] block">{tone.label}</span>
                        <span className="text-[10px] text-[var(--sos-muted)]">{tone.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[var(--sos-ink)]">
                    Temperatura de Criatividade: {config.creativityTemperature ?? 0.6}
                  </label>
                  <span className="text-[10px] font-semibold text-[var(--sos-muted)]">
                    {(config.creativityTemperature ?? 0.6) <= 0.3
                      ? 'Mais Factual e Estrito'
                      : (config.creativityTemperature ?? 0.6) <= 0.7
                        ? 'Natural e Humanizado (Ideal)'
                        : 'Mais Expressivo e Variado'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={config.creativityTemperature ?? 0.6}
                  onChange={(e) => setConfig({ ...config, creativityTemperature: parseFloat(e.target.value) })}
                  className="w-full accent-[var(--sos-ai)] cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-[var(--sos-muted)] mt-0.5">
                  <span>0.1 (Fiel ao Script)</span>
                  <span>0.6 (Humanizado)</span>
                  <span>1.0 (Livre)</span>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--sos-border)]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.workingHoursOnly ?? true}
                    onChange={(e) => setConfig({ ...config, workingHoursOnly: e.target.checked })}
                    className="accent-[var(--sos-ai)] rounded"
                  />
                  <div>
                    <span className="text-xs font-bold text-[var(--sos-ink)] block">
                      Respeitar Horário de Atendimento Comercial
                    </span>
                    <span className="text-[10px] text-[var(--sos-muted)]">
                      Fora do horário, informa a escala de funcionamento e captura dados para retorno prioritário.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Bloco 2: Alçadas Comerciais & Pagamentos */}
        <div className="bg-white border border-[var(--sos-border)] rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-[var(--sos-border)]">
            <Percent className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--sos-ink)] font-heading">
              Alçadas Comerciais & Políticas de Pagamento
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--sos-ink)] mb-1">
                Alçada Máxima de Desconto Autorizada (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={config.maxDiscountPercent ?? 0}
                  onChange={(e) => setConfig({ ...config, maxDiscountPercent: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full text-xs px-3 py-2 border border-[var(--sos-border)] rounded-lg bg-[var(--sos-surface)] text-[var(--sos-ink)] focus:border-[var(--sos-ai)] focus:outline-none"
                />
                <span className="absolute right-3 top-2 text-xs font-bold text-[var(--sos-muted)]">%</span>
              </div>
              <span className="text-[10px] text-[var(--sos-muted)] mt-0.5 block">
                Acima deste teto, a IA é proibida de conceder abatimento e aciona handoff para humano.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--sos-ink)] mb-1">
                Limite de Parcelas Sem Juros
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={config.installmentLimitWithoutInterest ?? 1}
                  onChange={(e) => setConfig({ ...config, installmentLimitWithoutInterest: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-full text-xs px-3 py-2 border border-[var(--sos-border)] rounded-lg bg-[var(--sos-surface)] text-[var(--sos-ink)] focus:border-[var(--sos-ai)] focus:outline-none"
                />
                <span className="absolute right-3 top-2 text-xs font-bold text-[var(--sos-muted)]">x</span>
              </div>
              <span className="text-[10px] text-[var(--sos-muted)] mt-0.5 block">
                Número máximo de parcelas sem juros comunicado nas ofertas comerciais.
              </span>
            </div>

            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-bold text-[var(--sos-ink)] mb-1">
                Formas de Pagamento Autorizadas
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {standardPaymentMethods.map((method) => {
                  const active = (config.allowedPaymentMethods || []).includes(method);
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => handleTogglePaymentMethod(method)}
                      className={`text-[10.5px] px-2.5 py-1 rounded-full font-bold border transition cursor-pointer ${
                        active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {active ? '✓ ' : '+ '}{method}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Outra forma..."
                  value={newPaymentMethod}
                  onChange={(e) => setNewPaymentMethod(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomPaymentMethod(); } }}
                  className="flex-1 text-xs px-2.5 py-1 border border-[var(--sos-border)] rounded-lg bg-[var(--sos-surface)] text-[var(--sos-ink)]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomPaymentMethod}
                  className="px-2.5 py-1 text-xs bg-slate-700 text-white rounded-lg hover:bg-slate-800 shrink-0 cursor-pointer"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bloco 3: Diretrizes Comerciais & Regras Invioláveis (Safety Guardrails) */}
        <div className="bg-white border border-[var(--sos-border)] rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--sos-border)]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-rose-600" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--sos-ink)] font-heading">
                  Diretrizes & Regras Comerciais Invioláveis (Safety Guardrails)
                </h3>
                <p className="text-[11px] text-[var(--sos-muted)]">
                  Regras de negócio que o agente Sofia deve seguir rigorosamente em toda resposta.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              {(config.safetyGuardrails || []).length} Regras Ativas
            </span>
          </div>

          <div className="space-y-2">
            {(config.safetyGuardrails || []).map((rule, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className="font-mono text-[10px] font-bold text-slate-400 mt-0.5 shrink-0">
                    #{idx + 1}
                  </span>
                  <span className="leading-relaxed break-words">{rule}</span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleRemoveGuardrail(idx)}
                    title="Remover regra"
                    className="text-slate-400 hover:text-rose-600 p-1 shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}

            {canManage && (
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Ex: Apresentar o plano anual por R$ 582 no Pix com 50% de desconto à vista."
                  value={newGuardrail}
                  onChange={(e) => setNewGuardrail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddGuardrail(); } }}
                  className="flex-1 text-xs px-3 py-2 border border-[var(--sos-border)] rounded-lg bg-[var(--sos-surface)] text-[var(--sos-ink)] focus:border-[var(--sos-ai)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddGuardrail}
                  className="flex items-center gap-1 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Regra</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bloco 4: Gatilhos de Transbordo Humano (Escalation Triggers) */}
        <div className="bg-white border border-[var(--sos-border)] rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--sos-border)]">
            <div className="flex items-center gap-2">
              <PhoneForwarded className="w-4 h-4 text-amber-600" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--sos-ink)] font-heading">
                  Gatilhos de Transbordo para a Equipe Humana (Handoff Triggers)
                </h3>
                <p className="text-[11px] text-[var(--sos-muted)]">
                  Cenários onde o agente transfere o controle do WhatsApp imediatamente para um operador humano.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              {(config.escalationTriggers || []).length} Gatilhos
            </span>
          </div>

          <div className="space-y-2">
            {(config.escalationTriggers || []).map((trigger, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-amber-50/40 border border-amber-200/60 text-xs text-slate-800"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span className="font-mono text-[10px] font-bold text-amber-600 mt-0.5 shrink-0">
                    #{idx + 1}
                  </span>
                  <span className="leading-relaxed break-words">{trigger}</span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleRemoveTrigger(idx)}
                    title="Remover gatilho"
                    className="text-slate-400 hover:text-rose-600 p-1 shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}

            {canManage && (
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Ex: Cliente solicitou falar com atendente humano ou fez reclamação de cobrança."
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTrigger(); } }}
                  className="flex-1 text-xs px-3 py-2 border border-[var(--sos-border)] rounded-lg bg-[var(--sos-surface)] text-[var(--sos-ink)] focus:border-[var(--sos-ai)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddTrigger}
                  className="flex items-center gap-1 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar Gatilho</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </fieldset>
    </form>
  );
};
