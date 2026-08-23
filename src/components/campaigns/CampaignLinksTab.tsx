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
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Header Banner */}
        <div className="bg-[var(--sos-action)]/5 text-[var(--sos-ink)] rounded-xl p-4 border border-[var(--sos-action)]/20 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="bg-[var(--sos-action)]/10 text-[var(--sos-action)] text-[9.5px] font-bold px-2 py-0.5 rounded-full border border-[var(--sos-action)]/30">
                  Click to WhatsApp (CTWA)
                </span>
                <span className="bg-[var(--sos-success)]/10 text-[var(--sos-success)] text-[9.5px] font-bold px-2 py-0.5 rounded-full border border-[var(--sos-success)]/30">
                  Atribuição Automática
                </span>
              </div>
              <h2 className="text-base font-bold">Gerador de Links de Campanha & QR Codes</h2>
              <p className="text-[9.5px] text-[var(--sos-muted)] max-w-2xl mt-0.5 leading-relaxed">
                Crie links diretos para o WhatsApp oficial com mensagens pré-preenchidas por anúncio.
                O SOS Sales identifica automaticamente a origem do lead quando a conversa é iniciada.
              </p>
            </div>

            {wabaPhone && (
              <div className="bg-[var(--sos-surface)] backdrop-blur-sm border border-[var(--sos-border)] rounded-lg p-2.5 text-right shrink-0">
                <p className="text-[8.5px] uppercase tracking-wider text-[var(--sos-muted)] font-bold">Número Conectado</p>
                <p className="text-xs font-bold font-mono text-[var(--sos-ink)] mt-0.5">{wabaName || 'WABA Oficial'}</p>
                <p className="text-[9.5px] text-[var(--sos-success)] font-mono">{wabaPhone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Main Grid: Generator Form + Live Preview & QR */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Form: 7 cols */}
          <div className="lg:col-span-7 rounded-xl border border-[var(--sos-border)] bg-[var(--sos-surface)] p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--sos-border)]">
              <h3 className="text-xs font-bold text-[var(--sos-ink)] flex items-center gap-1.5">
                <Link2 size={14} className="text-[var(--sos-action)]" />
                <span>Configurar Link de Anúncio</span>
              </h3>
              <span className="text-[9px] text-[var(--sos-muted)] font-mono">wa.me</span>
            </div>

            {/* Quick Presets Selector */}
            <div>
              <label className="block text-[9.5px] font-bold text-[var(--sos-muted)] mb-1.5">
                Modelos Rápidos de Campanha:
              </label>
              <div className="flex flex-wrap gap-1">
                {savedPresets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className={`text-[9.5px] font-medium px-2 py-0.75 rounded-lg border transition-all cursor-pointer ${
                      campaignName === p.name
                        ? 'bg-[var(--sos-action)]/10 border-[var(--sos-action)]/30 text-[var(--sos-action)] font-bold'
                        : 'bg-[var(--sos-border)]/30 hover:bg-[var(--sos-border)]/50 border-[var(--sos-border)] text-[var(--sos-muted)]'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Phone Number Input */}
            <div>
              <label className="block text-[9.5px] font-bold text-[var(--sos-muted)] mb-1">
                Número de Destino (WhatsApp)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  placeholder="Ex: 5549999999999 (DDI + DDD + Número)"
                  className="w-full rounded-lg border border-[var(--sos-border)] bg-[var(--sos-background)] px-2.5 py-1.5 text-xs font-mono text-[var(--sos-ink)] focus:ring-1 focus:ring-[var(--sos-action)] outline-none"
                />
                {wabaPhone && (
                  <button
                    type="button"
                    onClick={() => setCustomPhone(wabaPhone.replace(/\D/g, ''))}
                    className="absolute right-1.5 top-1.5 text-[9px] bg-[var(--sos-border)]/30 hover:bg-[var(--sos-border)]/50 text-[var(--sos-muted)] px-1.5 py-0.5 rounded font-bold"
                  >
                    Usar WABA Oficial
                  </button>
                )}
              </div>
              <p className="text-[9px] text-[var(--sos-muted)] mt-0.5">Sempre inclua o código do país (55 para Brasil) e DDD sem caracteres especiais.</p>
            </div>

            {/* Pre-filled Message */}
            <div>
              <label className="block text-[9.5px] font-bold text-[var(--sos-muted)] mb-1">
                Mensagem Pré-definida da Campanha
              </label>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Digite o texto que já aparecerá pronto no WhatsApp do lead..."
                className="w-full rounded-lg border border-[var(--sos-border)] bg-[var(--sos-background)] px-2.5 py-1.5 text-xs text-[var(--sos-ink)] focus:ring-1 focus:ring-[var(--sos-action)] outline-none resize-none leading-relaxed"
              />
              <div className="flex items-center justify-between mt-0.5 text-[9px] text-[var(--sos-muted)]">
                <span>Quando o cliente clicar no anúncio, este texto já estará no campo de envio.</span>
                <span>{message.length} caracteres</span>
              </div>
            </div>

            {/* UTM Tracking Tags */}
            <div className="p-3 bg-[var(--sos-border)]/30 border border-[var(--sos-border)] rounded-lg space-y-2.5">
              <div className="flex items-center gap-1 text-[9.5px] font-bold text-[var(--sos-ink)]">
                <Tag size={12} className="text-[var(--sos-action)]" />
                <span>Parâmetros de Atribuição (Meta Ads / UTM)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <label className="block text-[9px] font-bold text-[var(--sos-muted)] mb-0.5">Origem (Source)</label>
                  <input
                    type="text"
                    value={utmSource}
                    onChange={(e) => setUtmSource(e.target.value)}
                    placeholder="instagram / google"
                    className="w-full rounded border border-[var(--sos-border)] bg-[var(--sos-background)] px-2 py-1 text-[9.5px] focus:ring-1 focus:ring-[var(--sos-action)] outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[var(--sos-muted)] mb-0.5">Mídia (Medium)</label>
                  <input
                    type="text"
                    value={utmMedium}
                    onChange={(e) => setUtmMedium(e.target.value)}
                    placeholder="cpc / stories / bio"
                    className="w-full rounded border border-[var(--sos-border)] bg-[var(--sos-background)] px-2 py-1 text-[9.5px] focus:ring-1 focus:ring-[var(--sos-action)] outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-[var(--sos-muted)] mb-0.5">Campanha (Campaign)</label>
                  <input
                    type="text"
                    value={utmCampaign}
                    onChange={(e) => setUtmCampaign(e.target.value)}
                    placeholder="oferta_verao"
                    className="w-full rounded border border-[var(--sos-border)] bg-[var(--sos-background)] px-2 py-1 text-[9.5px] focus:ring-1 focus:ring-[var(--sos-action)] outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Output & Preview: 5 cols */}
          <div className="lg:col-span-5 space-y-4">
            {/* Result Card */}
            <div className="rounded-xl border border-[var(--sos-border)] bg-[var(--sos-surface)] p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--sos-border)]">
                <h3 className="text-xs font-bold text-[var(--sos-ink)] flex items-center gap-1.5">
                  <Globe size={14} className="text-[var(--sos-success)]" />
                  <span>Link Pronto para Anúncios</span>
                </h3>
                {copied && (
                  <span className="text-[9.5px] font-bold text-[var(--sos-success)] flex items-center gap-0.5">
                    <Check size={11} /> Copiado!
                  </span>
                )}
              </div>

              {/* Generated Link Box */}
              <div className="p-2.5 bg-[var(--sos-border)]/30 border border-[var(--sos-border)] rounded-lg space-y-1.5">
                <p className="text-[9.5px] text-[var(--sos-action)] font-mono break-all select-all leading-relaxed">
                  {finalUrl || 'Preencha o número para gerar o link.'}
                </p>
                <div className="flex items-center justify-between pt-1.5 border-t border-[var(--sos-border)]/50 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopy(finalUrl)}
                    disabled={!finalUrl}
                    className={`flex-1 py-1.5 px-2.5 rounded text-[9.5px] font-bold transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs ${
                      copied
                        ? 'bg-[var(--sos-success)] text-white'
                        : 'bg-[var(--sos-action)] hover:bg-[var(--sos-action)]/90 text-white disabled:opacity-50'
                    }`}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copiado para a Área de Transferência' : 'Copiar Link do WhatsApp'}
                  </button>

                  <a
                    href={finalUrl || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className={`p-1.5 rounded border border-[var(--sos-border)] bg-[var(--sos-surface)] hover:bg-[var(--sos-border)]/30 text-[var(--sos-muted)] transition flex items-center justify-center ${
                      !finalUrl ? 'opacity-40 pointer-events-none' : ''
                    }`}
                    title="Testar Link no WhatsApp Web"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>

              {/* QR Code Section */}
              {qrCodeUrl && (
                <div className="pt-2.5 border-t border-[var(--sos-border)] flex items-center gap-3">
                  <div className="w-20 h-20 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg p-1 shadow-2xs flex items-center justify-center shrink-0">
                    <img src={qrCodeUrl} alt="QR Code da Campanha" className="w-full h-full object-contain" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[9.5px] font-bold text-[var(--sos-ink)] flex items-center gap-0.75">
                      <QrCode size={12} className="text-[var(--sos-muted)]" />
                      <span>QR Code de Impressão</span>
                    </h4>
                    <p className="text-[9px] text-[var(--sos-muted)] leading-snug">
                      Perfeito para totens, balcão, panfletos ou material de PDV físico.
                    </p>
                    <a
                      href={qrCodeUrl}
                      target="_blank"
                      download="qrcode-campanha-whatsapp.svg"
                      className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-[var(--sos-action)] hover:underline pt-0.5"
                    >
                      <Download size={10} /> Baixar QR Code (SVG)
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* WhatsApp UI Simulation Card */}
            <div className="rounded-xl border border-[var(--sos-border)] bg-[var(--sos-surface)] p-4 shadow-2xs space-y-2.5">
              <h4 className="text-[9.5px] font-bold text-[var(--sos-muted)] flex items-center gap-1">
                <MessageSquare size={12} className="text-[var(--sos-success)]" />
                <span>Visão do Lead ao Clicar:</span>
              </h4>

              <div className="bg-[var(--sos-canvas)] rounded-lg p-2.5 max-w-sm mx-auto shadow-inner">
                <div className="bg-[var(--sos-success-subtle)] rounded-lg rounded-tl-none p-2.5 shadow-2xs space-y-0.5 ml-auto max-w-[240px]">
                  <p className="text-[9.5px] text-[var(--sos-ink)] whitespace-pre-wrap leading-relaxed">
                    {message || <span className="text-[var(--sos-muted)] italic">Mensagem em branco...</span>}
                  </p>
                  <div className="text-right text-[8.5px] text-[var(--sos-muted)]">18:00 ✓✓</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
