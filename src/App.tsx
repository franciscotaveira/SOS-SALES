/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
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
const GroupsHubView = React.lazy(() => import('./components/groups/GroupsHubView').then(({ GroupsHubView }) => ({ default: GroupsHubView })));
const TrafficProofView = React.lazy(() => import('./components/results/TrafficProofView').then(({ TrafficProofView }) => ({ default: TrafficProofView })));
const LiveTrafficProofView = React.lazy(() => import('./components/results/LiveTrafficProofView').then(({ LiveTrafficProofView }) => ({ default: LiveTrafficProofView })));
const ManagerDashboardView = React.lazy(() => import('./components/dashboard/ManagerDashboardView').then(({ ManagerDashboardView }) => ({ default: ManagerDashboardView })));
const SettingsShell = React.lazy(() => import('./components/settings/SettingsShell').then(({ SettingsShell }) => ({ default: SettingsShell })));
const CommercialKanbanView = React.lazy(() => import('./components/kanban/CommercialKanbanView').then(({ CommercialKanbanView }) => ({ default: CommercialKanbanView })));
const SalesAiPlaybookView = React.lazy(() => import('./components/intelligence/SalesAiPlaybookView').then(({ SalesAiPlaybookView }) => ({ default: SalesAiPlaybookView })));
const QaSimulatorView = React.lazy(() => import('./components/intelligence/QaSimulatorView').then(({ QaSimulatorView }) => ({ default: QaSimulatorView })));

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
}) {
  const { isFeatureEnabled } = useFeatureFlags();

  const [intelligenceSubTab, setIntelligenceSubTab] = React.useState<any>('knowledge');
  const [settingsSubTab, setSettingsSubTab] = React.useState<any>('ads_tracking');
  const [groupSubTab, setGroupSubTab] = React.useState<any>('conversations');

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
        isAuthenticatedApiMode && salesOsGateway instanceof HttpSalesOsGateway ? (
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
        )
      )}

      {activeTab === 'conversas' && (
        isAuthenticatedApiMode ? <ApiModeUnavailable title="Histórico completo em integração" detail="A fila e as mensagens reais já estão no Cockpit ao vivo. A tela de histórico com busca, filtros e paginação será liberada quando houver uma projeção autenticada equivalente." /> : (
          <AllConversationsView
            journeys={journeys}
            channels={currentWorkspace.channels}
            selectedJourneyId={selectedJourneyId}
            onSelectJourney={(j) => setSelectedJourneyId(j.id)}
            onGoToCockpit={(j) => {
              setSelectedJourneyId(j.id);
              setActiveTab('agora');
            }}
            onGoToKanban={() => setActiveTab('kanban')}
            currentOperatorId={currentOperatorId}
          />
        )
      )}

      {activeTab === 'kanban' && isFeatureEnabled('commercial_kanban') && (
        isAuthenticatedApiMode ? <ApiModeUnavailable title="Funil autenticado em integração" detail="Movimentação de estágio existe no backend, mas este quadro ainda precisa da projeção autenticada para não inventar SLA, valor, responsável ou resultado." /> : (
          <CommercialKanbanView
            journeys={journeys}
            onSelectJourney={(j) => {
              setSelectedJourneyId(j.id);
            }}
            onUpdateJourney={handleUpdateJourney}
            onSwitchToCockpit={() => setActiveTab('agora')}
            currentOperatorId={currentOperatorId}
            role={role}
          />
        )
      )}

      {activeTab === 'grupos' && isFeatureEnabled('agency_groups') && (
        isAuthenticatedApiMode ? <ApiModeUnavailable title="Hub de grupos ainda não está conectado" detail="Não há leitura autenticada de grupos nem uma sessão WAHA homologada para esta área. Por isso, dados e ping simulados foram bloqueados no modo de operação real." /> : (
          <GroupsHubView
            groups={agencyGroups}
            onUpdateGroup={(updated) => {
              setAgencyGroups((prev) =>
                prev.map((g) => (g.id === updated.id ? updated : g))
              );
            }}
            activeSubTab={groupSubTab}
            onChangeSubTab={setGroupSubTab}
          />
        )
      )}

      {activeTab === 'analytics' && (
        isAuthenticatedApiMode ? <ApiModeUnavailable title="Analytics real será liberado com a leitura de métricas" detail="O dashboard atual é uma demonstração. Métricas de aquisição, SLA e receita só aparecerão quando forem calculadas pelo backend a partir de eventos e resultados persistidos." /> : <ManagerDashboardView />
      )}

      {activeTab === 'resultados' && isFeatureEnabled('traffic_proof') && (
        isAuthenticatedApiMode && salesOsGateway instanceof HttpSalesOsGateway ? <LiveTrafficProofView workspaceId={currentWorkspace.id} workspaceName={currentWorkspace.name} gateway={salesOsGateway} /> : (
          <TrafficProofView
            workspace={currentWorkspace}
            gateway={salesOsGateway}
            journeys={journeys}
          />
        )
      )}

      {activeTab === 'playbook' && (
        isAuthenticatedApiMode ? <ApiModeUnavailable title="Playbook supervisionado em integração" detail="As recomendações reais aparecem no Cockpit. Configurações, guardrails e simuladores deste painel serão conectados apenas quando forem aplicados e auditados pelo servidor." /> : (
          <SalesAiPlaybookView
            currentWorkspace={currentWorkspace}
            workspaces={workspaces}
            onSelectWorkspace={onSelectWorkspace}
            activeSubTab={intelligenceSubTab}
            onChangeSubTab={setIntelligenceSubTab}
          />
        )
      )}

      {activeTab === 'simulador' && (
        isAuthenticatedApiMode ? <ApiModeUnavailable title="Simulador indisponível na operação real" detail="Geração de leads e falhas simuladas são permitidas apenas em demonstração. A operação autenticada não modifica dados comerciais com ações de QA." /> : (
          <QaSimulatorView
            onSimulateIncomingLeadMessage={onSimulateIncomingLeadMessage}
            onSimulateNetworkErrorToggle={onToggleForcedNetworkError}
            isNetworkErrorForced={isNetworkErrorForced}
          />
        )
      )}



      {activeTab === 'configuracoes' && (
        isAuthenticatedApiMode ? <ApiModeUnavailable title="Configurações de canal em integração" detail="A configuração de sessão, saúde, failover e políticas não pode ser simulada. Ela será liberada somente com controles owner-only e status reais do provedor." /> : (
          <SettingsShell
            workspace={currentWorkspace}
            activeSubTab={settingsSubTab}
            onChangeSubTab={setSettingsSubTab}
          />
        )
      )}
      </React.Suspense>
    </AppShell>
  );
}

function OperationalApp() {
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
  const [activeTab, setActiveTab] = React.useState<NavigationTab>('agora');
  const [role, setRole] = React.useState<OperatorRole>('operator');
  const [currentOperatorId] = React.useState('op-01');
  const [currentOperatorName] = React.useState('Você (Gestor)');
  const [isLoading, setIsLoading] = React.useState(true);
  const [operationalError, setOperationalError] = React.useState<string | null>(null);
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);
  const [isNetworkErrorForced, setIsNetworkErrorForced] = React.useState(false);
  const runtimeConfigurationError = salesOsRuntimeConfig.mode === 'unconfigured'
    ? salesOsRuntimeConfig.reason ?? 'A configuração de operação do SOS Sales está incompleta.'
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
        const defaultWs = wsList[0];
        setCurrentWorkspace(defaultWs ?? null);

        if (!defaultWs) {
          setOperationalError('Sua conta não possui nenhum workspace disponível.');
          return;
        }

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
    setCurrentWorkspace(ws);
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

  const handleUpdateJourney = (updated: Journey) => {
    setJourneys((prev) =>
      prev.map((j) => (j.id === updated.id ? updated : j))
    );
    // Persist to gateway storage
    salesOsGateway.updateJourney(updated).catch((err) => {
      console.error('Failed to persist journey to gateway:', err);
    });
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
          <h1 className="mt-2 text-2xl font-bold">O SOS Sales não exibirá dados de demonstração em produção.</h1>
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
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#00a884] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-mono tracking-wider text-slate-300">
            Carregando SOS Sales OS Cockpit...
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
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  if (auth.isLoading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-sm text-slate-200">Validando sessão segura…</div>;
  }

  if (!auth.session) {
    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setIsSubmitting(true);
      try {
        await auth.signInWithPassword(email, password);
      } catch (signInError) {
        setError(signInError instanceof Error ? signInError.message : 'Não foi possível iniciar a sessão.');
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <main className="min-h-screen bg-slate-950 px-6 flex items-center justify-center text-slate-100">
        <form onSubmit={submit} className="w-full max-w-md rounded-2xl border-2 border-blue-500/70 bg-slate-900 p-7 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">SOS Sales</p>
          <h1 className="mt-2 text-2xl font-bold">Entrar na operação</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Use sua conta autorizada. Acesso e dados são definidos pelo workspace no Supabase.</p>
          <label className="mt-5 block text-sm font-medium">E-mail
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label className="mt-4 block text-sm font-medium">Senha
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          {error && <p role="alert" className="mt-4 rounded-lg border border-rose-500/70 bg-rose-950/50 px-3 py-2 text-sm text-rose-100">{error}</p>}
          <button disabled={isSubmitting} type="submit" className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
            {isSubmitting ? 'Entrando…' : 'Entrar com segurança'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <>
      <div className="fixed right-3 top-3 z-50 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-lg">
        <span className="max-w-48 truncate">{auth.user?.email}</span>
        <button onClick={() => void auth.signOut()} className="rounded border border-slate-600 px-2 py-1 hover:bg-slate-800">Sair</button>
      </div>
      <OperationalApp />
    </>
  );
}

export default function App() {
  if (salesOsRuntimeConfig.mode === 'api') {
    return <SupabaseAuthProvider><AuthenticatedApp /></SupabaseAuthProvider>;
  }
  return <OperationalApp />;
}
