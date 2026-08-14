import React from 'react';
import { Workspace } from '../../types/cockpit';
import { useFeatureFlags } from '../../contexts/FeatureFlagContext';
import { FeatureFlagKey, FEATURE_FLAG_REGISTRY, FeatureFlagLevel } from '../../types/featureFlags';
import {
  Shield,
  Layers,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Building2,
  Briefcase,
  Sliders,
  AlertTriangle,
  Info,
  Crown,
} from 'lucide-react';

interface FeatureFlagManagerProps {
  workspace: Workspace;
}

export const FeatureFlagManager: React.FC<FeatureFlagManagerProps> = ({ workspace }) => {
  const { allFlags, setOverride, resetOverrides, workspaceTier, hasOverrides } =
    useFeatureFlags();

  const getLevelBadge = (level: FeatureFlagLevel) => {
    switch (level) {
      case 'P0_CORE':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            P0 · Núcleo Essencial
          </span>
        );
      case 'P1_OPERATIONAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            P1 · Evolução Operacional
          </span>
        );
      case 'P2_AGENCY':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
            P2 · Módulo Agência
          </span>
        );
      case 'DEV_QA':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            DEV / QA
          </span>
        );
    }
  };

  const flagsList = Object.entries(allFlags) as [
    FeatureFlagKey,
    { isEnabled: boolean; definition: typeof FEATURE_FLAG_REGISTRY[FeatureFlagKey]; isOverridden: boolean }
  ][];

  return (
    <div id="feature-flags-manager" className="space-y-6">
      {/* Header Panel with Workspace Tier Context */}
      <div className="cockpit-panel p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#111b21] flex items-center gap-2">
                <span>Governança de Feature Flags & Módulos</span>
                {hasOverrides && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                    Sobrescritas Manuais Ativas
                  </span>
                )}
              </h2>
              <p className="text-xs text-[#54656f] mt-0.5">
                Controle granular de ativação de recursos por nível de conta e isolamento de módulos em produção.
              </p>
            </div>
          </div>

          {hasOverrides && (
            <button
              onClick={resetOverrides}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors shrink-0"
              title="Restaurar flags para os padrões do plano do workspace"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Padrões</span>
            </button>
          )}
        </div>

        {/* Workspace Tier Info Card */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            {workspaceTier === 'agency' ? (
              <div className="w-9 h-9 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold">
                <Briefcase className="w-4 h-4" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                <Building2 className="w-4 h-4" />
              </div>
            )}
            <div>
              <div className="font-bold text-[#111b21] flex items-center gap-2">
                <span>Workspace Atual: {workspace.name}</span>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                    workspaceTier === 'agency'
                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  Plano {workspaceTier === 'agency' ? 'Agência / Hub' : 'Standard / Loja Local'}
                </span>
              </div>
              <div className="text-[11px] text-[#667781] mt-0.5">
                {workspaceTier === 'agency'
                  ? 'Módulos de Grupos WhatsApp, relatórios multi-clientes e governança de agência liberados por padrão.'
                  : 'Recursos operacionais essenciais focados em 1:1, velocidade de resposta no WhatsApp e Proof of Traffic.'}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[11px] font-mono text-slate-500">
              Tipo: <strong className="text-slate-800">{workspace.businessType}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* P0 Core Info Banner */}
      <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-3 text-xs text-emerald-950">
        <Shield className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
        <div>
          <div className="font-bold text-emerald-900 flex items-center gap-2">
            <span>P0 · Núcleo Essencial Imutável</span>
            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-200/80 text-emerald-800">
              100% Sempre Ativo
            </span>
          </div>
          <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
            Fila de Prioridades (<strong className="font-semibold">Agora</strong>), Linha de Continuidade, Dossiê Vivo,
            Recomendação Supervisionada, Compositor com Dupla Evidência, Follow-up, Outcome Comercial e{' '}
            <strong className="font-semibold">Proof of Traffic</strong> são os pilares fundamentais do SOS Sales e nunca são desativados.
          </p>
        </div>
      </div>

      {/* Flag List */}
      <div className="cockpit-panel overflow-hidden">
        <div className="p-4 border-b border-[#e2e8f0] bg-slate-50/50 flex items-center justify-between">
          <div className="font-bold text-xs text-[#111b21] uppercase tracking-wider">
            Módulos Modulares & Flags de Evolução (P1, P2 & QA)
          </div>
          <span className="text-[11px] text-[#667781]">
            {flagsList.filter(([, f]) => f.isEnabled).length} de {flagsList.length} recursos ativos
          </span>
        </div>

        <div className="divide-y divide-[#e2e8f0]">
          {flagsList.map(([key, flag]) => {
            const isAgencyFlag = flag.definition.level === 'P2_AGENCY';
            const isDevFlag = flag.definition.level === 'DEV_QA';

            return (
              <div
                key={key}
                className={`p-4 transition-colors ${
                  flag.isEnabled ? 'bg-white' : 'bg-slate-50/40'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-[#111b21]">
                        {flag.definition.name}
                      </span>
                      {getLevelBadge(flag.definition.level)}
                      {flag.definition.requiredRole === 'owner' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                          <Crown className="w-3 h-3 text-amber-700" />
                          Perfil Owner
                        </span>
                      )}
                      <code className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {key}
                      </code>
                      {flag.isOverridden && (
                        <span className="text-[9.5px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                          Sobrescrito localmente
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[#54656f] leading-relaxed">
                      {flag.definition.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {flag.definition.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded"
                        >
                          #{tag}
                        </span>
                      ))}

                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10.5px] text-slate-500">
                        Padrão Standard:{' '}
                        <strong>{flag.definition.defaultForStandard ? 'Ligado' : 'Desligado'}</strong>
                      </span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10.5px] text-slate-500">
                        Padrão Agência:{' '}
                        <strong>{flag.definition.defaultForAgency ? 'Ligado' : 'Desligado'}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Toggle Controls */}
                  <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
                    <div className="text-right">
                      <div
                        className={`text-xs font-bold flex items-center gap-1 ${
                          flag.isEnabled ? 'text-[#00a884]' : 'text-slate-500'
                        }`}
                      >
                        {flag.isEnabled ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#00a884]" />
                            <span>Ativo</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-slate-400" />
                            <span>Inativo</span>
                          </>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {flag.isOverridden
                          ? 'Manual (Override)'
                          : workspaceTier === 'agency'
                          ? 'Regra da Agência'
                          : 'Regra Standard'}
                      </div>
                    </div>

                    {/* Switch Button */}
                    <button
                      onClick={() => setOverride(key, !flag.isEnabled)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        flag.isEnabled ? 'bg-[#00a884]' : 'bg-slate-300'
                      }`}
                      role="switch"
                      aria-checked={flag.isEnabled}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          flag.isEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
