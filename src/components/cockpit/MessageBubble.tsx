import React, { useState } from 'react';
import { Message } from '../../types/cockpit';
import { Check, CheckCheck, AlertTriangle, Bot, User, RotateCcw, Sparkles, FileText } from 'lucide-react';
import { MessageMediaRenderer } from './MessageMediaRenderer';

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
        <MessageMediaRenderer
          mediaPayload={(message as any).mediaPayload}
          textContent={message.text}
          isOutbound={!isLead}
          senderName={message.senderName || (isLead ? 'Cliente' : 'Atendente')}
        />

        {/* AI Summary and Transcript if available */}
        {(message.transcript || (message.audioSummary && message.audioSummary.length > 0)) && (
          <div className="mt-1 border-t border-slate-100 pt-1.5 space-y-1.5">
            {message.audioSummary && message.audioSummary.length > 0 && (
              <div className="bg-purple-50/80 rounded-lg p-2 text-xs border border-purple-100">
                <div className="flex items-center gap-1 font-bold text-purple-950 text-[11px] mb-0.5">
                  <Sparkles className="w-3 h-3 text-purple-600" />
                  <span>Resumo da IA:</span>
                </div>
                <ul className="list-disc pl-3.5 space-y-0.5 text-purple-900 text-[11px] leading-snug">
                  {message.audioSummary.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}

            {message.transcript && (
              <details className="text-[11px] text-slate-600 bg-slate-50/80 p-1.5 rounded-md border border-slate-100 leading-snug cursor-pointer">
                <summary className="font-semibold text-slate-700 select-none flex items-center gap-1 text-[10.5px]">
                  <FileText className="w-3 h-3 text-slate-500" />
                  <span>Ver transcrição completa</span>
                </summary>
                <p className="mt-1 pl-4 italic text-slate-600">
                  "{message.transcript}"
                </p>
              </details>
            )}
          </div>
        )}

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
