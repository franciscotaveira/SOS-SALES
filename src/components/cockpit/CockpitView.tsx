import React from 'react';
import { Journey, Workspace, Message, Channel, OperatorRole, OutcomeStatus, CommercialStage, FollowUpSchedule } from '../../types/cockpit';
import { SalesOsGateway } from '../../services/salesOsGateway';
import { PriorityQueue } from './PriorityQueue';
import { ConversationHeader } from './ConversationHeader';
import { ContinuityLine } from './ContinuityLine';
import { MessageTimeline } from './MessageTimeline';
import { RecommendationCard } from './RecommendationCard';
import { SupervisedComposer } from './SupervisedComposer';
import { LiveDossier } from './LiveDossier';
import { OutcomeModal } from './OutcomeModal';
import { MessageSquareOff, ChevronLeft, ChevronRight, Layers, Flame, MessageSquare } from 'lucide-react';

interface CockpitViewProps {
  workspace: Workspace;
  gateway: SalesOsGateway;
  journeys: Journey[];
  selectedJourneyId?: string;
  onSelectJourney: (journey: Journey) => void;
  onUpdateJourney: (updated: Journey) => void;
  onViewAllConversations: () => void;
  role: OperatorRole;
  currentOperatorId: string;
  currentOperatorName: string;
}

export const CockpitView: React.FC<CockpitViewProps> = ({
  workspace,
  gateway,
  journeys,
  selectedJourneyId,
  onSelectJourney,
  onUpdateJourney,
  onViewAllConversations,
  role,
  currentOperatorId,
  currentOperatorName,
}) => {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = React.useState(false);
  const [draftText, setDraftText] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [isOutcomeModalOpen, setIsOutcomeModalOpen] = React.useState(false);

  // Mobile/Tablet sub-tab view mode: 'queue' | 'chat' | 'context'
  const [mobileView, setMobileView] = React.useState<'queue' | 'chat' | 'context'>('chat');

  // Selected Journey
  const currentJourney = React.useMemo(() => {
    return journeys.find((j) => j.id === selectedJourneyId) || journeys[0] || null;
  }, [journeys, selectedJourneyId]);

  // Current Channel
  const currentChannel = React.useMemo(() => {
    if (!currentJourney) return undefined;
    return workspace.channels.find((c) => c.id === currentJourney.channelId);
  }, [workspace.channels, currentJourney]);

  // Load messages & draft when selected journey changes
  React.useEffect(() => {
    if (!currentJourney) {
      setMessages([]);
      return;
    }
    let isMounted = true;
    setIsLoadingMessages(true);
    gateway
      .getMessages(currentJourney.id)
      .then((msgs) => {
        if (isMounted) {
          setMessages(msgs);
          setIsLoadingMessages(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoadingMessages(false);
      });

    // Load saved draft
    const savedDraft = gateway.getDraft(currentJourney.id);
    setDraftText(savedDraft);
    setSendError(null);

    return () => {
      isMounted = false;
    };
  }, [currentJourney?.id, gateway]);

  const handleDraftChange = (text: string) => {
    setDraftText(text);
    if (currentJourney) {
      gateway.saveDraft(currentJourney.id, text);
    }
  };

  const handleApplyRecommendationDraft = (text: string) => {
    handleDraftChange(text);
  };

  const handleClaimHandoff = async (journeyId?: string) => {
    const targetId = journeyId || currentJourney?.id;
    if (!targetId) return;
    try {
      const updated = await gateway.claimHandoff(targetId, currentOperatorId, currentOperatorName);
      onUpdateJourney(updated);
    } catch (err: any) {
      alert(err.message || 'Erro ao assumir handoff');
    }
  };

  const handleReleaseHandoff = async () => {
    if (!currentJourney) return;
    try {
      const updated = await gateway.releaseHandoff(currentJourney.id);
      onUpdateJourney(updated);
    } catch (err: any) {
      alert(err.message || 'Erro ao liberar handoff');
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!currentJourney) return;
    setIsSending(true);
    setSendError(null);
    try {
      const newMsg = await gateway.sendMessage({
        journeyId: currentJourney.id,
        text,
        senderId: currentOperatorId,
        senderName: currentOperatorName,
      });
      setMessages((prev) => [...prev, newMsg]);
      setDraftText('');
    } catch (err: any) {
      setSendError(err.message || 'Falha ao enviar mensagem');
      throw err;
    } finally {
      setIsSending(false);
    }
  };

  const handleRetryMessage = async (failedMsg: Message) => {
    if (!currentJourney) return;
    try {
      const newMsg = await gateway.sendMessage({
        journeyId: currentJourney.id,
        text: failedMsg.text,
        senderId: currentOperatorId,
        senderName: currentOperatorName,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === failedMsg.id ? newMsg : m))
      );
    } catch (err: any) {
      alert(err.message || 'Erro no reenvio');
    }
  };

  const handleToggleChannelPause = async (channelId: string) => {
    try {
      await gateway.toggleChannelPause(channelId, currentOperatorName, 'Pausa manual solicitada no cockpit');
      // refresh workspace channels state
      const updatedWorkspaces = await gateway.getWorkspaces();
      const currentWs = updatedWorkspaces.find((w) => w.id === workspace.id);
      if (currentWs) {
        // Trigger re-render by updating journeys clone
        const refreshedJourneys = await gateway.getJourneys(workspace.id);
        if (refreshedJourneys.length > 0) onUpdateJourney(refreshedJourneys[0]);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveOutcome = async (outcomeData: {
    status: OutcomeStatus;
    dealValueBrl?: number;
    serviceOrProduct?: string;
    reason?: string;
    closedBy: string;
  }) => {
    if (!currentJourney) return;
    const updated = await gateway.markOutcome(currentJourney.id, outcomeData);
    onUpdateJourney(updated);
  };

  const handleStageChange = (newStage: CommercialStage) => {
    if (!currentJourney) return;
    const updated: Journey = {
      ...currentJourney,
      stage: newStage,
    };
    onUpdateJourney(updated);
  };

  const handleScheduleFollowUp = (schedule: FollowUpSchedule) => {
    if (!currentJourney) return;
    const updated: Journey = {
      ...currentJourney,
      followUpSchedule: schedule,
      urgencyReason: `Follow-up agendado: ${schedule.reason}`,
    };
    onUpdateJourney(updated);
  };

  if (!currentJourney) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
        <MessageSquareOff className="w-12 h-12 text-slate-400 mb-3" />
        <h2 className="text-base font-bold text-slate-800">Nenhuma conversa selecionada</h2>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Selecione uma conversa na fila de prioridades para iniciar o atendimento supervisionado.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-slate-100 p-2 sm:p-3 gap-2 sm:gap-3">
      {/* Mobile sub-tabs selector */}
      <div className="lg:hidden flex items-center bg-white p-1 rounded-xl border border-slate-200 shrink-0 text-xs font-bold shadow-2xs">
        <button
          onClick={() => setMobileView('queue')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 ${
            mobileView === 'queue' ? 'bg-blue-600 text-white' : 'text-slate-600'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Fila ({journeys.length})</span>
        </button>
        <button
          onClick={() => setMobileView('chat')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 ${
            mobileView === 'chat' ? 'bg-blue-600 text-white' : 'text-slate-600'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Conversa</span>
        </button>
        <button
          onClick={() => setMobileView('context')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 ${
            mobileView === 'context' ? 'bg-blue-600 text-white' : 'text-slate-600'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Contexto</span>
        </button>
      </div>

      {/* Main 3-Column Layout: Desktop 24% - 50% - 26% */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-3 overflow-hidden">
        {/* Column 1: Priority Queue (24% ~ 3 cols) */}
        <div
          className={`h-full overflow-hidden ${
            mobileView === 'queue' ? 'block' : 'hidden lg:block'
          } lg:col-span-3`}
        >
          <PriorityQueue
            journeys={journeys}
            selectedJourneyId={currentJourney.id}
            onSelectJourney={(j) => {
              onSelectJourney(j);
              setMobileView('chat');
            }}
            onClaimHandoff={handleClaimHandoff}
            currentOperatorId={currentOperatorId}
            onViewAllConversations={onViewAllConversations}
          />
        </div>

        {/* Column 2: Live Conversation (50% ~ 6 cols) */}
        <div
          className={`h-full overflow-hidden flex flex-col cockpit-panel ${
            mobileView === 'chat' ? 'block' : 'hidden lg:flex'
          } lg:col-span-6`}
        >
          {/* Header */}
          <ConversationHeader
            journey={currentJourney}
            channel={currentChannel}
            currentOperatorId={currentOperatorId}
            currentOperatorName={currentOperatorName}
            role={role}
            onClaimHandoff={() => handleClaimHandoff(currentJourney.id)}
            onReleaseHandoff={handleReleaseHandoff}
            onOpenOutcomeModal={() => setIsOutcomeModalOpen(true)}
            onStageChange={handleStageChange}
            onScheduleFollowUp={handleScheduleFollowUp}
          />

          {/* Scrollable Conversation Center */}
          <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50/50">
            {/* Signature Visual: Continuity Line */}
            <div className="p-3 pb-0 shrink-0">
              <ContinuityLine
                acquisition={currentJourney.acquisition}
                lastLeadMessage={currentJourney.lastLeadMessage}
                recommendation={currentJourney.recommendation}
                continuitySteps={currentJourney.continuitySteps}
                onApplyRecommendation={() => {
                  if (currentJourney.recommendation) {
                    handleApplyRecommendationDraft(currentJourney.recommendation.draftText);
                  }
                }}
              />
            </div>

            {/* Timeline */}
            <MessageTimeline
              messages={messages}
              onRetryMessage={handleRetryMessage}
              isLoading={isLoadingMessages}
            />

            {/* Recommendation with evidences */}
            <RecommendationCard
              recommendation={currentJourney.recommendation}
              onApplyDraft={handleApplyRecommendationDraft}
            />
          </div>

          {/* Sticky Supervised Composer */}
          <SupervisedComposer
            journey={currentJourney}
            channel={currentChannel}
            role={role}
            currentDraft={draftText}
            onChangeDraft={handleDraftChange}
            onSendMessage={handleSendMessage}
            isSending={isSending}
            sendError={sendError}
            onClearError={() => setSendError(null)}
          />
        </div>

        {/* Column 3: Context & Decision (26% ~ 3 cols) */}
        <div
          className={`h-full overflow-hidden ${
            mobileView === 'context' ? 'block' : 'hidden lg:block'
          } lg:col-span-3`}
        >
          <LiveDossier
            journey={currentJourney}
            channel={currentChannel}
            role={role}
            currentOperatorId={currentOperatorId}
            currentOperatorName={currentOperatorName}
            onClaimHandoff={() => handleClaimHandoff(currentJourney.id)}
            onReleaseHandoff={handleReleaseHandoff}
            onToggleChannelPause={handleToggleChannelPause}
            onOpenOutcomeModal={() => setIsOutcomeModalOpen(true)}
          />
        </div>
      </div>

      {/* Outcome Modal */}
      <OutcomeModal
        journey={currentJourney}
        isOpen={isOutcomeModalOpen}
        onClose={() => setIsOutcomeModalOpen(false)}
        onSubmit={handleSaveOutcome}
        currentOperatorName={currentOperatorName}
      />
    </div>
  );
};
