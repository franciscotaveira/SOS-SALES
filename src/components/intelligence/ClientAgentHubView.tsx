import React from 'react';
import { Workspace } from '../../types/cockpit';
import {
  clientIntelligenceMap,
  mockEscovariaIntelligence,
} from '../../data/clientIntelligenceFixtures';
import { ClientIntelligenceBundle } from '../../types/intelligence';
import { CompanyProfileSection } from './CompanyProfileSection';
import { ProductCatalogSection } from './ProductCatalogSection';
import { AgentKnowledgeBaseSection } from './AgentKnowledgeBaseSection';
import { IntelligenceDataFlowSection } from './IntelligenceDataFlowSection';
import { ContinuousLearningSection } from './ContinuousLearningSection';
import { MetaAiBenchmarkSection } from './MetaAiBenchmarkSection';
import { AgentSettingsSection } from './AgentSettingsSection';
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

interface ClientAgentHubViewProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  activeSubTab?: IntelligenceTab;
  onChangeSubTab?: (tab: IntelligenceTab) => void;
}

export type IntelligenceTab =
  | 'company'
  | 'catalog'
  | 'knowledge'
  | 'dataflow'
  | 'learning'
  | 'benchmark'
  | 'agent';

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

  // Client Bundle state scoped strictly to the selected client workspace
  const [bundleMap, setBundleMap] = React.useState<Record<string, ClientIntelligenceBundle>>(clientIntelligenceMap);

  const currentBundle = React.useMemo(() => {
    return bundleMap[currentWorkspace.id] || {
      ...mockEscovariaIntelligence,
      workspaceId: currentWorkspace.id,
      companyProfile: {
        ...mockEscovariaIntelligence.companyProfile,
        tradeName: currentWorkspace.name,
      },
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
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> WABA Oficial Verificado
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

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 text-xs">
        <button
          onClick={() => setActiveTab('knowledge')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
            activeTab === 'knowledge'
              ? 'bg-purple-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Brain className="w-4 h-4" />
          <span>Banco de Inteligência & Arquivos ({currentBundle.documents.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
            activeTab === 'catalog'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Catálogo Oficial & Serviços ({currentBundle.catalog.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('dataflow')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
            activeTab === 'dataflow'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>De Onde Vem ➔ Para Onde Vai</span>
        </button>

        <button
          onClick={() => setActiveTab('learning')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
            activeTab === 'learning'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Aprendizado Contínuo ({currentBundle.learningRecords.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('company')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
            activeTab === 'company'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Empresa & WABA Oficial</span>
        </button>

        <button
          onClick={() => setActiveTab('agent')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
            activeTab === 'agent'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>Persona & Alçadas</span>
        </button>

        <button
          onClick={() => setActiveTab('benchmark')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all ${
            activeTab === 'benchmark'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Meta AI Benchmark</span>
        </button>
      </div>

      {/* Active Tab Component */}
      {activeTab === 'knowledge' && (
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

      {activeTab === 'dataflow' && (
        <IntelligenceDataFlowSection
          sources={currentBundle.sources}
          destinations={currentBundle.destinations}
        />
      )}

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

      {activeTab === 'benchmark' && <MetaAiBenchmarkSection />}
    </div>
  );
};
