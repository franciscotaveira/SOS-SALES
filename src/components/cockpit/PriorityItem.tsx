import React from 'react';
import { Journey } from '../../types/cockpit';
import { Clock, User, AlertCircle, UserCheck } from 'lucide-react';

interface PriorityItemProps {
  journey: Journey;
  isSelected: boolean;
  onSelect: (journey: Journey) => void;
  onClaim?: (journeyId: string) => void;
  isCurrentOperatorOwner?: boolean;
}

export const PriorityItem: React.FC<PriorityItemProps> = ({
  journey,
  isSelected,
  onSelect,
  onClaim,
  isCurrentOperatorOwner,
}) => {
  const isCritical = journey.slaStatus === 'critical';
  const isWarning = journey.slaStatus === 'warning';
  const isPending = journey.handoffStatus === 'pending_operator';
  const isAnotherOperator =
    journey.handoffStatus === 'in_progress' && !isCurrentOperatorOwner && !!journey.assignedOperatorName;

  const getPrimaryActionLabel = () => {
    if (isPending) {
      return isCritical ? 'Assumir agora' : 'Assumir';
    }
    if (isCurrentOperatorOwner) {
      return 'Abrir conversa';
    }
    if (isAnotherOperator) {
      return 'Ver contexto';
    }
    return 'Abrir';
  };

  return (
    <div
      id={`priority-item-${journey.id}`}
      onClick={() => onSelect(journey)}
      className={`p-3 rounded-xl border transition-all cursor-pointer text-left relative group ${
        isSelected
          ? 'bg-[#f0f2f5] border-[#00a884] shadow-xs ring-1 ring-[#00a884]'
          : isCritical
          ? 'bg-rose-50/50 border-rose-300 hover:border-rose-400 hover:bg-rose-50/80'
          : isWarning
          ? 'bg-amber-50/40 border-amber-300 hover:border-amber-400 hover:bg-amber-50/70'
          : 'bg-white border-[#e9edef] hover:border-slate-300 hover:bg-[#f0f2f5]/60'
      }`}
    >
      {/* Top Header: WhatsApp Avatar + Contact Name + Time / SLA */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
              isCritical
                ? 'bg-rose-600 text-white'
                : isWarning
                ? 'bg-amber-500 text-white'
                : 'bg-[#dfe5e7] text-[#54656f]'
            }`}
          >
            {journey.leadName.charAt(0)}
          </div>
          <span className="font-bold text-xs text-[#111b21] truncate">
            {journey.leadName}
          </span>
        </div>

        {/* SLA Badge */}
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold shrink-0 ${
            isCritical
              ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
              : isWarning
              ? 'bg-amber-100 text-amber-800 border border-amber-300'
              : 'bg-[#f0f2f5] text-[#54656f] border border-[#e2e8f0]'
          }`}
        >
          <Clock className="w-3 h-3" />
          <span>{isCritical ? `SLA: ${journey.slaMinutesRemaining}m` : `${journey.slaMinutesRemaining}m`}</span>
        </div>
      </div>

      {/* Motivo da Prioridade em uma linha clara / WhatsApp Preview */}
      <div className="text-xs text-[#54656f] font-normal line-clamp-1 mb-2 leading-relaxed">
        {journey.urgencyReason}
      </div>

      {/* Footer: Responsável / Estado do Handoff + Ação Primária */}
      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#f0f2f5]">
        <div className="flex items-center gap-1.5 truncate max-w-[140px]">
          {isPending ? (
            <span className="flex items-center gap-1 text-amber-700 font-bold">
              <AlertCircle className="w-3 h-3 text-amber-600" />
              <span>Aguardando operador</span>
            </span>
          ) : isAnotherOperator ? (
            <span className="flex items-center gap-1 text-slate-600">
              <User className="w-3 h-3 text-slate-400" />
              <span className="truncate">{journey.assignedOperatorName}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[#065f46] font-bold">
              <UserCheck className="w-3 h-3 text-[#00a884]" />
              <span>Seu atendimento</span>
            </span>
          )}
        </div>

        {/* Primary Action Button */}
        {isPending && onClaim ? (
          <button
            id={`quick-claim-btn-${journey.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onClaim(journey.id);
            }}
            className={`py-0.5 px-2.5 rounded-md text-[10.5px] font-bold transition-colors shrink-0 shadow-2xs ${
              isCritical
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-[#00a884] hover:bg-[#008069] text-white'
            }`}
          >
            {getPrimaryActionLabel()}
          </button>
        ) : (
          <span className="text-[10px] font-semibold text-[#667781] group-hover:text-[#00a884] transition-colors">
            {getPrimaryActionLabel()} →
          </span>
        )}
      </div>
    </div>
  );
};

