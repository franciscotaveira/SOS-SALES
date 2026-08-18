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
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 shrink-0 shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#00a884] flex items-center justify-center font-bold">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-black text-slate-900 font-heading">
              Central Comercial & Atendimento
            </h2>
            <p className="text-[10.5px] text-slate-500 hidden sm:block">
              {journeys.length} conversas totais · Escolha a lente operacional ideal para o seu momento.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Nova Conversa Button */}
          <button
            id="start-new-conversation-btn"
            onClick={() => setStartModalOpen(true)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nova Conversa</span>
            <span className="sm:hidden">+</span>
          </button>

          {/* 3-Way Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          <button
            id="switch-view-list-btn"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'list'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lista</span>
          </button>

          <button
            id="switch-view-kanban-btn"
            onClick={() => setViewMode('kanban')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'kanban'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>Funil</span>
          </button>

          <button
            id="switch-view-wallboard-btn"
            onClick={() => setViewMode('wallboard')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'wallboard'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-2xs'
                : 'text-slate-500 hover:text-emerald-700'
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
