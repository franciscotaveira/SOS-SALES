import React from 'react';
import { salesOsRuntimeConfig } from '../../config/runtime';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import {
  clientIntelligenceMap,
  mockSosSalesIntelligence,
  mockHavenIntelligence,
  mockSoraIntelligence,
} from '../../data/clientIntelligenceFixtures';
import { ClientIntelligenceBundle } from '../../types/intelligence';
import { CompanyProfileSection } from './CompanyProfileSection';
import { ProductCatalogSection } from './ProductCatalogSection';
import { AgentKnowledgeBaseSection } from './AgentKnowledgeBaseSection';
import { ContinuousLearningSection } from './ContinuousLearningSection';
import { AgentSettingsSection } from './AgentSettingsSection';
import { HistoricalDiagnosisSection } from './HistoricalDiagnosisSection';
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
} from 'lucide-react';

import { SalesAiThesisConfig } from '../settings/SalesAiThesisConfig';

interface ClientAgentHubViewProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  activeSubTab?: IntelligenceTab;
  onChangeSubTab?: (tab: IntelligenceTab) => void;
}

export type IntelligenceTab =
  | 'thesis'
  | 'diagnosis'
  | 'knowledge'
  | 'catalog'
  | 'learning'
  | 'agent';

export function resolveWorkspaceIntelligenceBundle(wsId: string, wsName?: string): ClientIntelligenceBundle {
  const norm = String(wsId).toLowerCase().trim();
  if (norm.includes('haven') || norm === '22222222-2222-2222-2222-222222222222') {
    return {
      ...mockHavenIntelligence,
      companyProfile: {
        ...mockHavenIntelligence.companyProfile,
        tradeName: wsName || mockHavenIntelligence.companyProfile.tradeName,
      },
    };
  }
  if (norm.includes('sora') || norm === '33333333-3333-3333-3333-333333333333') {
    return {
      ...mockSoraIntelligence,
      companyProfile: {
        ...mockSoraIntelligence.companyProfile,
        tradeName: wsName || mockSoraIntelligence.companyProfile.tradeName,
      },
    };
  }
  if (clientIntelligenceMap[wsId]) {
    return clientIntelligenceMap[wsId];
  }
  return {
    ...mockSosSalesIntelligence,
    companyProfile: {
      ...mockSosSalesIntelligence.companyProfile,
      tradeName: wsName || mockSosSalesIntelligence.companyProfile.tradeName,
    },
  };
}

export const ClientAgentHubView: React.FC<ClientAgentHubViewProps> = ({
  currentWorkspace,
  workspaces,
  onSelectWorkspace,
  activeSubTab: externalActiveSubTab,
  onChangeSubTab: externalOnChangeSubTab,
}) => {
  const [internalActiveTab, setInternalActiveTab] = React.useState<IntelligenceTab>('knowledge');
  const activeTab = externalActiveSubTab !== undefined ? externalActiveSubTab : internalActiveTab;
  const setActiveTab = externalOnChangeSubTab !== undefined ? externalOnChangeSubTab : setInternalActiveTab;

  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  const [bundleMap, setBundleMap] = React.useState<Record<string, ClientIntelligenceBundle>>(() => {
    return clientIntelligenceMap;
  });

  React.useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/intelligence`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (data.bundle && typeof data.bundle === 'object') {
          setBundleMap((prev) => ({
            ...prev,
            [currentWorkspace.id]: data.bundle,
          }));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentWorkspace.id]);

  const currentBundle = React.useMemo(() => {
    const fallback = resolveWorkspaceIntelligenceBundle(currentWorkspace.id, currentWorkspace.name);
    const existing = bundleMap[currentWorkspace.id];
    if (!existing) return fallback;

    return {
      ...fallback,
      ...existing,
      companyProfile: { ...fallback.companyProfile, ...(existing.companyProfile || {}) },
      agentConfig: {
        ...fallback.agentConfig,
        ...(existing.agentConfig || {}),
        safetyGuardrails: Array.isArray(existing.agentConfig?.safetyGuardrails)
          ? existing.agentConfig.safetyGuardrails
          : fallback.agentConfig.safetyGuardrails,
      },
      catalog: Array.isArray(existing.catalog) ? existing.catalog.map((item) => ({
        ...item,
        basePrice: Number(item?.basePrice || 0),
        minPromoPrice: Number(item?.minPromoPrice ?? item?.basePrice ?? 0),
        tags: Array.isArray(item?.tags) ? item.tags : [],
        frequentlyAsked: Array.isArray(item?.frequentlyAsked) ? item.frequentlyAsked : [],
      })) : fallback.catalog,
      documents: Array.isArray(existing.documents) ? existing.documents : fallback.documents,
      learningRecords: Array.isArray(existing.learningRecords) ? existing.learningRecords.map((r) => ({
        ...r,
        confidenceScore: Number(r?.confidenceScore || 0),
      })) : fallback.learningRecords,
    };
  }, [bundleMap, currentWorkspace]);

  const updateCurrentBundle = (updater: (prev: ClientIntelligenceBundle) => ClientIntelligenceBundle) => {
    const updated = updater(currentBundle);
    setBundleMap((prev) => ({
      ...prev,
      [currentWorkspace.id]: updated,
    }));

    setIsSaving(true);
    authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/intelligence`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle: updated }),
    })
      .then((r) => {
        if (r.ok) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2000);
        }
      })
      .catch(() => {})
      .finally(() => setIsSaving(false));
  };

  const handleManualSave = async () => {
    setIsSaving(true);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/intelligence`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: currentBundle }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
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
                <Sparkles className="w-2.5 h-2.5 text-[var(--sos-ai)]" /> Squad de IA
              </span>
              {currentWorkspace.channels?.some((c) => c.health === 'healthy' || c.health === 'connected') ? (
                <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border border-[var(--sos-success)]/30 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5 text-[var(--sos-success)]" /> WhatsApp Conectado
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
          ) : null}

          <button
            type="button"
            onClick={handleManualSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar Inteligência</span>
          </button>
        </div>
      </div>

      {/* Active Section Content (Navigation controlled via sidebar) */}
      {activeTab === 'diagnosis' && (
        <HistoricalDiagnosisSection workspace={currentWorkspace} />
      )}

      {(activeTab === 'knowledge' || !activeTab) && (
        <AgentKnowledgeBaseSection
          documents={currentBundle.documents}
          onUpdateDocuments={(docs) => {
            updateCurrentBundle((prev) => ({ ...prev, documents: docs }));
          }}
        />
      )}

      {activeTab === 'catalog' && (
        <ProductCatalogSection
          catalog={currentBundle.catalog}
          onUpdateCatalog={(items) => {
            updateCurrentBundle((prev) => ({ ...prev, catalog: items }));
          }}
        />
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
        <AgentSettingsSection
          agentConfig={currentBundle.agentConfig}
          onSaveAgentConfig={(updated) => {
            updateCurrentBundle((prev) => ({ ...prev, agentConfig: updated }));
          }}
        />
      )}
    </div>
  );
};
