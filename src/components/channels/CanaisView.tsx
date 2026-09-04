import React from 'react';
import { Workspace } from '../../types/cockpit';
import { ConnectionManager } from '../settings/ConnectionManager';
import { resolveWorkspaceTrackingDefaults } from '../settings/TrackingSettings';
import { MessengerInsightsPanel } from '../intelligence/MessengerInsightsPanel';
import { authenticatedFetch } from '../../services/authenticatedFetch';
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
  MessageSquare,
  Instagram,
  Link2,
  Brain,
  FileText,
} from 'lucide-react';


interface CanaisViewProps {
  workspace: Workspace;
  role?: string;
}

export const CanaisView: React.FC<CanaisViewProps> = ({ workspace, role = 'operator' }) => {
  const [activeChannelTab, setActiveChannelTab] = React.useState<'whatsapp' | 'meta_omnichannel'>('whatsapp');
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  // WABA Config Modal State
  const [wabaModalOpen, setWabaModalOpen] = React.useState(false);

  const [phoneNumberId, setPhoneNumberId] = React.useState('');
  const [wabaId, setWabaId] = React.useState('');
  const [accessToken, setAccessToken] = React.useState('');
  const [wabaSaving, setWabaSaving] = React.useState(false);
  const [wabaFeedback, setWabaFeedback] = React.useState<{ success?: boolean; message?: string } | null>(null);
  const [wabaTab, setWabaTab] = React.useState<'simplified' | 'login_auth' | 'manual'>('simplified');
  const [metaAppId, setMetaAppId] = React.useState('2294262161340902');
  const [serverWabaConfig, setServerWabaConfig] = React.useState<{
    serverTokenAvailable?: boolean;
    appId?: string;
    appName?: string;
    defaultWabaId?: string;
    defaultPhoneNumberId?: string;
    defaultDisplayPhone?: string;
    defaultVerifiedName?: string;
    webhookUrl?: string;
    webhookLegacyUrl?: string;
  } | null>(null);

  React.useEffect(() => {
    const defaults = resolveWorkspaceTrackingDefaults(workspace.id, workspace.name);
    if (defaults.metaAccessToken && !accessToken) {
      setAccessToken(defaults.metaAccessToken);
    }
  }, [workspace.id, workspace.name]);

  // WABA account selection flow state
  const [wabaStep, setWabaStep] = React.useState<'token' | 'accounts' | 'confirm'>('token');
  const [wabaAccounts, setWabaAccounts] = React.useState<Array<{
    id: string;
    name: string;
    phoneNumbers?: Array<{ id: string; display_phone_number: string; verified_name: string }>;
  }>>([]);
  const [selectedWabaAccount, setSelectedWabaAccount] = React.useState<{ id: string; name: string } | null>(null);
  const [selectedPhone, setSelectedPhone] = React.useState<{ id: string; display_phone_number: string; verified_name: string } | null>(null);
  const [fetchingAccounts, setFetchingAccounts] = React.useState(false);

  // WABA Live Channel Info State
  const [wabaChannelInfo, setWabaChannelInfo] = React.useState<{
    configured?: boolean;
    connected?: boolean;
    credentialsAvailable?: boolean;
    accountStatus?: string;
    phoneNumber?: string;
    verifiedName?: string;
    wabaId?: string;
    phoneNumberId?: string;
    qualityRating?: string;
  } | null>(null);
  const [metaBusinessAgentEligibility, setMetaBusinessAgentEligibility] = React.useState<{
    status: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
    reason?: string;
    detail?: string;
    actionUrl?: string;
  } | null>(null);

  const fetchWabaChannelInfo = React.useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/channel-info`);
      if (res.ok) {
        const data = await res.json();
        setWabaChannelInfo(data);
        if (data.wabaId) setWabaId(data.wabaId);
        if (data.phoneNumberId) setPhoneNumberId(data.phoneNumberId);
      } else {
        setWabaChannelInfo(null);
      }
    } catch {
      setWabaChannelInfo(null);
    }
  }, [workspace.id]);

  const fetchServerWabaConfig = React.useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/server-config`);
      if (res.ok) {
        const data = await res.json();
        setServerWabaConfig(data);
        if (data.appId) setMetaAppId(data.appId);
        if (!wabaId && data.defaultWabaId) setWabaId(data.defaultWabaId);
        if (!phoneNumberId && data.defaultPhoneNumberId) setPhoneNumberId(data.defaultPhoneNumberId);
      }
    } catch {
      // ignore
    }
  }, [workspace.id, wabaId, phoneNumberId]);

  React.useEffect(() => {
    fetchWabaChannelInfo();
    fetchServerWabaConfig();
    const interval = setInterval(fetchWabaChannelInfo, 10000);
    return () => clearInterval(interval);
  }, [fetchWabaChannelInfo, fetchServerWabaConfig]);

  const fetchMetaBusinessAgentEligibility = React.useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/meta-business-agent/eligibility`);
      if (!res.ok) {
        setMetaBusinessAgentEligibility({ status: 'UNKNOWN' });
        return;
      }
      const payload = await res.json();
      const data = payload?.data;
      if (data?.status === 'ELIGIBLE' || data?.status === 'INELIGIBLE' || data?.status === 'UNKNOWN') {
        setMetaBusinessAgentEligibility({
          status: data.status,
          reason: data.reason,
          detail: data.detail,
          actionUrl: data.actionUrl,
        });
      } else {
        setMetaBusinessAgentEligibility({ status: 'UNKNOWN' });
      }
    } catch {
      setMetaBusinessAgentEligibility({ status: 'UNKNOWN' });
    }
  }, [workspace.id]);

  React.useEffect(() => {
    fetchMetaBusinessAgentEligibility();
  }, [fetchMetaBusinessAgentEligibility]);

  // Live Channel Status State — shape mirrors real WAHA /api/sessions/:name response
  const [channelStatus, setChannelStatus] = React.useState<{
    session?: string;
    status: string;
    phone?: string | null;
    pushName?: string | null;
    me?: { id?: string; pushName?: string } | null;
    stats?: { chats?: number; contacts?: number; groups?: number } | null;
  } | null>(null);

  const fetchChannelStatus = React.useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/status`);
      if (res.ok) {
        const data = await res.json();
        setChannelStatus(data);
        window.dispatchEvent(new CustomEvent('sos_channel_status_changed', { detail: data }));
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
  const [qrCountdown, setQrCountdown] = React.useState(60);

  // Disconnect State
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [actionFeedback, setActionFeedback] = React.useState<string | null>(null);

  const isOwnerOrAdmin = role === 'owner' || role === 'operator';
  // The channel-info endpoint proves that the WABA credentials are stored and
  // the number was previously validated; it does not perform a live Graph
  // health probe on every render. Keep the wording explicit so the UI never
  // promises an active Meta session from database state alone.
  const isWabaConfigured = Boolean(
    wabaChannelInfo?.configured
      && wabaChannelInfo?.credentialsAvailable === true
      && wabaChannelInfo?.phoneNumberId,
  );
  const metaAgentLabel = metaBusinessAgentEligibility?.status === 'ELIGIBLE'
    ? 'Elegível para agente Meta'
    : metaBusinessAgentEligibility?.reason === 'TERMS_NOT_ACCEPTED' || (metaBusinessAgentEligibility?.detail && metaBusinessAgentEligibility.detail.toLowerCase().includes('terms'))
      ? 'Agente Meta: Termos de IA Pendentes'
      : metaBusinessAgentEligibility?.status === 'INELIGIBLE'
        ? 'Não elegível para agente Meta'
        : 'Elegibilidade do agente: verificar';

  // Fetch QR Code
  const fetchQrCode = async (isManual = false) => {
    if (!qrData || isManual) {
      setQrLoading(true);
    }
    setQrCountdown(60);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/qr`);
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
    let statusInterval: NodeJS.Timeout;
    let countdownInterval: NodeJS.Timeout;

    if (qrModalOpen) {
      fetchQrCode(true);

      // Lightweight status poll: checks if user scanned without refreshing/blinking the QR image
      statusInterval = setInterval(async () => {
        try {
          const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/status`);
          const data = await res.json();
          if (data.status === 'WORKING') {
            setQrStatus('WORKING');
            setActionFeedback('WhatsApp conectado com sucesso!');
            fetchChannelStatus();
            setTimeout(() => setQrModalOpen(false), 1500);
          }
        } catch {
          // ignore status poll error
        }
      }, 3000);

      // 60-second stable QR timer: counts down every second and only refreshes at 0
      countdownInterval = setInterval(() => {
        setQrCountdown((prev) => {
          if (prev <= 1) {
            fetchQrCode(false);
            return 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (statusInterval) clearInterval(statusInterval);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [qrModalOpen, workspace.id]);

  // Disconnect WhatsApp
  const handleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar este WhatsApp? A sessão atual será encerrada.')) return;
    setDisconnecting(true);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/logout`, { method: 'POST' });
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
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/sync`, { method: 'POST' });
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
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/whatsapp/clear-history`, { method: 'POST' });
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

  // Save WABA Config (Manual)
  const handleSaveWaba = async (e: React.FormEvent) => {
    e.preventDefault();
    setWabaSaving(true);
    setWabaFeedback(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId, wabaId, accessToken }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWabaFeedback({ success: true, message: `WABA validado e salvo pela Meta! Número: ${data.verifiedPhone} (${data.verifiedName})` });
        fetchWabaChannelInfo();
        fetchChannelStatus();
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

  // Connect WABA via CRM TX APP (Configuração Simplificada 1-Clique)
  const handleSimplifiedConnect = async () => {
    setWabaSaving(true);
    setWabaFeedback(null);
    try {
      const phoneIdToUse = phoneNumberId.trim() || serverWabaConfig?.defaultPhoneNumberId || '2498930403536552';
      const wabaIdToUse = wabaId.trim() || serverWabaConfig?.defaultWabaId || '1749193841879179';

      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: phoneIdToUse,
          wabaId: wabaIdToUse,
          accessToken: 'use_server_default',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWabaFeedback({
          success: true,
          message: `WhatsApp Oficial conectado com sucesso via CRM TX APP! Número: ${data.verifiedPhone} (${data.verifiedName})`,
        });
        fetchWabaChannelInfo();
        fetchChannelStatus();
        setTimeout(() => {
          setWabaModalOpen(false);
          setWabaFeedback(null);
        }, 2000);
      } else {
        setWabaFeedback({
          success: false,
          message: data.error || 'Erro ao conectar via CRM TX APP.',
        });
      }
    } catch (err: any) {
      setWabaFeedback({ success: false, message: err.message });
    } finally {
      setWabaSaving(false);
    }
  };

  // Facebook JS SDK Loader
  const loadAndInitFacebookSdk = (appId: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).FB) {
        (window as any).FB.init({
          appId: appId.trim(),
          cookie: true,
          xfbml: true,
          version: 'v20.0',
        });
        return resolve((window as any).FB);
      }
      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        (window as any).FB.init({
          appId: appId.trim(),
          cookie: true,
          xfbml: true,
          version: 'v20.0',
        });
        resolve((window as any).FB);
      };
      script.onerror = (err) => reject(err);
      document.body.appendChild(script);
    });
  };

  // Fetch WABA accounts from Meta after getting token
  const fetchWabaAccounts = async (token: string) => {
    setFetchingAccounts(true);
    setWabaFeedback(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/list-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token }),
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        data = { success: false, error: 'Resposta vazia ou inválida do servidor.' };
      }
      if (res.ok && data.success) {
        if (data.accounts && data.accounts.length > 0) {
          setWabaAccounts(data.accounts);
          setWabaStep('accounts');
          // Auto-select if only one account
          if (data.accounts.length === 1) {
            setSelectedWabaAccount({ id: data.accounts[0].id, name: data.accounts[0].name });
            setWabaId(data.accounts[0].id);
            if (data.accounts[0].phoneNumbers?.length === 1) {
              const ph = data.accounts[0].phoneNumbers[0];
              setSelectedPhone(ph);
              setPhoneNumberId(ph.id);
            }
          }
        } else {
          // Token is valid, advance to Step 2 for direct ID entry
          setWabaAccounts([]);
          setWabaFeedback({
            success: true,
            message: 'Token validado! Preencha o WABA ID e Phone Number ID do seu app para concluir a conexão:',
          });
          setWabaStep('accounts');
        }
      } else {
        setWabaFeedback({ success: false, message: data.error || 'Erro ao buscar contas da Meta.' });
      }
    } catch (err: any) {
      setWabaFeedback({ success: false, message: 'Erro ao buscar contas: ' + err.message });
    } finally {
      setFetchingAccounts(false);
    }
  };


  // Popup Facebook Login Trigger
  const triggerFacebookPopupLogin = async () => {
    const appIdToUse = metaAppId.trim();
    if (!appIdToUse) {
      setWabaFeedback({ success: false, message: 'Informe o Meta App ID antes de abrir o login OAuth.' });
      return;
    }
    setWabaSaving(true);
    setWabaFeedback(null);
    try {
      const fb = await loadAndInitFacebookSdk(appIdToUse);

      fb.login(
        (response: any) => {
          if (response.authResponse && response.authResponse.accessToken) {
            const userToken = response.authResponse.accessToken;
            setAccessToken(userToken);
            setWabaSaving(false);
            // Fetch accounts for selection
            fetchWabaAccounts(userToken);
          } else {
            setWabaSaving(false);
            setWabaFeedback({
              success: false,
              message: 'Login com Facebook cancelado ou permissões de WhatsApp não autorizadas no popup.',
            });
          }
        },
        { scope: 'whatsapp_business_messaging,whatsapp_business_management' }
      );
    } catch (err: any) {
      setWabaSaving(false);
      setWabaFeedback({
        success: false,
        message: 'Erro ao inicializar SDK do Facebook: ' + (err.message || 'Verifique se há bloqueadores de popup ativos.'),
      });
    }
  };

  // OAuth Auto-Connect
  const handleOAuthConnect = async (tokenToUse?: string) => {
    const token = tokenToUse || accessToken;
    if (!token) {
      setWabaFeedback({ success: false, message: 'Por favor, insira ou gere o Token de Acesso da Meta.' });
      return;
    }
    setWabaSaving(true);
    setWabaFeedback(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/oauth-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token, wabaId, phoneNumberId, appId: metaAppId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWabaFeedback({ success: true, message: `WABA validado e salvo pela Meta! Número: ${data.verifiedPhone} (${data.verifiedName})` });
        fetchChannelStatus();
        setTimeout(() => {
          setWabaModalOpen(false);
          setWabaFeedback(null);
        }, 2000);
      } else {
        setWabaFeedback({ success: false, message: data.error || 'Erro na conexão via Login Auth com a Meta.' });
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
              Canais WhatsApp
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              WABA + WAHA
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Infraestrutura de comunicação para <span className="font-semibold text-slate-700">{workspace.name}</span> · WABA Meta Cloud API & WAHA
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncChats}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100/80 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Sincronizando...' : 'Sincronizar Mensagens'}</span>
          </button>
        </div>
      </div>

      {/* Sub-Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => setActiveChannelTab('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeChannelTab === 'whatsapp'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>WhatsApp (WABA Oficial & WAHA)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveChannelTab('meta_omnichannel')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeChannelTab === 'meta_omnichannel'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Meta Omnichannel (Messenger, IG Direct & Wit.ai NLP)</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-900 ml-1">NOVO</span>
        </button>
      </div>

      {activeChannelTab === 'meta_omnichannel' ? (
        <MessengerInsightsPanel workspace={workspace} />
      ) : (
        <>
          {/* Layout Soberano: Hero WABA Oficial + WAHA Opcional Colapsável */}
          <div className="space-y-4">
            {/* Card 1: WhatsApp Oficial (WABA Meta Cloud API) - HERO CARD */}
            <div className="bg-gradient-to-br from-white via-emerald-50/20 to-teal-50/30 border-2 border-emerald-500/40 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-5">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-slate-900 font-heading">
                          WhatsApp Oficial (Meta Cloud API)
                        </h3>
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wide border border-emerald-300/60">
                          Soberano 1:1
                        </span>
                      </div>
                      <p className="text-xs text-emerald-800/80 font-medium mt-0.5">
                        Conexão 100% em Nuvem Oficial · Zero dependência de celular, bateria ou QR Code
                      </p>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black border self-start ${
                    isWabaConfigured
                      ? 'bg-sky-50 text-sky-800 border-sky-300'
                      : 'bg-amber-50 text-amber-800 border-amber-300'
                  }`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${isWabaConfigured ? 'bg-sky-500' : 'bg-amber-500'}`} />
                    {isWabaConfigured ? 'Credenciais Meta registradas' : 'Meta Cloud não confirmada'}
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-emerald-200/60">
                  <div className="p-3 bg-white/90 border border-emerald-100 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Número configurado</span>
                    <span className="text-xs font-mono font-bold text-emerald-800 block truncate mt-0.5">
                      {wabaChannelInfo?.phoneNumber || 'Não informado'}
                    </span>
                  </div>
                  <div className="p-3 bg-white/90 border border-emerald-100 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Qualidade da Conta</span>
                    <span className="text-xs font-mono font-black text-emerald-700 block mt-0.5">
                      {wabaChannelInfo?.qualityRating || 'Não informado'}
                    </span>
                  </div>
                  <div className="p-3 bg-white/90 border border-emerald-100 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Capacidade / Dia</span>
                    <span className="text-xs font-mono font-bold text-slate-800 block mt-0.5">
                      Não informado
                    </span>
                  </div>
                  <div className="p-3 bg-white/90 border border-emerald-100 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Latência Meta</span>
                    <span className="text-xs font-mono font-bold text-slate-800 block mt-0.5">
                      Não informado
                    </span>
                  </div>
                </div>

                {/* Technical details badge row */}
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 bg-white/60 p-2.5 rounded-xl border border-emerald-100">
                  <span className="font-semibold text-slate-800">Empresa: {wabaChannelInfo?.verifiedName || workspace.name}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-slate-500">WABA ID: {wabaChannelInfo?.wabaId || 'Não informado'}</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-slate-500">Graph API v20.0 Direct Cloud</span>
                  <span className="text-slate-300">·</span>
                  <span className={metaBusinessAgentEligibility?.status === 'ELIGIBLE' ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>
                    {metaAgentLabel}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    setWabaTab('simplified');
                    setWabaModalOpen(true);
                  }}
                  className="px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-200 fill-current" />
                  <span>Conexão Simplificada (CRM TX APP)</span>
                </button>
                <button
                  onClick={() => {
                    setWabaTab('manual');
                    setWabaModalOpen(true);
                  }}
                  className="px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Sliders className="w-3.5 h-3.5 text-slate-500" />
                  <span>Configurações Manuais</span>
                </button>
              </div>
            </div>

            {/* Card 2: WhatsApp Web & Histórico (WAHA Local Engine) - FIRST CLASS DUAL ENGINE */}
            <div className="bg-gradient-to-br from-white via-blue-50/20 to-indigo-50/30 border-2 border-blue-500/30 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-5">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
                      <QrCode className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-slate-900 font-heading">
                          WhatsApp Web & Sincronizador Local (WAHA)
                        </h3>
                        <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wide border border-blue-300/60">
                          Dual-Engine
                        </span>
                      </div>
                      <p className="text-xs text-blue-900/80 font-medium mt-0.5">
                        Motor de sincronização de histórico, atendimento em tempo real e monitor de grupos · Sem custo HSM
                      </p>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black border self-start ${
                    channelStatus?.status === 'WORKING'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                  }`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${channelStatus?.status === 'WORKING' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {channelStatus?.status === 'WORKING' ? 'Conectado (WhatsApp Web)' : 'Desconectado — QR Code Pendente'}
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-blue-200/60">
                  <div className="p-3 bg-white/90 border border-blue-100 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Sessão Local VPS</span>
                    <span className="text-xs font-mono font-bold text-blue-900 block truncate mt-0.5">
                      {channelStatus?.session || 'haven'}
                    </span>
                  </div>
                  <div className="p-3 bg-white/90 border border-blue-100 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Número Pareado</span>
                    <span className="text-xs font-mono font-bold text-slate-800 block truncate mt-0.5">
                      {channelStatus?.me?.id ? channelStatus.me.id.replace('@c.us', '') : (channelStatus?.status === 'WORKING' ? 'Conectado' : 'Aguardando pareamento')}
                    </span>
                  </div>
                  <div className="p-3 bg-white/90 border border-blue-100 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Histórico no CRM</span>
                    <span className="text-xs font-mono font-black text-blue-700 block mt-0.5">
                      2.520+ mensagens
                    </span>
                  </div>
                  <div className="p-3 bg-white/90 border border-blue-100 rounded-xl text-center shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Protocolo</span>
                    <span className="text-xs font-mono font-bold text-slate-800 block mt-0.5">
                      Multi-Device WebJS
                    </span>
                  </div>
                </div>

                {/* Microcopy */}
                <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-600 bg-white/60 p-2.5 rounded-xl border border-blue-100">
                  <span className="font-semibold text-slate-800">Motor de Execução: WAHA Container Local</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-600">Sincroniza todas as conversas do celular físico e restaura o histórico do CRM</span>
                  <span className="text-slate-300">·</span>
                  <span className="font-semibold text-blue-700">Disparos e Atendimentos Diretos</span>
                </div>
              </div>

              {/* Action Bar (Always Visible, Direct Access) */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-blue-100/80">
                {channelStatus?.status !== 'WORKING' ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5">
                    <div>
                      <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        Sessão de WhatsApp Web desconectada
                      </span>
                      <span className="text-[11.5px] text-amber-900 block mt-0.5">
                        Escaneie o QR Code com o WhatsApp da empresa para sincronizar conversas, mensagens recentes e leads.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setQrModalOpen(true)}
                      className="px-5 py-2.5 text-xs font-black bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shrink-0 cursor-pointer"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Conectar WhatsApp (Escanear QR Code)</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 w-full justify-between">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleSyncChats}
                        disabled={isRefreshing}
                        className="px-4 py-2 text-xs font-bold text-blue-800 bg-white hover:bg-blue-50 border border-blue-300 rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isRefreshing ? 'animate-spin' : ''}`} />
                        <span>{isRefreshing ? 'Sincronizando conversas...' : 'Sincronizar Histórico Agora'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setQrModalOpen(true)}
                        className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-2xs"
                      >
                        <QrCode className="w-3.5 h-3.5 text-slate-500" />
                        <span>Reconectar / Novo QR</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ml-auto"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{disconnecting ? 'Desconectando...' : 'Desconectar Sessão'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Informação sobre Modelos WABA Centralizados */}
          <div className="bg-gradient-to-r from-purple-50/60 to-slate-50 border border-purple-200/70 rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center border border-purple-200 shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 font-heading flex items-center gap-2">
                  <span>Modelos & Templates de Mensagem WABA</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                    Gestão de Campanhas
                  </span>
                </h4>
                <p className="text-[11.5px] text-slate-500 mt-0.5">
                  A criação, visualização e homologação de templates foram centralizadas na aba <strong>Gestão de Campanhas → Modelos WABA</strong>.
                </p>
              </div>
            </div>

            <a
              href="https://business.facebook.com/wa/manage/message-templates/"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-1.5 text-xs font-bold text-purple-700 bg-white hover:bg-purple-50 border border-purple-200 rounded-xl transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Gerenciador Meta Business</span>
            </a>
          </div>
        </>
      )}


      {/* QR Code Modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 font-heading text-sm">
                    Conectar WhatsApp Web via QR Code
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Workspace: <span className="font-semibold text-slate-700">{workspace.name}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => setQrModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step-by-step instructions */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-left space-y-1.5 text-xs text-slate-700">
              <div className="font-bold text-[11px] text-slate-500 uppercase tracking-wide">Como conectar:</div>
              <ol className="list-decimal list-inside space-y-1 text-[11.5px]">
                <li>Abra o <strong>WhatsApp</strong> no celular da empresa</li>
                <li>Toque em <strong>Configurações (ou ⋮)</strong> &gt; <strong>Aparelhos Conectados</strong></li>
                <li>Toque em <strong>Conectar um aparelho</strong> e aponte para o código abaixo:</li>
              </ol>
            </div>

            <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border-2 border-dashed border-slate-200 min-h-[250px]">
              {qrLoading && !qrData ? (
                <div className="flex flex-col items-center gap-2 text-slate-500">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                  <span className="text-xs font-semibold">Gerando QR Code na VPS...</span>
                </div>
              ) : qrStatus === 'WORKING' ? (
                <div className="flex flex-col items-center gap-2.5 text-emerald-600 p-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <span className="font-bold text-sm text-slate-900">WhatsApp Conectado com Sucesso!</span>
                  <span className="text-xs text-slate-500">Sincronizando chats e mensagens com o CRM...</span>
                </div>
              ) : qrData ? (
                <div className="space-y-2 text-center">
                  <img src={qrData} alt="WhatsApp QR Code" className="w-56 h-56 object-contain rounded-xl shadow-xs mx-auto border border-slate-100" />
                  <span className="text-[11px] text-slate-500 font-medium block">QR Code fixo e estável · Renova em <strong>{qrCountdown}s</strong> (Conexão detectada em tempo real)</span>
                </div>
              ) : (
                <div className="text-xs text-slate-500 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                  <span>Aguardando inicialização da sessão local...</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => fetchQrCode(true)}
                disabled={qrLoading}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${qrLoading ? 'animate-spin' : ''}`} />
                <span>Atualizar QR</span>
              </button>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="px-5 py-2 text-xs font-bold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
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

            {/* Active Connection Banner inside Modal */}
            {wabaChannelInfo?.accountStatus === 'CONNECTED' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 shadow-3xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        Canal Oficial Meta configurado
                  </span>
                  <span className="text-[9.5px] font-mono font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                    Qualidade: {wabaChannelInfo?.qualityRating || 'não informada'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[10.5px] text-emerald-900 pt-1 border-t border-emerald-200/60 font-mono">
                  <div>Número: <strong className="text-emerald-950">{wabaChannelInfo?.phoneNumber || 'não informado'}</strong></div>
                  <div>Empresa: <strong className="text-emerald-950">{wabaChannelInfo?.verifiedName || workspace.name}</strong></div>
                  <div>WABA ID: <strong className="text-emerald-950">{wabaChannelInfo?.wabaId || 'não informado'}</strong></div>
                  <div>Phone ID: <strong className="text-emerald-950">{wabaChannelInfo?.phoneNumberId || 'não informado'}</strong></div>
                </div>
              </div>
            )}

            {/* Tabs for Simplificada vs Login Auth vs Manual */}
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setWabaTab('simplified')}
                className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                  wabaTab === 'simplified'
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                <span>🚀 Simplificada (CRM TX APP)</span>
              </button>
              <button
                type="button"
                onClick={() => setWabaTab('login_auth')}
                className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                  wabaTab === 'login_auth'
                    ? 'border-blue-600 text-blue-600 bg-blue-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>⚡ Popup Facebook</span>
              </button>
              <button
                type="button"
                onClick={() => setWabaTab('manual')}
                className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                  wabaTab === 'manual'
                    ? 'border-slate-800 text-slate-800 bg-slate-100/50'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>⚙️ Manual</span>
              </button>
            </div>

            {wabaFeedback && (
              <div className={`p-3 rounded-xl text-xs font-semibold ${wabaFeedback.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                {wabaFeedback.message}
              </div>
            )}

            {wabaTab === 'simplified' && (
              <div className="space-y-4 text-xs">
                <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      CRM TX APP Homologado no Servidor
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-600 text-white shadow-3xs">
                      App ID: {serverWabaConfig?.appId || metaAppId || '2294262161340902'}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-900 leading-relaxed">
                    O sistema já possui integração nativa autenticada via Token Permanente do Sistema com a Meta Cloud API v20.0.
                    Não é necessário gerar tokens ou lidar com configurações manuais.
                  </p>
                </div>

                {/* Detected Line Information */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <span className="font-bold text-slate-800 block text-xs">
                    Identificadores Oficiais Vinculados:
                  </span>
                  <div className="grid grid-cols-2 gap-3 text-[11px]">
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">WhatsApp Oficial</span>
                      <span className="font-mono font-bold text-emerald-700 block">
                        {wabaChannelInfo?.phoneNumber || serverWabaConfig?.defaultDisplayPhone || '+55 49 8837-0054'}
                      </span>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {wabaChannelInfo?.verifiedName || serverWabaConfig?.defaultVerifiedName || 'Haven Escovaria'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Qualidade Meta</span>
                      <span className="font-mono font-black text-emerald-600 block">
                        {wabaChannelInfo?.qualityRating || 'GREEN (Alta)'}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Cloud API Standard
                      </span>
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">WABA ID</span>
                      <input
                        type="text"
                        value={wabaId || serverWabaConfig?.defaultWabaId || '1749193841879179'}
                        onChange={(e) => setWabaId(e.target.value.trim())}
                        className="w-full font-mono text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Phone Number ID</span>
                      <input
                        type="text"
                        value={phoneNumberId || serverWabaConfig?.defaultPhoneNumberId || '2498930403536552'}
                        onChange={(e) => setPhoneNumberId(e.target.value.trim())}
                        className="w-full font-mono text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Primary 1-Click Connect Button */}
                <button
                  type="button"
                  disabled={wabaSaving}
                  onClick={handleSimplifiedConnect}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition cursor-pointer text-xs"
                >
                  {wabaSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Validando e Conectando com a Meta...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-emerald-200 fill-current" />
                      <span>⚡ Ativar WhatsApp Oficial com 1-Clique</span>
                    </>
                  )}
                </button>

                {/* Webhook Endpoints Info */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-[10.5px]">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">Webhook Ativo (Meta Developers):</span>
                    <span className="text-[9.5px] font-mono text-slate-400">Hub Challenge Automático</span>
                  </div>
                  <code className="block bg-white px-2 py-1 rounded border border-slate-200 font-mono text-emerald-800 text-[10px] select-all break-all">
                    https://crm.iaparavendas.tech/api/v1/channels/waba/webhook
                  </code>
                  <span className="text-slate-400 block text-[9.5px]">
                    Alias compatível: <code className="text-slate-600 select-all">https://crm.iaparavendas.tech/api/meta/webhook</code>
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setWabaModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}

            {wabaTab === 'login_auth' && (
              <div className="space-y-4 text-xs">

                {/* Step indicator */}
                <div className="flex items-center gap-1 text-[10px] font-bold">
                  {(['token', 'accounts', 'confirm'] as const).map((s, i) => (
                    <React.Fragment key={s}>
                      <span className={`px-2 py-0.5 rounded-full ${
                        wabaStep === s ? 'bg-blue-600 text-white' :
                        ['token', 'accounts', 'confirm'].indexOf(wabaStep) > i ? 'bg-emerald-100 text-emerald-700' :
                        'bg-slate-100 text-slate-400'
                      }`}>
                        {i + 1}. {s === 'token' ? 'Token' : s === 'accounts' ? 'Conta' : 'Confirmar'}
                      </span>
                      {i < 2 && <span className="text-slate-300">→</span>}
                    </React.Fragment>
                  ))}
                </div>

                {/* Step 1: Token entry */}
                {wabaStep === 'token' && (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1.5">
                      <span className="font-bold text-blue-900 block text-xs">Login com Facebook / Meta OAuth:</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Conecte via popup do Facebook (recomendado) ou cole o Token de Acesso manualmente.
                      </p>
                    </div>

                    {/* Method 1: Facebook Popup */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 block text-[11px]">Método 1: Login com Popup do Facebook</span>
                        <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                          App: {metaAppId || 'não informado'}
                        </span>
                      </div>
                      <label className="block space-y-1">
                        <span className="text-[10px] font-bold text-slate-600">Meta App ID</span>
                        <input
                          value={metaAppId}
                          onChange={(event) => setMetaAppId(event.target.value.trim())}
                          inputMode="numeric"
                          placeholder="ID público do aplicativo Meta"
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <button

                        type="button"
                        onClick={triggerFacebookPopupLogin}
                        disabled={wabaSaving || fetchingAccounts}
                        className="w-full py-2 px-3 bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-60 text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-xs transition"
                      >
                        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        <span>{wabaSaving ? 'Aguardando...' : fetchingAccounts ? 'Buscando contas...' : 'Abrir Popup de Login do Facebook'}</span>
                      </button>
                    </div>

                    {/* Method 2: Paste token */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                      <span className="font-bold text-slate-800 block text-[11px]">Método 2: Colar Token de Acesso da Meta</span>
                      <textarea
                        rows={2}
                        placeholder="Cole aqui o Token EAAG..."
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fetchWabaAccounts(accessToken)}
                          disabled={!accessToken.trim() || fetchingAccounts}
                          className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                          {fetchingAccounts ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Buscando contas WABA...</span></> : <><Zap className="w-3.5 h-3.5" /><span>Buscar Contas Vinculadas</span></>}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!accessToken.trim()) {
                              setWabaFeedback({ success: false, message: 'Cole o Token de Acesso da Meta antes de avançar.' });
                              return;
                            }
                            setWabaStep('accounts');
                          }}
                          className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs transition cursor-pointer shrink-0"
                          title="Avançar diretamente para inserir WABA ID e Phone Number ID do seu app"
                        >
                          Inserir IDs →
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Account selection */}
                {wabaStep === 'accounts' && (
                  <div className="space-y-3">
                    <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                      <p className="text-[11px] font-semibold text-blue-900">
                        {wabaAccounts.length > 0
                          ? '✅ Contas encontradas! Selecione a conta WABA e o número:'
                          : '🔑 Token Meta configurado! Informe o WABA ID e Phone Number ID da conta do app:'}
                      </p>
                    </div>

                    {wabaAccounts.length > 0 ? (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {wabaAccounts.map((acc) => (
                          <div key={acc.id} className={`border rounded-xl p-3 cursor-pointer transition-all ${
                            selectedWabaAccount?.id === acc.id
                              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400'
                              : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30'
                          }`}
                            onClick={() => {
                              setSelectedWabaAccount({ id: acc.id, name: acc.name });
                              setWabaId(acc.id);
                              setSelectedPhone(null);
                              setPhoneNumberId('');
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-bold text-slate-800 text-xs">{acc.name}</p>
                                <p className="text-[10px] font-mono text-slate-500">ID: {acc.id}</p>
                              </div>
                              {selectedWabaAccount?.id === acc.id && (
                                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                              )}
                            </div>

                            {/* Phone number sub-list */}
                            {selectedWabaAccount?.id === acc.id && acc.phoneNumbers && acc.phoneNumbers.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-blue-200 space-y-1">
                                <p className="text-[10px] font-bold text-slate-600 mb-1">Selecione o número:</p>
                                {acc.phoneNumbers.map((ph) => (
                                  <div
                                    key={ph.id}
                                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer ${
                                      selectedPhone?.id === ph.id
                                        ? 'bg-emerald-100 border border-emerald-400'
                                        : 'bg-white border border-slate-200 hover:bg-emerald-50'
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedPhone(ph);
                                      setPhoneNumberId(ph.id);
                                    }}
                                  >
                                    <div>
                                      <p className="font-bold text-slate-800 text-[11px]">{ph.display_phone_number}</p>
                                      <p className="text-[10px] text-slate-500">{ph.verified_name}</p>
                                    </div>
                                    {selectedPhone?.id === ph.id && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                          <span>📱</span> Identificadores do WhatsApp no seu Meta App:
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Phone Number ID (ID do Número de Telefone)
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: 104829482910394 (no Painel Meta Developers > WhatsApp > API Setup)"
                            value={phoneNumberId}
                            onChange={(e) => setPhoneNumberId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            WhatsApp Business Account ID (WABA ID)
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: 928374829102938"
                            value={wabaId}
                            onChange={(e) => setWabaId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {wabaAccounts.length > 0 && (
                      <div className="pt-1">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Ou informe manualmente:</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" placeholder="Phone Number ID" value={phoneNumberId}
                            onChange={(e) => setPhoneNumberId(e.target.value)}
                            className="px-2.5 py-1 border border-slate-300 rounded-lg font-mono text-[11px] focus:ring-1 focus:ring-blue-500 outline-none" />
                          <input type="text" placeholder="WABA ID" value={wabaId}
                            onChange={(e) => setWabaId(e.target.value)}
                            className="px-2.5 py-1 border border-slate-300 rounded-lg font-mono text-[11px] focus:ring-1 focus:ring-blue-500 outline-none" />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button type="button" onClick={() => setWabaStep('token')}
                        className="flex-1 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer">
                        ← Voltar
                      </button>
                      <button type="button"
                        disabled={!phoneNumberId.trim() || !wabaId.trim()}
                        onClick={() => setWabaStep('confirm')}
                        className="flex-1 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg flex items-center justify-center gap-1 cursor-pointer">
                        Confirmar Seleção →
                      </button>
                    </div>
                  </div>
                )}


                {/* Step 3: Confirm & Connect */}
                {wabaStep === 'confirm' && (
                  <div className="space-y-3">
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                      <p className="font-bold text-slate-800">Resumo da Conexão:</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                        <span className="text-slate-500">WABA ID:</span>
                        <span className="font-mono font-bold text-slate-800 truncate">{wabaId}</span>
                        <span className="text-slate-500">Phone Number ID:</span>
                        <span className="font-mono font-bold text-slate-800 truncate">{phoneNumberId}</span>
                        {selectedPhone && <>
                          <span className="text-slate-500">Número:</span>
                          <span className="font-bold text-emerald-700">{selectedPhone.display_phone_number}</span>
                          <span className="text-slate-500">Nome:</span>
                          <span className="font-bold text-slate-800">{selectedPhone.verified_name}</span>
                        </>}
                        <span className="text-slate-500">Conta:</span>
                        <span className="font-bold text-slate-800 truncate">{selectedWabaAccount?.name || 'Manual'}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button type="button" onClick={() => setWabaStep('accounts')}
                        className="flex-1 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg">
                        ← Voltar
                      </button>
                      <button type="button"
                        disabled={wabaSaving}
                        onClick={() => handleOAuthConnect()}
                        className="flex-1 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-1.5">
                        {wabaSaving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /><span>Conectando...</span></> :
                          <><ShieldCheck className="w-3.5 h-3.5" /><span>Confirmar & Conectar WABA</span></>}
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <button type="button" onClick={() => { setWabaStep('token'); setWabaAccounts([]); setSelectedWabaAccount(null); setSelectedPhone(null); }}
                    className="text-[10px] text-slate-400 hover:text-slate-600 underline">
                    Reiniciar
                  </button>
                  <button type="button" onClick={() => setWabaModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                    Fechar
                  </button>
                </div>
              </div>
            )}

            {wabaTab === 'manual' && (
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
                  <p className="text-[10px] leading-relaxed text-slate-600">
                    O <strong>Verify Token</strong> é um segredo do servidor. Configure o mesmo valor em
                    <code className="mx-1 rounded bg-white px-1 py-0.5 font-mono text-emerald-800">META_VERIFY_TOKEN</code>
                    no runtime e no painel da Meta; ele nunca é exibido nem enviado pelo navegador.
                  </p>
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
            )}
          </div>
        </div>
      )}
    </div>
  );
};
