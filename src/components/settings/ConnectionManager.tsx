import React from 'react';
import { Workspace } from '../../types/cockpit';
import { mockEngineConfig } from '../../data/groupFixtures';
import { EngineConfig, WhatsAppEngineType } from '../../types/groupsAndEngines';
import {
  Server,
  Zap,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Radio,
  ArrowRightLeft,
  Check,
  Activity,
  Terminal,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface ConnectionManagerProps {
  workspace: Workspace;
  engineConfig: EngineConfig;
  onUpdateEngineConfig: (newConfig: EngineConfig) => void;
}

export const ConnectionManager: React.FC<ConnectionManagerProps> = ({
  workspace,
  engineConfig,
  onUpdateEngineConfig,
}) => {
  const [testingWaba, setTestingWaba] = React.useState(false);
  const [testingWaha, setTestingWaha] = React.useState(false);
  const [wabaPing, setWabaPing] = React.useState<number | null>(42);
  const [wahaPing, setWahaPing] = React.useState<number | null>(28);
  const [autoFailover, setAutoFailover] = React.useState(true);
  const [activeTransition, setActiveTransition] = React.useState<string | null>(null);

  // Transition logs
  const [transitionLogs, setTransitionLogs] = React.useState<
    Array<{ timestamp: string; engine: 'waba' | 'waha'; message: string; type: 'info' | 'success' | 'warn' }>
  >([
    {
      timestamp: '11:45:02',
      engine: 'waba',
      message: 'Handshake com Meta Cloud API v20.0 validado com sucesso (token ativo).',
      type: 'success',
    },
    {
      timestamp: '11:42:15',
      engine: 'waha',
      message: 'Sessão WAHA Multi-Device "agencia_master" sincronizada (12 grupos conectados).',
      type: 'success',
    },
    {
      timestamp: '11:30:00',
      engine: 'waba',
      message: 'Failover inteligente ativo: Roteamento prioritário 1:1 via WABA e Grupos via WAHA.',
      type: 'info',
    },
  ]);

  const handleTestWaba = () => {
    setTestingWaba(true);
    setTimeout(() => {
      const ping = Math.floor(Math.random() * 25) + 35;
      setWabaPing(ping);
      setTestingWaba(false);
      setTransitionLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          engine: 'waba',
          message: `Health-Check WABA OK: Latência ${ping}ms · Webhooks 200 OK · Cota ${engineConfig.waba.messagingLimit}/dia`,
          type: 'success',
        },
        ...prev,
      ]);
    }, 900);
  };

  const handleTestWaha = () => {
    setTestingWaha(true);
    setTimeout(() => {
      const ping = Math.floor(Math.random() * 20) + 20;
      setWahaPing(ping);
      setTestingWaha(false);
      setTransitionLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          engine: 'waha',
          message: `Health-Check WAHA OK: Latência ${ping}ms · Sessão Ativa · Bateria ${engineConfig.waha.batteryLevel}%`,
          type: 'success',
        },
        ...prev,
      ]);
    }, 850);
  };

  const handleToggleRoute = (
    routeKey: keyof EngineConfig['preferredRouting'],
    newEngine: WhatsAppEngineType
  ) => {
    setActiveTransition(routeKey);
    const updated: EngineConfig = {
      ...engineConfig,
      preferredRouting: {
        ...engineConfig.preferredRouting,
        [routeKey]: newEngine,
      },
    };
    onUpdateEngineConfig(updated);

    setTimeout(() => {
      setActiveTransition(null);
      setTransitionLogs((prev) => [
        {
          timestamp: new Date().toLocaleTimeString(),
          engine: newEngine,
          message: `Rota [${routeKey}] migrada para infraestrutura ${(newEngine || 'WAHA').toUpperCase()} com zero downtime.`,
          type: 'info',
        },
        ...prev,
      ]);
    }, 600);
  };

  return (
    <div id="connection-manager-panel" className="space-y-5">
      {/* Top Protocol Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* WABA Meta Official Card */}
        <div className="cockpit-panel p-4 space-y-3.5 border-t-4 border-t-[#00a884]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#e7f8e8] text-[#00a884] flex items-center justify-center font-bold shadow-2xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#111b21]">Meta WABA Cloud API</h3>
                <p className="text-[11px] text-[#54656f]">API Oficial Meta Business (WhatsApp Cloud)</p>
              </div>
            </div>

            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-[#e7f8e8] text-[#00a884] border border-[#a7f3d0] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Conectado
            </span>
          </div>

          <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-2">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#667781]">Qualidade do Número:</span>
              <span className="font-bold text-emerald-700 font-mono">Alta (GREEN)</span>
            </div>
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#667781]">Limite de Mensagens/dia:</span>
              <span className="font-bold text-[#111b21] font-mono">{engineConfig.waba.messagingLimit} leads</span>
            </div>
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#667781]">Templates Aprovados:</span>
              <span className="font-bold text-[#111b21]">{engineConfig.waba.templateCount} modelos HSM</span>
            </div>
            <div className="flex items-center justify-between text-[11.5px] pt-1 border-t border-[#e2e8f0]">
              <span className="text-[#667781]">Latência Ping API:</span>
              <span className="font-bold text-[#00a884] font-mono">
                {testingWaba ? 'Testando...' : `${wabaPing} ms`}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[#54656f]">Ideal para: CTWA Ads & Vendas 1:1</span>
            <button
              onClick={handleTestWaba}
              disabled={testingWaba}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#00a884] ${testingWaba ? 'animate-spin' : ''}`} />
              <span>{testingWaba ? 'Validando...' : 'Testar Ping WABA'}</span>
            </button>
          </div>
        </div>

        {/* WAHA Multi-Device Hub Card */}
        <div className="cockpit-panel p-4 space-y-3.5 border-t-4 border-t-blue-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shadow-2xs">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#111b21]">WAHA Multi-Device Hub</h3>
                <p className="text-[11px] text-[#54656f]">HTTP Gateway para Gestão de 12 Grupos</p>
              </div>
            </div>

            <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Sessão Ativa
            </span>
          </div>

          <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-2">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#667781]">Sessão Agência:</span>
              <span className="font-bold text-[#111b21]">{engineConfig.waha.sessionName}</span>
            </div>
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#667781]">Bateria do Aparelho:</span>
              <span className="font-bold text-emerald-700">{engineConfig.waha.batteryLevel}%</span>
            </div>
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-[#667781]">Uptime Contínuo:</span>
              <span className="font-bold text-blue-700">{engineConfig.waha.uptimeHours}h sem interrupção</span>
            </div>
            <div className="flex items-center justify-between text-[11.5px] pt-1 border-t border-[#e2e8f0]">
              <span className="text-[#667781]">Latência Gateway HTTP:</span>
              <span className="font-bold text-blue-700 font-mono">
                {testingWaha ? 'Testando...' : `${wahaPing} ms`}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[#54656f]">Ideal para: Grupos de Clientes & Avisos</span>
            <button
              onClick={handleTestWaha}
              disabled={testingWaha}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${testingWaha ? 'animate-spin' : ''}`} />
              <span>{testingWaha ? 'Validando...' : 'Testar Ping WAHA'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Intelligent Routing Matrix with Interactive Protocol Switcher */}
      <div className="cockpit-panel p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 font-bold text-sm text-[#111b21]">
            <Sliders className="w-4 h-4 text-[#00a884]" />
            <span>Matriz de Roteamento Inteligente & Transição de Protocolo</span>
          </div>

          {/* Failover Switch */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#54656f] font-medium">Failover Automático:</span>
            <button
              onClick={() => setAutoFailover(!autoFailover)}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                autoFailover ? 'bg-[#00a884]' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                  autoFailover ? 'left-5.5' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 4 Routing Channel Cards with Click-to-Switch */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Direct Sales 1:1 */}
          <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-2 border border-[#e2e8f0]">
            <div className="font-bold text-[#111b21]">Leads & Vendas 1:1</div>
            <div className="text-[11px] text-[#667781]">Anúncios Meta CTWA</div>

            <div className="flex gap-1 pt-1">
              <button
                onClick={() => handleToggleRoute('directSales', 'waba')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition-all ${
                  engineConfig.preferredRouting.directSales === 'waba'
                    ? 'bg-[#00a884] text-white shadow-2xs'
                    : 'bg-white text-[#54656f] border border-slate-200'
                }`}
              >
                WABA
              </button>
              <button
                onClick={() => handleToggleRoute('directSales', 'waha')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition-all ${
                  engineConfig.preferredRouting.directSales === 'waha'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-[#54656f] border border-slate-200'
                }`}
              >
                WAHA
              </button>
            </div>
          </div>

          {/* Group Management */}
          <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-2 border border-[#e2e8f0]">
            <div className="font-bold text-[#111b21]">Grupos Clientes (12)</div>
            <div className="text-[11px] text-[#667781]">Comunicação Agência</div>

            <div className="flex gap-1 pt-1">
              <button
                onClick={() => handleToggleRoute('groupManagement', 'waba')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition-all ${
                  engineConfig.preferredRouting.groupManagement === 'waba'
                    ? 'bg-[#00a884] text-white shadow-2xs'
                    : 'bg-white text-[#54656f] border border-slate-200'
                }`}
              >
                WABA
              </button>
              <button
                onClick={() => handleToggleRoute('groupManagement', 'waha')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition-all ${
                  engineConfig.preferredRouting.groupManagement === 'waha'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-[#54656f] border border-slate-200'
                }`}
              >
                WAHA
              </button>
            </div>
          </div>

          {/* Broadcasts */}
          <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-2 border border-[#e2e8f0]">
            <div className="font-bold text-[#111b21]">Disparos em Massa</div>
            <div className="text-[11px] text-[#667781]">Avisos e Confirmações</div>

            <div className="flex gap-1 pt-1">
              <button
                onClick={() => handleToggleRoute('massBroadcast', 'waba')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition-all ${
                  engineConfig.preferredRouting.massBroadcast === 'waba'
                    ? 'bg-[#00a884] text-white shadow-2xs'
                    : 'bg-white text-[#54656f] border border-slate-200'
                }`}
              >
                WABA
              </button>
              <button
                onClick={() => handleToggleRoute('massBroadcast', 'waha')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition-all ${
                  engineConfig.preferredRouting.massBroadcast === 'waha'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-[#54656f] border border-slate-200'
                }`}
              >
                WAHA
              </button>
            </div>
          </div>

          {/* Follow-up & Nurturing */}
          <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-2 border border-[#e2e8f0]">
            <div className="font-bold text-[#111b21]">Follow-up & Aquecimento</div>
            <div className="text-[11px] text-[#667781]">Reengajamento de Vendas</div>

            <div className="flex gap-1 pt-1">
              <button
                onClick={() => handleToggleRoute('leadNurturing', 'waba')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition-all ${
                  engineConfig.preferredRouting.leadNurturing === 'waba'
                    ? 'bg-[#00a884] text-white shadow-2xs'
                    : 'bg-white text-[#54656f] border border-slate-200'
                }`}
              >
                WABA
              </button>
              <button
                onClick={() => handleToggleRoute('leadNurturing', 'waha')}
                className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition-all ${
                  engineConfig.preferredRouting.leadNurturing === 'waha'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-white text-[#54656f] border border-slate-200'
                }`}
              >
                WAHA
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Connection Logs Terminal */}
      <div className="cockpit-panel p-4 space-y-3 bg-[#111b21] text-slate-200 rounded-2xl border-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs text-emerald-400 font-bold">
            <Terminal className="w-4 h-4" />
            <span>Terminal de Transição de Protocolos (WABA ⇆ WAHA Engine Log)</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Live Sync</span>
        </div>

        <div className="font-mono text-[11px] space-y-1.5 max-h-40 overflow-y-auto p-2.5 bg-black/40 rounded-xl border border-slate-800">
          {transitionLogs.map((log, idx) => (
            <div key={idx} className="flex items-start gap-2 leading-relaxed">
              <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
              <span
                className={`px-1 py-0.2 rounded text-[9.5px] font-bold shrink-0 ${
                  log.engine === 'waba' ? 'bg-[#00a884]/20 text-[#00a884]' : 'bg-blue-900/40 text-blue-400'
                }`}
              >
                {log.engine ? log.engine.toUpperCase() : 'WAHA'}
              </span>
              <span
                className={
                  log.type === 'success'
                    ? 'text-emerald-400'
                    : log.type === 'warn'
                    ? 'text-amber-400'
                    : 'text-slate-300'
                }
              >
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
