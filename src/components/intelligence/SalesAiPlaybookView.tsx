import React from 'react';
import { Workspace } from '../../types/cockpit';
import { ClientAgentHubView, IntelligenceTab } from './ClientAgentHubView';

interface SalesAiPlaybookViewProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  activeSubTab?: IntelligenceTab;
  onChangeSubTab?: (tab: IntelligenceTab) => void;
}

export const SalesAiPlaybookView: React.FC<SalesAiPlaybookViewProps> = ({
  currentWorkspace,
  workspaces,
  onSelectWorkspace,
  activeSubTab,
  onChangeSubTab,
}) => {
  return (
    <ClientAgentHubView
      currentWorkspace={currentWorkspace}
      workspaces={workspaces}
      onSelectWorkspace={onSelectWorkspace}
      activeSubTab={activeSubTab}
      onChangeSubTab={onChangeSubTab}
    />
  );
};
