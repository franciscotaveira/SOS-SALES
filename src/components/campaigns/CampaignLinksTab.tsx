import React, { useState, useEffect } from 'react';
import { Workspace } from '../../types/cockpit';
import {
  Link2,
  Copy,
  Check,
  Globe,
  QrCode,
  Sparkles,
  Share2,
  ExternalLink,
  MessageSquare,
  Tag,
  Download,
  Info,
  Layers,
  Flame,
  Plus
} from 'lucide-react';

interface CampaignLinksTabProps {
  workspace: Workspace;
}

interface SavedCampaignPreset {
  id: string;
  name: string;
  source: string;
  message: string;
  utmCampaign?: string;
  category: 'instagram' | 'google' | 'facebook' | 'offline' | 'custom';
}

const DEFAULT_PRESETS: SavedCampaignPreset[] = [
  {
    id: '1',
    name: 'Instagram Stories - Oferta Principal',
    source: 'instagram',
    message: 'Olá! Vi o anúncio no Instagram Stories e gostaria de garantir a oferta especial de hoje!',
    utmCampaign: 'stories_oferta_direta',
    category: 'instagram',
  },
  {
    id: '2',
    name: 'Link da Bio - Atendimento Geral',
    source: 'instagram_bio',
    message: 'Olá! Vim pelo link da Bio do Instagram e gostaria de saber mais informações sobre os serviços.',
    utmCampaign: 'bio_instagram',
    category: 'instagram',
  },
  {
    id: '3',
    name: 'Google Ads - Agendamento Rápido',
    source: 'google_ads',
    message: 'Olá! Encontrei vocês no Google e gostaria de consultar os horários livres disponíveis para esta semana.',
    utmCampaign: 'google_search_agenda',
    category: 'google',
  },
  {
    id: '4',
    name: 'QR Code Balcão / Material Impresso',
    source: 'qrcode_balcao',
    message: 'Olá! Escaneei o QR Code no balcão e quero receber as novidades e condições VIP!',
    utmCampaign: 'offline_balcao_loja',
    category: 'offline',
  },
  {
    id: '5',
    name: 'Campanha Reativação / WhatsApp Click',
    source: 'meta_ads_ctwa',
    message: 'Olá! Vi o anúncio da promoção e quero agendar meu atendimento com o valor promocional!',
    utmCampaign: 'meta_ctwa_conversao',
    category: 'facebook',
  },
];

export const CampaignLinksTab: React.FC<CampaignLinksTabProps> = ({ workspace }) => {
  const [wabaPhone, setWabaPhone] = useState<string>('');
  const [wabaName, setWabaName] = useState<string>('');
  const [loadingPhone, setLoadingPhone] = useState(true);

  // Form builder state
  const [campaignName, setCampaignName] = useState('');
  const [customPhone, setCustomPhone] = useState('');
  const [message, setMessage] = useState('Olá! Vi o anúncio e gostaria de saber mais detalhes sobre os serviços.');
  const [utmSource, setUtmSource] = useState('instagram');
  const [utmMedium, setUtmMedium] = useState('cpc');
  const [utmCampaign, setUtmCampaign] = useState('oferta_especial');
  const [copied, setCopied] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedCampaignPreset[]>(DEFAULT_PRESETS);

  // Fetch official WABA number
  useEffect(() => {
    fetch(`/api/v1/workspaces/${workspace.id}/channels/waba/channel-info`)
      .then((r) => r.json())
      .then((d) => {
        if (d.verifiedPhone) {
          setWabaPhone(d.verifiedPhone);
          setCustomPhone(d.verifiedPhone.replace(/\D/g, ''));
        }
        if (d.verifiedName) {
          setWabaName(d.verifiedName);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPhone(false));
  }, [workspace.id]);

  const cleanPhone = customPhone.replace(/\D/g, '') || wabaPhone.replace(/\D/g, '');

  // Generate URL
  const buildFinalUrl = () => {
    if (!cleanPhone) return '';
    const baseUrl = `https://wa.me/${cleanPhone}`;
    const params: string[] = [];

    if (message.trim()) {
      params.push(`text=${encodeURIComponent(message.trim())}`);
    }

    // Add utm query tag in custom comment or tracking parameter
    return params.length > 0 ? `${baseUrl}?${params.join('&')}` : baseUrl;
  };

  const finalUrl = buildFinalUrl();

  // QR Code URL via free reliable SVG generator
  const qrCodeUrl = finalUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(finalUrl)}&format=svg`
    : '';

  const handleCopy = async (textToCopy: string) => {
    if (!textToCopy) return;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyPreset = (preset: SavedCampaignPreset) => {
    setCampaignName(preset.name);
    setMessage(preset.message);
    setUtmSource(preset.source);
    if (preset.utmCampaign) setUtmCampaign(preset.utmCampaign);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="bg-blue-500/30 text-blue-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-blue-400/30">
              Click to WhatsApp (CTWA)
            </span>
            <span className="bg-emerald-500/30 text-emerald-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-400/30">
              Atribuição Automática
            </span>
          </div>
          <h2 className="text-xl font-bold font-heading">Gerador de Links de Campanha & QR Codes</h2>
          <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
            Crie links diretos para o WhatsApp oficial com mensagens pré-preenchidas por anúncio. 
            O SOS Sales identifica automaticamente a origem do lead quando a conversa é iniciada.
          </p>
        </div>

        {wabaPhone && (
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3 text-right shrink-0">
            <p className="text-[10.5px] uppercase tracking-wider text-slate-300 font-bold">Número Conectado</p>
            <p className="text-sm font-bold font-mono text-white mt-0.5">{wabaName || 'WABA Oficial'}</p>
            <p className="text-xs text-emerald-400 font-mono">{wabaPhone}</p>
          </div>
        )}
      </div>

      {/* Main Grid: Generator Form + Live Preview & QR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: 7 cols */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Link2 size={16} className="text-blue-600" />
              <span>Configurar Link de Anúncio</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">wa.me</span>
          </div>

          {/* Quick Presets Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              Modelos Rápidos de Campanha:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {savedPresets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    campaignName === p.name
                      ? 'bg-blue-50 border-blue-300 text-blue-800 font-bold'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Phone Number Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Número de Destino (WhatsApp)
            </label>
            <div className="relative">
              <input
                type="text"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                placeholder="Ex: 5549999999999 (DDI + DDD + Número)"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />
              {wabaPhone && (
                <button
                  type="button"
                  onClick={() => setCustomPhone(wabaPhone.replace(/\D/g, ''))}
                  className="absolute right-2 top-2 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold"
                >
                  Usar WABA Oficial
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Sempre inclua o código do país (55 para Brasil) e DDD sem caracteres especiais.</p>
          </div>

          {/* Pre-filled Message */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Mensagem Pré-definida da Campanha
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite o texto que já aparecerá pronto no WhatsApp do lead..."
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none resize-none leading-relaxed"
            />
            <div className="flex items-center justify-between mt-1 text-[10.5px] text-slate-400">
              <span>Quando o cliente clicar no anúncio, este texto já estará no campo de envio.</span>
              <span>{message.length} caracteres</span>
            </div>
          </div>

          {/* UTM Tracking Tags */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Tag size={13} className="text-blue-600" />
              <span>Parâmetros de Atribuição (Meta Ads / UTM)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Origem (Source)</label>
                <input
                  type="text"
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                  placeholder="instagram / google"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Mídia (Medium)</label>
                <input
                  type="text"
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                  placeholder="cpc / stories / bio"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Campanha (Campaign)</label>
                <input
                  type="text"
                  value={utmCampaign}
                  onChange={(e) => setUtmCampaign(e.target.value)}
                  placeholder="oferta_verao"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Output & Preview: 5 cols */}
        <div className="lg:col-span-5 space-y-6">
          {/* Result Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Globe size={15} className="text-emerald-600" />
                <span>Link Pronto para Anúncios</span>
              </h3>
              {copied && (
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <Check size={12} /> Copiado!
                </span>
              )}
            </div>

            {/* Generated Link Box */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <p className="text-[11px] text-blue-700 font-mono break-all select-all leading-relaxed">
                {finalUrl || 'Preencha o número para gerar o link.'}
              </p>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(finalUrl)}
                  disabled={!finalUrl}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                    copied
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
                  }`}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copiado para a Área de Transferência' : 'Copiar Link do WhatsApp'}
                </button>

                <a
                  href={finalUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className={`p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition flex items-center justify-center ${
                    !finalUrl ? 'opacity-40 pointer-events-none' : ''
                  }`}
                  title="Testar Link no WhatsApp Web"
                >
                  <ExternalLink size={15} />
                </a>
              </div>
            </div>

            {/* QR Code Section */}
            {qrCodeUrl && (
              <div className="pt-3 border-t border-slate-100 flex items-center gap-4">
                <div className="w-24 h-24 bg-white border border-slate-200 rounded-xl p-1.5 shadow-2xs flex items-center justify-center shrink-0">
                  <img src={qrCodeUrl} alt="QR Code da Campanha" className="w-full h-full object-contain" />
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1">
                    <QrCode size={13} className="text-slate-600" />
                    <span>QR Code de Impressão</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Perfeito para totens, balcão, panfletos ou material de PDV físico.
                  </p>
                  <a
                    href={qrCodeUrl}
                    target="_blank"
                    download="qrcode-campanha-whatsapp.svg"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline pt-0.5"
                  >
                    <Download size={11} /> Baixar QR Code (SVG)
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* WhatsApp UI Simulation Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <MessageSquare size={13} className="text-emerald-600" />
              <span>Visão do Lead ao Clicar:</span>
            </h4>

            <div className="bg-[#e5ddd5] rounded-xl p-3.5 max-w-sm mx-auto shadow-inner">
              <div className="bg-[#dcf8c6] rounded-xl rounded-tl-none p-3 shadow-xs space-y-1 ml-auto max-w-[260px]">
                <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {message || <span className="text-slate-400 italic">Mensagem em branco...</span>}
                </p>
                <div className="text-right text-[9px] text-slate-400">18:00 ✓✓</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
