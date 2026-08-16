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
    <div id="conversation-header" className="px-3 py-2 border-b border-[#e9edef] bg-[#f0f2f5] shrink-0">
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
        <div className="flex items-center gap-2 min-w-[140px] flex-1 overflow-hidden">
          {/* Avatar with WhatsApp Online Badge */}
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-full bg-[#dfe5e7] text-[#54656f] font-bold flex items-center justify-center text-xs shadow-2xs border border-white">
              {journey.leadName.charAt(0)}
            </div>
            <span
              className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#25d366] border-2 border-white rounded-full"
              title="Online no WhatsApp"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0">
              <h1 className="font-bold text-xs sm:text-sm text-[#111b21] truncate">
                {journey.leadName}
              </h1>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#00a884] fill-[#00a884]/10 shrink-0" title="Oficial" />
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[#667781] truncate">
              <span className="font-mono text-[#54656f] truncate">
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

          {/* SLA Badge */}
          <div
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-mono font-bold ${
              journey.slaStatus === 'critical'
                ? 'bg-rose-100 text-rose-800 border border-rose-200 animate-pulse'
                : 'bg-white text-slate-700 border border-slate-200 shadow-2xs'
            }`}
            title="Tempo restante de SLA"
          >
            <Clock className="w-3 h-3 text-slate-500 shrink-0" />
            <span>{journey.slaMinutesRemaining}m</span>
          </div>

          {/* Outcome Button */}
          <button
            id="mark-outcome-btn"
            onClick={onOpenOutcomeModal}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border transition-all ${
              journey.outcome
                ? journey.outcome.status === 'won'
                  ? 'bg-[#e7f8e8] text-[#065f46] border-[#a7f3d0]'
                  : 'bg-rose-50 text-rose-800 border-rose-300'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-2xs'
            }`}
            title="Registrar fechamento comercial ou perda"
          >
            <Award className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="hidden xl:inline">{journey.outcome ? 'Fechado' : 'Resultado'}</span>
          </button>

          {/* Follow-up Alarm Icon Button */}
          {onScheduleFollowUp && role !== 'viewer' && (
            <button
              onClick={() => setIsSnoozeModalOpen(true)}
              className="p-1 text-xs font-semibold rounded-md border border-purple-200 bg-white hover:bg-purple-50 text-purple-800 transition-colors shadow-2xs flex items-center"
              title="Programar alarme ou retomada de follow-up"
            >
              <BellRing className="w-3.5 h-3.5 text-purple-600" />
            </button>
          )}

          {/* Handoff Claim/Release */}
          {role !== 'viewer' && (
            <>
              {isPending && (
                <button
                  id="header-claim-handoff-btn"
                  onClick={onClaimHandoff}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-md bg-[#00a884] hover:bg-[#008069] text-white transition-colors shadow-xs"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Assumir</span>
                </button>
              )}

              {isMine && (
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-0.5 text-[11px] text-[#065f46] font-semibold bg-[#e7f8e8] border border-[#a7f3d0] px-1 py-0.5 rounded">
                    <UserCheck className="w-3 h-3 text-[#00a884]" />
                    <span className="hidden sm:inline">Você</span>
                  </div>
                  <button
                    id="header-release-handoff-btn"
                    onClick={onReleaseHandoff}
                    className="text-[10px] text-slate-500 hover:text-slate-800 underline px-0.5"
                    title="Devolver para fila geral"
                  >
                    Liberar
                  </button>
                </div>
              )}

              {isOtherOperator && (
                <div className="flex items-center gap-1 text-xs text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
                  <span className="font-medium truncate max-w-[70px]">
                    {journey.assignedOperatorName}
                  </span>
                  <button
                    onClick={onClaimHandoff}
                    className="text-[10px] font-bold text-[#00a884] hover:underline"
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
                  ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                  : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'
              }`}
              title={isDossierOpen ? 'Recolher Dossiê Lateral (Expandir Conversa)' : 'Abrir Dossiê Lateral'}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden xl:inline">Dossiê</span>
              {isDossierOpen ? (
                <PanelRightClose className="w-3.5 h-3.5 text-indigo-600 hidden md:inline" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5 text-indigo-600 hidden md:inline" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Warning banner if channel paused */}
      {isChannelPaused && (
        <div
          id="channel-paused-alert-bar"
          className="mt-1.5 p-1.5 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 flex items-center justify-between"
        >
          <div className="flex items-center gap-1">
            <span className="font-bold">WhatsApp Pausado:</span> Envio bloqueado ({channel?.pausedBy || 'Supervisor'}).
          </div>
        </div>
      )}
    </div>
  );
};

