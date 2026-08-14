import React from 'react';
import { Journey, MessageStatus } from '../../types/cockpit';
import {
  Clock,
  User,
  AlertCircle,
  UserCheck,
  Check,
  CheckCheck,
  Flame,
  Radio,
  Tag,
} from 'lucide-react';

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
    journey.handoffStatus === 'in_progress' &&
    !isCurrentOperatorOwner &&
    !!journey.assignedOperatorName;

  const hasUnread = (journey.unreadCount ?? 0) > 0;

  // Format time of last activity (e.g. 11:32 or date)
  const formattedTime = React.useMemo(() => {
    try {
      const date = new Date(journey.lastActivityAt);
      if (isNaN(date.getTime())) return 'Agora';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Agora';
    }
  }, [journey.lastActivityAt]);

  // WhatsApp Message Delivery Status Icon
  const renderDeliveryStatus = (status?: MessageStatus) => {
    switch (status) {
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] shrink-0" title="Lido pelo cliente" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-[#8696a0] shrink-0" title="Entregue no aparelho" />;
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-[#8696a0] shrink-0" title="Enviado aos servidores" />;
      case 'sending':
        return <Clock className="w-3 h-3 text-[#8696a0] animate-spin shrink-0" title="Enviando..." />;
      case 'failed':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" title="Falha no envio" />;
      default:
        return <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb] shrink-0" title="Lido" />;
    }
  };

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
      className={`px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left relative group ${
        isSelected
          ? 'bg-[#f0f2f5] border-[#00a884] shadow-2xs ring-1 ring-[#00a884]'
          : isCritical
          ? 'bg-rose-50/60 border-rose-300 hover:border-rose-400 hover:bg-rose-50/90'
          : isWarning
          ? 'bg-amber-50/50 border-amber-300 hover:border-amber-400 hover:bg-amber-50/80'
          : 'bg-white border-[#e9edef] hover:border-slate-300 hover:bg-[#f0f2f5]/60'
      }`}
    >
      {/* Top Header: Avatar + Lead Name + Time & SLA */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          {/* Avatar WhatsApp Style */}
          <div className="relative shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-2xs ${
                isCritical
                  ? 'bg-rose-600 text-white'
                  : isWarning
                  ? 'bg-amber-500 text-white'
                  : isPending
                  ? 'bg-[#00a884] text-white'
                  : 'bg-[#dfe5e7] text-[#54656f]'
              }`}
            >
              {journey.leadAvatar ? (
                <img
                  src={journey.leadAvatar}
                  alt={journey.leadName}
                  className="w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                journey.leadName.charAt(0)
              )}
            </div>

            {/* Unread dot indicator on avatar if unread */}
            {hasUnread && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#25d366] border-2 border-white rounded-full" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs truncate ${
                  hasUnread ? 'font-bold text-[#111b21]' : 'font-semibold text-[#111b21]'
                }`}
              >
                {journey.leadName}
              </span>
              {journey.acquisition.source === 'ctwa' && (
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 shrink-0">
                  CTWA Ads
                </span>
              )}
            </div>
            <span className="text-[10.5px] text-[#667781] block truncate font-mono">
              {journey.leadCity || journey.leadPhone}
            </span>
          </div>
        </div>

        {/* Right Top: Time & Unread Badge */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-[10.5px] font-mono ${
              hasUnread ? 'font-bold text-[#25d366]' : 'text-[#667781]'
            }`}
          >
            {formattedTime}
          </span>

          {/* SLA Badge */}
          <div
            className={`flex items-center gap-1 px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold ${
              isCritical
                ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                : isWarning
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-[#f0f2f5] text-[#54656f] border border-[#e2e8f0]'
            }`}
          >
            <Clock className="w-2.5 h-2.5" />
            <span>{isCritical ? `${journey.slaMinutesRemaining}m` : `${journey.slaMinutesRemaining}m`}</span>
          </div>
        </div>
      </div>

      {/* Message Preview with WhatsApp Delivery Status Icon */}
      <div className="flex items-center gap-1 text-[11.5px] text-[#54656f] mb-2 leading-relaxed">
        {renderDeliveryStatus(journey.lastMessageDeliveryStatus || 'read')}
        <span
          className={`truncate ${
            hasUnread ? 'font-semibold text-[#111b21]' : 'text-[#54656f]'
          }`}
        >
          {journey.lastLeadMessage || journey.urgencyReason}
        </span>
      </div>

      {/* Footer: Responsável / Status do Handoff + Action */}
      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#f0f2f5]">
        <div className="flex items-center gap-1.5 truncate max-w-[150px]">
          {isPending ? (
            <span className="flex items-center gap-1 text-amber-800 font-bold text-[10.5px]">
              <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
              <span>Aguardando operador</span>
            </span>
          ) : isAnotherOperator ? (
            <span className="flex items-center gap-1 text-slate-600 text-[10.5px]">
              <User className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{journey.assignedOperatorName}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[#00a884] font-bold text-[10.5px]">
              <UserCheck className="w-3 h-3 text-[#00a884] shrink-0" />
              <span>Seu atendimento</span>
            </span>
          )}
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-1.5">
          {journey.unreadCount > 0 && (
            <span className="bg-[#25d366] text-white font-bold text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
              {journey.unreadCount}
            </span>
          )}

          {isPending && onClaim ? (
            <button
              id={`quick-claim-btn-${journey.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onClaim(journey.id);
              }}
              className={`py-0.5 px-2 rounded-md text-[10.5px] font-bold transition-colors shrink-0 shadow-2xs ${
                isCritical
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-[#00a884] hover:bg-[#008069] text-white'
              }`}
            >
              {getPrimaryActionLabel()}
            </button>
          ) : (
            <span className="text-[10.5px] font-semibold text-[#667781] group-hover:text-[#00a884] transition-colors">
              {getPrimaryActionLabel()} →
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
