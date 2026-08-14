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
import { SettingsShell } from './components/settings/SettingsShell';
import { OfflineBanner } from './components/common/OfflineBanner';

export default function App() {
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
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);
  const [isNetworkErrorForced, setIsNetworkErrorForced] = React.useState(false);

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
    let isMounted = true;
    salesOsGateway.getWorkspaces().then((wsList) => {
      if (!isMounted) return;
      setWorkspaces(wsList);
      const defaultWs = wsList[0];
      setCurrentWorkspace(defaultWs);

      if (defaultWs) {
        salesOsGateway.getJourneys(defaultWs.id).then((jList) => {
          if (!isMounted) return;
          setJourneys(jList);
          if (jList.length > 0) {
            setSelectedJourneyId(jList[0].id);
          }
          setIsLoading(false);
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

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
    salesOsGateway.shouldFailNextSend = !isNetworkErrorForced;
    setIsNetworkErrorForced(!isNetworkErrorForced);
  };

  const pendingCount = journeys.filter((j) => j.handoffStatus === 'pending_operator').length;
  const pendingGroupsCount = agencyGroups.filter(
    (g) => g.healthStatus === 'pending_action' || g.unreadCount > 0
  ).length;

  if (isLoading || !currentWorkspace) {
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
    <AppShell
      workspaces={workspaces}
      currentWorkspace={currentWorkspace}
      onSelectWorkspace={handleSelectWorkspace}
      activeTab={activeTab}
      onChangeTab={setActiveTab}
      pendingPrioritiesCount={pendingCount}
      pendingGroupsCount={pendingGroupsCount}
      role={role}
      onChangeRole={setRole}
      onSimulateIncomingLeadMessage={handleSimulateIncomingLeadMessage}
      onSimulateNetworkErrorToggle={handleToggleForcedNetworkError}
      isNetworkErrorForced={isNetworkErrorForced}
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
          currentOperatorId={currentOperatorId}
        />
      )}

      {activeTab === 'grupos' && (
        <GroupsHubView
          groups={agencyGroups}
          onUpdateGroup={(updated) => {
            setAgencyGroups((prev) =>
              prev.map((g) => (g.id === updated.id ? updated : g))
            );
          }}
        />
      )}

      {activeTab === 'resultados' && (
        <TrafficProofView
          workspace={currentWorkspace}
          gateway={salesOsGateway}
          journeys={journeys}
        />
      )}

      {activeTab === 'configuracoes' && (
        <SettingsShell workspace={currentWorkspace} />
      )}
    </AppShell>
  );
}
