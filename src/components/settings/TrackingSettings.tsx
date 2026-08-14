import React, { useState } from 'react';
import { Workspace } from '../../types/cockpit';
import {
  Megaphone,
  Globe,
  Link2,
  CheckCircle2,
  Trash2,
  Plus,
  Target,
  ShieldCheck,
  Tag,
  Key,
  HelpCircle,
} from 'lucide-react';

interface TrackingSettingsProps {
  workspace: Workspace;
}

export const TrackingSettings: React.FC<TrackingSettingsProps> = ({ workspace }) => {
  const [metaPixelId, setMetaPixelId] = useState('892374928374192');
  const [metaAccessToken, setMetaAccessToken] = useState('EAAQ..._meta_capi_live_token_tx_crm');
  const [metaDatasetId, setMetaDatasetId] = useState('ds_8932749283');
  const [metaCapiEnabled, setMetaCapiEnabled] = useState(true);

  const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState('482-901-2394');
  const [googleConversionId, setGoogleConversionId] = useState('AW-1092834792');
  const [googleGclidTracking, setGoogleGclidTracking] = useState(true);

  const [campaignMappings, setCampaignMappings] = useState([
    {
      id: 'camp-1',
      platform: 'meta',
      campaignName: 'Meta Ads — Escova R$59 (Sábado)',
      utmSource: 'facebook',
      utmMedium: 'cpc',
      utmCampaign: 'escova_sabado_mar2026',
      defaultProduct: 'Escova Modelada Premium',
      hookPromise: 'Escova R$59 com garantia de horário para casamento',
      activeLeadsCount: 42,
    },
    {
      id: 'camp-2',
      platform: 'google',
      campaignName: 'Google Search — Salão em São Paulo',
      utmSource: 'google',
      utmMedium: 'search',
      utmCampaign: 'salao_sp_brand',
      defaultProduct: 'Corte Designer + Hidratação',
      hookPromise: 'Melhor salão da Av. Paulista com atendimento imediato',
      activeLeadsCount: 28,
    },
  ]);

  const [isAddingCampaign, setIsAddingCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newUtmSource, setNewUtmSource] = useState('instagram');
  const [newProduct, setNewProduct] = useState('Escova Modelada Premium');
  const [newHook, setNewHook] = useState('');

  const handleSaveMeta = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Configurações da Meta Ads & Conversions API (CAPI) salvas com sucesso no TX CRM Tracking Engine!');
  };

  const handleSaveGoogle = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Configurações do Google Ads & GCLID Tracking salvas com sucesso!');
  };

  const handleAddCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;
    const newItem = {
      id: 'camp-' + Date.now(),
      platform: newUtmSource.includes('google') ? 'google' : 'meta',
      campaignName: newCampaignName,
      utmSource: newUtmSource,
      utmMedium: 'cpc',
      utmCampaign: newCampaignName.toLowerCase().replace(/\s+/g, '_'),
      defaultProduct: newProduct,
      hookPromise: newHook || 'Campanha de aquisição direta',
      activeLeadsCount: 0,
    };
    setCampaignMappings([newItem, ...campaignMappings]);
    setNewCampaignName('');
    setNewHook('');
    setIsAddingCampaign(false);
  };

  const handleDeleteCampaign = (id: string) => {
    setCampaignMappings(campaignMappings.filter((c) => c.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#00A884]" />
            Configurações de Rastreamento & Atribuição (Tracking & Attribution)
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Gerencie tokens de UTM, Meta Pixel, CAPI e GCLID do Google Ads para traquear com precisão a origem do tráfego e alimentar a IA com o gancho do anúncio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Paridade TX CRM Ativa
          </span>
        </div>
      </div>

      {/* Grid: Meta Ads & Google Ads Tokens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Meta Ads Integration */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Meta Ads & Conversions API (CAPI)</h3>
                <p className="text-[11px] text-slate-500">Rastreamento server-side de cliques e eventos</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={metaCapiEnabled}
                onChange={(e) => setMetaCapiEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00A884]"></div>
            </label>
          </div>

          <form onSubmit={handleSaveMeta} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Meta Pixel ID</label>
              <input
                type="text"
                value={metaPixelId}
                onChange={(e) => setMetaPixelId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">CAPI Access Token (Bearer)</label>
              <input
                type="password"
                value={metaAccessToken}
                onChange={(e) => setMetaAccessToken(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Dataset ID</label>
                <input
                  type="text"
                  value={metaDatasetId}
                  onChange={(e) => setMetaDatasetId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Salvar Meta Ads
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Google Ads Integration */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Google Ads & GCLID Auto-Tagging</h3>
                <p className="text-[11px] text-slate-500">Atribuição de cliques do Google Search & Display</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={googleGclidTracking}
                onChange={(e) => setGoogleGclidTracking(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00A884]"></div>
            </label>
          </div>

          <form onSubmit={handleSaveGoogle} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Google Ads Customer ID</label>
              <input
                type="text"
                value={googleAdsCustomerId}
                onChange={(e) => setGoogleAdsCustomerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Conversion Action ID (AW-XXXX)</label>
              <input
                type="text"
                value={googleConversionId}
                onChange={(e) => setGoogleConversionId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
              />
            </div>
            <div className="pt-1">
              <button
                type="submit"
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Salvar Google Ads
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Campaign UTM Mapping & Hook Memory */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#00A884]" />
              Mapeamento de UTMs e Ganchos de Anúncios
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Associe parâmetros UTM e ganchos criativos para que a IA inicie a conversa já alinhada com a promessa do anúncio.
            </p>
          </div>
          <button
            onClick={() => setIsAddingCampaign(true)}
            className="px-3.5 py-2 bg-[#00A884] hover:bg-[#009273] text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Nova Campanha UTM
          </button>
        </div>

        {/* Campaign Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {campaignMappings.map((camp) => (
            <div
              key={camp.id}
              className="p-4 bg-slate-50 rounded-xl border border-slate-200/70 space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                    camp.platform === 'meta' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {camp.platform === 'meta' ? 'Meta Ads' : 'Google Ads'}
                  </span>
                  <span className="text-[11px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                    {camp.activeLeadsCount} leads trafegados
                  </span>
                </div>
                <h4 className="text-xs font-bold text-slate-900">{camp.campaignName}</h4>
                <div className="text-[11px] text-slate-500 font-mono mt-1">
                  utm_source=<span className="text-slate-800">{camp.utmSource}</span> &amp; utm_campaign=<span className="text-slate-800">{camp.utmCampaign}</span>
                </div>
                <div className="mt-2.5 p-2.5 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-700">
                  <span className="font-bold text-slate-950 block text-[10px] uppercase tracking-wider text-purple-700 mb-0.5">🎯 Gancho / Promessa:</span>
                  "{camp.hookPromise}"
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-[11px]">
                <span className="text-slate-500 font-mono">Produto: <b>{camp.defaultProduct}</b></span>
                <button
                  onClick={() => handleDeleteCampaign(camp.id)}
                  className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                  title="Excluir mapeamento"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Add Campaign */}
      {isAddingCampaign && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[#00A884]" />
                Nova Campanha UTM & Atribuição
              </h3>
              <button
                onClick={() => setIsAddingCampaign(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCampaign} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome da Campanha</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Meta Ads — Promoção Relâmpago 30% OFF"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">UTM Source</label>
                  <select
                    value={newUtmSource}
                    onChange={(e) => setNewUtmSource(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  >
                    <option value="facebook">facebook (Meta)</option>
                    <option value="instagram">instagram (Meta)</option>
                    <option value="google">google (Search)</option>
                    <option value="tiktok">tiktok</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Produto Padrão</label>
                  <input
                    type="text"
                    value={newProduct}
                    onChange={(e) => setNewProduct(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Promessa / Gancho do Anúncio</label>
                <textarea
                  rows={3}
                  placeholder="Qual promessa o lead viu no criativo? (Ex: Escova modelada com garantia de horário por R$59)"
                  value={newHook}
                  onChange={(e) => setNewHook(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddingCampaign(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#00A884] hover:bg-[#009273] text-white shadow-sm cursor-pointer"
                >
                  Salvar Campanha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
