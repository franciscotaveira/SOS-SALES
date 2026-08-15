/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Workspace, Journey, OperatorRole } from './types/cockpit';
import { WhatsAppGroup } from './types/groupsAndEngines';
import { mockAgencyGroups } from './data/groupFixtures';
import { salesOsGateway } from './services/salesOsGateway';
import { AppShell, NavigationTab } from './components/layout/AppShell';
import { CockpitView } from './components/cockpit/CockpitView';
import { AllConversationsView } from './components/conversations/AllConversationsView';
import { GroupsHubView } from './components/groups/GroupsHubView';
import { TrafficProofView } from './components/results/TrafficProofView';
import { ManagerDashboardView } from './components/dashboard/ManagerDashboardView';
import { SettingsShell } from './components/settings/SettingsShell';
import { CommercialKanbanView } from './components/kanban/CommercialKanbanView';
import { SalesAiPlaybookView } from './components/intelligence/SalesAiPlaybookView';
import { QaSimulatorView } from './components/intelligence/QaSimulatorView';
import { CanaisView } from './components/channels/CanaisView';
import { OfflineBanner } from './components/common/OfflineBanner';
import { FeatureFlagProvider, useFeatureFlags } from './contexts/FeatureFlagContext';
import { salesOsRuntimeConfig } from './config/runtime';
import { SupabaseAuthProvider, useSupabaseAuth } from './services/supabaseAuth';

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

      {activeTab === 'agora' && (
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

      {activeTab === 'conversas' && (
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
      )}

      {activeTab === 'kanban' && isFeatureEnabled('commercial_kanban') && (
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
      )}

      {activeTab === 'grupos' && isFeatureEnabled('agency_groups') && (
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
      )}

      {activeTab === 'analytics' && (
        <ManagerDashboardView />
      )}

      {activeTab === 'resultados' && isFeatureEnabled('traffic_proof') && (
        <TrafficProofView
          workspace={currentWorkspace}
          gateway={salesOsGateway}
          journeys={journeys}
        />
      )}

      {activeTab === 'playbook' && (
        <SalesAiPlaybookView
          currentWorkspace={currentWorkspace}
          workspaces={workspaces}
          onSelectWorkspace={onSelectWorkspace}
          activeSubTab={intelligenceSubTab}
          onChangeSubTab={setIntelligenceSubTab}
        />
      )}

      {activeTab === 'simulador' && (
        <QaSimulatorView
          onSimulateIncomingLeadMessage={onSimulateIncomingLeadMessage}
          onSimulateNetworkErrorToggle={onToggleForcedNetworkError}
          isNetworkErrorForced={isNetworkErrorForced}
        />
      )}



      {activeTab === 'configuracoes' && (
        <SettingsShell
          workspace={currentWorkspace}
          activeSubTab={settingsSubTab}
          onChangeSubTab={setSettingsSubTab}
        />
      )}
    </AppShell>
  );
}

function OperationalApp() {
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = React.useState<Workspace | null>(null);
  const [journeys, setJourneys] = React.useState<Journey[]>([]);
  const [agencyGroups, setAgencyGroups] = React.useState<WhatsAppGroup[]>(mockAgencyGroups);
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

        const jList = await salesOsGateway.getJourneys(defaultWs.id);
        if (!isMounted) return;
        setJourneys(jList);
        if (jList.length > 0) setSelectedJourneyId(jList[0].id);
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
      const list = await salesOsGateway.getJourneys(ws.id);
      setJourneys(list);
      if (list.length > 0) {
        setSelectedJourneyId(list[0].id);
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
