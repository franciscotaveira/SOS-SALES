import React, { useState } from 'react';
import { Journey, OperatorRole, Channel, Workspace } from '../../types/cockpit';
import { WhatsAppGroup } from '../../types/groupsAndEngines';
import { AllConversationsView } from './AllConversationsView';
import { CommercialKanbanView } from '../kanban/CommercialKanbanView';
import { LiveWallboardView } from '../monitoring/LiveWallboardView';
import { StartConversationModal } from './StartConversationModal';
import {
  List,
  Columns3,
  Tv,
  MessageSquare,
  MessageSquarePlus,
  Sparkles,
} from 'lucide-react';

interface ConversationsHubViewProps {
  journeys: Journey[];
  groups?: WhatsAppGroup[];
  channels?: Channel[];
  selectedJourneyId?: string;
  workspace: Workspace;
  onSelectJourney: (journey: Journey) => void;
  onGoToCockpit: (journey: Journey) => void;
  onOpenGroup?: (groupId: string) => void;
  onUpdateJourney?: (journey: Journey) => void;
  currentOperatorId?: string;
  role?: OperatorRole;
  initialViewMode?: 'list' | 'kanban' | 'wallboard';
}

export const ConversationsHubView: React.FC<ConversationsHubViewProps> = ({
  journeys,
  groups = [],
  channels = [],
  selectedJourneyId,
  workspace,
  onSelectJourney,
  onGoToCockpit,
  onOpenGroup,
  onUpdateJourney,
  currentOperatorId,
  role = 'operator',
  initialViewMode = 'list',
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'wallboard'>(initialViewMode);
  const [startModalOpen, setStartModalOpen] = useState(false);

  return (
    <>
      <div id="conversations-hub-container" className="h-full w-full flex flex-col overflow-hidden">
      {/* Top Universal Mode Switcher Bar */}
      <div className="bg-[var(--sos-surface)] border-b border-[var(--sos-border)] px-3 sm:px-4 py-2 flex items-center justify-between gap-2 shrink-0 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--sos-success-subtle)] text-[var(--sos-success)] flex items-center justify-center font-bold">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-black text-[var(--sos-ink)] font-heading">
              Central Comercial & Atendimento
            </h2>
            <p className="text-[10px] text-[var(--sos-muted)] hidden sm:block">
              {journeys.length} conversas totais · Escolha a lente operacional ideal para o seu momento.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Nova Conversa Button */}
          <button
            id="start-new-conversation-btn"
            onClick={() => setStartModalOpen(true)}
            className="px-2.5 py-1.5 bg-[var(--sos-success)] hover:bg-[var(--sos-success)]/90 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nova Conversa</span>
            <span className="sm:hidden">+</span>
          </button>

          {/* 3-Way Mode Toggle */}
        <div className="flex items-center gap-1 bg-[var(--sos-border)]/30 p-1 rounded-lg border border-[var(--sos-border)] text-xs">
          <button
            id="switch-view-list-btn"
            onClick={() => setViewMode('list')}
            className={`px-2.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'list'
                ? 'bg-[var(--sos-surface)] text-[var(--sos-ink)] shadow-2xs'
                : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)]'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lista</span>
          </button>

          <button
            id="switch-view-kanban-btn"
            onClick={() => setViewMode('kanban')}
            className={`px-2.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'kanban'
                ? 'bg-[var(--sos-surface)] text-[var(--sos-ink)] shadow-2xs'
                : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)]'
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>Funil</span>
          </button>

          <button
            id="switch-view-wallboard-btn"
            onClick={() => setViewMode('wallboard')}
            className={`px-2.5 py-1.5 rounded-md font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'wallboard'
                ? 'bg-[var(--sos-action)] text-white shadow-2xs'
                : 'text-[var(--sos-muted)] hover:text-[var(--sos-action)]'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Torre TV (NOC)</span>
          </button>
          </div>
        </div>
      </div>

      {/* Active View Container */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'list' && (
          <AllConversationsView
            journeys={journeys}
            channels={channels}
            selectedJourneyId={selectedJourneyId}
            onSelectJourney={onSelectJourney}
            onGoToCockpit={onGoToCockpit}
            onGoToKanban={() => setViewMode('kanban')}
            currentOperatorId={currentOperatorId}
          />
        )}

        {viewMode === 'kanban' && (
          <CommercialKanbanView
            journeys={journeys}
            onSelectJourney={onSelectJourney}
            onUpdateJourney={onUpdateJourney}
            onSwitchToCockpit={() => {
              if (journeys[0]) onGoToCockpit(journeys[0]);
            }}
            currentOperatorId={currentOperatorId}
            role={role}
          />
        )}

        {viewMode === 'wallboard' && (
          <LiveWallboardView
            journeys={journeys}
            groups={groups}
            mode="conversations"
            onGoToCockpit={onGoToCockpit}
            onOpenGroup={onOpenGroup}
          />
        )}
      </div>
    </div>

      {/* Start Conversation Modal */}
      <StartConversationModal
        workspace={workspace}
        isOpen={startModalOpen}
        onClose={() => setStartModalOpen(false)}
        onConversationStarted={(j) => {
          setStartModalOpen(false);
          onGoToCockpit(j as Journey);
        }}
      />
    </>
  );
};
