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
      className={`flex flex-col mb-2 ${isLead ? 'items-start' : 'items-end'}`}
    >
      {/* Sender Header if Bot or Operator - tokens semânticos */}
      {(isBot || isOperator) && (
        <div className="flex items-center gap-1.5 mb-1 px-1 text-[10.5px] text-[var(--sos-muted)] font-medium">
          {isBot && (
            <span className="flex items-center gap-1 text-[var(--sos-ai)] bg-[var(--sos-ai-subtle)] px-1.5 py-0.5 rounded text-[10px] font-bold">
              <Bot className="w-3 h-3 text-[var(--sos-ai)]" />
              {message.senderName || 'AutoBot IA'}
            </span>
          )}
          {isOperator && (
            <span className="flex items-center gap-1 text-[var(--sos-action)] bg-[var(--sos-action-subtle)] px-1.5 py-0.5 rounded text-[10px] font-bold">
              <User className="w-3 h-3 text-[var(--sos-action)]" />
              {message.senderName || 'Atendente'}
            </span>
          )}
        </div>
      )}

      {/* WhatsApp Authentic Bubble - tokens semânticos */}
      <div
        className={`relative max-w-[85%] sm:max-w-[70%] px-3 py-1.5 rounded-lg text-sm leading-relaxed wa-bubble-shadow ${
          isLead
            ? 'bg-white text-[var(--sos-ink)] rounded-tl-none border border-[var(--sos-border)]'
            : isBot
            ? 'bg-[var(--sos-ai-subtle)] text-[var(--sos-ink)] rounded-tr-none border border-[var(--sos-ai)]/30'
            : isFailed
            ? 'bg-[var(--sos-danger-subtle)] text-[var(--sos-danger)] rounded-tr-none border border-[var(--sos-danger)]/30'
            : 'bg-[var(--sos-action-subtle)] text-[var(--sos-ink)] rounded-tr-none border border-[var(--sos-action)]/30'
        }`}
      >
        <MessageMediaRenderer
          mediaPayload={(message as any).mediaPayload}
          textContent={message.text}
          isOutbound={!isLead}
          senderName={message.senderName || (isLead ? 'Cliente' : 'Atendente')}
          providerMessageId={(message as any).providerMessageId || null}
          session={(message as any).mediaPayload?.session || undefined}
        />

        {/* AI Summary and Transcript if available - tokens semânticos */}
        {(message.transcript || (message.audioSummary && message.audioSummary.length > 0)) && (
          <div className="mt-1 border-t border-[var(--sos-border)] pt-1.5 space-y-1.5">
            {message.audioSummary && message.audioSummary.length > 0 && (
              <div className="bg-[var(--sos-ai-subtle)] rounded-lg p-2 text-xs border border-[var(--sos-ai)]/30">
                <div className="flex items-center gap-1 font-bold text-[var(--sos-ai)] text-[10.5px] mb-0.5">
                  <Sparkles className="w-3 h-3 text-[var(--sos-ai)]" />
                  <span>Resumo da IA:</span>
                </div>
                <ul className="list-disc pl-3.5 space-y-0.5 text-[var(--sos-ai)] text-[11px] leading-snug">
                  {message.audioSummary.map((point, idx) => (
                    <li key={idx}>{point}</li>
                  ))}
                </ul>
              </div>
            )}

            {message.transcript && (
              <details className="text-[11px] text-[var(--sos-muted)] bg-[var(--sos-canvas)] p-1.5 rounded-md border border-[var(--sos-border)] leading-snug cursor-pointer">
                <summary className="font-semibold text-[var(--sos-ink)] select-none flex items-center gap-1 text-[10.5px]">
                  <FileText className="w-3 h-3 text-[var(--sos-muted)]" />
                  <span>Ver transcrição completa</span>
                </summary>
                <p className="mt-1 pl-4 italic text-[var(--sos-muted)]">
                  "{message.transcript}"
                </p>
              </details>
            )}
          </div>
        )}

        {/* Integrated WhatsApp Timestamp & Checkmarks - tokens semânticos */}
        <div className="flex items-center justify-end gap-1 float-right ml-3 mt-0.5 select-none">
          <span className="text-[10px] text-[var(--sos-muted)] font-normal leading-none">
            {message.timestamp}
          </span>
          {!isLead && (
            <span className="inline-flex items-center leading-none">
              {message.status === 'sending' && (
                <span className="text-[10px] text-[var(--sos-muted)]">...</span>
              )}
              {message.status === 'sent' && (
                <Check className="w-3.5 h-3.5 text-[var(--sos-muted)]" />
              )}
              {message.status === 'delivered' && (
                <CheckCheck className="w-3.5 h-3.5 text-[var(--sos-muted)]" />
              )}
              {message.status === 'read' && (
                <CheckCheck className="w-3.5 h-3.5 text-[var(--sos-action)]" />
              )}
              {isFailed && (
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--sos-danger)]" />
              )}
            </span>
          )}
        </div>
        <div className="clear-both" />

        {/* Failed Retry Option - tokens semânticos */}
        {isFailed && (
          <div className="flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-[var(--sos-danger)]/30 text-[11px] text-[var(--sos-danger)] font-medium">
            <span>Mensagem não entregue</span>
            {onRetry && (
              <button
                onClick={() => onRetry(message)}
                className="flex items-center gap-1 text-[var(--sos-danger)] bg-[var(--sos-danger-subtle)] hover:bg-[var(--sos-danger)]/20 px-2 py-0.5 rounded font-bold transition-colors"
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
