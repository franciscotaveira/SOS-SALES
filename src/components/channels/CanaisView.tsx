import React from 'react';
import { Workspace } from '../../types/cockpit';
import { mockEngineConfig } from '../../data/groupFixtures';
import { EngineConfig, WhatsAppEngineType } from '../../types/groupsAndEngines';
import { ConnectionManager } from '../settings/ConnectionManager';
import {
  Radio,
  Server,
  ShieldCheck,
  Zap,
  Activity,
  RefreshCw,
  AlertTriangle,
  Pause,
  Play,
  CheckCircle2,
  Lock,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink,
} from 'lucide-react';

interface CanaisViewProps {
  workspace: Workspace;
  role?: string;
}

export const CanaisView: React.FC<CanaisViewProps> = ({ workspace, role = 'operator' }) => {
  const [engineConfig, setEngineConfig] = React.useState<EngineConfig>(mockEngineConfig);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [pauseModalOpen, setPauseModalOpen] = React.useState<{
    isOpen: boolean;
    channelName: string;
    channelId: string;
    isPaused: boolean;
  }>({
    isOpen: false,
    channelName: '',
    channelId: '',
    isPaused: false,
  });

  const isOwnerOrAdmin = role === 'owner' || role === 'operator';

  const handleRefreshDiagnostics = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  const handleConfirmPauseToggle = () => {
    setPauseModalOpen({ isOpen: false, channelName: '', channelId: '', isPaused: false });
  };

  return (
    <div id="canais-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-600" />
            <h1 className="text-xl font-bold text-slate-900 font-heading">
              Canais WhatsApp Conectados
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Multi-Engine Ativo
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Infraestrutura de comunicação para {workspace.name} · WABA Meta Cloud API & WAHA
          </p>
        </div>

        <button
          onClick={handleRefreshDiagnostics}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Testando Conexões...' : 'Testar Saúde dos Canais'}</span>
        </button>
      </div>

      {/* Grid: WABA Oficial + WAHA Grupos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: WhatsApp Oficial (WABA Meta Cloud API) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-heading flex items-center gap-1.5">
                    WhatsApp Oficial (Meta Cloud API)
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-bold">
                      Primário 1:1
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    WABA ID: {workspace.channels[0]?.wabaAccountId || 'waba_prod_meta_v20'}
                  </p>
                </div>
              </div>

              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Online & Saudável
              </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100">
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Latência</span>
                <span className="text-xs font-mono font-bold text-slate-800">42ms</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Limite Diário</span>
                <span className="text-xs font-mono font-bold text-slate-800">Tier 2 (10k/dia)</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Score Qualidade</span>
                <span className="text-xs font-mono font-bold text-emerald-700">Verde (Alto)</span>
              </div>
            </div>

            {/* Account Details */}
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Número Vinculado:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {workspace.channels[0]?.phoneNumber || '+55 (11) 98765-4321'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Atribuição CTWA Ads:</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Criptografia Ponta a Ponta:</span>
                <span className="text-slate-800 font-semibold">Meta Cloud API Oficial</span>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <button
              onClick={() =>
                setPauseModalOpen({
                  isOpen: true,
                  channelName: 'WhatsApp Oficial (WABA)',
                  channelId: 'waba-01',
                  isPaused: false,
                })
              }
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pausar Canal Temporariamente</span>
            </button>

            <button
              onClick={handleRefreshDiagnostics}
              className="px-3 py-1.5 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Diagnóstico WABA</span>
            </button>
          </div>
        </div>

        {/* Card 2: WhatsApp Conectado (Instância WAHA Multi-Device) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-heading flex items-center gap-1.5">
                    WhatsApp Conectado (Instância WAHA)
                    <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.2 rounded font-bold">
                      Grupos & Suporte
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Sessão: {engineConfig.waha.sessionName || 'agencia_master_prod'}
                  </p>
                </div>
              </div>

              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                Sincronizado
              </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100">
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Latência</span>
                <span className="text-xs font-mono font-bold text-slate-800">28ms</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Grupos Ativos</span>
                <span className="text-xs font-mono font-bold text-slate-800">12 Grupos</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Bateria Aparelho</span>
                <span className="text-xs font-mono font-bold text-emerald-700">88% Carregando</span>
              </div>
            </div>

            {/* Session Details */}
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Aparelho Conectado:</span>
                <span className="font-semibold text-slate-900">iPhone 14 Pro · iOS 17.5</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Modo Multi-Device:</span>
                <span className="text-blue-700 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ativo
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Failover Automático:</span>
                <span className="text-emerald-700 font-semibold">Ativado para WABA</span>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <button
              onClick={() =>
                setPauseModalOpen({
                  isOpen: true,
                  channelName: 'Instância WAHA (Grupos)',
                  channelId: 'waha-01',
                  isPaused: false,
                })
              }
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pausar Instância</span>
            </button>

            <button
              onClick={handleRefreshDiagnostics}
              className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reconectar Sessão</span>
            </button>
          </div>
        </div>
      </div>

      {/* Advanced Infrastructure Section (Gated for Owner/Admin) */}
      {isOwnerOrAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-5 py-3.5 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between transition-colors border-b border-slate-200"
          >
            <div className="flex items-center gap-2.5 text-left">
              <ArrowRightLeft className="w-4 h-4 text-purple-600" />
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-heading">
                  Configurações Avançadas de Roteamento & Transição (Owner)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Roteamento de mensagens 1:1, canais de grupos e histórico de webhooks
                </p>
              </div>
            </div>
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showAdvanced && (
            <div className="p-5">
              <ConnectionManager
                workspace={workspace}
                engineConfig={engineConfig}
                onUpdateEngineConfig={setEngineConfig}
              />
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal for Pausing Channel */}
      {pauseModalOpen.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 font-heading text-sm">
                  Pausar Canal: {pauseModalOpen.channelName}
                </h3>
                <p className="text-xs text-slate-500">
                  Atenção: Novas mensagens do WhatsApp não serão recebidas enquanto pausado.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
              Ao pausar o canal, o SOS Sales colocará as filas em espera e os operadores não receberão novos leads até a reativação manual.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setPauseModalOpen({ isOpen: false, channelName: '', channelId: '', isPaused: false })}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmPauseToggle}
                className="px-4 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shadow-2xs"
              >
                Confirmar Pausa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
