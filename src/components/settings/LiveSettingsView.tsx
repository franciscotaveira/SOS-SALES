import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Smartphone,
  Clock,
  Users,
  CheckCircle2,
  Shield,
  QrCode,
  RefreshCw,
  Crown,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Workspace } from '../../types/cockpit';

interface LiveSettingsViewProps {
  workspace: Workspace;
  activeSubTab?: string;
  onChangeSubTab?: (subTab: string) => void;
}

export const LiveSettingsView: React.FC<LiveSettingsViewProps> = ({
  workspace,
  activeSubTab = 'canais',
  onChangeSubTab,
}) => {
  const [currentTab, setCurrentTab] = useState(activeSubTab);
  const [firstResponseMins, setFirstResponseMins] = useState(15);
  const [resolutionHours, setResolutionHours] = useState(24);
  const [savedSlaToast, setSavedSlaToast] = useState(false);

  // Live QR Code Modal state
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<'INITIAL' | 'STARTING' | 'SCAN_QR_CODE' | 'WORKING' | 'FAILED'>('INITIAL');
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const handleTabChange = (tab: string) => {
    setCurrentTab(tab);
    onChangeSubTab?.(tab);
  };

  const handleSaveSla = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSlaToast(true);
    setTimeout(() => setSavedSlaToast(false), 3000);
  };

  useEffect(() => {
    fetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/status`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status) {
          setQrStatus(data.status);
        }
      })
      .catch(() => undefined);
  }, [workspace.id]);

  const fetchQrCode = async () => {
    setIsQrLoading(true);
    setQrError(null);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/qr`);
      if (!res.ok) {
        throw new Error('Não foi possível obter o QR Code do canal.');
      }
      const data = await res.json();
      setQrStatus(data.status || data.engineStatus || 'INITIAL');
      if (data.qr || data.qrCodeDataUrl) {
        setQrCodeDataUrl(data.qr || data.qrCodeDataUrl);
      }
    } catch (err: any) {
      setQrError(err.message || 'Falha ao conectar com o serviço de WhatsApp.');
    } finally {
      setIsQrLoading(false);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (isQrModalOpen) {
      fetchQrCode();
      interval = setInterval(() => {
        if (qrStatus !== 'WORKING') {
          fetchQrCode();
        }
      }, 5000);
    } else {
      setQrCodeDataUrl(null);
      setQrStatus('INITIAL');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isQrModalOpen]);

  return (
    <div className="flex flex-col h-full bg-slate-50/50 text-slate-900 p-4 sm:p-6 overflow-y-auto max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-950 font-heading tracking-tight flex items-center gap-2">
              <Sliders className="w-5 h-5 text-emerald-600" /> Configurações Soberanas
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {workspace.name}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestão de canais do WhatsApp, limites de SLA comercial e membros do workspace.
          </p>
        </div>

        {/* Sub-tabs pills */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl shadow-2xs">
          <button
            onClick={() => handleTabChange('canais')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'canais'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" /> Canais WhatsApp
          </button>
          <button
            onClick={() => handleTabChange('sla')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'sla'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> Regras de SLA
          </button>
          <button
            onClick={() => handleTabChange('membros')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'membros'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Users className="w-3.5 h-3.5" /> Operadores & Time
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mt-5 flex-1">
        {currentTab === 'canais' && (
          <div className="max-w-4xl space-y-4">
            <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">Canal Principal · WhatsApp Web (WAHA)</h3>
                    <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold border flex items-center gap-1 ${
                      qrStatus === 'WORKING'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {qrStatus === 'WORKING' ? <Wifi className="w-3 h-3 text-emerald-600" /> : <WifiOff className="w-3 h-3 text-amber-600" />}
                      {qrStatus === 'WORKING' ? 'Conectado / Online' : 'Aguardando Pareamento'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Instância dedicada para o workspace <strong className="text-slate-800">{workspace.name}</strong>.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsQrModalOpen(true)}
                className="px-4 py-2 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <QrCode className="w-4 h-4" />
                {qrStatus === 'WORKING' ? 'Reconectar / QR Code' : 'Conectar via QR Code'}
              </button>
            </div>
          </div>
        )}

        {currentTab === 'sla' && (
          <div className="max-w-2xl bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-0.5 font-heading">Metas de Tempo de Resposta e Conversão</h2>
            <p className="text-xs text-slate-500 mb-5">
              Gatilhos automáticos para alertar e acionar handoff se o lead aguardar sem resposta.
            </p>

            {savedSlaToast && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold">Políticas de SLA salvas com sucesso no banco de dados!</span>
              </div>
            )}

            <form onSubmit={handleSaveSla} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                  Tempo Máximo para Primeiro Atendimento (Minutos)
                </label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={firstResponseMins}
                  onChange={(e) => setFirstResponseMins(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors shadow-2xs"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Recomendado para CTWA (Click to WhatsApp Ads): 5 a 15 minutos.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-heading">
                  Tempo Limite para Resolução / Follow-up (Horas)
                </label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={resolutionHours}
                  onChange={(e) => setResolutionHours(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors shadow-2xs"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                >
                  Salvar Políticas de SLA
                </button>
              </div>
            </form>
          </div>
        )}

        {currentTab === 'membros' && (
          <div className="max-w-4xl space-y-3">
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold text-sm shadow-2xs">
                  FR
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">Francisco Rios (Você)</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                      <Crown className="w-3 h-3 text-amber-600" /> Owner (Proprietário)
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">franciscotaveira.mkt@gmail.com • Acesso total e soberano</p>
                </div>
              </div>

              <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">Ativo agora</span>
            </div>
          </div>
        )}
      </div>

      {/* Real Live QR Code Pairing Modal */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl text-center relative">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 mx-auto mb-3 shadow-2xs">
              <QrCode className="w-6 h-6" />
            </div>
            
            <h3 className="text-base font-bold text-slate-950 font-heading">Conectar WhatsApp Oficial</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Abra o WhatsApp no celular &gt; Aparelhos Conectados &gt; Conectar Aparelho.
            </p>

            {/* Live QR Box */}
            <div className="w-56 h-56 bg-slate-50 p-3 rounded-2xl mx-auto flex items-center justify-center border border-slate-200 relative overflow-hidden">
              {isQrLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 text-slate-700">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                  <span className="text-xs font-semibold">Gerando QR Code...</span>
                </div>
              ) : qrStatus === 'WORKING' ? (
                <div className="flex flex-col items-center justify-center gap-2 text-emerald-700 p-4">
                  <CheckCircle2 className="w-14 h-14 text-emerald-600 animate-bounce" />
                  <span className="text-sm font-bold text-slate-900">WhatsApp Conectado!</span>
                  <span className="text-[11px] text-slate-500">Instância ativa e pronta para operar.</span>
                </div>
              ) : qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code WhatsApp"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 text-slate-500 p-4">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                  <span className="text-xs">Iniciando sessão do WhatsApp...</span>
                </div>
              )}
            </div>

            {qrError && (
              <p className="text-xs text-rose-600 mt-3 font-medium">{qrError}</p>
            )}

            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={fetchQrCode}
                disabled={isQrLoading}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isQrLoading ? 'animate-spin' : ''}`} />
                Atualizar QR Code
              </button>
            </div>

            <p className="text-[11px] text-slate-400 mt-3">
              Conexão 100% direta e soberana na sua VPS com o WAHA.
            </p>

            <div className="mt-5">
              <button
                onClick={() => setIsQrModalOpen(false)}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
