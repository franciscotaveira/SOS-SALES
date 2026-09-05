import React from 'react';
import { salesOsRuntimeConfig } from '../../config/runtime';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import { ClientIntelligenceBundle } from '../../types/intelligence';
import { CompanyProfileSection } from './CompanyProfileSection';
import { ProductCatalogSection } from './ProductCatalogSection';
import { AgentKnowledgeBaseSection } from './AgentKnowledgeBaseSection';
import { ContinuousLearningSection } from './ContinuousLearningSection';
import { HistoricalDiagnosisSection } from './HistoricalDiagnosisSection';
import { QaSimulatorView } from './QaSimulatorView';
import {
  Building2,
  ShoppingBag,
  Brain,
  Radio,
  TrendingUp,
  Award,
  Bot,
  Layers,
  CheckCircle2,
  Sparkles,
  Users,
  ChevronDown,
  Save,
  Loader2,
  Zap,
  FileText,
} from 'lucide-react';

import { SalesAiThesisConfig } from '../settings/SalesAiThesisConfig';

interface ClientAgentHubViewProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  activeSubTab?: IntelligenceTab;
  onChangeSubTab?: (tab: IntelligenceTab) => void;
  canManage?: boolean;
}

export type IntelligenceTab =
  | 'profile'
  | 'thesis'
  | 'diagnosis'
  | 'knowledge'
  | 'catalog'
  | 'simulator'
  | 'learning'
  | 'agent';

export function resolveWorkspaceIntelligenceBundle(wsId: string, wsName?: string): ClientIntelligenceBundle {
  const closedDay = { open: '', close: '', isOpen: false };
  return {
    workspaceId: wsId,
    companyProfile: {
      legalName: '', tradeName: wsName || '', taxId: '', segment: '', tagline: '', phone: '',
      email: '', website: '', instagram: '',
      address: { street: '', number: '', neighborhood: '', city: '', state: '', postalCode: '' },
      businessHours: {
        seg: { ...closedDay }, ter: { ...closedDay }, qua: { ...closedDay }, qui: { ...closedDay },
        sex: { ...closedDay }, sab: { ...closedDay }, dom: { ...closedDay },
      },
      wabaOfficialInfo: {
        verifiedName: '', metaBusinessId: '', phoneId: '', phoneNumber: '', greenBadgeVerified: false,
        qualityRating: 'YELLOW', messagingTier: '1k', wabaCatalogSync: false,
        metaFlowsEnabled: false, businessAiEnabled: false,
      },
      valueProposition: '', targetAudience: '', guaranteesAndPolicies: '', acceptedPaymentMethods: [],
    },
    agentConfig: {
      id: '', workspaceId: wsId, name: '', persona: '', toneOfVoice: 'consultivo_premium',
      autonomyMode: 'copilot_supervised', creativityTemperature: 0.2, maxDiscountPercent: 0,
      installmentLimitWithoutInterest: 1, allowedPaymentMethods: [], escalationTriggers: [],
      safetyGuardrails: [], workingHoursOnly: true, metaAiComparisonEnabled: false, activeChannels: [],
    },
    catalog: [], documents: [], learningRecords: [], sources: [], destinations: [],
  };
}

export const ClientAgentHubView: React.FC<ClientAgentHubViewProps> = ({
  currentWorkspace,
  workspaces,
  onSelectWorkspace,
  activeSubTab: externalActiveSubTab,
  onChangeSubTab,
  canManage = false,
}) => {
  const [internalTab, setInternalTab] = React.useState<IntelligenceTab>(externalActiveSubTab ?? 'knowledge');

  React.useEffect(() => {
    if (externalActiveSubTab) {
      setInternalTab(externalActiveSubTab);
    }
  }, [externalActiveSubTab]);

  const productionTabs = new Set<IntelligenceTab>(['profile', 'knowledge', 'catalog', 'simulator', 'diagnosis']);
  const requestedTab = externalActiveSubTab ?? internalTab;
  const activeTab: IntelligenceTab = salesOsRuntimeConfig.mode === 'api' && !productionTabs.has(requestedTab)
    ? 'knowledge'
    : requestedTab;

  const handleTabChange = (tab: IntelligenceTab) => {
    setInternalTab(tab);
    onChangeSubTab?.(tab);
  };

  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [bundleStatus, setBundleStatus] = React.useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [wabaChannelInfo, setWabaChannelInfo] = React.useState<{
    configured?: boolean;
    credentialsAvailable?: boolean;
    phoneNumber?: string | null;
    phoneNumberId?: string | null;
    wabaId?: string | null;
    verifiedName?: string | null;
    qualityRating?: string | null;
  } | null>(null);

  const [bundleMap, setBundleMap] = React.useState<Record<string, ClientIntelligenceBundle>>({});
  const intelligenceCanManage = canManage && bundleStatus !== 'loading' && bundleStatus !== 'error';

  React.useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setBundleStatus('loading');
    authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/intelligence`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Intelligence API ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!isMounted || !data) return;
        if (data.bundle && typeof data.bundle === 'object') {
          setBundleMap((prev) => ({
            ...prev,
            [currentWorkspace.id]: data.bundle,
          }));
          setBundleStatus('ready');
        } else {
          setBundleMap((prev) => {
            const next = { ...prev };
            delete next[currentWorkspace.id];
            return next;
          });
          setBundleStatus('empty');
        }
      })
      .catch(() => {
        if (isMounted) setBundleStatus('error');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentWorkspace.id]);

  // The authenticated workspace shell intentionally does not invent channel
  // data. Hydrate the profile from the WABA read model instead of relying on
  // `currentWorkspace.channels`, which is empty until a dedicated workspace
  // projection exists.
  React.useEffect(() => {
    let isMounted = true;
    setWabaChannelInfo(null);
    authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/channels/waba/channel-info`)
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (isMounted) setWabaChannelInfo(data && typeof data === 'object' ? data : null);
      })
      .catch(() => {
        if (isMounted) setWabaChannelInfo(null);
      });
    return () => {
      isMounted = false;
    };
  }, [currentWorkspace.id]);

  const currentBundle = React.useMemo(() => {
    const fallback = resolveWorkspaceIntelligenceBundle(currentWorkspace.id, currentWorkspace.name);
    const existing = bundleMap[currentWorkspace.id] || null;

    const liveQuality = String(wabaChannelInfo?.qualityRating || '').toUpperCase();
    const normalizedQuality = liveQuality === 'GREEN' || liveQuality === 'YELLOW' || liveQuality === 'RED'
      ? liveQuality as 'GREEN' | 'YELLOW' | 'RED'
      : fallback.companyProfile.wabaOfficialInfo.qualityRating;
    const liveWabaInfo = wabaChannelInfo?.configured && wabaChannelInfo.credentialsAvailable === true
      ? {
          ...fallback.companyProfile.wabaOfficialInfo,
          verifiedName: wabaChannelInfo.verifiedName || fallback.companyProfile.wabaOfficialInfo.verifiedName,
          metaBusinessId: wabaChannelInfo.wabaId || fallback.companyProfile.wabaOfficialInfo.metaBusinessId,
          phoneId: wabaChannelInfo.phoneNumberId || fallback.companyProfile.wabaOfficialInfo.phoneId,
          phoneNumber: wabaChannelInfo.phoneNumber || fallback.companyProfile.wabaOfficialInfo.phoneNumber,
          qualityRating: normalizedQuality,
        }
      : null;

    return {
      ...fallback,
      ...(existing || {}),
      companyProfile: {
        ...fallback.companyProfile,
        ...(existing?.companyProfile || {}),
        ...(liveWabaInfo ? { wabaOfficialInfo: liveWabaInfo } : {}),
      },
      agentConfig: {
        ...fallback.agentConfig,
        ...(existing?.agentConfig || {}),
        safetyGuardrails: Array.isArray(existing?.agentConfig?.safetyGuardrails)
          ? existing.agentConfig.safetyGuardrails
          : fallback.agentConfig.safetyGuardrails,
      },
      catalog: Array.isArray(existing?.catalog) ? existing.catalog.map((item) => ({
        ...item,
        basePrice: Number(item?.basePrice || 0),
        minPromoPrice: Number(item?.minPromoPrice ?? item?.basePrice ?? 0),
        tags: Array.isArray(item?.tags) ? item.tags : [],
        frequentlyAsked: Array.isArray(item?.frequentlyAsked) ? item.frequentlyAsked : [],
      })) : fallback.catalog,
      documents: Array.isArray(existing?.documents) ? existing.documents : fallback.documents,
      learningRecords: Array.isArray(existing?.learningRecords) ? existing.learningRecords.map((r) => ({
        ...r,
        confidenceScore: Number(r?.confidenceScore || 0),
      })) : fallback.learningRecords,
      sources: Array.isArray(existing?.sources) ? existing.sources : [],
      destinations: Array.isArray(existing?.destinations) ? existing.destinations : [],
    };
  }, [bundleMap, currentWorkspace, wabaChannelInfo]);

  const hasWabaConfiguration = Boolean(
    wabaChannelInfo?.configured
      && wabaChannelInfo.credentialsAvailable === true
      && wabaChannelInfo.phoneNumberId,
  );

  const updateCurrentBundle = async (updater: (prev: ClientIntelligenceBundle) => ClientIntelligenceBundle): Promise<boolean> => {
    if (!intelligenceCanManage) {
      setSaveError('Somente o proprietário pode editar a inteligência e o backend ainda não confirmou este bundle.');
      return false;
    }
    const updated = updater(currentBundle);
    setSaveError(null);
    setBundleMap((prev) => ({
      ...prev,
      [currentWorkspace.id]: updated,
    }));

    setIsSaving(true);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/intelligence`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: updated }),
      });
      if (!response.ok) {
        setSaveError(`Não foi possível persistir a inteligência (HTTP ${response.status}).`);
        return false;
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return true;
    } catch {
      setSaveError('Não foi possível alcançar o backend para persistir a inteligência.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/intelligence`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: currentBundle }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(`Não foi possível persistir a inteligência (HTTP ${res.status}).`);
      }
    } catch {
      setSaveError('Não foi possível alcançar o backend para persistir a inteligência.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="client-agent-hub-view" className="h-full overflow-y-auto w-full p-3 sm:p-4 max-w-7xl mx-auto space-y-4">
      {/* Top Client Header */}
      <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-xl p-3 sm:p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[var(--sos-ai)]/20 text-[var(--sos-ai)] flex items-center justify-center font-bold text-base shadow-2xs shrink-0">
            {currentWorkspace.name.substring(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-sm font-bold text-[var(--sos-ink)] font-heading truncate">
                {currentWorkspace.name}
              </h1>
            <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border border-[var(--sos-ai)]/30 flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-[var(--sos-ai)]" /> Inteligência Comercial
            </span>
            {!canManage && (
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Somente leitura
              </span>
            )}
              {hasWabaConfiguration ? (
                <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5 text-sky-600" /> Credenciais Meta registradas
                </span>
              ) : (
                <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                  <Radio className="w-2.5 h-2.5 text-slate-400" /> WhatsApp Não Confirmado
                </span>
              )}
            </div>

            <p className="text-[9.5px] text-[var(--sos-muted)] truncate">
              {currentBundle.companyProfile.tagline || currentWorkspace.tagline}
            </p>
          </div>
        </div>

        {/* Action Controls & Save Status */}
        <div className="flex items-center gap-2 shrink-0">
          {isSaving ? (
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
            </span>
          ) : saveSuccess ? (
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Salvo no Supabase
            </span>
          ) : saveError ? (
            <span role="alert" className="text-[11px] font-medium text-rose-600 flex items-center gap-1">
              {saveError}
            </span>
          ) : null}

          <button
            type="button"
            onClick={handleManualSave}
            disabled={isSaving || !intelligenceCanManage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar Inteligência</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-[var(--sos-border)]">
        <button
          type="button"
          onClick={() => handleTabChange('knowledge')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'knowledge'
              ? 'bg-[var(--sos-ink)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          <span>Base de Conhecimento & Arquivos</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            activeTab === 'knowledge'
              ? 'bg-white/20 text-white'
              : 'bg-[var(--sos-border)] text-[var(--sos-muted)]'
          }`}>
            {currentBundle.documents.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('simulator')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'simulator'
              ? 'bg-[var(--sos-ai)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-300" />
          <span>Simulador & Treinador IA</span>
          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30">
            Padrão Meta
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('catalog')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'catalog'
              ? 'bg-[var(--sos-ink)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Catálogo & Preços</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            activeTab === 'catalog'
              ? 'bg-white/20 text-white'
              : 'bg-[var(--sos-border)] text-[var(--sos-muted)]'
          }`}>
            {currentBundle.catalog.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('profile')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-[var(--sos-ink)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Perfil da Empresa</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('diagnosis')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'diagnosis'
              ? 'bg-[var(--sos-ink)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Diagnóstico</span>
        </button>
      </div>

      {/* Active Section Content */}
      {bundleStatus === 'empty' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <strong>Nenhuma inteligência persistida neste workspace.</strong>{' '}
          Catálogo, documentos e regras permanecem vazios até serem cadastrados e salvos no backend.
        </div>
      )}

      {bundleStatus === 'error' && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          <strong>Falha ao carregar a inteligência do backend.</strong> Nenhum dado substituto foi exibido.
        </div>
      )}

      {activeTab === 'diagnosis' && (
        <HistoricalDiagnosisSection workspace={currentWorkspace} />
      )}

      {(activeTab === 'knowledge' || !activeTab) && (
        <AgentKnowledgeBaseSection
          documents={currentBundle.documents}
          onUploadDocument={async (input) => {
            if (!intelligenceCanManage) throw new Error('Somente o proprietário pode editar a base de conhecimento.');
            const res = await authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/knowledge-docs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: input.name,
                category: input.category,
                content: input.content,
                fileName: input.name,
                fileSize: input.fileSize,
              }),
            });
            if (!res.ok) throw new Error(`Knowledge document API ${res.status}`);
            const data = await res.json();
            const document = data?.document;
            if (!document?.id) throw new Error('Knowledge document response missing id');
            return {
              id: String(document.id),
              name: String(document.title || input.name),
              fileType: input.fileType,
              fileSize: String(document.file_size || input.fileSize),
              uploadedAt: String(document.created_at || new Date().toISOString()),
              uploadedBy: 'Backend SOS Vendas',
              category: input.category,
              status: document.status === 'ready' ? 'indexed' : 'pending',
              extractedChunksCount: Number(document.chunks_count || 1),
              tokenCount: Math.max(1, Math.floor(input.content.length / 4)),
              summary: String(document.title || input.name),
              rawContentSnippet: input.content.slice(0, 1400),
              isPrioritizedFact: false,
              factType: input.category === 'tabela_precos' ? 'pricing' : 'faq',
            };
          }}
          onDeleteDocument={async (id) => {
            if (!intelligenceCanManage) return false;
            const res = await authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/knowledge-docs/${id}`, {
              method: 'DELETE',
            });
            return res.ok;
          }}
          onUpdateDocuments={(docs) => {
            void updateCurrentBundle((prev) => ({ ...prev, documents: docs }));
          }}
          canManage={intelligenceCanManage}
        />
      )}

      {activeTab === 'profile' && (
        <CompanyProfileSection
          profile={currentBundle.companyProfile}
          readOnly={!intelligenceCanManage}
          onSaveProfile={async (profile) => {
            return updateCurrentBundle((prev) => ({ ...prev, companyProfile: profile }));
          }}
        />
      )}

      {activeTab === 'catalog' && (
        <ProductCatalogSection
          catalog={currentBundle.catalog}
          canManage={intelligenceCanManage}
          onUpdateCatalog={(items) => {
            void updateCurrentBundle((prev) => ({ ...prev, catalog: items }));
          }}
        />
      )}

      {activeTab === 'simulator' && (
        <QaSimulatorView currentWorkspace={currentWorkspace} bundle={currentBundle} />
      )}

      {activeTab === 'thesis' && <SalesAiThesisConfig workspaceId={currentWorkspace.id} />}

      {activeTab === 'learning' && (
        <ContinuousLearningSection
          learningRecords={currentBundle.learningRecords}
          onApproveRecord={(id) => {
            updateCurrentBundle((prev) => ({
              ...prev,
              learningRecords: prev.learningRecords.map((r) =>
                r.id === id ? { ...r, status: 'curated_approved' } : r
              ),
            }));
          }}
          onRejectRecord={(id) => {
            updateCurrentBundle((prev) => ({
              ...prev,
              learningRecords: prev.learningRecords.map((r) =>
                r.id === id ? { ...r, status: 'rejected' } : r
              ),
            }));
          }}
        />
      )}

      {activeTab === 'agent' && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center space-y-2 text-amber-950">
          <Bot className="w-8 h-8 mx-auto text-amber-600" />
          <h2 className="text-sm font-bold">Squad de agentes ainda sem contrato operacional</h2>
          <p className="text-xs leading-relaxed max-w-2xl mx-auto">
            A antiga configuração de seis especialistas existia apenas no navegador e não correspondia ao
            agente Receptionist executado pelo backend. O painel foi bloqueado até existir persistência,
            versionamento e prova de execução por agente.
          </p>
        </div>
      )}
    </div>
  );
};
