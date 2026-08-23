import React from 'react';
import { Workspace } from '../../types/cockpit';
import { mockEngineConfig } from '../../data/groupFixtures';
import { ConnectionManager } from './ConnectionManager';
import { FeatureFlagManager } from './FeatureFlagManager';
import { CanaisView } from '../channels/CanaisView';
import { TeamManager } from './TeamManager';
import { ApiWebhooksManager } from './ApiWebhooksManager';
import {
  ShieldCheck,
  Info,
  Radio,
  Users,
  Lock,
  Server,
  Zap,
  Layers,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Smartphone,
  Globe,
  Bot,
  Sparkles,
  Megaphone,
  Key,
  Webhook,
  Code2,
  UserPlus,
} from 'lucide-react';

interface SettingsShellProps {
  workspace: Workspace;
  activeSubTab?: string;
  onChangeSubTab?: (subTab: string) => void;
}

export const SettingsShell: React.FC<SettingsShellProps> = ({
  workspace,
  activeSubTab: externalActiveSubTab,
  onChangeSubTab: externalOnChangeSubTab,
}) => {
  const [engineConfig, setEngineConfig] = React.useState(mockEngineConfig);
  const [internalSubTab, setInternalSubTab] = React.useState<
    'team' | 'api_webhooks' | 'channels' | 'feature_flags' | 'engines'
  >('team');

  const activeSubTab = externalActiveSubTab !== undefined ? externalActiveSubTab : internalSubTab;
  const handleSelectSubTab = (id: string) => {
    if (externalOnChangeSubTab) {
      externalOnChangeSubTab(id);
    } else {
      setInternalSubTab(id as any);
    }
  };

  const SUB_TABS = [
    { id: 'team', label: 'Equipe & Usuários', icon: Users, badge: 'Multi-Tenant' },
    { id: 'api_webhooks', label: 'API & Webhooks', icon: Code2, badge: 'Integrações' },
    { id: 'channels', label: 'Canais de WhatsApp', icon: Smartphone },
    { id: 'feature_flags', label: 'Parâmetros Globais', icon: Sliders },
    { id: 'engines', label: 'Modelos & Infra', icon: Server },
  ];

  const isMaster =
    !workspace.id?.toLowerCase().includes('haven') &&
    !workspace.id?.toLowerCase().includes('sora') &&
    !workspace.name?.toLowerCase().includes('haven') &&
    !workspace.name?.toLowerCase().includes('sora');

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
            Gerenciamento de equipe multi-usuário, chaves de API, webhooks de saída, WhatsApp e atribuição de tráfego.
          </p>
        </div>

        {/* Quick SubTab Switcher Pills */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto">
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectSubTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
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
      {(activeSubTab === 'team' || !activeSubTab) && <TeamManager workspace={workspace} />}

      {activeSubTab === 'api_webhooks' && <ApiWebhooksManager workspace={workspace} />}

      {activeSubTab === 'channels' && <CanaisView workspace={workspace} />}

      {activeSubTab === 'feature_flags' && <FeatureFlagManager workspace={workspace} />}

      {activeSubTab === 'engines' && (
        <ConnectionManager
          workspace={workspace}
          engineConfig={engineConfig}
          onUpdateEngineConfig={setEngineConfig}
        />
      )}
    </div>
  );
};
