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
  Flame,
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

  // SOS Destravar Venda: Generates the optimal commercial reactivation based on journey stage
  const handleApplyNextBestAction = () => {
    const leadName = journey.leadName.split(' ')[0] || 'amigo';
    let suggestion = '';

    if (journey.commercialStep === 'agendamento' || journey.commercialStep === 'orcamento') {
      suggestion = `Oi ${leadName}! Tudo bem? Vi que você estava interessado(a) no nosso atendimento. Consegui segurar um horário exclusivo aqui na agenda para você amanhã às 14h30 ou 16h00. Qual fica melhor para você?`;
    } else if (journey.commercialStep === 'fechamento') {
      suggestion = `Oi ${leadName}! Passando para te avisar que já deixei suas condições especiais ativadas aqui. Posso te enviar a chave Pix para confirmarmos seu pedido agora e garantir o bônus?`;
    } else if (journey.commercialStep === 'qualificacao') {
      suggestion = `Olá ${leadName}, vi sua mensagem pelo anúncio! Para eu te passar o valor exato e personalizado, qual o modelo do seu veículo / serviço desejado?`;
    } else {
      suggestion = `Oi ${leadName}! Como posso te ajudar a concluir sua solicitação hoje? Estamos com a equipe pronta para te atender agora!`;
    }

    onChangeDraft(suggestion);
    textareaRef.current?.focus();
  };

  const hasActiveAiSuggestion = !!recommendation && !isAiSuggestionDismissed && !isViewer && !isChannelPaused;

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

      {/* AI Copilot Integrated Suggestion Strip */}
      {hasActiveAiSuggestion && recommendation && (
        <div
          id="composer-ai-copilot-strip"
          className="mb-2 bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-purple-200 rounded-xl p-2.5 shadow-2xs space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-5 h-5 rounded-md bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Sparkles className="w-3 h-3" />
              </div>
              <span className="text-[11px] font-bold text-purple-950 truncate font-heading">
                Copilot Comercial: {recommendation.suggestedAction}
              </span>
              <span className="text-[10px] bg-purple-200/80 text-purple-900 font-mono px-1.5 py-0.2 rounded font-bold shrink-0">
                {Math.round(recommendation.confidence * 100)}% confiança
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setEvidenceModalOpen(true)}
                className="text-[10.5px] font-semibold text-purple-700 hover:text-purple-900 px-2 py-0.5 rounded hover:bg-purple-100/70 transition-colors flex items-center gap-1"
                title="Ver evidências que justificam esta sugestão"
              >
                <Eye className="w-3 h-3" />
                <span className="hidden sm:inline">Evidências</span>
              </button>

              <button
                onClick={() => setIsAiDetailsExpanded(!isAiDetailsExpanded)}
                className="text-[10.5px] font-semibold text-purple-700 hover:text-purple-900 p-0.5 rounded hover:bg-purple-100/70 transition-colors"
                title={isAiDetailsExpanded ? 'Recolher detalhes' : 'Ver detalhes da tese'}
              >
                {isAiDetailsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => setIsAiSuggestionDismissed(true)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors ml-1"
                title="Dispensar sugestão"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Suggested Draft Preview + Apply Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-purple-200/70 text-xs">
            <p className="text-[11.5px] text-purple-900 italic line-clamp-2 leading-relaxed">
              "{recommendation.draftText || recommendation.suggestedAction}"
            </p>

            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
              <button
                onClick={handleApplyAiSuggestion}
                className="px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-purple-600 hover:bg-purple-700 text-white transition-colors flex items-center gap-1 shadow-2xs"
              >
                <span>Usar Sugestão</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Expanded AI Thesis & Policy Details */}
          {isAiDetailsExpanded && (
            <div className="p-2 bg-white/90 border border-purple-200 rounded-lg text-[11px] space-y-1 text-slate-700 mt-1.5">
              <div className="flex items-center justify-between text-purple-900 font-bold">
                <span>Política Comercial Aplicada:</span>
                <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                  {recommendation.policyStatus === 'compliant' ? '100% Conforme' : 'Atenção'}
                </span>
              </div>
              <p className="text-slate-600 leading-snug">
                {recommendation.explanation ||
                  'A sugestão conduz o cliente diretamente para a confirmação de horário de agenda sem conceder descontos fora da tabela autorizada.'}
              </p>
            </div>
          )}
        </div>
      )}

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
              {/* SOS Destravar Venda Button */}
              <button
                onClick={handleApplyNextBestAction}
                className="text-[10.5px] bg-[#00a884] hover:bg-[#008069] text-white font-bold px-2.5 py-0.5 rounded-md shrink-0 transition-colors flex items-center gap-1 shadow-2xs"
                title="Sugerir o próximo passo comercial para destravar esta venda"
              >
                <Flame className="w-3 h-3 text-amber-300" />
                <span>SOS Destravar Venda</span>
              </button>

              <button
                onClick={() => {
                  setIsMacroMenuOpen(!isMacroMenuOpen);
                  setMacroFilter('');
                }}
                className="text-[10.5px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold px-2 py-0.5 rounded-md border border-emerald-200 shrink-0 transition-colors flex items-center gap-1"
              >
                <Zap className="w-3 h-3 text-[#00a884]" />
                <span>/ Atalhos</span>
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

