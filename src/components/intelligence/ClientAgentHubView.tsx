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
  const normId = (wsId || '').toLowerCase();
  const normName = (wsName || '').toLowerCase();

  if (normId.includes('haven') || normId.includes('escovaria') || normName.includes('haven') || normName.includes('escovaria')) {
    return {
      ...mockHavenIntelligence,
      workspaceId: wsId,
      companyProfile: {
        ...mockHavenIntelligence.companyProfile,
        tradeName: wsName || mockHavenIntelligence.companyProfile.tradeName,
      },
    };
  }

  if (normId.includes('sora') || normId.includes('spa') || normName.includes('sora') || normName.includes('spa')) {
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
    <div id="client-agent-hub-view" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Client Header & Quick Switcher */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00A884] to-emerald-700 text-white flex items-center justify-center font-bold text-lg shadow-md shrink-0">
            {currentWorkspace.name.substring(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-slate-900 font-heading truncate">
                {currentWorkspace.name}
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-600" /> Agente IA Dedicado
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> WhatsApp Oficial Conectado
              </span>
            </div>

            <p className="text-xs text-slate-500 truncate">
              {currentBundle.companyProfile.tagline || currentWorkspace.tagline}
            </p>
          </div>
        </div>

        {/* Client Workspace Selector */}
        <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
          <label className="text-xs font-semibold text-slate-500 whitespace-nowrap hidden sm:inline">
            Configurações do Cliente:
          </label>
          <div className="relative">
            <select
              value={currentWorkspace.id}
              onChange={(e) => {
                const target = workspaces.find((w) => w.id === e.target.value);
                if (target) onSelectWorkspace(target);
              }}
              className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00A884] cursor-pointer"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  🏢 {ws.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
