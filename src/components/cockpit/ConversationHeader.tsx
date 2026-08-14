import React from 'react';
import { Journey, Channel, OperatorRole, CommercialStage, FollowUpSchedule } from '../../types/cockpit';
import { Phone, Clock, UserCheck, UserPlus, Award, BellRing, CheckCircle2, ShieldCheck } from 'lucide-react';
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
}) => {
  const [isSnoozeModalOpen, setIsSnoozeModalOpen] = React.useState(false);
  const isMine = journey.assignedOperatorId === currentOperatorId;
  const isPending = journey.handoffStatus === 'pending_operator';
  const isOtherOperator = !isMine && !isPending && !!journey.assignedOperatorName;
  const isChannelPaused = channel?.health === 'paused';

  return (
    <div id="conversation-header" className="p-3 border-b border-[#e9edef] bg-[#f0f2f5] shrink-0">
      {/* Snooze Follow-up Modal */}
      {onScheduleFollowUp && (
        <SnoozeFollowUpModal
          isOpen={isSnoozeModalOpen}
          onClose={() => setIsSnoozeModalOpen(false)}
          journey={journey}
          onScheduleFollowUp={onScheduleFollowUp}
        />
      )}

      {/* Top Row: WhatsApp Lead Identity & Header Actions */}
      <div className="flex items-center justify-between gap-3">
        {/* Left: WhatsApp Avatar + Lead Info */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar with WhatsApp Online Badge */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-full bg-[#dfe5e7] text-[#54656f] font-bold flex items-center justify-center text-sm shadow-2xs border border-white">
              {journey.leadName.charAt(0)}
            </div>
            <span
              className="absolute bottom-0 right-0 w-3 h-3 bg-[#25d366] border-2 border-white rounded-full"
              title="Online no WhatsApp"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-sm text-[#111b21] truncate">
                {journey.leadName}
              </h1>
              <span title="Conta Oficial WhatsApp Business">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#00a884] shrink-0 fill-[#00a884]/10" />
              </span>
              {journey.leadCity && (
                <span className="text-[11.5px] text-[#667781] font-normal hidden sm:inline truncate">
                  · {journey.leadCity}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-[#667781] mt-0.5">
              <span className="font-mono flex items-center gap-1 text-[#54656f]">
                <Phone className="w-3 h-3 text-[#8696a0]" />
                {journey.leadPhone}
              </span>
              <span>·</span>
              <span className="text-[#00a884] font-medium text-[11px] truncate max-w-[130px] flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-[#00a884]" />
                {channel?.name || 'WhatsApp WABA'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions & Handoff Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Follow-up Alarm Button */}
          {onScheduleFollowUp && role !== 'viewer' && (
            <button
              onClick={() => setIsSnoozeModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-purple-200 bg-white hover:bg-purple-50 text-purple-800 transition-colors shadow-2xs"
              title="Programar alarme ou retomada de follow-up"
            >
              <BellRing className="w-3.5 h-3.5 text-purple-600" />
              <span className="hidden md:inline">Follow-up</span>
            </button>
          )}

          {/* SLA Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
              journey.slaStatus === 'critical'
                ? 'bg-rose-100 text-rose-800 border border-rose-200 animate-pulse'
                : 'bg-white text-slate-700 border border-slate-200 shadow-2xs'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>SLA: {journey.slaMinutesRemaining}m</span>
          </div>

          {/* Outcome Button */}
          <button
            id="mark-outcome-btn"
            onClick={onOpenOutcomeModal}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
              journey.outcome
                ? journey.outcome.status === 'won'
                  ? 'bg-[#e7f8e8] text-[#065f46] border-[#a7f3d0]'
                  : 'bg-rose-50 text-rose-800 border-rose-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-2xs'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-amber-600" />
            <span>{journey.outcome ? 'Resultado OK' : 'Resultado'}</span>
          </button>

          {/* Handoff Claim/Release */}
          {role !== 'viewer' && (
            <>
              {isPending && (
                <button
                  id="header-claim-handoff-btn"
                  onClick={onClaimHandoff}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg bg-[#00a884] hover:bg-[#008069] text-white transition-colors shadow-xs"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Assumir</span>
                </button>
              )}

              {isMine && (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 text-xs text-[#065f46] font-semibold bg-[#e7f8e8] border border-[#a7f3d0] px-2 py-1 rounded-lg">
                    <UserCheck className="w-3.5 h-3.5 text-[#00a884]" />
                    <span className="hidden sm:inline">Com você</span>
                  </div>
                  <button
                    id="header-release-handoff-btn"
                    onClick={onReleaseHandoff}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline px-1"
                    title="Devolver para fila geral"
                  >
                    Liberar
                  </button>
                </div>
              )}

              {isOtherOperator && (
                <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
                  <span className="font-medium truncate max-w-[100px]">
                    {journey.assignedOperatorName}
                  </span>
                  <button
                    onClick={onClaimHandoff}
                    className="text-[11px] font-bold text-[#00a884] hover:underline ml-1"
                  >
                    Assumir
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom Row: Commercial Mini-Pipeline & Scheduled Follow-up Banner */}
      <div className="mt-2.5 pt-2 border-t border-[#e2e8f0] flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#667781] shrink-0">
            Funil Comercial:
          </span>
          {onStageChange && (
            <CommercialStageSelector
              journey={journey}
              onStageChange={onStageChange}
            />
          )}
        </div>

        {journey.followUpSchedule && (
          <div className="flex items-center gap-1.5 text-[11px] text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-lg border border-purple-200 shrink-0">
            <BellRing className="w-3 h-3 text-purple-600 animate-pulse" />
            <span className="font-bold">Follow-up:</span>
            <span>{journey.followUpSchedule.label}</span>
          </div>
        )}
      </div>

      {/* Warning banner if channel paused */}
      {isChannelPaused && (
        <div
          id="channel-paused-alert-bar"
          className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-800"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold">Canal WhatsApp pausado</span> por {channel?.pausedBy || 'Supervisor'}. Envio bloqueado.
          </div>
          {channel?.pauseReason && (
            <span className="text-[11px] text-rose-700 italic hidden md:inline">
              "{channel.pauseReason}"
            </span>
          )}
        </div>
      )}
    </div>
  );
};

