import React, { useState } from 'react';
import { salesOsRuntimeConfig } from '../../config/runtime';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';
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
  Sparkles,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

interface TrackingSettingsProps {
  workspace: Workspace;
}

export interface CampaignMappingItem {
  id: string;
  platform: 'meta' | 'google';
  campaignName: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  defaultProduct: string;
  hookPromise: string;
  activeLeadsCount: number;
}

export function resolveWorkspaceTrackingDefaults(wsId: string, wsName?: string): {
  pixelId: string;
  datasetId: string;
  googleCustomerId: string;
  googleConversionId: string;
  metaAccessToken?: string;
  campaigns: CampaignMappingItem[];
} {
  const normId = (wsId || '').toLowerCase();
  const normName = (wsName || '').toLowerCase();

  // 1. Haven Escovaria & Esmalteria
  if (normId === '22222222-2222-2222-2222-222222222222' || normName === 'haven' || normName === 'haven escovaria & esmalteria') {
    return {
      pixelId: '2042592029613403',
      datasetId: '2042592029613403',
      googleCustomerId: '482-901-2394',
      googleConversionId: 'AW-1092834792',
      // Provider credentials are never shipped in the browser bundle.
      metaAccessToken: '',
      campaigns: [
        {
          id: 'camp-haven-1',
          platform: 'meta',
          campaignName: 'Meta Ads — Escova R$59 Sem Hora Marcada',
          utmSource: 'facebook',
          utmMedium: 'cpc',
          utmCampaign: 'escova_express_haven',
          defaultProduct: 'Escova Express (Lisa ou Modelada)',
          hookPromise: 'Chegue a qualquer momento no Centro de Chapecó com lavagem ozonizada inclusa',
          activeLeadsCount: 42,
        },
        {
          id: 'camp-haven-2',
          platform: 'meta',
          campaignName: 'Instagram — Nanoblading Realista Suzana',
          utmSource: 'instagram',
          utmMedium: 'cpc',
          utmCampaign: 'nanoblading_suzana',
          defaultProduct: 'Micropigmentação Nanoblading Realista · Suzana',
          hookPromise: 'Fios ultra realistas, anestésico sem dor e retoque incluso em 30 dias',
          activeLeadsCount: 19,
        },
      ],
    };
  }

  // 2. Sora Spa
  if (normId === '33333333-3333-3333-3333-333333333333' || normName === 'sora' || normName === 'sora spa') {
    return {
      pixelId: '',
      datasetId: '',
      googleCustomerId: '',
      googleConversionId: '',
      metaAccessToken: '',
      campaigns: [
        {
          id: 'camp-sora-1',
          platform: 'meta',
          campaignName: 'Meta Ads — Headspa Coreano Experiência Sensorial',
          utmSource: 'instagram',
          utmMedium: 'cpc',
          utmCampaign: 'headspa_sensorial',
          defaultProduct: 'Sessão Headspa Signature (90 min)',
          hookPromise: 'Desconecte do estresse com massagem capilar e cascata de ozônio',
          activeLeadsCount: 0,
        },
      ],
    };
  }

  // 3. Outros Workspaces (Limpo e Isolado)
  return {
    pixelId: '',
    datasetId: '',
    googleCustomerId: '',
    googleConversionId: '',
    metaAccessToken: '',
    campaigns: [],
  };
}

export const TrackingSettings: React.FC<TrackingSettingsProps> = ({ workspace }) => {
  const isApiMode = salesOsRuntimeConfig.mode === 'api';
  const defaults = React.useMemo(
    () => isApiMode
      ? { pixelId: '', datasetId: '', googleCustomerId: '', googleConversionId: '', metaAccessToken: '', campaigns: [] }
      : resolveWorkspaceTrackingDefaults(workspace.id, workspace.name),
    [isApiMode, workspace.id, workspace.name]
  );

  const storageKey = `sos_sales_tracking_v3_${workspace.id}`;

  const [metaPixelId, setMetaPixelId] = useState(defaults.pixelId);
  const [metaAccessToken, setMetaAccessToken] = useState(defaults.metaAccessToken || '');
  const [metaDatasetId, setMetaDatasetId] = useState(defaults.datasetId);
  const [metaCapiEnabled, setMetaCapiEnabled] = useState(true);

  // Meta Login Auth States
  const [metaTab, setMetaTab] = useState<'login_auth' | 'manual'>('login_auth');
  const [metaAppId, setMetaAppId] = useState('');

  const [fetchingDatasets, setFetchingDatasets] = useState(false);
  const [discoveredDatasets, setDiscoveredDatasets] = useState<Array<{
    id: string;
    name: string;
    type: 'dataset' | 'pixel';
    owner?: string;
  }>>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(defaults.datasetId);

  const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState(defaults.googleCustomerId);
  const [googleConversionId, setGoogleConversionId] = useState(defaults.googleConversionId);
  const [googleGclidTracking, setGoogleGclidTracking] = useState(true);

  const [savingMeta, setSavingMeta] = useState(false);
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [feedback, setFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  // Live CAPI Event Testing State
  const [testingCapi, setTestingCapi] = useState(false);
  const [testEventCode, setTestEventCode] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testEventName, setTestEventName] = useState<'Lead' | 'Purchase'>('Lead');
  const [capiTestFeedback, setCapiTestFeedback] = useState<{ success?: boolean; message?: string; details?: any } | null>(null);

  // Retroactive Reconciliation State
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<{
    success?: boolean;
    message?: string;
    reconciledCount?: number;
    totalAttributedRevenueBrl?: string;
    campaignBreakdown?: Record<string, { leads: number; revenueMinor: number }>;
  } | null>(null);

  const handleRunRetroactiveReconciliation = async () => {
    setIsReconciling(true);
    setReconcileResult(null);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/tracking/reconcile-retroactive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceRescan: true, limit: 300 }),
      });
      const data = await response.json();
      if (data.success) {
        setReconcileResult(data);
      } else {
        setReconcileResult({
          success: false,
          message: data.error || 'Falha ao processar reconciliação retroativa.',
        });
      }
    } catch (err: any) {
      setReconcileResult({
        success: false,
        message: err.message || 'Erro de conexão ao reconciliar histórico.',
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const [campaignMappings, setCampaignMappings] = useState<CampaignMappingItem[]>(() => {
    if (salesOsRuntimeConfig.mode === 'api') return [];
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return defaults.campaigns;
  });

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

  // Discover Datasets / Pixels via Meta Graph API
  const fetchMetaDatasets = async (token: string) => {
    setFetchingDatasets(true);
    setFeedback(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/tracking/meta/list-datasets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token }),
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.datasets) && data.datasets.length > 0) {
        setDiscoveredDatasets(data.datasets);
        // If only 1 dataset found, auto-select and bind it
        if (data.datasets.length === 1) {
          const only = data.datasets[0];
          selectAndBindDataset(only, token);
        } else {
          setFeedback({
            success: true,
            message: `🎉 ${data.datasets.length} conjunto(s) de dados/pixel encontrados na Meta! Escolha um abaixo para vincular:`,
          });
        }
      } else {
        setDiscoveredDatasets([]);
        setFeedback({
          success: false,
          message: 'Nenhum conjunto de dados/pixel encontrado nesta conta da Meta. Verifique se o token de acesso possui permissões de "ads_read" e "business_management" para a conta de anúncios deste workspace.',
        });
      }
    } catch (err: any) {
      setFeedback({
        success: false,
        message: 'Erro ao buscar conjuntos de dados: ' + err.message,
      });
    } finally {
      setFetchingDatasets(false);
    }
  };

  // Popup Facebook Login Trigger for Tracking
  const triggerFacebookPopupLogin = async () => {
    if (!metaAppId.trim()) {
      setFeedback({
        success: false,
        message: 'Informe o Meta App ID ou cole o token diretamente.',
      });
      return;
    }

    setFetchingDatasets(true);
    setFeedback(null);
    try {
      const fb = await loadAndInitFacebookSdk(metaAppId);
      fb.login(
        (response: any) => {
          if (response.authResponse && response.authResponse.accessToken) {
            const userToken = response.authResponse.accessToken;
            setMetaAccessToken(userToken);
            fetchMetaDatasets(userToken);
          } else {
            setFetchingDatasets(false);
            setFeedback({
              success: false,
              message: 'Login com Facebook cancelado ou permissões de anúncios não autorizadas.',
            });
          }
        },
        { scope: 'ads_management,ads_read,business_management,read_ads_dataset_quality' }
      );
    } catch (err: any) {
      setFetchingDatasets(false);
      setFeedback({
        success: false,
        message: 'Erro ao abrir login do Facebook: ' + (err.message || 'Verifique bloqueadores de popup.'),
      });
    }
  };

  // Select a discovered Dataset and Auto-Save
  const selectAndBindDataset = async (ds: { id: string; name: string; type?: 'dataset' | 'pixel' }, tokenToUse?: string) => {
    const token = tokenToUse || metaAccessToken;
    setSelectedDatasetId(ds.id);
    if (ds.type === 'pixel') setMetaPixelId(ds.id);
    else setMetaDatasetId(ds.id);

    setSavingMeta(true);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metaPixelId: ds.type === 'pixel' ? ds.id : metaPixelId,
          metaDatasetId: ds.type === 'dataset' ? ds.id : metaDatasetId,
          metaAccessToken: token,
          metaCapiEnabled: true,
          campaignMappings,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          success: true,
          message: `✅ Conjunto de Dados "${ds.name}" (${ds.id}) vinculado e salvo com sucesso no SOS-SALES!`,
        });
      } else {
        setFeedback({
          success: false,
          message: data?.error || `Não foi possível vincular o conjunto de dados (HTTP ${res.status}).`,
        });
      }
    } catch (error) {
      setFeedback({
        success: false,
        message: error instanceof Error ? error.message : 'Não foi possível vincular o conjunto de dados.',
      });
    } finally {
      setSavingMeta(false);
    }
  };


  // Fetch persisted tracking from API or localStorage
  const fetchTrackingConfig = React.useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/tracking`);
      if (!res.ok) throw new Error(`Tracking indisponível (HTTP ${res.status})`);
      const data = await res.json();
      if (data?.tracking) {
        const t = data.tracking;
        setMetaPixelId(t.metaPixelId || '');
        setMetaDatasetId(t.metaDatasetId || '');
        setGoogleAdsCustomerId(t.googleAdsCustomerId || '');
        setGoogleConversionId(t.googleConversionId || '');
        setCampaignMappings(Array.isArray(t.campaignMappings) ? t.campaignMappings : []);
        return;
      }
      setMetaPixelId('');
      setMetaDatasetId('');
      setGoogleAdsCustomerId('');
      setGoogleConversionId('');
      setCampaignMappings([]);
      return;
    } catch (error) {
      if (salesOsRuntimeConfig.mode === 'api') {
        setMetaPixelId('');
        setMetaDatasetId('');
        setGoogleAdsCustomerId('');
        setGoogleConversionId('');
        setCampaignMappings([]);
        setFeedback({ success: false, message: error instanceof Error ? error.message : 'Tracking indisponível.' });
        return;
      }
    }

    // Fallback to local storage or defaults
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setCampaignMappings(parsed);
      }
    } catch {}
  }, [workspace.id, storageKey]);

  React.useEffect(() => {
    setMetaPixelId(defaults.pixelId);
    setMetaDatasetId(defaults.datasetId);
    if (defaults.metaAccessToken) setMetaAccessToken(defaults.metaAccessToken);
    setGoogleAdsCustomerId(defaults.googleCustomerId);
    setGoogleConversionId(defaults.googleConversionId);
    fetchTrackingConfig();
  }, [workspace.id, workspace.name, defaults, fetchTrackingConfig]);

  const [isAddingCampaign, setIsAddingCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newUtmSource, setNewUtmSource] = useState('instagram');
  const [newProduct, setNewProduct] = useState('');
  const [newHook, setNewHook] = useState('');

  // Save Meta Tracking to Backend API & LocalStorage
  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMeta(true);
    setFeedback(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metaPixelId,
          metaDatasetId,
          metaAccessToken,
          metaCapiEnabled,
          campaignMappings,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          success: true,
          message: 'Configurações de Meta Ads & Conversions API (CAPI) salvas no banco de dados com sucesso!',
        });
      } else {
        setFeedback({
          success: false,
          message: data.error || 'Erro ao salvar configurações no servidor.',
        });
      }
    } catch (err: any) {
      setFeedback({ success: false, message: 'Erro de conexão: ' + err.message });
    } finally {
      setSavingMeta(false);
    }
  };

  // Save Google Tracking
  const handleSaveGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGoogle(true);
    setFeedback(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          googleAdsCustomerId,
          googleConversionId,
          googleGclidTracking,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({
          success: true,
          message: 'Configurações do Google Ads salvas com sucesso!',
        });
      } else {
        setFeedback({ success: false, message: data.error || 'Erro ao salvar Google Ads.' });
      }
    } catch (err: any) {
      setFeedback({ success: false, message: 'Erro: ' + err.message });
    } finally {
      setSavingGoogle(false);
    }
  };

  // Live Test CAPI Event directly against Meta Graph API
  const handleTestCapiEvent = async () => {
    if (!testEventCode.trim()) {
      setCapiTestFeedback({
        success: false,
        message: 'Informe o Test Event Code da Meta antes de disparar um evento de teste.',
      });
      return;
    }
    if ((!metaDatasetId && !metaPixelId) || !metaAccessToken) {
      setCapiTestFeedback({
        success: false,
        message: 'Preencha o Dataset/Pixel ID e o CAPI Access Token antes de disparar o teste.',
      });
      return;
    }

    setTestingCapi(true);
    setCapiTestFeedback(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/tracking/test-capi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pixelId: metaPixelId.trim() || undefined,
          datasetId: metaDatasetId.trim() || undefined,
          accessToken: metaAccessToken,
          testEventCode: testEventCode.trim(),
          eventName: testEventName,
          phone: testPhone.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCapiTestFeedback({
          success: true,
          message: `✅ Evento "${testEventName}" recebido pela Meta! Eventos processados: ${data.eventsReceived} (Trace ID: ${data.fbtraceId || 'OK'})`,
          details: data,
        });
      } else {
        setCapiTestFeedback({
          success: false,
          message: `❌ Erro da Meta: ${data.error || 'Falha no disparo do evento CAPI.'}`,
          details: data,
        });
      }
    } catch (err: any) {
      setCapiTestFeedback({
        success: false,
        message: 'Erro na requisição: ' + err.message,
      });
    } finally {
      setTestingCapi(false);
    }
  };

  const persistCampaignMappings = async (updated: CampaignMappingItem[]) => {
    if (salesOsRuntimeConfig.mode !== 'api') {
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return;
    }
    const res = await authenticatedFetch(`/api/v1/workspaces/${workspace.id}/tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignMappings: updated }),
    });
    if (!res.ok) throw new Error(`Não foi possível salvar campanhas (HTTP ${res.status}).`);
  };

  const handleAddCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;
    const newItem: CampaignMappingItem = {
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
    const updated = [newItem, ...campaignMappings];
    try {
      await persistCampaignMappings(updated);
      setCampaignMappings(updated);
    } catch (error) {
      setFeedback({ success: false, message: error instanceof Error ? error.message : 'Falha ao salvar campanha.' });
      return;
    }
    setNewCampaignName('');
    setNewHook('');
    setIsAddingCampaign(false);
  };

  const handleDeleteCampaign = async (id: string) => {
    const updated = campaignMappings.filter((c) => c.id !== id);
    try {
      await persistCampaignMappings(updated);
      setCampaignMappings(updated);
    } catch (error) {
      setFeedback({ success: false, message: error instanceof Error ? error.message : 'Falha ao excluir campanha.' });
    }
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
            Gerencie tokens de UTM, Meta Pixel / Dataset, CAPI e Google Ads para traquear a origem do tráfego e alimentar a IA com o gancho do anúncio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
            isApiMode
              ? 'bg-slate-100 text-slate-700 border border-slate-200'
              : 'bg-amber-50 text-amber-700 border border-amber-200'
          }`}>
            {isApiMode ? <RefreshCw className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {isApiMode ? 'Estado proveniente da API' : 'Modo demonstração local'}
          </span>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in duration-200 ${
          feedback.success
            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="font-bold underline ml-2 text-slate-600">Fechar</button>
        </div>
      )}

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

          {/* Tabs for Login Auth vs Manual */}
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setMetaTab('login_auth')}
              className={`flex-1 py-2 text-xs font-bold text-center border-b-2 transition-colors cursor-pointer ${
                metaTab === 'login_auth'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              ⚡ Login Auth (1-Clique)
            </button>
            <button
              type="button"
              onClick={() => setMetaTab('manual')}
              className={`flex-1 py-2 text-xs font-bold text-center border-b-2 transition-colors cursor-pointer ${
                metaTab === 'manual'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              ⚙️ Manual
            </button>
          </div>

          {metaTab === 'login_auth' ? (
            <div className="space-y-3.5 text-xs">
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1.5">
                <span className="font-bold text-blue-900 block text-xs">Conectar Meta Ads & Pixel em 1-Clique:</span>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Faça login com sua conta do Facebook para listar automaticamente todos os Conjuntos de Dados (Datasets) e Pixels da sua conta de anúncios.
                </p>
              </div>

              {/* Method 1: Popup Facebook Login */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <span className="font-bold text-slate-800 block text-[11px]">Método 1: Popup do Facebook</span>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1 text-[10px]">Meta App ID</label>
                  <input
                    type="text"
                    value={metaAppId}
                    onChange={(e) => setMetaAppId(e.target.value)}
                    placeholder="Ex: 229426216349902"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={triggerFacebookPopupLogin}
                  disabled={fetchingDatasets}
                  className="w-full py-2 px-3 bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-60 text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  <span>{fetchingDatasets ? 'Buscando Conjuntos de Dados...' : 'Conectar com Facebook Login'}</span>
                </button>
              </div>

              {/* Method 2: Paste Token directly */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <span className="font-bold text-slate-800 block text-[11px]">Método 2: Colar Token de Acesso da Meta</span>
                <textarea
                  rows={2}
                  placeholder="Cole aqui o Token EAAL... ou EAAG..."
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-500 outline-none text-xs"
                />
                <button
                  type="button"
                  onClick={() => fetchMetaDatasets(metaAccessToken)}
                  disabled={!metaAccessToken.trim() || fetchingDatasets}
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>{fetchingDatasets ? 'Descobrindo Datasets...' : 'Buscar Datasets Vinculados'}</span>
                </button>
              </div>

              {/* Discovered Datasets Picker */}
              {discoveredDatasets.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="font-bold text-slate-800 block text-xs flex items-center gap-1">
                    <span>🎯</span> Conjuntos de Dados / Pixels Encontrados:
                  </span>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {discoveredDatasets.map((ds) => {
                      const isSelected = selectedDatasetId === ds.id || metaDatasetId === ds.id;
                      return (
                        <div
                          key={ds.id}
                          onClick={() => selectAndBindDataset(ds)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400'
                              : 'border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/30'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs">{ds.name}</span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-blue-100 text-blue-800">
                                {ds.type}
                              </span>
                            </div>
                            <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                              ID: <span className="font-bold text-slate-800">{ds.id}</span>
                              {ds.owner && ` · ${ds.owner}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isSelected ? (
                              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Vinculado
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[10px] font-bold"
                              >
                                Vincular
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveMeta} className="space-y-3">
              {/* Helper Note for Meta Dataset ID */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-slate-600 space-y-1">
                <span className="font-bold text-blue-900 block text-xs">💡 Dica Meta Events Manager:</span>
                <p>
                  Use o <b>Dataset ID</b> exibido no Events Manager para a Conversions API. Pixel ID e Dataset ID são campos diferentes; não os misture sem confirmação da Meta.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Identificação do Conjunto de Dados (Dataset ID)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 2042592029613403"
                  value={metaDatasetId}
                  onChange={(e) => {
                    setMetaDatasetId(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  CAPI Access Token (Bearer Permanente da Meta)
                </label>
                <textarea
                  rows={2}
                  placeholder="EAAL..."
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#00A884]"
                />
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={savingMeta}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                >
                  {savingMeta ? (
                    <span>Salvando na Nuvem...</span>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Salvar Configurações Meta Ads</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}


          {/* Test CAPI Live Dispatch Section */}
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5">
            <span className="font-bold text-slate-800 block text-xs flex items-center gap-1.5">
              <span>🧪</span> Testar Disparo CAPI ao Vivo na Meta
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Tipo de Evento</label>
                <select
                  value={testEventName}
                  onChange={(e) => setTestEventName(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="Lead">Lead (Início de Conversa)</option>
                  <option value="Purchase">Purchase (Compra / Fechamento)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Código de Teste da Meta (obrigatório)</label>
                <input
                  type="text"
                  placeholder="Ex: TEST12345 (da aba Eventos de Teste)"
                  value={testEventCode}
                  onChange={(e) => setTestEventCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Telefone do contato de teste</label>
                <input
                  type="tel"
                  placeholder="Ex: +55 49 99999-9999"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleTestCapiEvent}
              disabled={testingCapi || !metaAccessToken || !metaDatasetId || !testEventCode.trim() || testPhone.replace(/\D/g, '').length < 8}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              {testingCapi ? (
                <span>Disparando evento para a Meta...</span>
              ) : (
                <>
                  <Target className="w-3.5 h-3.5" />
                  <span>Enviar Evento de Teste para a Meta</span>
                </>
              )}
            </button>

            {capiTestFeedback && (
              <div className={`p-3 rounded-lg text-xs font-semibold ${
                capiTestFeedback.success
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                <p>{capiTestFeedback.message}</p>
              </div>
            )}
          </div>
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
                disabled={savingGoogle}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
              >
                {savingGoogle ? 'Salvando...' : 'Salvar Google Ads'}
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

      {/* Scanner de Reconciliação & Traqueamento Retroativo */}
      <div className="bg-gradient-to-br from-purple-950 via-slate-900 to-slate-950 rounded-2xl p-6 border border-purple-500/30 shadow-md text-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-purple-800/40">
          <div>
            <h3 className="text-base font-bold text-purple-400 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              Scanner de Traqueamento & Atribuição Retroativa
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Escaneia todo o histórico de conversas do WhatsApp do cliente, detecta ganchos de anúncios e reconcilia retroativamente com vendas fechadas.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
            Arma de Vendas 1x1 · Auditoria Histórica
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900/80 rounded-xl border border-purple-500/20">
          <div className="space-y-1">
            <span className="text-xs font-bold text-slate-200">Reconciliar Leads e Vendas Históricas</span>
            <p className="text-[11px] text-slate-400">
              Cruza as primeiras mensagens de cada conversa com as campanhas mapeadas e atualiza o relatório de ROI real.
            </p>
          </div>
          <button
            type="button"
            disabled={isReconciling}
            onClick={handleRunRetroactiveReconciliation}
            className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-2 shrink-0 shadow-sm"
          >
            {isReconciling ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Escaneando Histórico...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>⚡ Reconciliar Histórico Retroativo</span>
              </>
            )}
          </button>
        </div>

        {reconcileResult && (
          <div className="p-4 bg-purple-900/30 border border-purple-500/30 rounded-xl space-y-2 text-xs animate-in fade-in duration-200">
            <div className="flex items-center justify-between font-bold text-purple-300">
              <span>{reconcileResult.message}</span>
              {reconcileResult.totalAttributedRevenueBrl && (
                <span className="text-emerald-400 font-mono">R$ {reconcileResult.totalAttributedRevenueBrl} atribuídos</span>
              )}
            </div>
            {reconcileResult.campaignBreakdown && Object.keys(reconcileResult.campaignBreakdown).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-purple-500/20">
                {Object.entries(reconcileResult.campaignBreakdown).map(([camp, data]: any) => (
                  <div key={camp} className="p-2 bg-slate-950/60 rounded-lg border border-purple-500/10 flex justify-between items-center">
                    <span className="text-slate-300 font-mono text-[11px] truncate max-w-[200px]">{camp}</span>
                    <span className="font-bold text-purple-200 shrink-0">{data.leads} leads</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Link Click WA só volta quando houver criação e atribuição persistidas pela API. */}
      {salesOsRuntimeConfig.mode === 'api' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4" /> Link Click WA indisponível neste release</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            O gerador anterior criava links locais e alegava atribuição sem registrar campanha, criativo ou origem no backend.
            Ele permanece bloqueado até que a criação e a reconciliação sejam auditáveis pela API.
          </p>
        </div>
      )}


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
