import React from 'react';
import { Journey, Workspace, Message, Channel, OperatorRole, OutcomeStatus, CommercialStage, FollowUpSchedule } from '../../types/cockpit';
import { SalesOsGateway } from '../../services/salesOsGateway';
import { PriorityQueue } from './PriorityQueue';
import { ConversationHeader } from './ConversationHeader';
import { ContinuityRibbon } from './ContinuityRibbon';
import { MessageTimeline } from './MessageTimeline';
import { SupervisedComposer } from './SupervisedComposer';
import { LiveDossier } from './LiveDossier';
import { OutcomeModal } from './OutcomeModal';
import {
  MessageSquareOff,
  ChevronLeft,
  ChevronRight,
  Layers,
  Flame,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Columns3,
  Maximize2,
  X,
  Sparkles,
} from 'lucide-react';

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

  // Persistent Dossier state & display mode ('docked' | 'drawer')
  const [isDossierOpen, setIsDossierOpen] = React.useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('sos_cockpit_dossier_open');
      if (saved !== null) return saved === 'true';
      return window.innerWidth >= 1280;
    } catch {
      return true;
    }
  });

  const [dossierMode, setDossierMode] = React.useState<'docked' | 'drawer'>(() => {
    try {
      const saved = localStorage.getItem('sos_cockpit_dossier_mode');
      if (saved === 'docked' || saved === 'drawer') return saved;
      return window.innerWidth >= 1280 ? 'docked' : 'drawer';
    } catch {
      return 'docked';
    }
  });

  // Mobile/Tablet sub-tab view mode: 'queue' | 'chat' | 'context'
  const [mobileView, setMobileView] = React.useState<'queue' | 'chat' | 'context'>('chat');

  // Toggle dossier open state & persist
  const toggleDossierOpen = () => {
    setIsDossierOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sos_cockpit_dossier_open', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Toggle dossier mode ('docked' vs 'drawer') & persist
  const toggleDossierMode = () => {
    setDossierMode((prev) => {
      const next = prev === 'docked' ? 'drawer' : 'docked';
      try {
        localStorage.setItem('sos_cockpit_dossier_mode', next);
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Close drawer on ESC key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDossierOpen && dossierMode === 'drawer') {
        setIsDossierOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDossierOpen, dossierMode]);

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
        <h2 className="text-base font-bold text-slate-800 font-heading">Nenhuma conversa selecionada</h2>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Selecione uma conversa na fila de prioridades para iniciar o atendimento supervisionado.
        </p>
      </div>
    );
  }

  // Determine whether docked dossier column should be active in the CSS Grid
  const isDockedActive = isDossierOpen && dossierMode === 'docked';

  return (
    <div
      id="cockpit-view-container"
      className="flex-1 min-h-0 h-full w-full flex flex-col overflow-hidden bg-[#F8FAFC] p-2 sm:p-2.5 gap-2 relative"
    >
      {/* Mobile sub-tabs selector (Queue -> Conversation -> Dossier) */}
      <div className="lg:hidden flex items-center bg-white p-1 rounded-xl border border-slate-200 shrink-0 text-xs font-bold shadow-2xs">
        <button
          onClick={() => setMobileView('queue')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors ${
            mobileView === 'queue' ? 'bg-[#00A884] text-white' : 'text-slate-600'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Fila ({journeys.length})</span>
        </button>
        <button
          onClick={() => setMobileView('chat')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors ${
            mobileView === 'chat' ? 'bg-[#00A884] text-white' : 'text-slate-600'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Conversa</span>
        </button>
        <button
          onClick={() => {
            setMobileView('context');
            setIsDossierOpen(true);
          }}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-colors ${
            mobileView === 'context' ? 'bg-[#00A884] text-white' : 'text-slate-600'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Dossiê</span>
        </button>
      </div>

      {/* Main Responsive Cockpit CSS Grid Architecture */}
      <div
        id="cockpit-css-grid"
        className={`flex-1 min-h-0 h-full w-full overflow-hidden ${
          isDockedActive
            ? 'lg:grid lg:grid-cols-[290px_minmax(0,1fr)_320px] xl:grid-cols-[320px_minmax(0,1fr)_340px] lg:gap-2'
            : 'lg:grid lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] lg:gap-2'
        }`}
      >
        {/* Pane 1: Priority Queue (CSS Grid Track 1) */}
        <section
          id="cockpit-queue-pane"
          aria-label="Fila de Prioridades Comerciais"
          className={`h-full min-h-0 min-w-0 overflow-hidden flex flex-col ${
            mobileView === 'queue' ? 'flex' : 'hidden lg:flex'
          }`}
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
        </section>

        {/* Pane 2: Live Conversation Central Focus (CSS Grid Track 2: flexible minmax(0, 1fr) never squashed!) */}
        <section
          id="cockpit-conversation-pane"
          aria-label="Janela Central de Atendimento WhatsApp"
          className={`h-full min-h-0 min-w-0 overflow-hidden flex flex-col cockpit-panel ${
            mobileView === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Conversation Header with quick actions & Dossier toggle */}
          <div className="relative shrink-0">
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
              isDossierOpen={isDossierOpen}
              onToggleDossier={toggleDossierOpen}
            />
          </div>

          {/* Signature Visual: Continuity Ribbon (Sleek 34px bar) */}
          <div className="shrink-0 px-2 pt-1 pb-0.5 bg-slate-50/60">
            <ContinuityRibbon
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

          {/* AI Smart Funnel Auto-Advance Suggestion (Compact 1-line chip) */}
          {(!currentJourney.stage || currentJourney.stage === 'new' || currentJourney.stage === 'contacted') && (
            <div className="mx-2 mt-1 px-2 py-1 bg-purple-50/90 border border-purple-200/80 rounded-lg flex items-center justify-between text-xs text-purple-900 shadow-2xs shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span className="text-[11px] truncate">
                  <strong className="font-semibold">IA Sugere:</strong> Avançar para Negociação (interesse detectado)
                </span>
              </div>
              <button
                onClick={() => handleStageChange('negotiation')}
                className="px-2 py-0.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded text-[10.5px] shadow-xs transition-colors shrink-0 ml-2"
              >
                Avançar
              </button>
            </div>
          )}

          {/* Scrollable Conversation Center - Maximized Viewport */}
          <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50/40 p-2 sm:p-2.5">
            <MessageTimeline
              messages={messages}
              onRetryMessage={handleRetryMessage}
              isLoading={isLoadingMessages}
            />
          </div>

          {/* Supervised Composer with integrated AI Copilot Recommendation Strip */}
          <div className="shrink-0 border-t border-slate-200 bg-white">
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
              recommendation={currentJourney.recommendation}
            />
          </div>
        </section>

        {/* Pane 3: Live Dossier - DOCKED MODE in CSS Grid Track 3 */}
        {isDockedActive && (
          <aside
            id="cockpit-dossier-docked-pane"
            aria-label="Dossiê Vivo de Decisão Comercial"
            className="hidden lg:flex h-full min-h-0 min-w-0 overflow-hidden flex-col"
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
              onUpdateJourney={onUpdateJourney}
              onClose={() => setIsDossierOpen(false)}
              displayMode="docked"
              onToggleMode={toggleDossierMode}
            />
          </aside>
        )}
      </div>

      {/* Pane 3 (Alternate): Live Dossier - DRAWER / OVERLAY MODE (Floating Slide-over with Backdrop) */}
      {isDossierOpen && (!isDockedActive || mobileView === 'context') && (
        <div
          id="cockpit-dossier-drawer-overlay"
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Dossiê Vivo de Decisão do Lead"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity animate-in fade-in duration-150"
            onClick={() => {
              if (mobileView === 'context') {
                setMobileView('chat');
              }
              setIsDossierOpen(false);
            }}
          />

          {/* Slide-over Drawer Panel */}
          <div className="relative w-full max-w-[420px] sm:w-[420px] bg-white h-full shadow-2xl z-10 animate-in slide-in-from-right duration-200 overflow-hidden flex flex-col border-l border-slate-200">
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
              onUpdateJourney={onUpdateJourney}
              onClose={() => {
                if (mobileView === 'context') {
                  setMobileView('chat');
                }
                setIsDossierOpen(false);
              }}
              displayMode="drawer"
              onToggleMode={toggleDossierMode}
            />
          </div>
        </div>
      )}

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
