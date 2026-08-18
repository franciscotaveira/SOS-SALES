import React from 'react';
import { Message } from '../../types/cockpit';
import { MessageBubble } from './MessageBubble';
import { MessageSquareOff, Lock } from 'lucide-react';

interface MessageTimelineProps {
  messages: Message[];
  onRetryMessage?: (message: Message) => void;
  isLoading?: boolean;
}

export const MessageTimeline: React.FC<MessageTimelineProps> = ({
  messages,
  onRetryMessage,
  isLoading,
}) => {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const isAtBottomRef = React.useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = React.useState(false);
  const prevMessagesLengthRef = React.useRef(messages.length);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom < 80;
    isAtBottomRef.current = isNearBottom;
    setShowScrollBottomBtn(!isNearBottom);
  };

  const scrollToBottom = (smooth = true) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
      isAtBottomRef.current = true;
      setShowScrollBottomBtn(false);
    }
  };

  // Auto-scroll on initial load or if user was already at the bottom
  React.useEffect(() => {
    const isNew = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (isAtBottomRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: isNew ? 'smooth' : 'auto',
      });
    }
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-4 animate-pulse whatsapp-chat-wallpaper">
        <div className="w-1/2 h-12 bg-white/80 rounded-lg shadow-xs"></div>
        <div className="w-2/3 h-16 bg-[#d9fdd3]/80 rounded-lg ml-auto shadow-xs"></div>
        <div className="w-1/3 h-10 bg-white/80 rounded-lg shadow-xs"></div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 whatsapp-chat-wallpaper">
        <div className="w-12 h-12 rounded-full bg-white/90 shadow-xs flex items-center justify-center mb-3">
          <MessageSquareOff className="w-6 h-6 text-slate-400" />
        </div>
        <h3 className="font-semibold text-slate-800 text-sm">Histórico sem mensagens</h3>
        <p className="text-xs text-slate-600 max-w-xs mt-1">
          Nenhuma interação registrada ainda nesta conversa. Inicie o atendimento usando o compositor supervisionado.
        </p>
      </div>
    );
  }

  return (
    <div
      id="message-timeline-container"
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto p-4 space-y-1 whatsapp-chat-wallpaper"
    >
      {/* WhatsApp Official Encryption Badge */}
      <div className="text-center my-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] bg-[#ffeecd] text-[#54656f] border border-[#f5c369]/40 px-3 py-1 rounded-lg shadow-2xs font-normal max-w-md text-center leading-tight">
          <Lock className="w-3 h-3 text-[#f59e0b] shrink-0" />
          <span>As mensagens são protegidas com criptografia oficial da WhatsApp Business Platform (Cloud API).</span>
        </span>
      </div>

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} onRetry={onRetryMessage} />
      ))}

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottomBtn && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="sticky bottom-2 ml-auto float-right z-20 flex items-center gap-1.5 rounded-full bg-slate-900/90 hover:bg-slate-950 text-white px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur-xs transition transform active:scale-95 cursor-pointer animate-in fade-in"
          title="Ir para mensagens recentes"
        >
          <span>↓ Mensagens recentes</span>
        </button>
      )}
    </div>
  );
};

