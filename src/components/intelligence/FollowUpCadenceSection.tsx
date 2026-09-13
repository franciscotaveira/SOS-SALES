import React, { useState } from 'react';
import { FollowUpCadenceConfig, FollowUpCadenceStep } from '../../types/intelligence';
import {
  Clock,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Zap,
  Info,
  ChevronRight,
  Eye,
  MessageSquare,
  DoorOpen,
} from 'lucide-react';

export const DEFAULT_CADENCE_CONFIG: FollowUpCadenceConfig = {
  enabled: true,
  steps: [
    {
      stepNumber: 1,
      delayHours: 2,
      label: 'Toque 1 — Prova Visual (+2h)',
      goal: 'Quebra de inércia com demonstração em vídeo do Cockpit em 45s',
      copyPrompt: 'Vídeo curto de 45s mostrando o Cockpit funcionando ou pergunta rápida se conseguiu ver a proposta.',
      executionMode: 'supervised',
      enabled: true,
    },
    {
      stepNumber: 2,
      delayHours: 24,
      label: 'Toque 2 — Quebra de Dúvida (+24h)',
      goal: 'Retomada de decisão dentro da janela gratuita da Meta',
      copyPrompt: 'Perguntar se restou alguma dúvida pontual sobre o plano e reapresentar o checkout correspondente.',
      executionMode: 'supervised',
      enabled: true,
    },
    {
      stepNumber: 3,
      delayHours: 48,
      label: 'Toque 3 — Break-up & Desapego (+48h)',
      goal: 'Fechamento por desapego ou desqualificação limpa com porta aberta',
      copyPrompt: 'Avisar educadamente que está pausando os contatos para não incomodar, deixando os links e porta aberta.',
      executionMode: 'supervised',
      enabled: true,
    },
  ],
};

interface FollowUpCadenceSectionProps {
  cadenceConfig?: FollowUpCadenceConfig;
  onChange: (updated: FollowUpCadenceConfig) => void;
  canManage?: boolean;
}

const STEP_ICONS = [Eye, MessageSquare, DoorOpen];

export const FollowUpCadenceSection: React.FC<FollowUpCadenceSectionProps> = ({
  cadenceConfig,
  onChange,
  canManage = true,
}) => {
  const current = cadenceConfig || DEFAULT_CADENCE_CONFIG;
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);

  const handleToggleGeneral = () => {
    if (!canManage) return;
    onChange({
      ...current,
      enabled: !current.enabled,
    });
  };

  const handleResetToDefault = () => {
    if (!canManage) return;
    onChange(DEFAULT_CADENCE_CONFIG);
    setEditingStepIndex(null);
  };

  const handleToggleStep = (index: number) => {
    if (!canManage) return;
    const updatedSteps = [...current.steps];
    updatedSteps[index] = {
      ...updatedSteps[index],
      enabled: !updatedSteps[index].enabled,
    };
    onChange({ ...current, steps: updatedSteps });
  };

  const handleUpdateStep = (index: number, partial: Partial<FollowUpCadenceStep>) => {
    if (!canManage) return;
    const updatedSteps = [...current.steps];
    updatedSteps[index] = {
      ...updatedSteps[index],
      ...partial,
    };
    onChange({ ...current, steps: updatedSteps });
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-xs mb-8 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 mt-0.5">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-100">
                Cadência de Follow-up Comercial (Anti-Ghosting)
              </h3>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Playbook Canônico (48h)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              Régua padrão de 3 etapas para resgatar leads em silêncio no WhatsApp após a apresentação comercial. Respeita a janela de 24h da Meta e encerra automaticamente assim que o cliente responder.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetToDefault}
            disabled={!canManage}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            title="Restaurar padrão do estudo (+2h, +24h, +48h)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Padrão do Estudo
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={current.enabled}
            onClick={handleToggleGeneral}
            disabled={!canManage}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              current.enabled ? 'bg-emerald-500' : 'bg-slate-700'
            } disabled:opacity-50`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                current.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Regras Invariantes (MCT OS P0) */}
      <div className="my-4 p-3 bg-slate-800/40 border border-slate-700/50 rounded-xl flex items-start gap-2.5 text-xs text-slate-300">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-emerald-300">Blindagem Operacional Ativa:</span> Se o lead responder em qualquer momento, a cadência é cancelada no ato. Disparos ocorrem estritamente dentro do horário comercial e nunca de madrugada.
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-4 mt-6">
        {current.steps.map((step, idx) => {
          const StepIcon = STEP_ICONS[idx] || Clock;
          const isEditing = editingStepIndex === idx;

          return (
            <div
              key={step.stepNumber}
              className={`border rounded-xl p-4 transition-all ${
                step.enabled
                  ? 'bg-slate-800/30 border-slate-700/70 hover:border-slate-600'
                  : 'bg-slate-900/30 border-slate-800/60 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg mt-0.5 ${
                    step.enabled
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}>
                    <StepIcon className="w-4 h-4" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-100">
                        Passo {step.stepNumber}: {step.label}
                      </span>
                      <span className="px-2 py-0.5 text-xs rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                        +{step.delayHours}h de silêncio
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-md border font-medium ${
                        step.executionMode === 'supervised'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                      }`}>
                        {step.executionMode === 'supervised' ? '🛡️ Supervisionado (1-clique)' : '🤖 Autônomo'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1">
                      <strong className="text-slate-300 font-medium">Objetivo:</strong> {step.goal}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      <strong className="text-slate-300 font-medium">Gancho de Abordagem:</strong> &ldquo;{step.copyPrompt}&rdquo;
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingStepIndex(isEditing ? null : idx)}
                    disabled={!canManage}
                    className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    {isEditing ? 'Fechar' : 'Personalizar'}
                  </button>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={step.enabled}
                    onClick={() => handleToggleStep(idx)}
                    disabled={!canManage}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      step.enabled ? 'bg-emerald-500' : 'bg-slate-700'
                    } disabled:opacity-50`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        step.enabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Editor Inline */}
              {isEditing && (
                <div className="mt-4 pt-4 border-t border-slate-700/60 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Tempo de Silêncio (horas)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={168}
                      value={step.delayHours}
                      onChange={(e) => handleUpdateStep(idx, { delayHours: Math.max(1, Number(e.target.value) || 1) })}
                      disabled={!canManage}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Modo de Disparo
                    </label>
                    <select
                      value={step.executionMode}
                      onChange={(e) => handleUpdateStep(idx, { executionMode: e.target.value as 'supervised' | 'autonomous' })}
                      disabled={!canManage}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none cursor-pointer"
                    >
                      <option value="supervised">Supervisionado (Aprovar no Cockpit)</option>
                      <option value="autonomous">Autônomo (Sofia envia sozinha)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Diretriz do Gancho para a IA
                    </label>
                    <textarea
                      rows={2}
                      value={step.copyPrompt}
                      onChange={(e) => handleUpdateStep(idx, { copyPrompt: e.target.value })}
                      disabled={!canManage}
                      placeholder="Instrua o que a Sofia deve enfatizar neste toque (ex: falar do vídeo, mandar link de desconto no Pix, etc.)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
