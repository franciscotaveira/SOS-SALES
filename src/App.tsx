/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component } from 'react';
import { Workspace, Journey, OperatorRole } from './types/cockpit';
import { WhatsAppGroup } from './types/groupsAndEngines';
import { mockAgencyGroups } from './data/groupFixtures';
import { HttpSalesOsGateway, salesOsGateway } from './services/salesOsGateway';
import { AppShell, NavigationTab } from './components/layout/AppShell';
import { LiveCockpitView } from './components/cockpit/LiveCockpitView';
import { OfflineBanner } from './components/common/OfflineBanner';
import { FeatureFlagProvider, useFeatureFlags } from './contexts/FeatureFlagContext';
import { salesOsRuntimeConfig } from './config/runtime';
import { SupabaseAuthProvider, useSupabaseAuth } from './services/supabaseAuth';

// Demo-only surfaces are intentionally loaded on demand. In API mode they are
// blocked altogether, keeping the operator's initial cockpit fast and avoiding
// downloading simulated features that must never be mistaken for live data.
const CockpitView = React.lazy(() => import('./components/cockpit/CockpitView').then(({ CockpitView }) => ({ default: CockpitView })));
const AllConversationsView = React.lazy(() => import('./components/conversations/AllConversationsView').then(({ AllConversationsView }) => ({ default: AllConversationsView })));
const ConversationsHubView = React.lazy(() => import('./components/conversations/ConversationsHubView').then(({ ConversationsHubView }) => ({ default: ConversationsHubView })));
const GroupsHubView = React.lazy(() => import('./components/groups/GroupsHubView').then(({ GroupsHubView }) => ({ default: GroupsHubView })));
import { ResultsHubView, ResultsSubTab } from './components/results/ResultsHubView';
const SettingsShell = React.lazy(() => import('./components/settings/SettingsShell').then(({ SettingsShell }) => ({ default: SettingsShell })));
const LiveSettingsView = React.lazy(() => import('./components/settings/LiveSettingsView').then(({ LiveSettingsView }) => ({ default: LiveSettingsView })));
const AgencyClientsManager = React.lazy(() => import('./components/clients/AgencyClientsManager').then(({ AgencyClientsManager }) => ({ default: AgencyClientsManager })));
const CommercialKanbanView = React.lazy(() => import('./components/kanban/CommercialKanbanView').then(({ CommercialKanbanView }) => ({ default: CommercialKanbanView })));
import { LiveCommercialKanbanView } from './components/kanban/LiveCommercialKanbanView';
import { LiveConversationsView } from './components/conversations/LiveConversationsView';
const AgendaView = React.lazy(() => import('./components/agenda/AgendaView').then(({ AgendaView }) => ({ default: AgendaView })));
import { NotesView } from './components/notes/NotesView';
import { SalesAiPlaybookView } from './components/intelligence/SalesAiPlaybookView';
import { QaSimulatorView } from './components/intelligence/QaSimulatorView';
import { WorkspaceInitModal } from './components/workspace/WorkspaceInitModal';
import { OnboardingSetupAssistantModal } from './components/assistant/OnboardingSetupAssistantModal';
import { AssistedTutorialModal } from './components/assistant/AssistedTutorialModal';
import { Bot, Sparkles } from 'lucide-react';

interface TabErrorBoundaryProps {
  children: React.ReactNode;
  tabName: string;
}

interface TabErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): TabErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Error in tab ${this.props.tabName}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 max-w-xl mx-auto my-8 space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <Bot className="w-6 h-6 text-rose-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Falha ao renderizar {this.props.tabName}</h2>
          <p className="text-xs text-slate-500 leading-relaxed">{this.state.error?.message || 'Ocorreu um erro inesperado ao carregar este módulo.'}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all"
          >
            Recarregar Módulo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ApiModeUnavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
      <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">Integração em andamento</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">{detail}</p>
        <p className="mt-4 rounded-xl border-2 border-amber-200 bg-white px-4 py-3 text-sm text-slate-600">
          Esta área não exibirá dados de demonstração, métricas simuladas ou controles locais enquanto seu contrato autenticado não estiver disponível.
        </p>
      </section>
    </main>
  );
}

function AppContent({
  workspaces,
  currentWorkspace,
  onSelectWorkspace,
  journeys,
  agencyGroups,
  setAgencyGroups,
  selectedJourneyId,
  setSelectedJourneyId,
  activeTab,
  setActiveTab,
  role,
  setRole,
  currentOperatorId,
  currentOperatorName,
  isOffline,
  setIsOffline,
  isNetworkErrorForced,
  onSimulateIncomingLeadMessage,
  onToggleForcedNetworkError,
  handleUpdateJourney,
  isAuthenticatedApiMode,
  userEmail,
  onSignOut,
  onCreateWorkspace,
  onDeactivateWorkspace,
}: {
  workspaces: Workspace[];
  currentWorkspace: Workspace;
  onSelectWorkspace: (ws: Workspace) => void;
  journeys: Journey[];
  agencyGroups: WhatsAppGroup[];
  setAgencyGroups: React.Dispatch<React.SetStateAction<WhatsAppGroup[]>>;
  selectedJourneyId: string | undefined;
  setSelectedJourneyId: (id: string) => void;
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  role: OperatorRole;
  setRole: (r: OperatorRole) => void;
  currentOperatorId: string;
  currentOperatorName: string;
  isOffline: boolean;
  setIsOffline: (off: boolean) => void;
  isNetworkErrorForced: boolean;
  onSimulateIncomingLeadMessage: () => void;
  onToggleForcedNetworkError: () => void;
  handleUpdateJourney: (j: Journey) => void;
  isAuthenticatedApiMode: boolean;
  userEmail?: string;
  onSignOut?: () => void;
  onCreateWorkspace?: (workspaceData: {
    name: string;
    businessType: 'hair_salon' | 'auto_film' | 'general_services';
    tagline: string;
    ownerEmail: string;
    whatsappNumber: string;
    provider: 'waba' | 'waha';
  }) => Promise<void>;
  onDeactivateWorkspace?: (workspace: Workspace) => Promise<void>;
}) {
  const { isFeatureEnabled } = useFeatureFlags();
  const isProductionMvp = salesOsRuntimeConfig.mode === 'api';

  const [conversationsMode, setConversationsMode] = React.useState<'list' | 'kanban' | 'wallboard'>('list');
  const [intelligenceSubTab, setIntelligenceSubTab] = React.useState<any>('knowledge');
  const [settingsSubTab, setSettingsSubTab] = React.useState<any>('canais');
  const [groupSubTab, setGroupSubTab] = React.useState<any>('conversations');
  const [resultsSubTab, setResultsSubTab] = React.useState<ResultsSubTab>(
    isProductionMvp ? 'traffic_proof' : 'analytics',
  );
  const [isAssistantOpen, setIsAssistantOpen] = React.useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = React.useState<boolean>(() => {
    try {
      const completed = localStorage.getItem('sos_tutorial_completed');
      return completed !== 'true';
    } catch {
      return false;
    }
  });

  // Role-based security fallback: prevent unauthorized roles from viewing restricted tabs
  // Fine-grained RBAC tab authorization guard
  React.useEffect(() => {
    const roleHierarchy: Record<OperatorRole, number> = {
      viewer: 0,
      operator: 1,
      supervisor: 2,
      admin: 3,
      owner: 4,
    };
    const userLevel = roleHierarchy[role] ?? 1;

    if (activeTab === 'configuracoes' && userLevel < 4) {
      setActiveTab('agora');
    }
    if ((activeTab === 'clientes' || activeTab === 'resultados') && userLevel < 3) {
      setActiveTab('agora');
    }
  }, [activeTab, role, setActiveTab]);

  // Safety fallback if active tab gets disabled via feature flag
  React.useEffect(() => {
    if (activeTab === 'grupos' && !isFeatureEnabled('agency_groups')) {
      setActiveTab('agora');
    }
    if (activeTab === 'kanban' && !isFeatureEnabled('commercial_kanban')) {
      setActiveTab('agora');
    }
    if (activeTab === 'resultados' && !isFeatureEnabled('traffic_proof')) {
      setActiveTab('agora');
    }
  }, [activeTab, isFeatureEnabled, setActiveTab]);

  // Keep non-core modules preserved for future tiers without leaving direct
  // URLs, history entries or stale localStorage able to reopen them in the
  // production MVP. The live MVP exposes only intelligence that has a real
  // backend contract; legacy simulators and unsupported specialist screens
  // remain isolated from production navigation.
  React.useEffect(() => {
    const hiddenProductionTabs: NavigationTab[] = [
      'kanban',
      'agenda',
      'anotacoes',
      'grupos',
      'analytics',
    ];
    if (isProductionMvp && hiddenProductionTabs.includes(activeTab)) {
      setActiveTab('agora');
    }
  }, [activeTab, isProductionMvp, setActiveTab]);

  const pendingCount = journeys.filter((j) => j.handoffStatus === 'pending_operator').length;
  const pendingGroupsCount = agencyGroups.filter(
    (g) => g.healthStatus === 'pending_action' || g.unreadCount > 0
  ).length;

  return (
    <AppShell
      workspaces={workspaces}
      currentWorkspace={currentWorkspace}
      onSelectWorkspace={onSelectWorkspace}
      activeTab={activeTab}
      onChangeTab={setActiveTab}
      pendingPrioritiesCount={pendingCount}
      pendingGroupsCount={pendingGroupsCount}
      role={role}
      onChangeRole={setRole}
      onSimulateIncomingLeadMessage={onSimulateIncomingLeadMessage}
      onSimulateNetworkErrorToggle={onToggleForcedNetworkError}
      isNetworkErrorForced={isNetworkErrorForced}
      activeIntelligenceSubTab={intelligenceSubTab}
      onChangeIntelligenceSubTab={setIntelligenceSubTab}
      activeSettingsSubTab={settingsSubTab}
      onChangeSettingsSubTab={setSettingsSubTab}
      activeGroupSubTab={groupSubTab}
      onChangeGroupSubTab={setGroupSubTab}
      activeResultsSubTab={resultsSubTab}
      onChangeResultsSubTab={setResultsSubTab}
      activeConversationsMode={conversationsMode}
      onChangeConversationsMode={setConversationsMode}
      userEmail={userEmail}
      onSignOut={onSignOut}
      onOpenTutorial={() => setIsTutorialOpen(true)}
    >
      <OfflineBanner isOffline={isOffline} onReconnect={() => setIsOffline(false)} />

      <React.Suspense fallback={(
        <main className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
          <section className="rounded-2xl border-2 border-blue-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Carregando esta área…
          </section>
        </main>
      )}>

      {activeTab === 'agora' && (
        <TabErrorBoundary tabName="Cockpit de Atendimento (Agora)">
          {isAuthenticatedApiMode && salesOsGateway instanceof HttpSalesOsGateway ? (
            <LiveCockpitView
              workspaceId={currentWorkspace.id}
              selectedJourneyId={selectedJourneyId}
              onSelectedJourneyChange={setSelectedJourneyId}
              gateway={salesOsGateway}
            />
          ) : (
            <CockpitView
              workspace={currentWorkspace}
              gateway={salesOsGateway}
              journeys={journeys}
              selectedJourneyId={selectedJourneyId}
              onSelectJourney={(j) => setSelectedJourneyId(j.id)}
              onUpdateJourney={handleUpdateJourney}
              onViewAllConversations={() => setActiveTab('conversas')}
              role={role}
              currentOperatorId={currentOperatorId}
              currentOperatorName={currentOperatorName}
            />
          )}
        </TabErrorBoundary>
      )}

      {activeTab === 'kanban' && (
        <TabErrorBoundary tabName="Kanban Comercial">
          {isAuthenticatedApiMode ? (
            <LiveCommercialKanbanView
              workspaceId={currentWorkspace.id}
              gateway={salesOsGateway}
              onSelectJourney={(journeyId) => {
                setSelectedJourneyId(journeyId);
                setActiveTab('agora');
              }}
              onSwitchToCockpit={() => setActiveTab('agora')}
            />
          ) : (
            <ConversationsHubView
              journeys={journeys}
              groups={agencyGroups}
              channels={currentWorkspace.channels}
              workspace={currentWorkspace}
              selectedJourneyId={selectedJourneyId}
              onSelectJourney={(j) => setSelectedJourneyId(j.id)}
              onGoToCockpit={(j) => {
                setSelectedJourneyId(j.id);
                setActiveTab('agora');
              }}
              onOpenGroup={() => setActiveTab('grupos')}
              onUpdateJourney={handleUpdateJourney}
              currentOperatorId={currentOperatorId}
              role={role}
              initialViewMode="kanban"
            />
          )}
        </TabErrorBoundary>
      )}

      {activeTab === 'conversas' && (
        <TabErrorBoundary tabName="Conversas & Funil">
          {isAuthenticatedApiMode ? (
            <LiveConversationsView
              workspaceId={currentWorkspace.id}
              workspace={currentWorkspace}
              gateway={salesOsGateway}
              initialViewMode={conversationsMode}
              onJourneySelect={(journeyId) => {
                setSelectedJourneyId(journeyId);
                setActiveTab('agora');
              }}
              onSwitchToCockpit={() => setActiveTab('agora')}
            />
          ) : (
            <ConversationsHubView
              journeys={journeys}
              groups={agencyGroups}
              channels={currentWorkspace.channels}
              workspace={currentWorkspace}
              selectedJourneyId={selectedJourneyId}
              onSelectJourney={(j) => setSelectedJourneyId(j.id)}
              onGoToCockpit={(j) => {
                setSelectedJourneyId(j.id);
                setActiveTab('agora');
              }}
              onOpenGroup={() => setActiveTab('grupos')}
              onUpdateJourney={handleUpdateJourney}
              currentOperatorId={currentOperatorId}
              role={role}
              initialViewMode={conversationsMode}
            />
          )}
        </TabErrorBoundary>
      )}

      {activeTab === 'agenda' && (
        isProductionMvp ? (
          <ApiModeUnavailable
            title="Agenda ainda não está disponível no MVP autenticado"
            detail="A agenda legada dependia de dados locais. Ela permanece fora do caminho de produção até possuir leitura e gravação reais no backend."
          />
        ) : (
          <TabErrorBoundary tabName="Agenda Comercial">
            <AgendaView
              workspace={currentWorkspace}
              gateway={salesOsGateway}
              onGoToCockpitWithJourney={(journeyId) => {
                setSelectedJourneyId(journeyId);
                setActiveTab('agora');
              }}
            />
          </TabErrorBoundary>
        )
      )}

      {activeTab === 'anotacoes' && (
        isProductionMvp ? (
          <ApiModeUnavailable
            title="Anotações ainda não estão disponíveis no MVP autenticado"
            detail="As anotações legadas usavam armazenamento local. Nenhuma nota será exibida ou gravada até existir um contrato persistido para a equipe."
          />
        ) : (
          <TabErrorBoundary tabName="Anotações & Insights">
            <NotesView
              workspace={currentWorkspace}
              gateway={salesOsGateway}
            />
          </TabErrorBoundary>
        )
      )}

      {activeTab === 'grupos' && isFeatureEnabled('agency_groups') && (
        isProductionMvp ? (
          <ApiModeUnavailable
            title="Grupos ainda não estão disponíveis no MVP autenticado"
            detail="O monitor de grupos permanece preservado para uma fase posterior. O modo de produção não exibirá grupos simulados nem estados locais."
          />
        ) : (
          <TabErrorBoundary tabName="Hub de Grupos">
            <GroupsHubView
              groups={agencyGroups}
              workspaceId={currentWorkspace.id}
              onUpdateGroup={(updated) => {
                setAgencyGroups((prev) =>
                  prev.map((g) => (g.id === updated.id ? updated : g))
                );
              }}
              activeSubTab={groupSubTab}
              onChangeSubTab={setGroupSubTab}
            />
          </TabErrorBoundary>
        )
      )}

      {activeTab === 'clientes' && (
        <TabErrorBoundary tabName="Gestão de Clientes">
          <AgencyClientsManager
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            onSelectWorkspace={onSelectWorkspace}
            onCreateWorkspace={onCreateWorkspace}
            onDeactivateWorkspace={onDeactivateWorkspace}
            onNavigateTab={(tab, subTab) => {
              setActiveTab(tab);
              if (tab === 'playbook' && subTab) {
                setIntelligenceSubTab(subTab);
              }
            }}
          />
        </TabErrorBoundary>
      )}

      {activeTab === 'resultados' && isFeatureEnabled('traffic_proof') && (
        <TabErrorBoundary tabName="Resultados Comerciais & ROAS">
          <ResultsHubView
            workspace={currentWorkspace}
            gateway={salesOsGateway}
            journeys={journeys}
            isAuthenticatedApiMode={isAuthenticatedApiMode}
            activeSubTab={resultsSubTab}
            onChangeSubTab={setResultsSubTab}
          />
        </TabErrorBoundary>
      )}

      {activeTab === 'playbook' && (
        <TabErrorBoundary tabName="Inteligência & Agentes">
          <SalesAiPlaybookView
            currentWorkspace={currentWorkspace}
            workspaces={workspaces}
            onSelectWorkspace={onSelectWorkspace}
            activeSubTab={intelligenceSubTab}
            onChangeSubTab={setIntelligenceSubTab}
            canManage={currentWorkspace.operatorRole === 'owner'}
          />
        </TabErrorBoundary>
      )}

      {activeTab === 'simulador' && (
        <TabErrorBoundary tabName="Simulador QA">
          <QaSimulatorView
            currentWorkspace={currentWorkspace}
            onSimulateIncomingLeadMessage={onSimulateIncomingLeadMessage}
            onSimulateNetworkErrorToggle={onToggleForcedNetworkError}
            isNetworkErrorForced={isNetworkErrorForced}
            onNavigateToTab={(tab) => {
              setActiveTab('playbook');
              setIntelligenceSubTab(tab);
            }}
          />
        </TabErrorBoundary>
      )}

      {activeTab === 'configuracoes' && (
        <TabErrorBoundary tabName="Configurações">
          {isAuthenticatedApiMode ? (
            <LiveSettingsView
              workspace={currentWorkspace}
              activeSubTab={settingsSubTab}
              onChangeSubTab={setSettingsSubTab}
            />
          ) : (
            <SettingsShell
              workspace={currentWorkspace}
              activeSubTab={settingsSubTab}
              onChangeSubTab={setSettingsSubTab}
            />
          )}
        </TabErrorBoundary>
      )}
      </React.Suspense>

        {/* O assistente experimental continua disponível no laboratório, mas
            não ocupa a operação principal até possuir um contrato de setup
            específico e alinhado às telas realmente publicadas. */}
        {!isProductionMvp && <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => setIsAssistantOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#020617] text-white shadow-2xl shadow-slate-950/80 hover:scale-110 active:scale-95 transition-all duration-200 border-2 border-emerald-500 group cursor-pointer relative"
            title="Atlas Copilot IA - Assistente de Configuração"
            aria-label="Abrir Atlas Copilot IA"
          >
            <Bot className="h-6 w-6 text-emerald-400 group-hover:text-white transition-colors" />
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-slate-950 animate-pulse" />
          </button>
        </div>}

        {/* Modal Conversacional de Onboarding */}
        {!isProductionMvp && <OnboardingSetupAssistantModal
          currentWorkspace={currentWorkspace}
          isOpen={isAssistantOpen}
          onClose={() => setIsAssistantOpen(false)}
          onNavigateToTab={(tab) => {
            setActiveTab(tab);
            setIsAssistantOpen(false);
          }}
        />}

        {/* Guia Assistido de Configuração e Vendas (Onboarding Walkthrough) */}
        <AssistedTutorialModal
          currentWorkspace={currentWorkspace}
          isOpen={isTutorialOpen}
          onClose={() => setIsTutorialOpen(false)}
          onNavigateToTab={(tab, subTab) => {
            if (tab === 'kanban') {
              setActiveTab('conversas');
              setConversationsMode('kanban');
            } else {
              setActiveTab(tab);
            }
            if (subTab) {
              if (tab === 'configuracoes') setSettingsSubTab(subTab);
              if (tab === 'resultados') setResultsSubTab(subTab as ResultsSubTab);
              if (tab === 'grupos') setGroupSubTab(subTab);
              if (tab === 'playbook') setIntelligenceSubTab(subTab);
            }
          }}
          isChannelOnline={Boolean(currentWorkspace.channels?.some((c) => c.health === 'healthy' || c.health === 'connected' || (c as any).status === 'CONNECTED'))}
          isOfficialChannelConfigured={Boolean(currentWorkspace.channels?.some((c) => Boolean(c.wabaAccountId)))}
        />
      </AppShell>
    );
  }

function OperationalApp({
  userEmail,
  onSignOut,
}: {
  userEmail?: string;
  onSignOut?: () => void;
} = {}) {
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = React.useState<Workspace | null>(null);
  const [journeys, setJourneys] = React.useState<Journey[]>([]);
  // API mode never initializes commercial records from fixture data. Group
  // operations will receive their own authenticated read model in a later
  // slice; until then they are visibly empty rather than simulated.
  const [agencyGroups, setAgencyGroups] = React.useState<WhatsAppGroup[]>(() => (
    salesOsRuntimeConfig.mode === 'api' ? [] : mockAgencyGroups
  ));
  const [selectedJourneyId, setSelectedJourneyId] = React.useState<string | undefined>(undefined);
  // Clean URL Routing sync for SPAs (/agora, /conversas, /inteligencia, etc.)
  const pathToTab = React.useCallback((pathname: string): NavigationTab | null => {
    const clean = pathname.replace(/^\//, '').toLowerCase().split('/')[0];
    if (clean === 'agora' || clean === '') return 'agora';
    if (clean === 'conversas' || clean === 'funil' || clean === 'kanban') return 'conversas';
    if (clean === 'grupos') return 'grupos';
    if (clean === 'agenda') return 'agenda';
    if (clean === 'anotacoes' || clean === 'notes') return 'conversas';
    if (clean === 'clientes' || clean === 'empresas' || clean === 'clients') return 'clientes';
    if (clean === 'resultados' || clean === 'roi' || clean === 'analytics') return 'resultados';
    if (clean === 'inteligencia' || clean === 'playbook') return 'playbook';
    if (clean === 'simulador') return 'simulador';
    if (clean === 'configuracoes' || clean === 'config' || clean === 'settings') return 'configuracoes';
    return null;
  }, []);

  const tabToPath = (tab: NavigationTab): string => {
    switch (tab) {
      case 'agora': return '/agora';
      case 'conversas': return '/conversas';
      case 'kanban': return '/conversas';
      case 'grupos': return '/grupos';
      case 'agenda': return '/agenda';
      case 'anotacoes': return '/anotacoes';
      case 'clientes': return '/clientes';
      case 'resultados': return '/resultados';
      case 'analytics': return '/resultados';
      case 'playbook': return '/inteligencia';
      case 'simulador': return '/simulador';
      case 'configuracoes': return '/configuracoes';
      default: return '/agora';
    }
  };

  const [activeTab, setActiveTab] = React.useState<NavigationTab>(() => {
    try {
      const fromPath = pathToTab(window.location.pathname);
      if (fromPath) return fromPath;
      const saved = localStorage.getItem('sos_active_tab') as NavigationTab;
      const validTabs: NavigationTab[] = [
        'agora',
        'kanban',
        'conversas',
        'grupos',
        'agenda',
        'anotacoes',
        'clientes',
        'resultados',
        'analytics',
        'playbook',
        'simulador',
        'configuracoes',
      ];
      if (saved && validTabs.includes(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'agora';
  });

  // Sync activeTab with URL bar & history
  React.useEffect(() => {
    try {
      localStorage.setItem('sos_active_tab', activeTab);
      const targetPath = tabToPath(activeTab);
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath);
      }
    } catch {
      // ignore
    }
  }, [activeTab]);

  // Handle browser Back/Forward buttons
  React.useEffect(() => {
    const handlePopState = () => {
      const tab = pathToTab(window.location.pathname);
      if (tab) {
        setActiveTab(tab);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [pathToTab]);

  const [role, setRole] = React.useState<OperatorRole>('operator');
  const [currentOperatorId] = React.useState('op-01');
  const [currentOperatorName] = React.useState('Você (Gestor)');
  const [isLoading, setIsLoading] = React.useState(true);
  const [operationalError, setOperationalError] = React.useState<string | null>(null);
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);
  const [isNetworkErrorForced, setIsNetworkErrorForced] = React.useState(false);
  const runtimeConfigurationError = salesOsRuntimeConfig.mode === 'unconfigured'
    ? salesOsRuntimeConfig.reason ?? 'A configuração de operação do SOS Vendas está incompleta.'
    : null;

  // Online / Offline listener
  React.useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initial load of workspaces and journeys
  React.useEffect(() => {
    if (runtimeConfigurationError) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    void (async () => {
      try {
        const wsList = await salesOsGateway.getWorkspaces();
        if (!isMounted) return;
        setWorkspaces(wsList);

        let targetWs: Workspace | undefined;
        try {
          const savedWsId = localStorage.getItem('sos_selected_workspace_id');
          if (savedWsId) {
            targetWs = wsList.find((w) => w.id === savedWsId);
          }
        } catch {
          // ignore
        }

        const defaultWs = targetWs || wsList[0];
        setCurrentWorkspace(defaultWs ?? null);

        if (!defaultWs) {
          // A signed-in operator may be entering for the first time, either to
          // create a workspace or to redeem an owner-issued access code.
          // This is an expected state, not an operational failure.
          setOperationalError(null);
          return;
        }

        // In authenticated mode the backend membership is authoritative. Do
        // not hide or reveal screens based on a local default role.
        if (defaultWs.operatorRole) setRole(defaultWs.operatorRole);

        if (salesOsGateway instanceof HttpSalesOsGateway) {
          const page = await salesOsGateway.listJourneys(defaultWs.id, { limit: 20 });
          if (!isMounted) return;
          // `Journey` is a fixture-shaped type. Do not map authenticated
          // records into it with invented SLA, recommendation or outcome data.
          setJourneys([]);
          if (page.data.length > 0) setSelectedJourneyId(page.data[0].id);
        } else {
          const jList = await salesOsGateway.getJourneys(defaultWs.id);
          if (!isMounted) return;
          setJourneys(jList);
          if (jList.length > 0) setSelectedJourneyId(jList[0].id);
        }
      } catch (error) {
        if (!isMounted) return;
        setOperationalError(error instanceof Error ? error.message : 'Não foi possível carregar a operação autenticada.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [runtimeConfigurationError]);

  // When switching workspace
  const handleSelectWorkspace = async (ws: Workspace) => {
    try {
      localStorage.setItem('sos_selected_workspace_id', ws.id);
    } catch {
      // ignore
    }
    setCurrentWorkspace(ws);
    if (ws.operatorRole) setRole(ws.operatorRole);
    setIsLoading(true);
    try {
      if (salesOsGateway instanceof HttpSalesOsGateway) {
        const page = await salesOsGateway.listJourneys(ws.id, { limit: 20 });
        setJourneys([]);
        setSelectedJourneyId(page.data[0]?.id);
      } else {
        const list = await salesOsGateway.getJourneys(ws.id);
        setJourneys(list);
        if (list.length > 0) {
          setSelectedJourneyId(list[0].id);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWorkspace = async (data: {
    name: string;
    businessType: 'hair_salon' | 'auto_film' | 'general_services';
    tagline: string;
    ownerEmail: string;
    whatsappNumber: string;
    provider: 'waba' | 'waha';
  }) => {
    let createdWs: Workspace;

    if (salesOsGateway instanceof HttpSalesOsGateway) {
      if (!currentWorkspace) throw new Error('Selecione o workspace matriz antes de criar uma conta de cliente.');
      const created = await salesOsGateway.createClientWorkspace(currentWorkspace.id, data);
      createdWs = {
        id: created.workspaceId,
        name: created.workspaceName,
        slug: created.slug,
        operatorRole: created.role,
        businessType: data.businessType,
        tagline: data.tagline,
        activeOperatorCount: 1,
        tier: 'standard',
        channels: [{
          id: created.channelConnectionId,
          name: data.provider === 'waba' ? 'WhatsApp Oficial (Meta Cloud)' : 'WhatsApp Principal (WAHA)',
          phoneNumber: data.whatsappNumber || 'Aguardando conexão',
          health: 'disconnected',
          wabaAccountId: undefined,
        }],
      };
      setWorkspaces((prev) => [...prev, createdWs]);
    } else {
      const newId = `ws-client-${Date.now()}`;
      createdWs = {
        id: newId,
        name: data.name,
        slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
        businessType: data.businessType,
        tagline: data.tagline,
        activeOperatorCount: 1,
        tier: 'standard',
        channels: [
          {
            id: `chan-${newId}`,
            name: `WhatsApp (${data.provider.toUpperCase()})`,
            phoneNumber: data.whatsappNumber || '+55 49 98800-0000',
            health: 'connected',
            wabaAccountId: data.provider === 'waba' ? `waba_${newId}` : undefined,
          },
        ],
      };
      setWorkspaces((prev) => [...prev, createdWs]);
    }

    // Demo-only persistence. Authenticated API mode keeps the backend as the
    // sole source of truth for client workspaces and their configuration.
    if (salesOsRuntimeConfig.mode !== 'api') {
      try {
        const intelKey = 'sos_sales_intelligence_bundles_v2';
        const existing = JSON.parse(localStorage.getItem(intelKey) || '{}');
        existing[createdWs.id] = {
          workspaceId: createdWs.id,
          workspaceName: createdWs.name,
          companyProfile: {
            tradeName: createdWs.name,
            legalName: createdWs.name,
            cnpj: '',
            tagline: data.tagline,
            primaryColorHex: '#00A884',
            whatsappNumber: data.whatsappNumber,
            ownerEmail: data.ownerEmail,
            officialChannelType: data.provider,
            businessSegment: data.businessType,
          },
          catalog: [],
          documents: [],
          learningRecords: [],
        };
        localStorage.setItem(intelKey, JSON.stringify(existing));
      } catch {}
    }

    // Auto switch to the new workspace
    await handleSelectWorkspace(createdWs);
    // The next useful action for a new entry-plan customer is connecting the
    // real WhatsApp channel; do not strand them on an administrative list.
    setActiveTab('configuracoes');
  };

  const handleUpdateJourney = (updated: Journey) => {
    setJourneys((prev) =>
      prev.map((j) => (j.id === updated.id ? updated : j))
    );
    // Persist to gateway storage
    salesOsGateway.updateJourney(updated).catch((err) => {
      console.error('Failed to persist journey to gateway:', err);
    });
  };

  const handleDeactivateWorkspace = async (workspace: Workspace) => {
    if (!(salesOsGateway instanceof HttpSalesOsGateway)) {
      throw new Error('A desativação de clientes só está disponível na operação autenticada.');
    }
    if (workspace.id === currentWorkspace?.id) {
      throw new Error('Troque para outro cliente antes de desativar esta conta.');
    }
    await salesOsGateway.deactivateWorkspace(workspace.id);
    setWorkspaces((previous) => previous.filter((item) => item.id !== workspace.id));
    try {
      if (localStorage.getItem('sos_selected_workspace_id') === workspace.id) {
        localStorage.removeItem('sos_selected_workspace_id');
      }
    } catch {
      // Browser storage is only a convenience, never a source of truth.
    }
  };

  const handleSimulateIncomingLeadMessage = async () => {
    if (!selectedJourneyId) return;
    try {
      await salesOsGateway.simulateIncomingLeadMessage(
        selectedJourneyId,
        'Olá! Ainda estou aguardando a confirmação do horário, podem me responder?'
      );
      if (currentWorkspace) {
        const refreshed = await salesOsGateway.getJourneys(currentWorkspace.id);
        setJourneys(refreshed);
      }
    } catch {
      // ignore
    }
  };

  const handleToggleForcedNetworkError = () => {
    if ('shouldFailNextSend' in salesOsGateway && typeof salesOsGateway.shouldFailNextSend === 'boolean') {
      salesOsGateway.shouldFailNextSend = !isNetworkErrorForced;
    }
    setIsNetworkErrorForced(!isNetworkErrorForced);
  };

  if (runtimeConfigurationError) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 flex items-center justify-center text-slate-100">
        <section className="max-w-xl rounded-2xl border-2 border-amber-500/70 bg-slate-900 p-7 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">Configuração necessária</p>
          <h1 className="mt-2 text-2xl font-bold">O SOS Vendas não exibirá dados de demonstração em produção.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{runtimeConfigurationError}</p>
          <div className="mt-5 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-xs text-slate-200">
            VITE_SOS_API_URL=https://api.seudominio.com/api/v1{`\n`}
            VITE_SUPABASE_URL=https://seu-projeto.supabase.co{`\n`}
            VITE_SUPABASE_ANON_KEY=sua_chave_publica
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-400">
            Para uma demonstração local, use VITE_DEMO_MODE=true. Nunca use esse modo em produção.
          </p>
        </section>
      </main>
    );
  }

  if (isLoading || !currentWorkspace) {
    if (!isLoading && operationalError) {
      return (
        <main className="min-h-screen bg-slate-950 px-6 flex items-center justify-center text-slate-100">
          <section className="max-w-xl rounded-2xl border-2 border-rose-500/70 bg-slate-900 p-7 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-300">Operação indisponível</p>
            <h1 className="mt-2 text-2xl font-bold">A sessão foi protegida, mas o cockpit ainda não pode ser carregado.</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">{operationalError}</p>
            <p className="mt-3 text-xs leading-5 text-slate-400">Dados locais não serão usados como substituto para dados autenticados.</p>
          </section>
        </main>
      );
    }
    if (!isLoading && workspaces.length === 0 && !operationalError) {
      return (
        <WorkspaceInitModal
          onInit={async (name) => {
            setIsLoading(true);
            try {
              if (salesOsGateway instanceof HttpSalesOsGateway) {
                await salesOsGateway.initializeWorkspace(name);
              }
              const wsList = await salesOsGateway.getWorkspaces();
              setWorkspaces(wsList);
              if (wsList.length > 0) {
                setCurrentWorkspace(wsList[0]);
              }
            } catch (err: any) {
              setOperationalError(err?.message || 'Falha ao inicializar o workspace.');
            } finally {
              setIsLoading(false);
            }
          }}
          onAcceptInvite={async (code) => {
            setIsLoading(true);
            try {
              if (!(salesOsGateway instanceof HttpSalesOsGateway)) {
                throw new Error('O ingresso por convite exige uma sessão autenticada.');
              }
              await salesOsGateway.acceptWorkspaceInvitation(code);
              const wsList = await salesOsGateway.getWorkspaces();
              if (wsList.length === 0) throw new Error('O convite foi aceito, mas nenhum workspace pôde ser carregado. Atualize a página.');
              const defaultWs = wsList[0];
              setOperationalError(null);
              setWorkspaces(wsList);
              setCurrentWorkspace(defaultWs);
              if (defaultWs.operatorRole) setRole(defaultWs.operatorRole);
            } catch (err: any) {
              setOperationalError(err?.message || 'Não foi possível aceitar o convite.');
              throw err;
            } finally {
              setIsLoading(false);
            }
          }}
        />
      );
    }
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#00a884] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-mono tracking-wider text-slate-300">
            Carregando SOS Vendas OS Cockpit...
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {salesOsRuntimeConfig.mode === 'demo' && (
        <div className="bg-amber-500 px-4 py-2 text-center text-xs font-bold text-slate-950">
          Modo demonstração: dados locais não representam operação comercial real.
        </div>
      )}
      <FeatureFlagProvider workspace={currentWorkspace} role={role}>
        <AppContent
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          onSelectWorkspace={handleSelectWorkspace}
          journeys={journeys}
          agencyGroups={agencyGroups}
          setAgencyGroups={setAgencyGroups}
          selectedJourneyId={selectedJourneyId}
          setSelectedJourneyId={setSelectedJourneyId}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          role={role}
          setRole={setRole}
          currentOperatorId={currentOperatorId}
          currentOperatorName={currentOperatorName}
          isOffline={isOffline}
          setIsOffline={setIsOffline}
          isNetworkErrorForced={isNetworkErrorForced}
          onSimulateIncomingLeadMessage={handleSimulateIncomingLeadMessage}
          onToggleForcedNetworkError={handleToggleForcedNetworkError}
          handleUpdateJourney={handleUpdateJourney}
          isAuthenticatedApiMode={salesOsRuntimeConfig.mode === 'api'}
          userEmail={userEmail}
          onSignOut={onSignOut}
          onCreateWorkspace={handleCreateWorkspace}
          onDeactivateWorkspace={handleDeactivateWorkspace}
        />
      </FeatureFlagProvider>
    </>
  );
}

function AuthenticatedApp() {
  const auth = useSupabaseAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [resetMessage, setResetMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);

  if (auth.isLoading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-sm text-slate-200">Validando sessão segura…</div>;
  }

  if (!auth.session) {
    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setResetMessage(null);
      setIsSubmitting(true);
      try {
        await auth.signInWithPassword(email, password);
      } catch (signInError) {
        setError(signInError instanceof Error ? signInError.message : 'Não foi possível iniciar a sessão.');
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleForgotPassword = async () => {
      if (!email || !email.includes('@')) {
        setError('Por favor, digite seu e-mail corporativo acima para redefinir a senha.');
        return;
      }
      setError(null);
      setResetMessage(null);
      setIsResetting(true);
      try {
        await auth.resetPasswordForEmail(email);
        setResetMessage(`E-mail de redefinição enviado para ${email}. Verifique sua caixa de entrada!`);
      } catch (resetErr) {
        setError(resetErr instanceof Error ? resetErr.message : 'Falha ao solicitar redefinição de senha.');
      } finally {
        setIsResetting(false);
      }
    };

    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 selection:bg-emerald-100 selection:text-emerald-900 font-sans">
        <div className="w-full max-w-md p-8 sm:p-10 rounded-3xl bg-white border border-slate-200 shadow-xl text-slate-900">
          
          {/* Logo & Brand Header */}
          <div className="flex flex-col items-center text-center">
            <img src="/logo.svg" alt="SOS Vendas" className="h-11 w-auto mb-3" />
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold uppercase tracking-wider mb-2">
              🇧🇷 Cockpit Comercial Seguro
            </span>
            <h1 className="font-display text-2xl font-black text-slate-950">Acessar Cockpit</h1>
            <p className="mt-1.5 text-xs text-slate-500 max-w-xs leading-relaxed">
              Entre com sua conta autorizada para gerenciar suas conversas e equipe no WhatsApp.
            </p>
          </div>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                E-mail Corporativo
              </label>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="seu.email@empresa.com"
                autoComplete="email"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Senha de Acesso
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isResetting}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer disabled:opacity-50"
                >
                  {isResetting ? 'Enviando link…' : 'Esqueceu a senha?'}
                </button>
              </div>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
              />
            </div>

            {error && (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 font-medium leading-relaxed">
                ⚠️ {error}
              </div>
            )}

            {resetMessage && (
              <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 font-medium leading-relaxed">
                ✅ {resetMessage}
              </div>
            )}

            <button
              disabled={isSubmitting}
              type="submit"
              className="mt-6 w-full py-4 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              <span>{isSubmitting ? 'Validando acesso…' : 'Entrar no Cockpit Comercial →'}</span>
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">
              Protegido por criptografia TLS e em conformidade total com a LGPD.
            </p>
          </div>

        </div>
      </main>
    );
  }

  return (
    <OperationalApp
      userEmail={auth.user?.email}
      onSignOut={() => void auth.signOut()}
    />
  );
}

export default function App() {
  if (salesOsRuntimeConfig.mode === 'api') {
    return <SupabaseAuthProvider><AuthenticatedApp /></SupabaseAuthProvider>;
  }
  return <OperationalApp />;
}
