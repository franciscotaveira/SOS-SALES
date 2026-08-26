import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Phone,
  Layers,
  Sparkles,
  HelpCircle,
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
}

export const EmbeddedSignupModal: React.FC<EmbeddedSignupModalProps> = ({
  isOpen,
  onClose,
  workspace,
  onSuccess,
}) => {
  const [appId, setAppId] = useState('');
  const [configId, setConfigId] = useState('');
  const [useHybridApp, setUseHybridApp] = useState(true);
  const [enableLocalStorageBR, setEnableLocalStorageBR] = useState(true);
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

  const webhookCallbackUrl = `${window.location.origin}/api/v1/workspaces/${workspace.id}/channels/whatsapp/webhook`;

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

            // Escuta os eventos da janela popup do WhatsApp Embedded Signup
            const handleMessage = async (event: MessageEvent) => {
              if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
              try {
                const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (data.type === 'WA_EMBEDDED_SIGNUP') {
                  const { waba_id, phone_number_id } = data.data || {};
                  
                  // Chama o backend para registrar permanentemente
                  await sendExchangeToBackend({
                    code,
                    accessToken,
                    wabaId: waba_id,
                    phoneNumberId: phone_number_id,
                    appId,
                  });
                  window.removeEventListener('message', handleMessage);
                }
              } catch (e) {}
            };

            window.addEventListener('message', handleMessage);

            // Se a mensagem demorar, tenta com o que tiver
            setTimeout(async () => {
              if (connectionStatus === 'exchanging') {
                await sendExchangeToBackend({
                  code,
                  accessToken,
                  appId,
                });
              }
            }, 3000);
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

  const sendExchangeToBackend = async (payload: any) => {
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/channels/waba/oauth-connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          dataLocalizationRegion: enableLocalStorageBR ? 'BR' : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Erro ao validar conexão no servidor');
      }

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
    } catch (err: any) {
      setIsConnecting(false);
      setConnectionStatus('error');
      setErrorMessage(err.message || 'Falha na comunicação com o backend SOS-SALES');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
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
                  Meta WhatsApp Embedded Signup v4
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Cloud API Oficial
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Onboarding em 1-clique oficial da Meta com suporte a Marketing Messages & Modo Híbrido.
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
              <span>Zero Risco de Bloqueio</span>
            </div>
            <p className="text-[11px] text-emerald-700 leading-tight">
              Conexão com a infraestrutura oficial da Meta Graph API v23.0.
            </p>
          </div>

          <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-blue-800 font-bold text-xs">
              <Radio className="w-3.5 h-3.5 text-blue-600" />
              <span>Modo Híbrido (App + API)</span>
            </div>
            <p className="text-[11px] text-blue-700 leading-tight">
              Continue usando o app no seu celular físico enquanto o SOS-SALES roda.
            </p>
          </div>

          <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-purple-800 font-bold text-xs">
              <Layers className="w-3.5 h-3.5 text-purple-600" />
              <span>Ads Insights & CAPI</span>
            </div>
            <p className="text-[11px] text-purple-700 leading-tight">
              Atribuição automática de conversão com permissão <code>ads_read</code>.
            </p>
          </div>
        </div>

        {/* Status Messages */}
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
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              Parâmetros do Aplicativo Meta (Solution Partner)
            </span>
            <span className="text-[10.5px] text-slate-500">Versão v4 (Definitiva 2026)</span>
          </div>

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
                placeholder="Ex: 1144078860714777"
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
                placeholder="Ex: 1144078860714777_config"
              />
            </div>
          </div>

          {/* Toggle Hybrid Mode */}
          <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-800 block text-xs">
                Modo Híbrido (Marketing Messages Lite)
              </span>
              <span className="text-[11px] text-slate-500">
                Permite ao cliente manter o aplicativo WhatsApp Business no smartphone físico.
              </span>
            </div>

            <button
              type="button"
              onClick={() => setUseHybridApp(!useHybridApp)}
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

          {/* Toggle Local Storage LGPD Brasil */}
          <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                <span>Armazenamento Local LGPD (Brasil - Região BR)</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Data at Rest: BR
                </span>
              </span>
              <span className="text-[11px] text-slate-500">
                Armazena mensagens e mídias em repouso exclusivamente em data centers no Brasil para conformidade regulatória.
              </span>
            </div>

            <button
              type="button"
              onClick={() => setEnableLocalStorageBR(!enableLocalStorageBR)}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                enableLocalStorageBR ? 'bg-[#00a884]' : 'bg-slate-300'
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                  enableLocalStorageBR ? 'left-6' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>


        {/* Webhook Callback Info (For Meta Developer App) */}
        <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 text-xs">
          <div className="flex items-center justify-between text-slate-600">
            <span className="font-semibold text-[11px] flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              URL de Webhook do Workspace:
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
            onClick={handleLaunchEmbeddedSignup}
            disabled={isConnecting}
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
                <span>Conectar com Facebook (Embedded Signup v4)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
