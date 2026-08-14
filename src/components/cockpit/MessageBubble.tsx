import React from 'react';
import { Message } from '../../types/cockpit';
import { Check, CheckCheck, AlertTriangle, Bot, User, RotateCcw } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
  onRetry?: (message: Message) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onRetry }) => {
  const isLead = message.sender === 'lead';
  const isBot = message.sender === 'bot';
  const isOperator = message.sender === 'operator';
  const isFailed = message.status === 'failed';

  return (
    <div
      id={`message-bubble-${message.id}`}
      className={`flex flex-col mb-2.5 ${
        isLead ? 'items-start' : 'items-end'
      }`}
    >
      {/* Sender Header if Bot or Operator */}
      {(isBot || isOperator) && (
        <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-slate-500 font-medium">
          {isBot && (
            <span className="flex items-center gap-1 text-purple-700 bg-purple-100/80 px-1.5 py-0.5 rounded text-[10px] font-bold">
              <Bot className="w-3 h-3 text-purple-600" />
              {message.senderName || 'AutoBot IA'}
            </span>
          )}
          {isOperator && (
            <span className="flex items-center gap-1 text-emerald-800 bg-emerald-100/80 px-1.5 py-0.5 rounded text-[10px] font-bold">
              <User className="w-3 h-3 text-emerald-700" />
              {message.senderName || 'Atendente'}
            </span>
          )}
        </div>
      )}

      {/* WhatsApp Authentic Bubble */}
      <div
        className={`relative max-w-[85%] sm:max-w-[70%] px-3.5 pt-2 pb-1.5 rounded-lg text-[13.5px] leading-relaxed wa-bubble-shadow ${
          isLead
            ? 'bg-white text-[#111b21] rounded-tl-none border-t border-l border-white/50'
            : isBot
            ? 'bg-[#f5f3ff] text-[#111b21] rounded-tr-none border border-purple-200/70'
            : isFailed
            ? 'bg-[#ffebee] text-[#b71c1c] rounded-tr-none border border-rose-300'
            : 'bg-[#d9fdd3] text-[#111b21] rounded-tr-none border-t border-r border-[#cbf5c4]'
        }`}
      >
        {/* Message Content */}
        <div className="whitespace-pre-wrap break-words pr-2">
          {message.text}
        </div>

        {/* Integrated WhatsApp Timestamp & Checkmarks */}
        <div className="flex items-center justify-end gap-1 float-right ml-3 mt-0.5 select-none">
          <span className="text-[10.5px] text-[#667781] font-normal leading-none">
            {message.timestamp}
          </span>

          {!isLead && (
            <span className="inline-flex items-center leading-none">
              {message.status === 'sending' && (
                <span className="text-[10px] text-[#8696a0]">...</span>
              )}
              {message.status === 'sent' && (
                <Check className="w-3.5 h-3.5 text-[#8696a0]" />
              )}
              {message.status === 'delivered' && (
                <CheckCheck className="w-3.5 h-3.5 text-[#8696a0]" />
              )}
              {message.status === 'read' && (
                <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
              )}
              {isFailed && (
                <AlertTriangle className="w-3.5 h-3.5 text-[#e53935]" />
              )}
            </span>
          )}
        </div>

        <div className="clear-both" />

        {/* Failed Retry Option */}
        {isFailed && (
          <div className="flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-rose-200 text-[11px] text-rose-800 font-medium">
            <span>Mensagem não entregue</span>
            {onRetry && (
              <button
                onClick={() => onRetry(message)}
                className="flex items-center gap-1 text-rose-900 bg-rose-100 hover:bg-rose-200 px-2 py-0.5 rounded font-bold transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reenviar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

