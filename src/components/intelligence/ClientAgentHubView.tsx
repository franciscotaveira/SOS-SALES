import React from 'react';
import { Workspace } from '../../types/cockpit';
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
  | 'diagnosis'
  | 'knowledge'
  | 'catalog'
  | 'thesis'
  | 'learning'
  | 'company'
  | 'agent';

export function resolveWorkspaceIntelligenceBundle(wsId: string, wsName?: string): ClientIntelligenceBundle {
  const normId = (wsId || '').toLowerCase().trim();
  const normName = (wsName || '').toLowerCase().trim();

  if (normId === '22222222-2222-2222-2222-222222222222' || normName === 'haven' || normName === 'haven escovaria & esmalteria') {
    return {
      ...mockHavenIntelligence,
      workspaceId: wsId,
      companyProfile: {
        ...mockHavenIntelligence.companyProfile,
        tradeName: wsName || mockHavenIntelligence.companyProfile.tradeName,
      },
    };
  }

  if (normId === '33333333-3333-3333-3333-333333333333' || normName === 'sora' || normName === 'sora spa') {
    return {
      ...mockSoraIntelligence,
      workspaceId: wsId,
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
    workspaceId: wsId,
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

  const STORAGE_KEY = 'sos_sales_intelligence_bundles_v2';
  const [bundleMap, setBundleMap] = React.useState<Record<string, ClientIntelligenceBundle>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
    return clientIntelligenceMap;
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bundleMap));
    } catch {}
  }, [bundleMap]);

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
    setBundleMap((prev) => {
      const existing = prev[currentWorkspace.id] || currentBundle;
      return {
        ...prev,
        [currentWorkspace.id]: updater(existing),
      };
    });
  };

  return (
    <div id="client-agent-hub-view" className="h-full overflow-y-auto w-full p-3 sm:p-4 max-w-7xl mx-auto space-y-4">
      {/* Top Client Header & Quick Switcher */}
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
                <Sparkles className="w-2.5 h-2.5 text-[var(--sos-ai)]" /> Agente IA Dedicado
              </span>
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--sos-success-subtle)] text-[var(--sos-success)] border border-[var(--sos-success)]/30 flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-[var(--sos-success)]" /> WhatsApp Oficial Conectado
              </span>
            </div>

            <p className="text-[9.5px] text-[var(--sos-muted)] truncate">
              {currentBundle.companyProfile.tagline || currentWorkspace.tagline}
            </p>
          </div>
        </div>

        {/* Client Workspace Selector */}
        <div className="flex items-center gap-1.5 shrink-0 self-start md:self-center">
          <label className="text-xs font-semibold text-[var(--sos-muted)] whitespace-nowrap hidden sm:inline">
            Configurações do Cliente:
          </label>
          <div className="relative">
            <select
              value={currentWorkspace.id}
              onChange={(e) => {
                const target = workspaces.find((w) => w.id === e.target.value);
                if (target) onSelectWorkspace(target);
              }}
              className="appearance-none pl-2.5 pr-7 py-1.5 bg-[var(--sos-background)] border border-[var(--sos-border)] rounded-lg text-[9.5px] font-bold text-[var(--sos-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--sos-ai)] cursor-pointer"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-[var(--sos-muted)] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
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

      {activeTab === 'company' && (
        <CompanyProfileSection
          profile={currentBundle.companyProfile}
          onSaveProfile={(updated) => {
            updateCurrentBundle((prev) => ({ ...prev, companyProfile: updated }));
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
