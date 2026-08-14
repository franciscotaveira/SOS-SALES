import React from 'react';
import { Channel, Journey, OperatorRole } from '../../types/cockpit';
import {
  Send,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  AlertCircle,
  Zap,
  ShieldX,
  Smile,
  Paperclip,
  Mic,
} from 'lucide-react';
import { validateCommercialPolicy } from '../../services/commercialGuardrailService';
import { MacroShortcutMenu } from './MacroShortcutMenu';

interface SupervisedComposerProps {
  journey: Journey;
  channel?: Channel;
  role: OperatorRole;
  currentDraft: string;
  onChangeDraft: (text: string) => void;
  onSendMessage: (text: string) => Promise<void>;
  isSending: boolean;
  sendError?: string | null;
  onClearError: () => void;
}

export const SupervisedComposer: React.FC<SupervisedComposerProps> = ({
  journey,
  channel,
  role,
  currentDraft,
  onChangeDraft,
  onSendMessage,
  isSending,
  sendError,
  onClearError,
}) => {
  const isChannelPaused = channel?.health === 'paused';
  const isViewer = role === 'viewer';

  // Real-time commercial guardrail validation
  const guardrail = React.useMemo(
    () => validateCommercialPolicy(currentDraft),
    [currentDraft]
  );

  const [isMacroMenuOpen, setIsMacroMenuOpen] = React.useState(false);
  const [macroFilter, setMacroFilter] = React.useState('');

  const canSend =
    !isChannelPaused &&
    !isViewer &&
    currentDraft.trim().length > 0 &&
    !isSending &&
    guardrail.isValid;

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === '/' && (currentDraft.endsWith(' ') || currentDraft.length === 0)) {
      setIsMacroMenuOpen(true);
      setMacroFilter('');
    } else if (e.key === 'Escape' && isMacroMenuOpen) {
      setIsMacroMenuOpen(false);
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canSend) {
        handleSend();
      }
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (sendError) onClearError();
    onChangeDraft(val);

    const lastWord = val.split(/\s+/).pop() || '';
    if (lastWord.startsWith('/') && lastWord.length >= 1) {
      setIsMacroMenuOpen(true);
      setMacroFilter(lastWord);
    } else if (isMacroMenuOpen && !lastWord.startsWith('/')) {
      setIsMacroMenuOpen(false);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    try {
      await onSendMessage(currentDraft);
    } catch {
      // Handled by parent
    }
  };

  const handleInsertMacro = (text: string) => {
    const words = currentDraft.split(/\s+/);
    if (words.length > 0 && words[words.length - 1].startsWith('/')) {
      words.pop();
      const prefix = words.join(' ');
      onChangeDraft(prefix ? `${prefix} ${text}` : text);
    } else {
      onChangeDraft(currentDraft ? `${currentDraft} ${text}` : text);
    }
    setIsMacroMenuOpen(false);
    textareaRef.current?.focus();
  };

  return (
    <div
      id="supervised-composer-container"
      className="p-2.5 sm:p-3 bg-[#f0f2f5] border-t border-[#e2e8f0] shrink-0 relative"
    >
      {/* Macro Shortcuts Popover Menu */}
      <MacroShortcutMenu
        journey={journey}
        isOpen={isMacroMenuOpen}
        onSelect={handleInsertMacro}
        onClose={() => setIsMacroMenuOpen(false)}
        filterQuery={macroFilter}
      />

      {/* Guardrail Violation Alert */}
      {!guardrail.isValid && (
        <div
          id="guardrail-violation-banner"
          className="mb-2 p-2 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 flex items-start gap-2 animate-in fade-in"
        >
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">Alerta de Conformidade (Guardrail Comercial):</span>
            {guardrail.violations.map((v, i) => (
              <p key={i} className="text-[11px] text-rose-800">{v}</p>
            ))}
          </div>
        </div>
      )}

      {/* Guardrail Soft Warnings */}
      {guardrail.isValid && guardrail.warnings.length > 0 && (
        <div
          id="guardrail-warning-banner"
          className="mb-2 p-1.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-center gap-2"
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>{guardrail.warnings[0]}</span>
        </div>
      )}

      {/* Error alert if send failed */}
      {sendError && (
        <div
          id="composer-error-banner"
          className="mb-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{sendError}</span>
          </div>
          <button
            onClick={onClearError}
            className="text-[11px] font-bold text-rose-900 underline ml-2"
          >
            Fechar
          </button>
        </div>
      )}

      {/* WhatsApp Signature Input Bar Row */}
      <div className="flex items-end gap-2">
        {/* Left Accessories: Emoji & Attachment Icons */}
        <div className="flex items-center gap-0.5 sm:gap-1 text-[#54656f] pb-1.5 shrink-0">
          <button
            type="button"
            className="p-1.5 rounded-full hover:bg-white/80 text-[#54656f] hover:text-[#111b21] transition-colors"
            title="Emojis"
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-full hover:bg-white/80 text-[#54656f] hover:text-[#111b21] transition-colors"
            title="Anexar arquivo / foto"
          >
            <Paperclip className="w-5 h-5" />
          </button>
        </div>

        {/* Center: Clean White Rounded Input Area */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 focus-within:border-[#00a884] focus-within:ring-1 focus-within:ring-[#00a884] transition-all shadow-2xs">
          <textarea
            id="supervised-composer-textarea"
            ref={textareaRef}
            value={currentDraft}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            disabled={isViewer || isChannelPaused}
            rows={2}
            placeholder={
              isViewer
                ? 'Modo Somente Leitura: você está como visualizador.'
                : isChannelPaused
                ? 'Canal pausado pelo supervisor. O rascunho está preservado com segurança.'
                : 'Digite uma mensagem para o cliente (ou / para atalhos)...'
            }
            className="w-full px-3.5 py-2 text-[13.5px] text-[#111b21] placeholder:text-[#8696a0] bg-transparent rounded-2xl border-none outline-none resize-none leading-relaxed"
          />

          {/* Quick macro triggers & Helper chips */}
          {!isViewer && !isChannelPaused && (
            <div className="flex items-center gap-1.5 px-3 pb-1.5 overflow-x-auto">
              <button
                onClick={() => {
                  setIsMacroMenuOpen(!isMacroMenuOpen);
                  setMacroFilter('');
                }}
                className="text-[10.5px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded-md border border-emerald-200 shrink-0 transition-colors flex items-center gap-1"
              >
                <Zap className="w-3 h-3 text-[#00a884]" />
                <span>/ Atalhos Rápidos</span>
              </button>
              <button
                onClick={() => handleInsertMacro('Temos vaga disponível hoje por volta das 14h30 ou 16h00!')}
                className="text-[10.5px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 shrink-0 transition-colors"
              >
                Vaga hoje
              </button>
              <button
                onClick={() => handleInsertMacro('Segue nossa chave Pix oficial para confirmação do seu horário:')}
                className="text-[10.5px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 shrink-0 transition-colors"
              >
                Chave Pix
              </button>
              <button
                onClick={() => handleInsertMacro('Já deixei seu horário pré-reservado aqui por 15 minutos para garantir!')}
                className="text-[10.5px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 shrink-0 transition-colors"
              >
                Hold 15min
              </button>
              <button
                onClick={() => handleInsertMacro('Ficamos localizados na Rua Central, 450 com estacionamento gratuito.')}
                className="text-[10.5px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md border border-slate-200 shrink-0 transition-colors"
              >
                Endereço
              </button>
            </div>
          )}
        </div>

        {/* Right: WhatsApp Circular Green Send Button */}
        <div className="pb-1.5 shrink-0">
          <button
            id="composer-send-btn"
            onClick={handleSend}
            disabled={!canSend}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-xs ${
              canSend
                ? 'bg-[#00a884] hover:bg-[#008069] text-white cursor-pointer active:scale-95'
                : 'bg-slate-300 text-white cursor-not-allowed opacity-80'
            }`}
            title="Enviar mensagem (Cmd + Enter)"
          >
            {isSending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : currentDraft.trim().length === 0 ? (
              <Mic className="w-5 h-5 text-slate-500" />
            ) : (
              <Send className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* Footer Status / Policy confirmations */}
      <div className="flex items-center justify-between text-[10.5px] mt-1.5 px-2 text-[#667781]">
        <div className="flex items-center gap-2">
          {isChannelPaused ? (
            <span className="flex items-center gap-1 text-rose-600 font-bold">
              <ShieldAlert className="w-3 h-3" />
              Canal pausado · Envio bloqueado
            </span>
          ) : !guardrail.isValid ? (
            <span className="flex items-center gap-1 text-rose-600 font-bold">
              <ShieldX className="w-3 h-3 text-rose-600" />
              Desconto excede política comercial
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[#00a884] font-medium">
              <ShieldCheck className="w-3 h-3 text-[#00a884]" />
              WhatsApp Cloud API Oficial · Políticas OK
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentDraft.length > 0 && <span>{currentDraft.length} caracteres</span>}
          <span className="hidden sm:inline">Pressione Enter para enviar</span>
        </div>
      </div>
    </div>
  );
};

