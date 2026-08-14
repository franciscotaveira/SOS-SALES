import React from 'react';
import { Workspace } from '../../types/cockpit';
import { mockEngineConfig } from '../../data/groupFixtures';
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
} from 'lucide-react';

interface SettingsShellProps {
  workspace: Workspace;
}

export const SettingsShell: React.FC<SettingsShellProps> = ({ workspace }) => {
  const [engineConfig, setEngineConfig] = React.useState(mockEngineConfig);
  const [activeSubTab, setActiveSubTab] = React.useState<'engines' | 'channels' | 'governance'>('engines');

  return (
    <div id="settings-shell-view" className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#e2e8f0]">
        <div>
          <h1 className="text-xl font-bold text-[#111b21]">Configurações & Conectores WhatsApp</h1>
          <p className="text-xs text-[#54656f]">
            Status de infraestrutura híbrida WABA (Meta Cloud API) e WAHA (Automação de Grupos)
          </p>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-1 bg-[#f0f2f5] p-1 rounded-xl border border-[#e2e8f0]">
          <button
            onClick={() => setActiveSubTab('engines')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              activeSubTab === 'engines'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            Engines WABA / WAHA
          </button>
          <button
            onClick={() => setActiveSubTab('channels')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              activeSubTab === 'channels'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            Canais do Workspace
          </button>
          <button
            onClick={() => setActiveSubTab('governance')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
              activeSubTab === 'governance'
                ? 'bg-white text-[#00a884] shadow-2xs'
                : 'text-[#54656f] hover:text-[#111b21]'
            }`}
          >
            Governança & SLA
          </button>
        </div>
      </div>

      {activeSubTab === 'engines' && (
        <div className="space-y-5">
          {/* Engine Cards: WABA vs WAHA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* WABA Meta Official Card */}
            <div className="cockpit-panel p-4 space-y-3 border-t-4 border-t-[#00a884]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#e7f8e8] text-[#00a884] flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#111b21]">Meta WABA Cloud API</h3>
                    <p className="text-[11px] text-[#54656f]">Conexão Oficial Direta Meta Business</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-[#e7f8e8] text-[#00a884] border border-[#a7f3d0] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Conectado
                </span>
              </div>

              <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#667781]">Qualidade do Número:</span>
                  <span className="font-bold text-emerald-700 font-mono">Alta (GREEN)</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#667781]">Limite de Mensagens/dia:</span>
                  <span className="font-bold text-[#111b21] font-mono">{engineConfig.waba.messagingLimit} leads</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#667781]">Templates Aprovados:</span>
                  <span className="font-bold text-[#111b21]">{engineConfig.waba.templateCount} modelos HSM</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#e2e8f0]">
                  <span className="text-[#667781]">Nome Verificado:</span>
                  <span className="font-bold text-[#00a884]">{engineConfig.waba.verifiedName}</span>
                </div>
              </div>

              <div className="text-[11px] text-[#54656f] leading-relaxed">
                Utilizado para o atendimento 1:1 de alta velocidade, CTWA ads, garantia de entrega de 99.9% e proteção contra bloqueios.
              </div>
            </div>

            {/* WAHA Multi-Device Automation Card */}
            <div className="cockpit-panel p-4 space-y-3 border-t-4 border-t-blue-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#111b21]">WAHA Multi-Device Hub</h3>
                    <p className="text-[11px] text-[#54656f]">HTTP Gateway para Gestão de Grupos</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Sessão Ativa
                </span>
              </div>

              <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#667781]">Endpoint da Instância:</span>
                  <span className="font-mono text-[10.5px] text-[#111b21] truncate max-w-[150px]">{engineConfig.waha.endpointUrl}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#667781]">Sessão Agência:</span>
                  <span className="font-bold text-[#111b21]">{engineConfig.waha.sessionName}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#667781]">Bateria do Aparelho:</span>
                  <span className="font-bold text-emerald-700">{engineConfig.waha.batteryLevel}%</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[#e2e8f0]">
                  <span className="text-[#667781]">Uptime Contínuo:</span>
                  <span className="font-bold text-blue-700">{engineConfig.waha.uptimeHours} horas sem queda</span>
                </div>
              </div>

              <div className="text-[11px] text-[#54656f] leading-relaxed">
                Permite escutar e responder em 12+ grupos de clientes simultaneamente, interagir com squads internos e automatizar avisos sem custos de template.
              </div>
            </div>
          </div>

          {/* Hybrid Routing Matrix */}
          <div className="cockpit-panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-[#111b21]">
                <Sliders className="w-4 h-4 text-[#00a884]" />
                <span>Matriz de Roteamento Inteligente (WABA ⇆ WAHA)</span>
              </div>
              <span className="text-[11px] text-[#667781]">Transição transparente de protocolo</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-1.5">
                <div className="font-bold text-[#111b21]">Leads & Vendas 1:1</div>
                <div className="text-[11px] text-[#667781]">Anúncios Meta CTWA</div>
                <span className="inline-block px-2 py-0.5 bg-[#e7f8e8] text-[#00a884] font-bold text-[10px] rounded">
                  🟢 Rota WABA Oficial
                </span>
              </div>

              <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-1.5">
                <div className="font-bold text-[#111b21]">Grupos de Clientes (12)</div>
                <div className="text-[11px] text-[#667781]">Comunicação Agência</div>
                <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-[10px] rounded">
                  🔵 Rota WAHA Engine
                </span>
              </div>

              <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-1.5">
                <div className="font-bold text-[#111b21]">Disparos em Massa (HSM)</div>
                <div className="text-[11px] text-[#667781]">Avisos e Confirmações</div>
                <span className="inline-block px-2 py-0.5 bg-[#e7f8e8] text-[#00a884] font-bold text-[10px] rounded">
                  🟢 Rota WABA Oficial
                </span>
              </div>

              <div className="p-3 bg-[#f0f2f5] rounded-xl text-xs space-y-1.5">
                <div className="font-bold text-[#111b21]">Aquecimento & Nurturing</div>
                <div className="text-[11px] text-[#667781]">Follow-up Comercial</div>
                <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-800 font-bold text-[10px] rounded">
                  🔵 Rota WAHA Engine
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'channels' && (
        <div className="cockpit-panel p-4 space-y-3">
          <div className="flex items-center gap-2 font-bold text-sm text-[#111b21]">
            <Radio className="w-4 h-4 text-[#00a884]" />
            <span>Canais Conectados para {workspace.name}</span>
          </div>

          <div className="space-y-2">
            {workspace.channels.map((chan) => (
              <div
                key={chan.id}
                className="p-3 bg-[#f0f2f5] border border-[#e2e8f0] rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-bold text-[#111b21]">{chan.name}</div>
                  <div className="text-[#667781] font-mono text-[11px]">
                    {chan.phoneNumber} · WABA ID: {chan.wabaAccountId || 'waba_prod_01'}
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                    chan.health === 'connected'
                      ? 'bg-[#e7f8e8] text-[#00a884] border border-[#a7f3d0]'
                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                  }`}
                >
                  {chan.health === 'connected' ? 'Ativo & Saudável' : 'Pausado'}
                </span>
              </div>
            ))}
          </div>
        </div>
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
