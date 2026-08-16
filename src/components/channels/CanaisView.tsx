import React from 'react';
import { Workspace } from '../../types/cockpit';
import { mockEngineConfig } from '../../data/groupFixtures';
import { EngineConfig } from '../../types/groupsAndEngines';
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
  QrCode,
  LogOut,
  Sliders,
  Check,
  Trash2,
  X,
} from 'lucide-react';

interface CanaisViewProps {
  workspace: Workspace;
  role?: string;
}

export const CanaisView: React.FC<CanaisViewProps> = ({ workspace, role = 'operator' }) => {
  const [engineConfig, setEngineConfig] = React.useState<EngineConfig>(mockEngineConfig);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  // WABA Config Modal State
  const [wabaModalOpen, setWabaModalOpen] = React.useState(false);
  const [phoneNumberId, setPhoneNumberId] = React.useState('');
  const [wabaId, setWabaId] = React.useState('');
  const [accessToken, setAccessToken] = React.useState('');
  const [verifyToken, setVerifyToken] = React.useState('mct_waba_verify_2026');
  const [wabaSaving, setWabaSaving] = React.useState(false);
  const [wabaFeedback, setWabaFeedback] = React.useState<{ success?: boolean; message?: string } | null>(null);

  // Live Channel Status State
  const [channelStatus, setChannelStatus] = React.useState<{ status: string; phone?: string | null; pushName?: string | null } | null>(null);

  const fetchChannelStatus = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/status`);
      if (res.ok) {
        const data = await res.json();
        setChannelStatus(data);
      }
    } catch {
      // ignore
    }
  }, [workspace.id]);

  React.useEffect(() => {
    fetchChannelStatus();
    const interval = setInterval(fetchChannelStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchChannelStatus]);

  // QR Modal State
  const [qrModalOpen, setQrModalOpen] = React.useState(false);
  const [qrData, setQrData] = React.useState<string | null>(null);
  const [qrStatus, setQrStatus] = React.useState<string>('STARTING');
  const [qrLoading, setQrLoading] = React.useState(false);

  // Disconnect State
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [actionFeedback, setActionFeedback] = React.useState<string | null>(null);

  const isOwnerOrAdmin = role === 'owner' || role === 'operator';

  // Fetch QR Code
  const fetchQrCode = async () => {
    setQrLoading(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/qr`);
      const data = await res.json();
      setQrStatus(data.status);
      if (data.qr) {
        setQrData(data.qr);
      }
      if (data.status === 'WORKING') {
        setActionFeedback('WhatsApp conectado com sucesso!');
        fetchChannelStatus();
        setTimeout(() => setQrModalOpen(false), 1500);
      }
    } catch {
      setQrStatus('ERROR');
    } finally {
      setQrLoading(false);
    }
  };

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (qrModalOpen) {
      fetchQrCode();
      interval = setInterval(fetchQrCode, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [qrModalOpen, workspace.id]);

  // Disconnect WhatsApp
  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar este WhatsApp? A sessão atual será encerrada.')) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/logout`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionFeedback('WhatsApp desconectado com sucesso! Você pode conectar um novo número.');
        setQrData(null);
        setQrStatus('STOPPED');
        fetchChannelStatus();
      } else {
        setActionFeedback('Erro ao desconectar: ' + (data.error || 'Falha no servidor'));
      }
    } catch (err: any) {
      setActionFeedback('Erro ao desconectar: ' + err.message);
    } finally {
      setDisconnecting(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  // Sync Chats
  const handleSyncChats = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(`Sincronizado com sucesso! ${data.syncedContacts || 0} contatos e ${data.syncedMessages || 0} mensagens.`);
      } else {
        setActionFeedback('Erro ao sincronizar: ' + (data.error || 'Falha no servidor'));
      }
    } catch (err: any) {
      setActionFeedback('Erro ao sincronizar: ' + err.message);
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setActionFeedback(null), 6000);
    }
  };

  // Clear History
  const handleClearHistory = async () => {
    if (!confirm('Deseja realmente limpar todo o histórico de conversas e leads deste workspace? Essa ação é permanente.')) return;
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/clear-history`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setActionFeedback('Histórico de conversas e leads limpo com sucesso!');
      } else {
        setActionFeedback('Erro ao limpar: ' + (data.error || 'Falha no servidor'));
      }
    } catch (err: any) {
      setActionFeedback('Erro ao limpar: ' + err.message);
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setActionFeedback(null), 6000);
    }
  };

  // Save WABA Config
  const handleSaveWaba = async (e: React.FormEvent) => {
    e.preventDefault();
    setWabaSaving(true);
    setWabaFeedback(null);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspace.id}/channels/waba/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId, wabaId, accessToken, verifyToken }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWabaFeedback({ success: true, message: `WABA Conectado! Número: ${data.verifiedPhone} (${data.verifiedName})` });
        setTimeout(() => {
          setWabaModalOpen(false);
          setWabaFeedback(null);
        }, 2000);
      } else {
        setWabaFeedback({ success: false, message: data.error || 'Erro na validação com a Meta.' });
      }
    } catch (err: any) {
      setWabaFeedback({ success: false, message: err.message });
    } finally {
      setWabaSaving(false);
    }
  };

  return (
    <div id="canais-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Action Notification Banner */}
      {actionFeedback && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
          <button onClick={() => setActionFeedback(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
            Infraestrutura de comunicação para <span className="font-semibold text-slate-700">{workspace.name}</span> · WABA Meta Cloud API & WAHA
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClearHistory}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100 shadow-2xs transition-colors cursor-pointer"
            title="Limpa todas as conversas e leads salvos neste workspace"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar Histórico</span>
          </button>
          <button
            onClick={handleSyncChats}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100/80 shadow-2xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Sincronizando...' : 'Sincronizar Mensagens'}</span>
          </button>
        </div>
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
                    WABA ID: {workspace.channels[0]?.wabaAccountId || 'Meta Cloud API v20.0'}
                  </p>
                </div>
              </div>

              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Meta API Pronta
              </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100">
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Latência</span>
                <span className="text-xs font-mono font-bold text-slate-800">38ms</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Limite Diário</span>
                <span className="text-xs font-mono font-bold text-slate-800">Tier 2 (10k/dia)</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Qualidade</span>
                <span className="text-xs font-mono font-bold text-emerald-700">Verde (Alto)</span>
              </div>
            </div>

            {/* Account Details */}
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Número Vinculado:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {workspace.channels[0]?.phoneNumber || 'Não configurado'}
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
              onClick={() => setWabaModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Conectar WABA Oficial (Meta)</span>
            </button>

            <button
              onClick={() => setWabaModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Credenciais & Token</span>
            </button>
          </div>
        </div>

        {/* Card 2: WhatsApp Web / WAHA Multi-Device */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-heading flex items-center gap-1.5">
                    WhatsApp Web (Instância WAHA)
                    <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.2 rounded font-bold">
                      Grupos & Suporte
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Workspace: {workspace.slug}
                  </p>
                </div>
              </div>

              <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                channelStatus?.status === 'WORKING'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : channelStatus?.status === 'SCAN_QR_CODE'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  channelStatus?.status === 'WORKING'
                    ? 'bg-emerald-500 animate-pulse'
                    : channelStatus?.status === 'SCAN_QR_CODE'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-slate-400'
                }`} />
                {channelStatus?.status === 'WORKING'
                  ? 'Conectado & Online'
                  : channelStatus?.status === 'SCAN_QR_CODE'
                  ? 'Aguardando QR Code'
                  : 'Desconectado'}
              </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100">
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Latência</span>
                <span className="text-xs font-mono font-bold text-slate-800">22ms</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Sessão</span>
                <span className="text-xs font-mono font-bold text-slate-800">
                  {channelStatus?.status === 'WORKING' ? 'Ativa (Pareada)' : 'Desconectada'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Webhooks</span>
                <span className="text-xs font-mono font-bold text-emerald-700">200 OK</span>
              </div>
            </div>

            {/* Session Details */}
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Número Pareado:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {channelStatus?.phone || 'Nenhum (Aguardando Pareamento)'}
                </span>
              </div>
              {channelStatus?.pushName && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>Nome no WhatsApp:</span>
                  <span className="font-semibold text-slate-800">
                    {channelStatus.pushName}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-slate-600">
                <span>Failover Automático:</span>
                <span className="text-emerald-700 font-semibold">Ativado para WABA</span>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <button
              onClick={() => setQrModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Parear via QR Code</span>
            </button>

            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{disconnecting ? 'Desconectando...' : 'Desconectar Aparelho'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 border border-slate-200 shadow-2xl space-y-4 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 font-heading text-sm">
                Conectar WhatsApp Web
              </h3>
              <button onClick={() => setQrModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Abra o WhatsApp no celular &gt; <strong>Aparelhos Conectados</strong> &gt; <strong>Conectar um aparelho</strong> e aponte para o código:
            </p>

            <div className="flex items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-200 min-h-[220px]">
              {qrLoading && !qrData ? (
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
                  <span className="text-xs font-semibold">Gerando QR Code na VPS...</span>
                </div>
              ) : qrData ? (
                <img src={qrData} alt="WhatsApp QR Code" className="w-52 h-52 object-contain rounded-xl shadow-xs" />
              ) : (
                <div className="text-xs text-slate-500">
                  {qrStatus === 'WORKING' ? (
                    <div className="flex flex-col items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="w-10 h-10" />
                      <span className="font-bold">WhatsApp Conectado!</span>
                    </div>
                  ) : (
                    <span>Aguardando inicialização da sessão...</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                onClick={fetchQrCode}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Atualizar QR</span>
              </button>
              <button
                onClick={() => setQrModalOpen(false)}
                className="px-4 py-1.5 text-xs font-bold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WABA Configuration Modal */}
      {wabaModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 font-heading text-sm">
                    Configurar WhatsApp Oficial (Meta Cloud API / WABA)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Workspace: {workspace.name}
                  </p>
                </div>
              </div>
              <button onClick={() => setWabaModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {wabaFeedback && (
              <div className={`p-3 rounded-xl text-xs font-semibold ${wabaFeedback.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                {wabaFeedback.message}
              </div>
            )}

            <form onSubmit={handleSaveWaba} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Phone Number ID (ID do Número de Telefone na Meta)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 104829482910394"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  WhatsApp Business Account ID (WABA ID)
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 928374829102938"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Meta System User Access Token (Bearer Token Permanente)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="EAAG..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Gere no Meta Business Manager &gt; Usuários do Sistema com permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
                </p>
              </div>

              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1.5">
                <span className="font-bold text-slate-800 block text-[11px]">Dados para Configurar no Meta Business Manager:</span>
                <div>
                  <span className="text-[10px] text-slate-500 block font-semibold">URL de Retorno de Chamada (Callback URL):</span>
                  <code className="text-[11px] font-mono text-emerald-800 select-all block break-all font-bold bg-white px-2 py-1 rounded border border-emerald-200">
                    https://crm.iaparavendas.tech/api/v1/channels/waba/webhook
                  </code>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-semibold">Token de Verificação (Verify Token):</span>
                  <code className="text-[11px] font-mono text-emerald-800 select-all block font-bold bg-white px-2 py-1 rounded border border-emerald-200">
                    mct_waba_verify_2026
                  </code>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setWabaModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={wabaSaving}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-2xs flex items-center gap-1.5"
                >
                  {wabaSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validando com a Meta...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Validar & Conectar WABA</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
