import React from 'react';
import { Channel, Journey, OperatorRole, Recommendation, EvidenceReference } from '../../types/cockpit';
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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Eye,
  X,
} from 'lucide-react';
import { validateCommercialPolicy } from '../../services/commercialGuardrailService';
import { MacroShortcutMenu } from './MacroShortcutMenu';
import { EvidenceModal } from './EvidenceModal';
import { WabaActionsModal } from './WabaActionsModal';

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
  recommendation?: Recommendation;
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
  recommendation,
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
  const [isAiSuggestionDismissed, setIsAiSuggestionDismissed] = React.useState(false);
  const [isAiDetailsExpanded, setIsAiDetailsExpanded] = React.useState(false);
  const [evidenceModalOpen, setEvidenceModalOpen] = React.useState(false);
  const [wabaActionsModalOpen, setWabaActionsModalOpen] = React.useState(false);
  const [toastNotification, setToastNotification] = React.useState<string | null>(null);

  // Reset dismissed state when journey or recommendation changes
  React.useEffect(() => {
    setIsAiSuggestionDismissed(false);
    setIsAiDetailsExpanded(false);
  }, [journey.id, recommendation?.id]);

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

  const handleApplyAiSuggestion = () => {
    if (recommendation?.draftText) {
      onChangeDraft(recommendation.draftText);
    } else if (recommendation?.suggestedAction) {
      onChangeDraft(recommendation.suggestedAction);
    }
    textareaRef.current?.focus();
  };

  const hasActiveAiSuggestion = !!recommendation && !isAiSuggestionDismissed && !isViewer && !isChannelPaused;

  return (
    <div
      id="supervised-composer-container"
      className="p-2 sm:p-2.5 bg-[var(--sos-canvas)] border-t border-[var(--sos-border)] shrink-0 relative"
    >
      {/* Macro Shortcuts Popover Menu */}
      <MacroShortcutMenu
        journey={journey}
        isOpen={isMacroMenuOpen}
        onSelect={handleInsertMacro}
        onClose={() => setIsMacroMenuOpen(false)}
        filterQuery={macroFilter}
      />

      {/* AI Copilot Integrated Suggestion Strip (Compact 1-line bar) - tokens semânticos */}
      {hasActiveAiSuggestion && recommendation && (
        <div
          id="composer-ai-copilot-strip"
          className="mb-1.5 bg-[var(--sos-ai-subtle)] border border-[var(--sos-ai)]/30 rounded-lg px-2.5 py-1.5 shadow-2xs flex items-center justify-between gap-2 text-xs animate-in fade-in"
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Sparkles className="w-3.5 h-3.5 text-[var(--sos-ai)] shrink-0" />
            <span className="text-[10.5px] font-bold text-[var(--sos-ai)] shrink-0 hidden sm:inline">
              Copilot:
            </span>
            <p className="text-[11px] text-[var(--sos-ai)] italic truncate">
              "{recommendation.draftText || recommendation.suggestedAction}"
            </p>
            <span className="text-[9px] bg-[var(--sos-ai)]/20 text-[var(--sos-ai)] font-mono px-1 py-0.2 rounded font-bold shrink-0 hidden md:inline">
              {Math.round(recommendation.confidence * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleApplyAiSuggestion}
              className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[var(--sos-ai)] hover:bg-[var(--sos-ai)]/90 text-white transition-colors flex items-center gap-1 shadow-2xs"
            >
              <span>Usar</span>
              <ArrowRight className="w-3 h-3" />
            </button>

            <button
              onClick={() => setEvidenceModalOpen(true)}
              className="text-[var(--sos-ai)] hover:text-[var(--sos-ai)]/70 p-0.5 rounded hover:bg-[var(--sos-ai)]/10 transition-colors"
              title="Ver evidências"
            >
              <Eye className="w-3 h-3" />
            </button>

            <button
              onClick={() => setIsAiSuggestionDismissed(true)}
              className="text-[var(--sos-muted)] hover:text-[var(--sos-ink)] p-0.5 rounded transition-colors"
              title="Dispensar sugestão"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Guardrail Violation Alert - tokens semânticos */}
      {!guardrail.isValid && (
        <div
          id="guardrail-violation-banner"
          className="mb-2 p-2 bg-[var(--sos-danger-subtle)] border border-[var(--sos-danger)]/30 rounded-xl text-xs text-[var(--sos-danger)] flex items-start gap-2 animate-in fade-in"
        >
          <ShieldAlert className="w-4 h-4 text-[var(--sos-danger)] shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">Alerta de Conformidade (Guardrail Comercial):</span>
            {guardrail.violations.map((v, i) => (
              <p key={i} className="text-[11px] text-[var(--sos-danger)]">{v}</p>
            ))}
          </div>
        </div>
      )}

      {/* Guardrail Soft Warnings - tokens semânticos */}
      {guardrail.isValid && guardrail.warnings.length > 0 && (
        <div
          id="guardrail-warning-banner"
          className="mb-2 p-1.5 bg-[var(--sos-warning-subtle)] border border-[var(--sos-warning)]/30 rounded-xl text-[11px] text-[var(--sos-warning)] flex items-center gap-2"
        >
          <AlertCircle className="w-3.5 h-3.5 text-[var(--sos-warning)] shrink-0" />
          <span>{guardrail.warnings[0]}</span>
        </div>
      )}

      {/* Error alert if send failed - tokens semânticos */}
      {sendError && (
        <div
          id="composer-error-banner"
          className="mb-2 p-2 bg-[var(--sos-danger-subtle)] border border-[var(--sos-danger)]/30 rounded-lg text-xs text-[var(--sos-danger)] flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[var(--sos-danger)] shrink-0" />
            <span>{sendError}</span>
          </div>
          <button
            onClick={onClearError}
            className="text-[11px] font-bold text-[var(--sos-danger)] underline ml-2"
          >
            Fechar
          </button>
        </div>
      )}

      {/* WhatsApp Signature Input Bar Row */}
      <div className="flex items-end gap-2">
        {/* Left Accessories: Emoji & Attachment Icons */}
        <div className="flex items-center gap-0.5 sm:gap-1 text-[var(--sos-muted)] pb-1.5 shrink-0">
          <button
            type="button"
            className="p-1.5 rounded-full hover:bg-white/80 text-[var(--sos-muted)] hover:text-[var(--sos-ink)] transition-colors"
            title="Emojis"
          >
            <Smile className="w-5 h-5" />
          </button>
          <button
            type="button"
            className="p-1.5 rounded-full hover:bg-white/80 text-[var(--sos-muted)] hover:text-[var(--sos-ink)] transition-colors"
            title="Anexar arquivo / foto"
          >
            <Paperclip className="w-5 h-5" />
          </button>
        </div>

        {/* Center: Clean White Rounded Input Area */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-[var(--sos-border)] focus-within:border-[var(--sos-action)] focus-within:ring-1 focus-within:ring-[var(--sos-action)] transition-all shadow-2xs">
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
            className="w-full px-3.5 py-2 text-sm text-[var(--sos-ink)] placeholder:text-[var(--sos-muted)] bg-transparent rounded-xl border-none outline-none resize-none leading-relaxed"
          />

          {/* Quick macro triggers & Helper chips - tokens semânticos */}
          {!isViewer && !isChannelPaused && (
            <div className="flex items-center gap-1.5 px-3 pb-1.5 overflow-x-auto">
              <button
                onClick={() => {
                  setIsMacroMenuOpen(!isMacroMenuOpen);
                  setMacroFilter('');
                }}
                className="text-[10.5px] bg-[var(--sos-action-subtle)] hover:bg-[var(--sos-action)]/20 text-[var(--sos-action)] font-bold px-2 py-0.5 rounded-md border border-[var(--sos-action)]/30 shrink-0 transition-colors flex items-center gap-1"
              >
                <Zap className="w-3 h-3 text-[var(--sos-action)]" />
                <span>/ Atalhos</span>
              </button>

              {/* WABA Native Features (Pix, Location, Catalog, Flow) */}
              <button
                onClick={() => setWabaActionsModalOpen(true)}
                className="text-[10.5px] bg-[var(--sos-ai-subtle)] hover:bg-[var(--sos-ai)]/20 text-[var(--sos-ai)] font-bold px-2 py-0.5 rounded-md border border-[var(--sos-ai)]/30 shrink-0 transition-colors flex items-center gap-1 cursor-pointer"
                title="Disparar Pix Dinâmico, Localização GPS, Catálogo ou Flow"
              >
                <Sparkles className="w-3 h-3 text-[var(--sos-ai)]" />
                <span>⚡ WABA Nativo</span>
              </button>

              <button
                onClick={() => handleInsertMacro('Vou consultar a disponibilidade real e já retorno com os horários possíveis.')}
                className="text-[10.5px] bg-[var(--sos-canvas)] hover:bg-[var(--sos-border)]/50 text-[var(--sos-muted)] px-2 py-0.5 rounded-md border border-[var(--sos-border)] shrink-0 transition-colors"
              >
                Vaga hoje
              </button>

              <button
                onClick={() => handleInsertMacro('Posso enviar as instruções de pagamento cadastradas depois de confirmar o serviço e o valor.')}
                className="text-[10.5px] bg-[var(--sos-canvas)] hover:bg-[var(--sos-border)]/50 text-[var(--sos-muted)] px-2 py-0.5 rounded-md border border-[var(--sos-border)] shrink-0 transition-colors"
              >
                Chave Pix
              </button>

              <button
                onClick={() => handleInsertMacro('Assim que você confirmar, verifico se é possível reservar este horário.')}
                className="text-[10.5px] bg-[var(--sos-canvas)] hover:bg-[var(--sos-border)]/50 text-[var(--sos-muted)] px-2 py-0.5 rounded-md border border-[var(--sos-border)] shrink-0 transition-colors"
              >
                Hold 15min
              </button>
            </div>
          )}
        </div>

        {/* Right: WhatsApp Circular Green Send Button - token semântico */}
        <div className="pb-1.5 shrink-0">
          <button
            id="composer-send-btn"
            onClick={handleSend}
            disabled={!canSend}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-xs ${
              canSend
                ? 'bg-[var(--sos-action)] hover:bg-[var(--sos-action-hover)] text-white cursor-pointer active:scale-95'
                : 'bg-[var(--sos-border-strong)] text-white cursor-not-allowed opacity-80'
            }`}
            title="Enviar mensagem (Cmd + Enter)"
          >
            {isSending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : currentDraft.trim().length === 0 ? (
              <Mic className="w-5 h-5 text-[var(--sos-muted)]" />
            ) : (
              <Send className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* Footer Status / Policy confirmations - tokens semânticos */}
      <div className="flex items-center justify-between text-[10.5px] mt-1.5 px-2 text-[var(--sos-muted)]">
        <div className="flex items-center gap-2">
          {isChannelPaused ? (
            <span className="flex items-center gap-1 text-[var(--sos-danger)] font-bold">
              <ShieldAlert className="w-3 h-3" />
              Canal pausado · Envio bloqueado
            </span>
          ) : !guardrail.isValid ? (
            <span className="flex items-center gap-1 text-[var(--sos-danger)] font-bold">
              <ShieldX className="w-3 h-3 text-[var(--sos-danger)]" />
              Desconto excede política comercial
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--sos-action)] font-medium">
              <ShieldCheck className="w-3 h-3 text-[var(--sos-action)]" />
              WhatsApp Cloud API Oficial · Políticas OK
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentDraft.length > 0 && <span>{currentDraft.length} caracteres</span>}
          <span className="hidden sm:inline">Pressione Enter para enviar</span>
        </div>
      </div>

      {/* WABA Native Actions Modal */}
      <WabaActionsModal
        isOpen={wabaActionsModalOpen}
        onClose={() => setWabaActionsModalOpen(false)}
        journey={journey}
        workspaceId={journey.workspaceId}
        recipientPhone={journey.leadPhone || ''}
        onSuccessNotification={(msg) => {
          setToastNotification(msg);
          setTimeout(() => setToastNotification(null), 3000);
        }}
      />

      {/* Toast Notification */}
      {toastNotification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xl border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastNotification}</span>
        </div>
      )}

      {/* Evidence Modal for AI Recommendation */}
      {recommendation && (
        <EvidenceModal
          isOpen={evidenceModalOpen}
          onClose={() => setEvidenceModalOpen(false)}
          title={`Evidências da Ação: ${recommendation.suggestedAction}`}
          subtitle={recommendation.draftText}
          confidence={recommendation.policyStatus === 'compliant' ? 'CONFIRMED' : 'INFERRED'}
          evidences={recommendation.evidences.map((e) => ({
            id: e.id,
            source: 'SYSTEM_INFERENCE' as const,
            label: e.source,
            excerpt: e.text,
            occurredAt: e.timestamp,
          }))}
        />
      )}
    </div>
  );
};
