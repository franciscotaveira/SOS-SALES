import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  MapPin,
  ShoppingBag,
  Layers,
  Sparkles,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  PhoneCall,
  Phone,
  LayoutGrid,
  Images,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Smartphone,
  Eye,
  ChevronRight
} from 'lucide-react';
import { Journey, Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';

interface WabaActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  journey?: any;
  workspaceId: string;
  recipientPhone?: string;
  contactPhone?: string;
  contactName?: string;
  onSuccess?: (msg: string) => void;
  onSuccessNotification?: (msg: string) => void;
  onError?: (err: string) => void;
  onQueueWabaAction?: (payload: Record<string, unknown>) => Promise<void>;
}

type WabaActionTab = 'flow' | 'pix' | 'buttons' | 'location' | 'product' | 'carousel' | 'call';

const SAFE_WABA_CAPABILITIES: Record<WabaActionTab, boolean> = {
  flow: false,
  pix: false,
  buttons: false,
  location: false,
  product: false,
  carousel: false,
  call: false,
};

function ActionPresetChips({
  presets,
}: {
  presets: Array<{ label: string; icon?: string; onClick: () => void }>;
}) {
  return (
    <div className="p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-1.5 shadow-3xs">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-500" /> Templates Prontos de Validação (1-Clique):
        </span>
        <span className="text-[9px] text-slate-400 font-medium">Preenchimento instantâneo</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={p.onClick}
            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg text-[10.5px] font-bold transition flex items-center gap-1 shadow-3xs cursor-pointer active:scale-95"
          >
            {p.icon && <span>{p.icon}</span>}
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export const WabaActionsModal: React.FC<WabaActionsModalProps> = ({
  isOpen,
  onClose,
  journey,
  workspaceId,
  recipientPhone,
  contactPhone,
  contactName,
  onSuccess,
  onSuccessNotification,
  onError,
  onQueueWabaAction,
}) => {
  const activePhone =
    recipientPhone ||
    contactPhone ||
    journey?.contact?.phone ||
    journey?.leadPhone ||
    '';

  const displayName =
    contactName ||
    journey?.contact?.name ||
    journey?.leadName ||
    activePhone ||
    'Cliente';

  const [activeTab, setActiveTab] = useState<WabaActionTab>('flow');
  const [capabilities, setCapabilities] = useState<Record<WabaActionTab, boolean>>(SAFE_WABA_CAPABILITIES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // WABA Channel Connection State
  const [wabaConnected, setWabaConnected] = useState<boolean | null>(null);
  const [wabaPhone, setWabaPhone] = useState<string>('');
  const [wabaName, setWabaName] = useState<string>('');
  const [wabaChecking, setWabaChecking] = useState<boolean>(true);

  // Form State: Pix
  const [pixTitle, setPixTitle] = useState('');
  const [pixAmount, setPixAmount] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixBodyText, setPixBodyText] = useState('');

  // Form State: Location Request
  const [locationBodyText, setLocationBodyText] = useState(
    'Para verificarmos a unidade mais próxima e a melhor rota para você, por favor toque no botão abaixo para compartilhar sua localização:'
  );

  // Form State: Product / Catalog
  const [productMode, setProductMode] = useState<'single' | 'multi'>('single');
  const [catalogId, setCatalogId] = useState('');
  const [productRetailerId, setProductRetailerId] = useState('');
  const [productBodyText, setProductBodyText] = useState('');

  // Form State: WhatsApp Flow (Formulário Nativo)
  const [flowId, setFlowId] = useState('');
  const [flowCta, setFlowCta] = useState('Abrir formulário');
  const [flowBodyText, setFlowBodyText] = useState('Abra o formulário oficial para continuar.');

  // Form State: Buttons / List
  const [buttonBodyText, setButtonBodyText] = useState('Como deseja prosseguir com o seu atendimento hoje?');
  const [btn1, setBtn1] = useState('1. Agendar Horário');
  const [btn2, setBtn2] = useState('2. Ver Valores');
  const [btn3, setBtn3] = useState('3. Falar com Atendente');

  // Form State: Carousel HSM
  const [carouselTemplate, setCarouselTemplate] = useState('');
  const [carouselCard1Text, setCarouselCard1Text] = useState('');
  const [carouselCard1Img, setCarouselCard1Img] = useState('');
  const [carouselCard2Text, setCarouselCard2Text] = useState('');
  const [carouselCard2Img, setCarouselCard2Img] = useState('');

  // Form State: Call CTA Button
  const [callPhoneNumber, setCallPhoneNumber] = useState('');
  const [callButtonLabel, setCallButtonLabel] = useState('Ligar para Especialista');
  const [callBodyText, setCallBodyText] = useState('Prefere tirar dúvidas ao vivo por telefone? Toque no botão abaixo para ligar agora:');

  // Probe WABA channel connection
  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    setWabaChecking(true);

    authenticatedFetch(`/api/v1/workspaces/${workspaceId}/channels/waba/channel-info`)
      .then((res) => {
        if (!res.ok) throw new Error('WABA channel info not found');
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        if (data.configured && (data.verifiedPhone || data.wabaId)) {
          setWabaConnected(true);
          setWabaPhone(data.verifiedPhone || '');
          setWabaName(data.verifiedName || 'Conta WABA Oficial');
        } else {
          setWabaConnected(false);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setWabaConnected(false);
      })
      .finally(() => {
        if (mounted) setWabaChecking(false);
      });

    authenticatedFetch(`/api/v1/workspaces/${workspaceId}/channels/waba/capabilities`)
      .then((res) => {
        if (!res.ok) throw new Error('WABA capabilities unavailable');
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        const available = data?.capabilities || {};
        setCapabilities({
          flow: onQueueWabaAction !== undefined && available.flow === true,
          buttons: onQueueWabaAction !== undefined && available.buttons === true,
          call: false,
          pix: false,
          location: false,
          product: false,
          carousel: false,
        });
      })
      .catch(() => {
        if (mounted) setCapabilities(SAFE_WABA_CAPABILITIES);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, workspaceId, onQueueWabaAction]);

  useEffect(() => {
    if (!capabilities[activeTab]) {
      const firstSupported = (Object.keys(capabilities) as WabaActionTab[]).find((tab) => capabilities[tab]);
      if (firstSupported) setActiveTab(firstSupported);
    }
  }, [activeTab, capabilities]);

  if (!isOpen) return null;

  const handleSendPix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wabaConnected) {
      setFeedback({ success: false, message: 'WABA não conectado. Conecte o canal oficial da Meta em Configurações > Canais para disparar cobranças Pix nativas.' });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const amountMinor = Math.round(parseFloat(pixAmount || '0') * 100);
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/channels/waba/send-order-details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: activePhone,
          referenceId: `ref_pix_${journey?.id || 'waba'}_${Date.now()}`,
          itemTitle: pixTitle,
          amountMinor,
          paymentType: 'pix_dynamic_code',
          pixKey,
          bodyText: pixBodyText,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao enviar Pix nativo');

      setFeedback({ success: true, message: 'Cobrança Pix oficial enviada com sucesso no WhatsApp!' });
      onSuccessNotification?.('Cobrança Pix nativa enviada!');
      onSuccess?.(`Cobrança Pix de R$ ${(amountMinor / 100).toFixed(2)} enviada`);
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setFeedback({ success: false, message: err.message });
      onError?.(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wabaConnected) {
      setFeedback({ success: false, message: 'WABA não conectado. Conecte o canal oficial da Meta para disparar solicitações de GPS.' });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/channels/waba/send-location-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: activePhone,
          bodyText: locationBodyText,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao pedir localização');

      setFeedback({ success: true, message: 'Solicitação de Localização enviada com sucesso!' });
      onSuccessNotification?.('Solicitação de localização enviada!');
      onSuccess?.('Pedido de Localização GPS enviado');
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setFeedback({ success: false, message: err.message });
      onError?.(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wabaConnected) {
      setFeedback({ success: false, message: 'WABA não conectado. Conecte o canal oficial da Meta para enviar itens do catálogo de produtos.' });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const endpoint =
        productMode === 'single'
          ? `/api/v1/workspaces/${workspaceId}/channels/waba/send-product`
          : `/api/v1/workspaces/${workspaceId}/channels/waba/send-multi-product`;

      const payload =
        productMode === 'single'
          ? {
              recipientPhone: activePhone,
              catalogId,
              productRetailerId,
              bodyText: productBodyText,
            }
          : {
              recipientPhone: activePhone,
              catalogId,
              headerText: 'Catálogo de Produtos',
              bodyText: productBodyText,
              sections: [
                {
                  title: 'Destaques',
                  productRetailerIds: [productRetailerId],
                },
              ],
            };

      const res = await authenticatedFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao enviar produto');

      setFeedback({ success: true, message: 'Produto do catálogo enviado com sucesso!' });
      onSuccessNotification?.('Produto do catálogo enviado!');
      onSuccess?.(`Produto ${productRetailerId} enviado`);
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setFeedback({ success: false, message: err.message });
      onError?.(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wabaConnected) {
      setFeedback({
        success: false,
        message: 'Trava de Segurança: O WhatsApp Flow (Formulário Nativo) requer uma conta WABA oficial conectada e um Flow ID publicado no Meta Business Manager. Conecte o WABA em Configurações > Canais.',
      });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      if (!flowId.trim()) throw new Error('Informe o Flow ID publicado no Meta Business Manager.');
      if (!onQueueWabaAction) throw new Error('Este fluxo precisa ser aberto dentro de uma conversa supervisionada.');
      await onQueueWabaAction({ messageKind: 'WABA_FLOW', flowId, flowCta, bodyText: flowBodyText });

      setFeedback({ success: true, message: 'Flow aprovado. Aguardando aceite da Meta.' });
      onSuccessNotification?.('Flow aprovado; aguardando aceite da Meta.');
      onSuccess?.(`Flow ${flowId} aprovado`);
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setFeedback({ success: false, message: err.message });
      onError?.(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendButtons = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wabaConnected) {
      setFeedback({ success: false, message: 'WABA não conectado. Conecte o canal oficial da Meta para enviar botões interativos.' });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const buttonsList = [
        { id: 'btn_opt_1', title: btn1 },
        { id: 'btn_opt_2', title: btn2 },
      ];
      if (btn3.trim()) {
        buttonsList.push({ id: 'btn_opt_3', title: btn3.trim() });
      }

      if (!onQueueWabaAction) throw new Error('Este fluxo precisa ser aberto dentro de uma conversa supervisionada.');
      await onQueueWabaAction({ messageKind: 'WABA_BUTTONS', bodyText: buttonBodyText, buttons: buttonsList });

      setFeedback({ success: true, message: 'Botões aprovados. Aguardando aceite da Meta.' });
      onSuccessNotification?.('Botões aprovados; aguardando aceite da Meta.');
      onSuccess?.('Botões de resposta rápida aprovados');
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setFeedback({ success: false, message: err.message });
      onError?.(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendCarousel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wabaConnected) {
      setFeedback({ success: false, message: 'WABA não conectado. Conecte o canal oficial da Meta para enviar carrosséis HSM.' });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/channels/waba/send-carousel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: activePhone,
          templateName: carouselTemplate,
          cards: [
            {
              cardIndex: 0,
              components: [
                { type: 'HEADER', parameters: [{ type: 'IMAGE', image: { link: carouselCard1Img } }] },
                { type: 'BODY', parameters: [{ type: 'TEXT', text: carouselCard1Text }] },
              ],
            },
            {
              cardIndex: 1,
              components: [
                { type: 'HEADER', parameters: [{ type: 'IMAGE', image: { link: carouselCard2Img } }] },
                { type: 'BODY', parameters: [{ type: 'TEXT', text: carouselCard2Text }] },
              ],
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao disparar carrossel HSM');

      setFeedback({ success: true, message: 'Carrossel disparado com sucesso!' });
      onSuccessNotification?.('Carrossel de mídia enviado!');
      onSuccess?.(`Carrossel ${carouselTemplate} enviado`);
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setFeedback({ success: false, message: err.message });
      onError?.(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendCallButton = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wabaConnected) {
      setFeedback({ success: false, message: 'WABA não conectado. Conecte o canal oficial da Meta para enviar botões de chamada.' });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspaceId}/channels/waba/send-buttons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientPhone: activePhone,
          bodyText: callBodyText,
          buttons: [{ id: 'call_now', title: callButtonLabel }],
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao enviar convite de chamada');

      setFeedback({ success: true, message: 'Convite de chamada enviado no WhatsApp!' });
      onSuccessNotification?.('Convite de chamada enviado!');
      onSuccess?.('Convite de ligação enviado');
      setTimeout(onClose, 1500);
    } catch (err: any) {
      setFeedback({ success: false, message: err.message });
      onError?.(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyTextFallback = (text: string) => {
    navigator.clipboard.writeText(text);
    setFeedback({ success: true, message: 'Texto copiado para a área de transferência! Cole no chat do WhatsApp Web.' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header com Status do Canal WABA */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-slate-900 font-heading">
                  Arsenal Interativo WABA (Meta Cloud API)
                </h3>
                {wabaChecking ? (
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Verificando WABA...
                  </span>
                ) : wabaConnected ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" /> WABA Conectado ({wabaPhone || wabaName})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-amber-600" /> WhatsApp Web (WAHA) Ativo • WABA Não Conectado
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Disparo estruturado para <span className="font-bold text-slate-800">{displayName}</span> ({activePhone})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Trava / Alerta quando WABA não está conectado */}
        {!wabaChecking && !wabaConnected && (
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-950 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Atenção:</strong> WhatsApp Flows (Formulários Nativos), Catálogo e Botões Interativos exigem uma conta <strong>WABA Oficial da Meta</strong> vinculada com token ativo.
              </span>
            </div>
            <a
              href="#canais"
              onClick={(e) => {
                e.preventDefault();
                onClose();
                window.location.hash = '#settings';
              }}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[10.5px] shrink-0 transition flex items-center gap-1 shadow-2xs"
            >
              <span>Conectar WABA</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Tab Selection */}
        <div className="grid grid-cols-7 gap-1 p-2 bg-slate-100 border-b border-slate-200 text-center shrink-0">
          <button
            type="button"
            disabled={!capabilities.flow}
            onClick={() => setActiveTab('flow')}
            className={`py-1.5 text-xs font-bold rounded-xl transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'flow' ? 'bg-white text-amber-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 text-amber-600" />
            <span>📋 Flows (Form)</span>
          </button>
          <button
            type="button"
            disabled={!capabilities.pix}
            onClick={() => setActiveTab('pix')}
            className={`py-1.5 text-xs font-bold rounded-xl transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'pix' ? 'bg-white text-emerald-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>💰 Pix {!capabilities.pix && '(indisp.)'}</span>
          </button>
          <button
            type="button"
            disabled={!capabilities.buttons}
            onClick={() => setActiveTab('buttons')}
            className={`py-1.5 text-xs font-bold rounded-xl transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'buttons' ? 'bg-white text-indigo-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-4 h-4 text-indigo-600" />
            <span>🔘 Botões</span>
          </button>
          <button
            type="button"
            disabled={!capabilities.location}
            onClick={() => setActiveTab('location')}
            className={`py-1.5 text-xs font-bold rounded-xl transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'location' ? 'bg-white text-blue-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-4 h-4 text-blue-600" />
            <span>📍 GPS {!capabilities.location && '(indisp.)'}</span>
          </button>
          <button
            type="button"
            disabled={!capabilities.product}
            onClick={() => setActiveTab('product')}
            className={`py-1.5 text-xs font-bold rounded-xl transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'product' ? 'bg-white text-purple-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-purple-600" />
            <span>🛍️ Catálogo {!capabilities.product && '(indisp.)'}</span>
          </button>
          <button
            type="button"
            disabled={!capabilities.carousel}
            onClick={() => setActiveTab('carousel')}
            className={`py-1.5 text-xs font-bold rounded-xl transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'carousel' ? 'bg-white text-pink-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Images className="w-4 h-4 text-pink-600" />
            <span>🖼️ Carrossel {!capabilities.carousel && '(indisp.)'}</span>
          </button>
          <button
            type="button"
            disabled={!capabilities.call}
            onClick={() => setActiveTab('call')}
            className={`py-1.5 text-xs font-bold rounded-xl transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
              activeTab === 'call' ? 'bg-white text-emerald-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PhoneCall className="w-4 h-4 text-emerald-600" />
            <span>📞 Ligação</span>
          </button>
        </div>

        {feedback && (
          <div
            className={`m-3 p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs shrink-0 ${
              feedback.success
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                : 'bg-rose-50 text-rose-900 border border-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-700 p-0.5"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* 2-Column Responsive Body: Form (Left) + Live Mobile WhatsApp Preview (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] flex-1 min-h-0 overflow-y-auto divide-y md:divide-y-0 md:divide-x divide-slate-200">
          {/* Coluna Esquerda: Formulário de Configuração */}
          <div className="p-4 overflow-y-auto space-y-3">
            {/* Tab 1: WhatsApp Flow */}
            {activeTab === 'flow' && (
              <form onSubmit={handleSendFlow} className="space-y-3 text-xs">
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950">
                    <Layers className="w-4 h-4 text-amber-600" />
                    <span>Como funciona o WhatsApp Flow (Formulário Nativo)?</span>
                  </div>
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    O WhatsApp Flow abre uma tela de formulário interativo <strong>dentro do próprio WhatsApp</strong> do cliente (sem abrir navegador externo). O cliente preenche o dia, horário ou dados de agendamento e o resultado cai instantaneamente aqui no CRM.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-700">
                  Informe o ID exato de um Flow publicado. O SOS Sales não cria nem presume formulários, serviços ou horários.
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">ID do Flow (Meta Business)</label>
                    <input
                      type="text"
                      value={flowId}
                      onChange={(e) => setFlowId(e.target.value)}
                      placeholder="ex: 1234567890_agendamento"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">Texto do Botão (CTA)</label>
                    <input
                      type="text"
                      value={flowCta}
                      onChange={(e) => setFlowCta(e.target.value)}
                      placeholder="ex: Agendar Horário"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-800 block mb-1">Mensagem de Apresentação</label>
                  <textarea
                    rows={3}
                    value={flowBodyText}
                    onChange={(e) => setFlowBodyText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none"
                    required
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => handleCopyTextFallback(flowBodyText)}
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 p-1 hover:bg-slate-100 rounded-lg transition"
                    title="Copiar texto para enviar via WhatsApp Web"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copiar Texto
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !wabaConnected}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                        isSubmitting || !wabaConnected
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Disparando...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>{wabaConnected ? 'Disparar WhatsApp Flow Oficial' : 'Bloqueado (Requer WABA)'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Tab 2: Pix Dinâmico */}
            {activeTab === 'pix' && (
              <form onSubmit={handleSendPix} className="space-y-3 text-xs">
                <p className="text-slate-600 text-xs">
                  Gera um cartão nativo oficial da Meta com botão interativo <strong>"Pagar com Pix"</strong> e cópia de chave no padrão Banco Central.
                </p>

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                  Preencha somente dados de cobrança confirmados para este cliente. O SOS Sales não sugere valores, chaves ou condições financeiras.
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">Título do Serviço / Item</label>
                    <input
                      type="text"
                      value={pixTitle}
                      onChange={(e) => setPixTitle(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">Valor do Sinal (R$)</label>
                    <input
                      type="text"
                      value={pixAmount}
                      onChange={(e) => setPixAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Chave Pix Favorecida</label>
                  <input
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Mensagem de Cobrança</label>
                  <textarea
                    rows={2}
                    value={pixBodyText}
                    onChange={(e) => setPixBodyText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => handleCopyTextFallback(`${pixBodyText}\n\n*${pixTitle}*\nValor: R$ ${pixAmount}\nChave Pix: ${pixKey}`)}
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 p-1 hover:bg-slate-100 rounded-lg transition"
                    title="Copiar mensagem Pix para WhatsApp Web"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copiar Pix
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !wabaConnected}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                        isSubmitting || !wabaConnected
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Enviando...</span>
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{wabaConnected ? 'Enviar Cobrança Pix Oficial' : 'Bloqueado (Requer WABA)'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Tab 3: Botões Interativos */}
            {activeTab === 'buttons' && (
              <form onSubmit={handleSendButtons} className="space-y-3 text-xs">
                <p className="text-slate-600 text-xs">
                  Envia até 3 botões interativos de resposta rápida para guiar o próximo passo do lead em 1 toque.
                </p>

                <ActionPresetChips
                  presets={[
                    {
                      label: 'Decisão de Compra',
                      icon: '🛒',
                      onClick: () => {
                        setButtonBodyText('Como prefere dar continuidade ao seu atendimento hoje?');
                        setBtn1('1. Quero Contratar');
                        setBtn2('2. Ver Detalhes');
                        setBtn3('3. Falar com Atendente');
                      },
                    },
                    {
                      label: 'Confirmação de Presença',
                      icon: '📅',
                      onClick: () => {
                        setButtonBodyText('Você gostaria de confirmar, reagendar ou cancelar o compromisso já registrado no atendimento?');
                        setBtn1('1. Confirmar Presença');
                        setBtn2('2. Reagendar Horário');
                        setBtn3('3. Cancelar');
                      },
                    },
                    {
                      label: 'Próximo Passo',
                      icon: '⚡',
                      onClick: () => {
                        setButtonBodyText('Como prefere continuar este atendimento?');
                        setBtn1('1. Quero Continuar');
                        setBtn2('2. Ver Condições');
                        setBtn3('3. Tirar Dúvidas');
                      },
                    },
                  ]}
                />
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Texto da Mensagem</label>
                  <textarea
                    rows={2}
                    value={buttonBodyText}
                    onChange={(e) => setButtonBodyText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-bold text-slate-800 block">Opções dos Botões (máx. 20 caracteres)</label>
                  <input
                    type="text"
                    value={btn1}
                    maxLength={20}
                    onChange={(e) => setBtn1(e.target.value)}
                    placeholder="Botão 1"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                    required
                  />
                  <input
                    type="text"
                    value={btn2}
                    maxLength={20}
                    onChange={(e) => setBtn2(e.target.value)}
                    placeholder="Botão 2"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                    required
                  />
                  <input
                    type="text"
                    value={btn3}
                    maxLength={20}
                    onChange={(e) => setBtn3(e.target.value)}
                    placeholder="Botão 3 (Opcional)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => handleCopyTextFallback(`${buttonBodyText}\n\n1. ${btn1}\n2. ${btn2}${btn3 ? `\n3. ${btn3}` : ''}`)}
                    className="text-xs text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1 p-1 hover:bg-slate-100 rounded-lg transition"
                    title="Copiar texto com opções numeradas para WhatsApp Web"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copiar Opções
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !wabaConnected}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                        isSubmitting || !wabaConnected
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Enviando...</span>
                        </>
                      ) : (
                        <>
                          <LayoutGrid className="w-3.5 h-3.5" />
                          <span>{wabaConnected ? 'Enviar Botões Oficiais' : 'Bloqueado (Requer WABA)'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Tab 4: Location Request */}
            {activeTab === 'location' && (
              <form onSubmit={handleSendLocation} className="space-y-3 text-xs">
                <p className="text-slate-600 text-xs">
                  Envia um botão nativo oficial que permite ao cliente compartilhar a localização do celular com apenas 1 toque.
                </p>

                <ActionPresetChips
                  presets={[
                    {
                      label: 'Unidade Mais Próxima',
                      icon: '📍',
                      onClick: () => {
                        setLocationBodyText('Para indicarmos a unidade mais próxima de você e calcularmos a melhor rota, por favor compartilhe sua localização tocando no botão abaixo:');
                      },
                    },
                    {
                      label: 'Cálculo de Frete & Entrega',
                      icon: '🚚',
                      onClick: () => {
                        setLocationBodyText('Para calcularmos a taxa de entrega e o prazo exato para seu endereço, envie sua localização em 1 toque:');
                      },
                    },
                  ]}
                />
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Mensagem de Solicitação</label>
                  <textarea
                    rows={3}
                    value={locationBodyText}
                    onChange={(e) => setLocationBodyText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 resize-none"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !wabaConnected}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                      isSubmitting || !wabaConnected
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{wabaConnected ? 'Pedir Localização GPS' : 'Bloqueado (Requer WABA)'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Tab 5: Catalog Product */}
            {activeTab === 'product' && (
              <form onSubmit={handleSendProduct} className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <p className="text-slate-600 text-xs">Envia card oficial de produto integrado ao Meta Catalog.</p>
                  <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg text-[10.5px]">
                    <button
                      type="button"
                      onClick={() => setProductMode('single')}
                      className={`px-2 py-0.5 rounded-md ${productMode === 'single' ? 'bg-white font-bold text-purple-700 shadow-2xs' : 'text-slate-500'}`}
                    >
                      Único
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductMode('multi')}
                      className={`px-2 py-0.5 rounded-md ${productMode === 'multi' ? 'bg-white font-bold text-purple-700 shadow-2xs' : 'text-slate-500'}`}
                    >
                      Multi
                    </button>
                  </div>
                </div>

                <ActionPresetChips
                  presets={[
                    {
                      label: 'Serviço Destaque (Escova VIP)',
                      icon: '📦',
                      onClick: () => {
                        setProductMode('single');
                        setCatalogId('haven_catalog_default');
                        setProductRetailerId('escova_modelada_promo');
                        setProductBodyText('Confira os detalhes, fotos e disponibilidade do nosso procedimento mais procurado:');
                      },
                    },
                    {
                      label: 'Catálogo de Procedimentos (MPM)',
                      icon: '🛍️',
                      onClick: () => {
                        setProductMode('multi');
                        setCatalogId('haven_catalog_default');
                        setProductBodyText('Navegue pelo nosso catálogo com todas as opções de tratamentos e serviços disponíveis:');
                      },
                    },
                  ]}
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">ID do Catálogo (Meta)</label>
                    <input
                      type="text"
                      value={catalogId}
                      onChange={(e) => setCatalogId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-purple-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">ID do Item (Retailer ID)</label>
                    <input
                      type="text"
                      value={productRetailerId}
                      onChange={(e) => setProductRetailerId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-purple-500"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Texto Complementar</label>
                  <textarea
                    rows={2}
                    value={productBodyText}
                    onChange={(e) => setProductBodyText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-purple-500 resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !wabaConnected}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                      isSubmitting || !wabaConnected
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>{wabaConnected ? 'Enviar Card de Produto' : 'Bloqueado (Requer WABA)'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Tab 6: Carousel */}
            {activeTab === 'carousel' && (
              <form onSubmit={handleSendCarousel} className="space-y-3 text-xs">
                <p className="text-slate-600 text-xs">
                  Carrossel com cartões visuais deslizantes para apresentar múltiplos serviços com fotos e botões.
                </p>

                <ActionPresetChips
                  presets={[
                    {
                      label: 'Antes & Depois / Transformações',
                      icon: '🌟',
                      onClick: () => {
                        setCarouselTemplate('catalogo_transformacoes_vip');
                        setCarouselCard1Text('Transformação Capilar VIP');
                        setCarouselCard1Img('https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600');
                        setCarouselCard2Text('Hidratação & Ozônio Profunda');
                        setCarouselCard2Img('https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600');
                      },
                    },
                    {
                      label: 'Combos Promocionais',
                      icon: '🎁',
                      onClick: () => {
                        setCarouselTemplate('combos_especiais_semana');
                        setCarouselCard1Text('Combo 1: Corte + Escova (R$ 99)');
                        setCarouselCard1Img('https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600');
                        setCarouselCard2Text('Combo 2: Tratamento Completo (R$ 179)');
                        setCarouselCard2Img('https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600');
                      },
                    },
                  ]}
                />
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Template HSM Aprovado na Meta</label>
                  <input
                    type="text"
                    value={carouselTemplate}
                    onChange={(e) => setCarouselTemplate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-pink-500"
                    required
                  />
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-900 block text-xs">Card 1:</span>
                  <input
                    type="text"
                    value={carouselCard1Text}
                    onChange={(e) => setCarouselCard1Text(e.target.value)}
                    placeholder="Título do Card 1"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    value={carouselCard1Img}
                    onChange={(e) => setCarouselCard1Img(e.target.value)}
                    placeholder="URL da Imagem do Card 1"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono text-xs"
                  />
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <span className="font-bold text-slate-900 block text-xs">Card 2:</span>
                  <input
                    type="text"
                    value={carouselCard2Text}
                    onChange={(e) => setCarouselCard2Text(e.target.value)}
                    placeholder="Título do Card 2"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                  <input
                    type="text"
                    value={carouselCard2Img}
                    onChange={(e) => setCarouselCard2Img(e.target.value)}
                    placeholder="URL da Imagem do Card 2"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !wabaConnected}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                      isSubmitting || !wabaConnected
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-pink-600 hover:bg-pink-700 text-white cursor-pointer'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Images className="w-3.5 h-3.5" />
                        <span>{wabaConnected ? 'Disparar Carrossel HSM' : 'Bloqueado (Requer WABA)'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Tab 7: Call CTA */}
            {activeTab === 'call' && (
              <form onSubmit={handleSendCallButton} className="space-y-3 text-xs">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-emerald-950 block text-xs">Discar Imediatamente pelo Celular:</span>
                    <span className="font-mono text-emerald-800 text-xs">{activePhone || 'Telefone não disponível'}</span>
                  </div>
                  {activePhone && (
                    <a
                      href={`tel:${activePhone}`}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1 text-xs shadow-2xs transition"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Ligar Agora</span>
                    </a>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-2.5">
                  <ActionPresetChips
                    presets={[
                      {
                        label: 'Ligar para Consultor Comercial',
                        icon: '📞',
                        onClick: () => {
                          setCallButtonLabel('Ligar para Especialista');
                          setCallBodyText('Ficou com alguma dúvida? Toque no botão abaixo para ligar gratuitamente para o nosso consultor agora mesmo:');
                        },
                      },
                      {
                        label: 'Plantão de Atendimento Urgente',
                        icon: '🚨',
                        onClick: () => {
                          setCallButtonLabel('Falar no Plantão');
                          setCallBodyText('Precisa de atendimento urgente? Nossa equipe está disponível no telefone direto:');
                        },
                      },
                    ]}
                  />
                  <span className="font-bold text-slate-800 block text-xs">Ou enviar botão de chamada no WhatsApp do cliente:</span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="font-bold text-slate-800 block mb-1">Número de Destino</label>
                      <input
                        type="text"
                        value={callPhoneNumber}
                        onChange={(e) => setCallPhoneNumber(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-800 block mb-1">Texto do Botão (CTA)</label>
                      <input
                        type="text"
                        value={callButtonLabel}
                        onChange={(e) => setCallButtonLabel(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs outline-none focus:border-emerald-500"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">Mensagem de Convite</label>
                    <textarea
                      rows={2}
                      value={callBodyText}
                      onChange={(e) => setCallBodyText(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !wabaConnected}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                        isSubmitting || !wabaConnected
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                      }`}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Enviando...</span>
                        </>
                      ) : (
                        <>
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>{wabaConnected ? 'Enviar Botão de Chamada' : 'Bloqueado (Requer WABA)'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Coluna Direita: Simulador Visual Real do WhatsApp (Mobile Live Preview) */}
          <div className="bg-slate-100/70 p-4 flex flex-col items-center justify-center">
            <div className="w-full max-w-[290px] rounded-3xl border-4 border-slate-800 bg-[#efeae2] shadow-xl overflow-hidden flex flex-col text-xs font-sans">
              {/* Celular Header */}
              <div className="bg-[#075e54] text-white px-3 py-2 flex items-center gap-2 shrink-0">
                <div className="w-6 h-6 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                  {displayName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[11px] truncate leading-tight">{displayName}</p>
                  <p className="text-[9px] text-emerald-200 leading-none">online no WhatsApp</p>
                </div>
                <Smartphone className="w-3.5 h-3.5 text-emerald-200" />
              </div>

              {/* Chat Body Wallpaper */}
              <div className="p-2.5 space-y-2 min-h-[300px] flex flex-col justify-end text-[11px]">
                <div className="bg-white rounded-2xl p-2.5 shadow-xs space-y-2 border border-slate-200 max-w-[95%]">
                  {/* Visualização de Flow */}
                  {activeTab === 'flow' && (
                    <div className="space-y-2">
                      <p className="text-slate-800 text-[11.5px] leading-relaxed">{flowBodyText || 'Mensagem do Flow...'}</p>
                      <div className="pt-1.5 border-t border-slate-100">
                        <div className="w-full py-2 bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs">
                          <Layers className="w-3.5 h-3.5 text-emerald-700" />
                          <span>{flowCta || 'Abrir formulário'}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-emerald-600 ml-auto" />
                        </div>
                        <p className="text-[9px] text-slate-400 text-center mt-1">Prévia visual; não consulta serviços ou agenda.</p>
                      </div>
                    </div>
                  )}

                  {/* Visualização de Pix */}
                  {activeTab === 'pix' && (
                    <div className="space-y-2">
                      <p className="text-slate-800 text-[11.5px]">{pixBodyText || 'Cobrança Pix...'}</p>
                      <div className="p-2.5 bg-emerald-50/80 rounded-xl border border-emerald-200 space-y-1">
                        <div className="flex items-center justify-between text-[10.5px]">
                          <span className="font-bold text-emerald-950">{pixTitle}</span>
                          <span className="font-mono font-black text-emerald-800 text-xs">R$ {pixAmount}</span>
                        </div>
                        <p className="text-[9.5px] font-mono text-emerald-700 truncate">Pix: {pixKey}</p>
                        <button
                          type="button"
                          className="w-full mt-1 py-1.5 bg-emerald-600 text-white rounded-lg font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-2xs"
                        >
                          <CreditCard className="w-3 h-3" /> Pagar com Pix
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Visualização de Botões */}
                  {activeTab === 'buttons' && (
                    <div className="space-y-2">
                      <p className="text-slate-800 text-[11.5px]">{buttonBodyText}</p>
                      <div className="space-y-1 pt-1 border-t border-slate-100">
                        <div className="w-full py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-center font-bold text-indigo-900 text-[11px]">
                          {btn1}
                        </div>
                        <div className="w-full py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-center font-bold text-indigo-900 text-[11px]">
                          {btn2}
                        </div>
                        {btn3.trim() && (
                          <div className="w-full py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-center font-bold text-indigo-900 text-[11px]">
                            {btn3}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Visualização de Localização */}
                  {activeTab === 'location' && (
                    <div className="space-y-2">
                      <p className="text-slate-800 text-[11.5px]">{locationBodyText}</p>
                      <div className="pt-1 border-t border-slate-100">
                        <div className="w-full py-2 bg-blue-50 border border-blue-200 rounded-xl text-center font-bold text-blue-900 text-xs flex items-center justify-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-blue-600" />
                          <span>Enviar Minha Localização</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Visualização de Produto */}
                  {activeTab === 'product' && (
                    <div className="space-y-1.5">
                      <div className="h-24 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400 text-[10px]">
                        [ Imagem do Catálogo ]
                      </div>
                      <p className="font-bold text-slate-900 text-xs">{productRetailerId}</p>
                      <p className="text-[10px] text-slate-600">{productBodyText}</p>
                      <div className="w-full py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-center font-bold text-purple-900 text-[11px]">
                        Ver no Catálogo
                      </div>
                    </div>
                  )}

                  {/* Visualização de Carrossel */}
                  {activeTab === 'carousel' && (
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        <div className="w-28 shrink-0 bg-slate-50 p-1.5 rounded-lg border border-slate-200 space-y-1">
                          <div className="h-14 bg-slate-200 rounded" />
                          <p className="font-bold text-[9.5px] truncate">{carouselCard1Text}</p>
                          <div className="py-0.5 bg-pink-50 text-pink-700 text-center font-bold text-[9px] rounded">
                            Escolher
                          </div>
                        </div>
                        <div className="w-28 shrink-0 bg-slate-50 p-1.5 rounded-lg border border-slate-200 space-y-1">
                          <div className="h-14 bg-slate-200 rounded" />
                          <p className="font-bold text-[9.5px] truncate">{carouselCard2Text}</p>
                          <div className="py-0.5 bg-pink-50 text-pink-700 text-center font-bold text-[9px] rounded">
                            Escolher
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Visualização de Chamada */}
                  {activeTab === 'call' && (
                    <div className="space-y-2">
                      <p className="text-slate-800 text-[11.5px]">{callBodyText}</p>
                      <div className="pt-1 border-t border-slate-100">
                        <div className="w-full py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-center font-bold text-emerald-900 text-xs flex items-center justify-center gap-1.5">
                          <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{callButtonLabel}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="text-[9px] text-right text-slate-400 font-mono">14:32 ✓✓</div>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2 flex items-center gap-1 font-medium">
              <Eye className="w-3 h-3" /> Pré-visualização real no celular do lead
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
