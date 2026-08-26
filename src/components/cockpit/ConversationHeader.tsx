import React from 'react';
import { Journey, Channel, OperatorRole, CommercialStage, FollowUpSchedule } from '../../types/cockpit';
import { Phone, Clock, UserCheck, UserPlus, Award, BellRing, CheckCircle2, ShieldCheck, Layers, PanelRightClose, PanelRightOpen, Sparkles } from 'lucide-react';
import { CommercialStageSelector } from './CommercialStageSelector';
import { SnoozeFollowUpModal } from './SnoozeFollowUpModal';

interface ConversationHeaderProps {
  journey: Journey;
  channel?: Channel;
  currentOperatorId: string;
  currentOperatorName: string;
  role: OperatorRole;
  onClaimHandoff: () => void;
  onReleaseHandoff: () => void;
  onOpenOutcomeModal: () => void;
  onStageChange?: (newStage: CommercialStage) => void;
  onScheduleFollowUp?: (schedule: FollowUpSchedule) => void;
  isDossierOpen?: boolean;
  onToggleDossier?: () => void;
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  journey,
  channel,
  currentOperatorId,
  currentOperatorName,
  role,
  onClaimHandoff,
  onReleaseHandoff,
  onOpenOutcomeModal,
  onStageChange,
  onScheduleFollowUp,
  isDossierOpen = false,
  onToggleDossier,
}) => {
  const [isSnoozeModalOpen, setIsSnoozeModalOpen] = React.useState(false);
  const isMine = journey.assignedOperatorId === currentOperatorId;
  const isPending = journey.handoffStatus === 'pending_operator';
  const isOtherOperator = !isMine && !isPending && !!journey.assignedOperatorName;
  const isChannelPaused = channel?.health === 'paused';

  return (
    <div id="conversation-header" className="px-2.5 py-1.5 border-b border-[var(--sos-border)] bg-[var(--sos-canvas)] shrink-0">
      {/* Snooze Follow-up Modal */}
      {onScheduleFollowUp && (
        <SnoozeFollowUpModal
          isOpen={isSnoozeModalOpen}
          onClose={() => setIsSnoozeModalOpen(false)}
          journey={journey}
          onScheduleFollowUp={onScheduleFollowUp}
        />
      )}

      {/* Main Single Row: Lead Info + Actions */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        {/* Left: WhatsApp Avatar + Lead Identity */}
        <div className="flex items-center gap-2 min-w-[120px] flex-1 overflow-hidden">
          {/* Avatar with WhatsApp Online Badge - reduzido w-8 para w-7 */}
          <div className="relative shrink-0">
            <div className="w-7 h-7 rounded-full bg-[var(--sos-border)] text-[var(--sos-muted)] font-bold flex items-center justify-center text-xs shadow-2xs border border-white">
              {journey.leadName.charAt(0)}
            </div>
            <span
              className="absolute bottom-0 right-0 w-2 h-2 bg-[var(--wa-green-badge)] border-2 border-white rounded-full"
              title="Online no WhatsApp"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0">
              <h1 className="font-bold text-xs text-[var(--sos-ink)] truncate">
                {journey.leadName}
              </h1>
              <span title="Oficial" className="inline-flex items-center">
                <CheckCircle2 className="w-3 h-3 text-[var(--wa-primary)] fill-[var(--wa-primary)]/10 shrink-0" />
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[var(--sos-muted)] truncate">
              <span className="font-mono text-[var(--sos-muted)] truncate">
                {journey.leadPhone}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Stage Selector + Actions & Handoff Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Stage Selector Pill */}
          {onStageChange && (
            <CommercialStageSelector
              journey={journey}
              onStageChange={onStageChange}
            />
          )}

          {/* SLA Badge - cores semânticas */}
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-mono font-bold ${
              journey.slaStatus === 'critical'
                ? 'bg-[var(--sos-danger-subtle)] text-[var(--sos-danger)] border border-[var(--sos-danger)]/30 animate-pulse'
                : 'bg-white text-[var(--sos-muted)] border border-[var(--sos-border)] shadow-2xs'
            }`}
            title="Tempo restante de SLA"
          >
            <Clock className="w-3 h-3 text-[var(--sos-muted)] shrink-0" />
            <span>{journey.slaMinutesRemaining}m</span>
          </div>

          {/* Outcome Button */}
          <button
            id="mark-outcome-btn"
            onClick={onOpenOutcomeModal}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border transition-all ${
              journey.outcome
                ? journey.outcome.status === 'won'
                  ? 'bg-[var(--sos-action-subtle)] text-[var(--sos-action)] border-[var(--sos-action)]/30'
                  : 'bg-[var(--sos-danger-subtle)] text-[var(--sos-danger)] border-[var(--sos-danger)]/30'
                : 'bg-white text-[var(--sos-muted)] border border-[var(--sos-border)] hover:bg-[var(--sos-canvas)] shadow-2xs'
            }`}
            title="Registrar fechamento comercial ou perda"
          >
            <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="hidden xl:inline">{journey.outcome ? 'Fechado' : 'Resultado'}</span>
          </button>

          {/* Click-to-Call Phone Button */}
          {journey.leadPhone && (
            <a
              href={`tel:${journey.leadPhone}`}
              className="p-1 text-xs font-semibold rounded-md border border-[var(--sos-action)]/30 bg-white hover:bg-[var(--sos-action-subtle)] text-[var(--sos-action)] transition-colors shadow-2xs flex items-center"
              title={`Ligar agora para ${journey.leadPhone}`}
            >
              <Phone className="w-3.5 h-3.5 text-[var(--sos-action)]" />
            </a>
          )}

          {/* Follow-up Alarm Icon Button */}
          {onScheduleFollowUp && role !== 'viewer' && (
            <button
              onClick={() => setIsSnoozeModalOpen(true)}
              className="p-1 text-xs font-semibold rounded-md border border-[var(--sos-ai)]/30 bg-white hover:bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] transition-colors shadow-2xs flex items-center"
              title="Programar alarme ou retomada de follow-up"
            >
              <BellRing className="w-3.5 h-3.5 text-[var(--sos-ai)]" />
            </button>
          )}

          {/* Handoff Claim/Release */}
          {role !== 'viewer' && (
            <>
              {isPending && (
                <button
                  id="header-claim-handoff-btn"
                  onClick={onClaimHandoff}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-md bg-[var(--sos-action)] hover:bg-[var(--sos-action-hover)] text-white transition-colors shadow-xs"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Assumir</span>
                </button>
              )}

              {isMine && (
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-0.5 text-[10px] text-[var(--sos-action)] font-semibold bg-[var(--sos-action-subtle)] border border-[var(--sos-action)]/30 px-1 py-0.5 rounded">
                    <UserCheck className="w-3 h-3 text-[var(--sos-action)]" />
                    <span className="hidden sm:inline">Você</span>
                  </div>
                  <button
                    id="header-release-handoff-btn"
                    onClick={onReleaseHandoff}
                    className="text-[10px] text-[var(--sos-muted)] hover:text-[var(--sos-ink)] underline px-0.5"
                    title="Devolver para fila geral"
                  >
                    Liberar
                  </button>
                </div>
              )}

              {isOtherOperator && (
                <div className="flex items-center gap-1 text-xs text-[var(--sos-muted)] bg-white border border-[var(--sos-border)] px-1.5 py-0.5 rounded shadow-2xs">
                  <span className="font-medium truncate max-w-[70px]">
                    {journey.assignedOperatorName}
                  </span>
                  <button
                    onClick={onClaimHandoff}
                    className="text-[10px] font-bold text-[var(--sos-action)] hover:underline"
                  >
                    Assumir
                  </button>
                </div>
              )}
            </>
          )}

          {/* Dossiê Vivo Toggle Button */}
          {onToggleDossier && (
            <button
              id="header-toggle-dossier-btn"
              onClick={onToggleDossier}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold transition-all shadow-2xs ${
                isDossierOpen
                  ? 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border border-[var(--sos-ai)]/30'
                  : 'bg-white text-[var(--sos-ai)] border border-[var(--sos-ai)]/30 hover:bg-[var(--sos-ai-subtle)]'
              }`}
              title={isDossierOpen ? 'Recolher Dossiê Lateral (Expandir Conversa)' : 'Abrir Dossiê Lateral'}
            >
              <Layers className="w-3.5 h-3.5 text-[var(--sos-ai)]" />
              <span className="hidden xl:inline">Dossiê</span>
              {isDossierOpen ? (
                <PanelRightClose className="w-3.5 h-3.5 text-[var(--sos-ai)] hidden md:inline" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5 text-[var(--sos-ai)] hidden md:inline" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Warning banner if channel paused */}
      {isChannelPaused && (
        <div
          id="channel-paused-alert-bar"
          className="mt-1 p-1.5 bg-[var(--sos-danger-subtle)] border border-[var(--sos-danger)]/30 rounded text-xs text-[var(--sos-danger)] flex items-center justify-between"
        >
          <div className="flex items-center gap-1">
            <span className="font-bold">WhatsApp Pausado:</span> Envio bloqueado ({channel?.pausedBy || 'Supervisor'}).
          </div>
        </div>
      )}
    </div>
  );
};

