import React from 'react';
import { salesOsRuntimeConfig } from '../../config/runtime';
import { Workspace } from '../../types/cockpit';
import { mockEngineConfig } from '../../data/groupFixtures';
import { ConnectionManager } from './ConnectionManager';
import { FeatureFlagManager } from './FeatureFlagManager';
import { CanaisView } from '../channels/CanaisView';
import { TeamManager } from './TeamManager';
import { ApiWebhooksManager } from './ApiWebhooksManager';
import { CompanyProfileSection } from '../intelligence/CompanyProfileSection';
import { LtvConfigManager } from './LtvConfigManager';
import { TrackingSettings } from './TrackingSettings';
import { resolveWorkspaceIntelligenceBundle } from '../intelligence/ClientAgentHubView';
import {
  Users,
  Building2,
  Sparkles,
  Smartphone,
  Server,
  Target,
  Code2,
  Sliders,
  AlertTriangle,
  Trash2,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface SettingsShellProps {
  workspace: Workspace;
  activeSubTab?: string;
  onChangeSubTab?: (subTab: string) => void;
}

export type SettingsTabGroup = 'Conta' | 'Integrações' | 'Governança';

export interface SettingsSubTabItem {
  id: string;
  label: string;
  group: SettingsTabGroup;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const SETTINGS_TABS: SettingsSubTabItem[] = [
  // Conta
  { id: 'team', label: 'Equipe & Usuários', group: 'Conta', icon: Users, badge: 'Multi-Tenant' },
  { id: 'company', label: 'Dados da Empresa', group: 'Conta', icon: Building2 },
  { id: 'commercial_rules', label: 'Regras Comerciais (LTV)', group: 'Conta', icon: Sparkles },

  // Integrações
  { id: 'channels', label: 'Canais de WhatsApp', group: 'Integrações', icon: Smartphone },
  { id: 'engines', label: 'Modelos & Infra', group: 'Integrações', icon: Server },
  { id: 'tracking', label: 'Traqueamento & Pixels', group: 'Integrações', icon: Target },
  { id: 'api_webhooks', label: 'API & Webhooks', group: 'Integrações', icon: Code2 },

  // Governança
  { id: 'feature_flags', label: 'Parâmetros Globais', group: 'Governança', icon: Sliders },
  { id: 'danger_zone', label: 'Zona de Risco', group: 'Governança', icon: AlertTriangle },
];

export const SettingsShell: React.FC<SettingsShellProps> = ({
  workspace,
  activeSubTab: externalActiveSubTab,
  onChangeSubTab: externalOnChangeSubTab,
}) => {
  const [engineConfig, setEngineConfig] = React.useState(mockEngineConfig);
  const [internalSubTab, setInternalSubTab] = React.useState<string>('team');

  const [companyProfile, setCompanyProfile] = React.useState(() => {
    const bundle = resolveWorkspaceIntelligenceBundle(workspace.id, workspace.name);
    return bundle.companyProfile;
  });

  // Danger zone state
  const [confirmText, setConfirmText] = React.useState('');
  const [dangerActionDone, setDangerActionDone] = React.useState<string | null>(null);

  const activeSubTab = externalActiveSubTab !== undefined ? externalActiveSubTab : internalSubTab;
  const handleSelectSubTab = (id: string) => {
    if (externalOnChangeSubTab) {
      externalOnChangeSubTab(id);
    } else {
      setInternalSubTab(id);
    }
  };

  const isMaster =
    !workspace.id?.toLowerCase().includes('haven') &&
    !workspace.id?.toLowerCase().includes('sora') &&
    !workspace.name?.toLowerCase().includes('haven') &&
    !workspace.name?.toLowerCase().includes('sora');

  const unsupportedInApiMode = salesOsRuntimeConfig.mode === 'api'
    && ['team', 'company', 'commercial_rules', 'engines', 'api_webhooks', 'feature_flags'].includes(activeSubTab);

  const handleClearLocalCache = () => {
    if (confirmText !== 'LIMPAR DADOS') return;
    try {
      localStorage.removeItem(`sos_sales_apikeys_v3_${workspace.id}`);
      localStorage.removeItem(`sos_sales_webhooks_v3_${workspace.id}`);
      localStorage.removeItem(`sos_sales_intelligence_bundles_v2`);
      setDangerActionDone('Cache local e simulações descartadas com sucesso.');
      setConfirmText('');
    } catch {
      setDangerActionDone('Erro ao limpar cache local.');
    }
  };

  return (
    <div id="settings-shell-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="pb-3 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-900 font-heading">
              Configurações da Conta
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold border ${
              isMaster
                ? 'bg-purple-100 text-purple-900 border-purple-200'
                : 'bg-emerald-100 text-emerald-900 border-emerald-200'
            }`}>
              {isMaster ? '🛡️ Matriz Sovereign (SOS Sales)' : `🏢 Cliente: ${workspace.name || 'Sub-conta'}`}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Gerenciamento centralizado de conta, canais, integrações de marketing e governança técnica.
          </p>
        </div>

        {/* Structured Tabs Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectSubTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-purple-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-purple-100 text-purple-700">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active SubTab Content */}
      {unsupportedInApiMode && (
        <div role="status" className="mx-auto max-w-3xl rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-slate-800">
          <p className="text-xs font-extrabold uppercase tracking-wider text-amber-800">Função ainda sem contrato operacional</p>
          <h2 className="mt-2 text-lg font-bold">Esta configuração não será simulada no navegador</h2>
          <p className="mt-2 text-sm leading-6">A persistência e a autorização no backend ainda precisam ser implementadas e homologadas. O controle foi bloqueado para não exibir sucesso falso nem armazenar dados críticos apenas neste computador.</p>
        </div>
      )}

      {!unsupportedInApiMode && (activeSubTab === 'team' || !activeSubTab) && <TeamManager workspace={workspace} />}

      {!unsupportedInApiMode && activeSubTab === 'company' && (
        <CompanyProfileSection
          profile={companyProfile}
          onSaveProfile={(updated) => setCompanyProfile(updated)}
        />
      )}

      {!unsupportedInApiMode && activeSubTab === 'commercial_rules' && <LtvConfigManager workspace={workspace} />}

      {activeSubTab === 'channels' && <CanaisView workspace={workspace} />}

      {!unsupportedInApiMode && activeSubTab === 'engines' && (
        <ConnectionManager
          workspace={workspace}
          engineConfig={engineConfig}
          onUpdateEngineConfig={setEngineConfig}
        />
      )}

      {activeSubTab === 'tracking' && (
        <div className="max-w-6xl mx-auto">
          <TrackingSettings workspace={workspace} />
        </div>
      )}

      {!unsupportedInApiMode && activeSubTab === 'api_webhooks' && <ApiWebhooksManager workspace={workspace} />}

      {!unsupportedInApiMode && activeSubTab === 'feature_flags' && <FeatureFlagManager workspace={workspace} />}

      {activeSubTab === 'danger_zone' && (
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="p-5 bg-white border border-rose-200 rounded-2xl shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-950 font-heading">
                  Zona de Risco & Manutenção Avançada
                </h3>
                <p className="text-xs text-rose-700/80">
                  Ações destrutivas com impacto em cache local, logs transitórios e credenciais.
                </p>
              </div>
            </div>

            {dangerActionDone && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{dangerActionDone}</span>
              </div>
            )}

            <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/50 space-y-3">
              <div>
                <h4 className="text-xs font-bold text-rose-900">Limpar Cache e Rascunhos Locais deste Workspace</h4>
                <p className="text-[11px] text-rose-700 mt-0.5">
                  Descarta chaves de API, webhooks e rascunhos salvos exclusivamente no navegador para este cliente.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Digite LIMPAR DADOS para confirmar"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs text-rose-950 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono flex-1"
                />
                <button
                  onClick={handleClearLocalCache}
                  disabled={confirmText !== 'LIMPAR DADOS'}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 ${
                    confirmText === 'LIMPAR DADOS'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer'
                      : 'bg-rose-100 text-rose-400 cursor-not-allowed'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirmar Limpeza</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
