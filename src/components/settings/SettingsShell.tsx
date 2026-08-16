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
    'channels' | 'ads_tracking' | 'governance' | 'feature_flags' | 'engines'
  >('channels');

  const activeSubTab = externalActiveSubTab !== undefined ? externalActiveSubTab : internalSubTab;

  return (
    <div id="settings-shell-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="pb-3 border-b border-[#e2e8f0]">
        <h1 className="text-xl font-bold text-[#111b21] font-heading">
          Configurações do Sistema & Conexões
        </h1>
        <p className="text-xs text-[#54656f]">
          Gerenciamento de canais de atendimento, atribuição de tráfego Meta Ads, governança de equipe e infraestrutura.
        </p>
      </div>

      {/* Active Section Content (Navigation controlled via sidebar) */}
      {(activeSubTab === 'channels' || !activeSubTab) && (
        <CanaisView workspace={workspace} />
      )}

      {activeSubTab === 'ads_tracking' && <TrackingSettings workspace={workspace} />}

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
