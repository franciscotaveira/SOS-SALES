import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Layers,
  Sparkles,
  Copy,
  Check,
  Globe,
  Radio,
  Sliders
} from 'lucide-react';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';

interface EmbeddedSignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace;
  onSuccess: (data: { wabaId: string; phoneNumberId: string; verifiedPhone?: string }) => void;
  canManage?: boolean;
}

export const EmbeddedSignupModal: React.FC<EmbeddedSignupModalProps> = ({
  isOpen,
  onClose,
  workspace,
  onSuccess,
  canManage = true,
}) => {
  const [appId, setAppId] = useState('');
  const [configId, setConfigId] = useState('');
  const [useHybridApp, setUseHybridApp] = useState(true);
  const [connectionMode, setConnectionMode] = useState<'embedded' | 'manual'>('embedded');
  const [manualWabaId, setManualWabaId] = useState('');
  const [manualPhoneNumberId, setManualPhoneNumberId] = useState('');
  const [manualAccessToken, setManualAccessToken] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'authorizing' | 'exchanging' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectedDetails, setConnectedDetails] = useState<{
    wabaId?: string;
    phoneNumberId?: string;
    verifiedName?: string;
    phone?: string;
  } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const exchangeInFlightRef = useRef(false);
  const signupListenerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Meta uses one signed webhook endpoint for the app. Tenant ownership is
  // resolved server-side from the phone_number_id in each event.
  const webhookCallbackUrl = `${window.location.origin}/api/v1/channels/waba/webhook`;

  const cleanupSignup = () => {
    if (signupListenerRef.current) {
      window.removeEventListener('message', signupListenerRef.current);
      signupListenerRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  useEffect(() => () => cleanupSignup(), []);

  const applyConnectedResult = (data: any) => {
    setConnectionStatus('success');
    setIsConnecting(false);
    setConnectedDetails({
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
      verifiedName: data.verifiedName,
      phone: data.verifiedPhone,
    });
    onSuccess({
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
      verifiedPhone: data.verifiedPhone,
    });
  };

  // Load Facebook SDK
  useEffect(() => {
    if (!isOpen) return;

    if (!(window as any).FB) {
      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.async = true;
      script.defer = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        try {
          (window as any).FB.init({
            appId: appId || undefined,
            cookie: true,
            xfbml: true,
            version: 'v23.0',
          });
        } catch (e) {
          console.warn('FB.init error:', e);
        }
      };
      document.body.appendChild(script);
    }
  }, [isOpen, appId]);

  const handleLaunchEmbeddedSignup = () => {
    if (!canManage) {
      setErrorMessage('Somente o proprietário do workspace pode alterar a conexão oficial.');
      return;
    }
    if (!appId.trim() || !configId.trim()) {
      setConnectionStatus('error');
      setErrorMessage('Informe o Meta App ID e o Login Config ID antes de iniciar o Embedded Signup.');
      return;
    }
    cleanupSignup();
    exchangeInFlightRef.current = false;
    setIsConnecting(true);
    setConnectionStatus('authorizing');
    setErrorMessage(null);

    // Fallback: If FB SDK is blocked by ad-blocker or iframe policy, provide interactive manual fallback
    if (!(window as any).FB) {
      setTimeout(() => {
        setIsConnecting(false);
        setConnectionStatus('idle');
        setErrorMessage('O Facebook SDK não pôde ser carregado no navegador (possível bloqueador de anúncios/pop-up). Você também pode inserir o Access Token e Phone ID diretamente.');
      }, 1500);
      return;
    }

    try {
      (window as any).FB.login(
        (response: any) => {
          if (response.authResponse?.code || response.authResponse?.accessToken) {
            setConnectionStatus('exchanging');
            const code = response.authResponse.code;
            const accessToken = response.authResponse.accessToken;

            // Escuta os eventos da janela popup do WhatsApp Embedded Signup.
            const handleMessage = async (event: MessageEvent) => {
              if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
              try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data.type === 'WA_EMBEDDED_SIGNUP') {
                  const { waba_id, phone_number_id } = data.data || {};
                  if (exchangeInFlightRef.current) return;
                  exchangeInFlightRef.current = true;
                  cleanupSignup();
                  await sendExchangeToBackend({
                    code,
                    accessToken,
                    wabaId: waba_id,
                    phoneNumberId: phone_number_id,
                    appId,
                  });
                }
              } catch (e) {}
            };

            signupListenerRef.current = handleMessage;
            window.addEventListener('message', handleMessage);

            // Se o evento de signup não chegar, tenta concluir com o código e
            // token entregues pelo Login. O ref evita duas gravações quando o
            // popup envia o evento quase ao mesmo tempo.
            fallbackTimerRef.current = setTimeout(async () => {
              if (!exchangeInFlightRef.current) {
                exchangeInFlightRef.current = true;
                cleanupSignup();
                await sendExchangeToBackend({
                  code,
                  accessToken,
                  appId,
                });
              }
            }, 5000);
          } else {
            setIsConnecting(false);
            setConnectionStatus('idle');
            if (response.status !== 'connected') {
              setErrorMessage('Autorização cancelada ou recusada pelo usuário.');
            }
          }
        },
        {
          config_id: configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            featureType: 'whatsapp_business_app_onboarding',
            sessionInfoVersion: '3',
            features: useHybridApp ? [{ name: 'marketing_messages_lite' }] : [],
            version: 'v4', // Meta Embedded Signup v4 (Definitivo)
          },
        }
      );
    } catch (err: any) {
      setIsConnecting(false);
      setConnectionStatus('error');
      setErrorMessage(err.message || 'Erro ao iniciar o Facebook Login.');
    }
  };

  const handleManualConnect = async (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (!canManage) {
      setErrorMessage('Somente o proprietário do workspace pode alterar a conexão oficial.');
      return;
    }
    const wabaId = manualWabaId.trim();
    const phoneNumberId = manualPhoneNumberId.trim();
    const accessToken = manualAccessToken.trim();
    if (!wabaId || !phoneNumberId || !accessToken) {
      setConnectionStatus('error');
      setErrorMessage('Informe WABA ID, Phone Number ID e Access Token para validar a conexão.');
      return;
    }

    setIsConnecting(true);
    setConnectionStatus('exchanging');
    setErrorMessage(null);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wabaId, phoneNumberId, accessToken }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) {
        throw new Error(data?.error || `Falha ao validar a conexão (HTTP ${response.status}).`);
      }
      applyConnectedResult(data);
    } catch (error) {
      setIsConnecting(false);
      setConnectionStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Falha na comunicação com o backend SOS Sales.');
    }
  };

  const sendExchangeToBackend = async (payload: any) => {
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/oauth-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erro ao validar conexão no servidor');
      }

      applyConnectedResult(data);
    } catch (err: any) {
      setIsConnecting(false);
      setConnectionStatus('error');
      setErrorMessage(err.message || 'Falha na comunicação com o backend SOS-SALES');
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2500);
    } catch {
      setErrorMessage('Não foi possível copiar a URL. Selecione o endereço manualmente.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#00a884] to-emerald-400 text-white flex items-center justify-center shadow-md">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-950 font-heading">
                  Conectar WhatsApp Oficial da Meta
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Cloud API Oficial
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Escolha o Embedded Signup ou valide manualmente as credenciais do seu número WABA.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Canal oficial</span>
            </div>
            <p className="text-[11px] text-emerald-700 leading-tight">
              A conexão usa a API oficial da Meta; qualidade e limites continuam sujeitos às políticas da Meta.
            </p>
          </div>

          <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-blue-800 font-bold text-xs">
              <Radio className="w-3.5 h-3.5 text-blue-600" />
              <span>Opção da Meta</span>
            </div>
            <p className="text-[11px] text-blue-700 leading-tight">
              Você pode solicitar Marketing Messages Lite; a disponibilidade depende da elegibilidade da conta.
            </p>
          </div>

          <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-purple-800 font-bold text-xs">
              <Layers className="w-3.5 h-3.5 text-purple-600" />
              <span>Ads Insights & CAPI</span>
            </div>
            <p className="text-[11px] text-purple-700 leading-tight">
              O rastreamento de campanhas é uma configuração separada e exige as permissões aprovadas no Meta.
            </p>
          </div>
        </div>

        {/* Status Messages */}
        {!canManage && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
            Somente o proprietário do workspace pode alterar a conexão oficial. Você pode consultar o estado atual, mas não publicar credenciais.
          </div>
        )}

        {connectionStatus === 'success' && connectedDetails && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>WhatsApp Oficial Conectado com Sucesso!</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <span className="text-emerald-700/80 block">Nome Verificado:</span>
                <span className="font-bold text-slate-900">{connectedDetails.verifiedName || 'WhatsApp Business'}</span>
              </div>
              <div>
                <span className="text-emerald-700/80 block">Telefone:</span>
                <span className="font-bold text-slate-900">{connectedDetails.phone || 'Ativo'}</span>
              </div>
              <div>
                <span className="text-emerald-700/80 block">WABA ID:</span>
                <span className="font-mono text-slate-800">{connectedDetails.wabaId}</span>
              </div>
              <div>
                <span className="text-emerald-700/80 block">Phone Number ID:</span>
                <span className="font-mono text-slate-800">{connectedDetails.phoneNumberId}</span>
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Atenção na Conexão:</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Configuration Options */}
        <div className="space-y-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              Método de conexão
            </span>
            <div className="flex items-center gap-1 rounded-lg bg-white p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => { setConnectionMode('embedded'); setErrorMessage(null); }}
                className={`rounded-md px-2 py-1 text-[10px] font-bold ${connectionMode === 'embedded' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Embedded Signup
              </button>
              <button
                type="button"
                onClick={() => { setConnectionMode('manual'); setErrorMessage(null); }}
                className={`rounded-md px-2 py-1 text-[10px] font-bold ${connectionMode === 'manual' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Configuração manual
              </button>
            </div>
          </div>

          {connectionMode === 'embedded' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Meta App ID:
                  </label>
                  <input
                    type="text"
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500"
                    placeholder="ID público do app Meta"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Login Config ID (Meta App Dashboard):
                  </label>
                  <input
                    type="text"
                    value={configId}
                    onChange={(e) => setConfigId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500"
                    placeholder="ID da configuração Embedded Signup"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-800 block text-xs">
                    Solicitar Marketing Messages Lite
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Envia a opção à Meta; a disponibilidade depende da configuração e elegibilidade do número.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setUseHybridApp(!useHybridApp)}
                  aria-pressed={useHybridApp}
                  className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                    useHybridApp ? 'bg-[#00a884]' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                      useHybridApp ? 'left-6' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-600">Use um token com a permissão <code>whatsapp_business_messaging</code>. O backend valida o token e o Phone Number ID na Meta antes de salvar.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-[11px] font-semibold text-slate-600">WABA ID
                  <input type="text" value={manualWabaId} onChange={(e) => setManualWabaId(e.target.value)} placeholder="ID numérico da conta WhatsApp Business" className="mt-1 w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500" />
                </label>
                <label className="block text-[11px] font-semibold text-slate-600">Phone Number ID
                  <input type="text" value={manualPhoneNumberId} onChange={(e) => setManualPhoneNumberId(e.target.value)} placeholder="ID numérico do telefone WABA" className="mt-1 w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500" />
                </label>
              </div>
              <label className="block text-[11px] font-semibold text-slate-600">Access Token
                <input type="password" value={manualAccessToken} onChange={(e) => setManualAccessToken(e.target.value)} placeholder="Token Meta (não será exibido novamente)" autoComplete="off" className="mt-1 w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-emerald-500" />
              </label>
            </div>
          )}
        </div>


        {/* Webhook Callback Info (For Meta Developer App) */}
        <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-slate-600">
            <span className="font-semibold text-[11px] flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              URL de Webhook da aplicação Meta:
            </span>
            <button
              onClick={() => copyToClipboard(webhookCallbackUrl)}
              className="text-[10.5px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
            >
              {copiedWebhook ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              {copiedWebhook ? 'Copiado!' : 'Copiar URL'}
            </button>
          </div>
          <div className="font-mono text-[11px] text-slate-700 bg-slate-50 p-2 rounded-lg break-all border border-slate-100 select-all">
            {webhookCallbackUrl}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
          >
            Fechar
          </button>

          <button
            onClick={connectionMode === 'embedded' ? handleLaunchEmbeddedSignup : (event) => void handleManualConnect(event)}
            disabled={isConnecting || !canManage}
            className="px-6 py-2.5 bg-gradient-to-r from-[#00a884] to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isConnecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>
                  {connectionStatus === 'authorizing'
                    ? 'Aguardando Meta Login...'
                    : 'Registrando WABA...'}
                </span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 text-white" />
                <span>{connectionMode === 'embedded' ? 'Conectar com Facebook' : 'Validar e salvar WABA'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
