import React from 'react';
import { Workspace } from '../../types/cockpit';
import { mockEngineConfig } from '../../data/groupFixtures';
import { ConnectionManager } from './ConnectionManager';
import { SalesAiThesisConfig } from './SalesAiThesisConfig';
import { FeatureFlagManager } from './FeatureFlagManager';
import { TrackingSettings } from './TrackingSettings';
import { CanaisView } from '../channels/CanaisView';
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
    'engines' | 'ai_thesis' | 'channels' | 'ads_tracking' | 'governance' | 'feature_flags'
  >('ads_tracking');

  const activeSubTab = externalActiveSubTab !== undefined ? externalActiveSubTab : internalSubTab;
  const setActiveSubTab = externalOnChangeSubTab !== undefined ? externalOnChangeSubTab : setInternalSubTab;

  return (
    <div id="settings-shell-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#e2e8f0]">
        <div>
          <h1 className="text-xl font-bold text-[#111b21]">
            Configurações, Infraestrutura & Tese IA
          </h1>
          <p className="text-xs text-[#54656f]">
            Gerenciamento de conexões WABA/WAHA e inteligência comercial 24/7 da SOS Sales
          </p>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 bg-[#f0f2f5] p-1 rounded-xl border border-[#e2e8f0] overflow-x-auto">
          <button
            onClick={() => setActiveSubTab('engines')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'engines'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Infraestrutura & Transição</span>
          </button>

          <button
            onClick={() => setActiveSubTab('ai_thesis')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'ai_thesis'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-[#54656f] hover:text-indigo-600'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-indigo-600" />
            <span>IA Vendedora 24/7 & Tese</span>
          </button>

          <button
            onClick={() => setActiveSubTab('channels')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'channels'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Canais</span>
          </button>

          <button
            onClick={() => setActiveSubTab('ads_tracking')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'ads_tracking'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-[#54656f] hover:text-emerald-600'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5 text-emerald-600" />
            <span>Atribuição & Ads</span>
          </button>

          <button
            onClick={() => setActiveSubTab('governance')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'governance'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Governança & SLA</span>
          </button>

          <button
            onClick={() => setActiveSubTab('feature_flags')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubTab === 'feature_flags'
                ? 'bg-white text-purple-700 shadow-2xs'
                : 'text-[#54656f] hover:text-purple-600'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-purple-600" />
            <span>Feature Flags & Módulos</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'engines' && (
        <ConnectionManager
          workspace={workspace}
          engineConfig={engineConfig}
          onUpdateEngineConfig={setEngineConfig}
        />
      )}

      {activeSubTab === 'ai_thesis' && <SalesAiThesisConfig />}

      {activeSubTab === 'ads_tracking' && <TrackingSettings workspace={workspace} />}

      {activeSubTab === 'feature_flags' && <FeatureFlagManager workspace={workspace} />}

      {activeSubTab === 'channels' && (
        <CanaisView workspace={workspace} />
      )}

      {activeSubTab === 'governance' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="cockpit-panel p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-[#111b21]">
              <Users className="w-4 h-4 text-purple-600" />
              <span>Assentos de Operadores & Gestores</span>
            </div>
            <p className="text-xs text-[#54656f]">
              {workspace.activeOperatorCount} operadores simultâneos autorizados para esta unidade.
            </p>
            <div className="text-[11px] text-[#667781]">
              Distribuição de leads com balanceamento supervisionado por SLA e priorização de calor de conversação.
            </div>
          </div>

          <div className="cockpit-panel p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-[#111b21]">
              <Lock className="w-4 h-4 text-[#00a884]" />
              <span>Criptografia & Privacidade</span>
            </div>
            <p className="text-xs text-[#54656f]">
              Conexão com a API Oficial da Meta (Cloud API / WABA) com proteção estrita de PII e LGPD.
            </p>
            <div className="text-[11px] text-[#667781]">
              Nenhuma informação de cartão, senhas ou dados sensíveis trafega desprotegida.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
