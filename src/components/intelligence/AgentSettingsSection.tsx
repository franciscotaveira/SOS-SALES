import React from 'react';
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
} from 'lucide-react';

interface AgentSettingsSectionProps {
  agentConfig: AiAgentConfig;
  onSaveAgentConfig?: (updated: AiAgentConfig) => void;
}

export const AgentSettingsSection: React.FC<AgentSettingsSectionProps> = ({
  agentConfig: initialConfig,
  onSaveAgentConfig,
}) => {
  const [config, setConfig] = React.useState<AiAgentConfig>(initialConfig);
  const [saved, setSaved] = React.useState(false);
  const [newTrigger, setNewTrigger] = React.useState('');
  const [newGuardrail, setNewGuardrail] = React.useState('');

  React.useEffect(() => {
    setConfig(initialConfig);
  }, [initialConfig]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSaveAgentConfig) onSaveAgentConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleAddTrigger = () => {
    if (!newTrigger.trim()) return;
    setConfig({
      ...config,
      escalationTriggers: [...config.escalationTriggers, newTrigger.trim()],
    });
    setNewTrigger('');
  };

  const handleRemoveTrigger = (index: number) => {
    const updated = config.escalationTriggers.filter((_, i) => i !== index);
    setConfig({ ...config, escalationTriggers: updated });
  };

  const handleAddGuardrail = () => {
    if (!newGuardrail.trim()) return;
    setConfig({
      ...config,
      safetyGuardrails: [...config.safetyGuardrails, newGuardrail.trim()],
    });
    setNewGuardrail('');
  };

  const handleRemoveGuardrail = (index: number) => {
    const updated = config.safetyGuardrails.filter((_, i) => i !== index);
    setConfig({ ...config, safetyGuardrails: updated });
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 rounded-xl p-5 border border-slate-800 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold font-heading">
              Configurações da Persona, Tom de Voz & Alçadas Comerciais
            </h2>
          </div>
          <p className="text-xs text-slate-300">
            Defina o comportamento, autonomia, alçadas financeiras máximas e gatilhos para transferir para um operador humano.
          </p>
        </div>

        <button
          type="submit"
          id="btn-save-agent-settings"
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#00A884] hover:bg-[#008f6f] text-white rounded-lg text-xs font-bold transition-all shadow-sm shrink-0"
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" />
              <span>Salvo com Sucesso!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Salvar Configurações</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Persona & Tom de Voz */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Bot className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-bold text-slate-900 font-heading">
              Identidade do Agente & Modo de Atuação
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Nome do Agente Virtual
              </label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Modo de Autonomia
              </label>
              <select
                value={config.autonomyMode}
                onChange={(e) =>
                  setConfig({ ...config, autonomyMode: e.target.value as AgentAutonomyMode })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
              >
                <option value="copilot_supervised">
                  Copilot Supervisionado (Gera rascunhos para o atendente aprovar com 1 clique)
                </option>
                <option value="semi_autonomous">
                  Semi-Autônomo (Responde dúvidas de catálogo e passa negociações pro atendente)
                </option>
                <option value="autonomous_24_7">
                  Autônomo 24/7 (Qualifica, apresenta catálogo e agenda de forma independente)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Tom de Voz
              </label>
              <select
                value={config.toneOfVoice}
                onChange={(e) =>
                  setConfig({ ...config, toneOfVoice: e.target.value as ToneOfVoice })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
              >
                <option value="consultivo_premium">Consultivo & Premium (Elegante e prestativo)</option>
                <option value="energetico_direto">Energético & Direto (Focado em conversão e velocidade)</option>
                <option value="acolhedor_empatico">Acolhedor & Empático (Caloroso e acolhedor)</option>
                <option value="tecnico_especialista">Técnico & Especialista (Profundo em detalhes técnicos)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Instrução Central da Persona (System Prompt)
              </label>
              <textarea
                rows={4}
                value={config.persona}
                onChange={(e) => setConfig({ ...config, persona: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
              />
            </div>
          </div>
        </div>

        {/* Alçadas Financeiras & Guardrails de Segurança */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Percent className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-900 font-heading">
              Alçadas Financeiras & Limites Comerciais
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Desconto Máximo Autorizado (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={config.maxDiscountPercent}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      maxDiscountPercent: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Parcelas sem Juros Máximas
                </label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={config.installmentLimitWithoutInterest}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      installmentLimitWithoutInterest: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-bold focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                />
              </div>
            </div>

            {/* Gatilhos de Escalonamento Humano */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Gatilhos para Transferir para Atendente Humano
              </label>
              <div className="flex gap-1.5 mb-2">
                <input
                  type="text"
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  placeholder="Adicionar palavra ou condição de transição..."
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddTrigger}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-bold"
                >
                  +
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {config.escalationTriggers.map((trig, idx) => (
                  <span
                    key={idx}
                    className="text-[11px] bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium"
                  >
                    {trig}
                    <button
                      type="button"
                      onClick={() => handleRemoveTrigger(idx)}
                      className="text-rose-500 hover:text-rose-800 font-bold ml-1"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Guardrails de Segurança */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Guardrails de Segurança (Regras Inegociáveis)
              </label>
              <div className="flex gap-1.5 mb-2">
                <input
                  type="text"
                  value={newGuardrail}
                  onChange={(e) => setNewGuardrail(e.target.value)}
                  placeholder="Ex: Nunca prometer horário sem vaga..."
                  className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddGuardrail}
                  className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-bold"
                >
                  +
                </button>
              </div>

              <div className="space-y-1">
                {config.safetyGuardrails.map((guard, idx) => (
                  <div
                    key={idx}
                    className="text-[11px] bg-slate-50 border border-slate-200 p-1.5 rounded flex items-center justify-between text-slate-800"
                  >
                    <span>🛡️ {guard}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveGuardrail(idx)}
                      className="text-slate-400 hover:text-rose-600 font-bold"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
