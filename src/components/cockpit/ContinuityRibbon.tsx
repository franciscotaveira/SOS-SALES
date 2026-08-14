import React from 'react';
import { AcquisitionContext, Recommendation, ContinuityStep, EvidenceReference } from '../../types/cockpit';
import { EvidenceModal } from './EvidenceModal';
import {
  ArrowRight,
  Sparkles,
  MessageSquareQuote,
  Tag,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  Lock,
  ChevronRight,
  Maximize2,
  Minimize2,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface ContinuityRibbonProps {
  acquisition: AcquisitionContext;
  lastLeadMessage: string;
  recommendation?: Recommendation;
  continuitySteps?: ContinuityStep[];
  onApplyRecommendation?: () => void;
  className?: string;
}

export const ContinuityRibbon: React.FC<ContinuityRibbonProps> = ({
  acquisition,
  lastLeadMessage,
  recommendation,
  continuitySteps,
  onApplyRecommendation,
  className = '',
}) => {
  const isCTWA = acquisition.source === 'ctwa';
  const hasOrigin = isCTWA || !!acquisition.campaignName || !!acquisition.adHeadline;
  const isNextBlocked = !recommendation || !!recommendation.blockedReason;

  const [copied, setCopied] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [evidenceModalData, setEvidenceModalData] = React.useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    confidence?: any;
    evidences: EvidenceReference[];
    blockedReason?: string;
  }>({
    isOpen: false,
    title: '',
    evidences: [],
  });

  const handleCopyNextStep = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!recommendation?.draftText && !recommendation?.suggestedAction) return;
    const textToCopy = recommendation.draftText || recommendation.suggestedAction;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenStepEvidence = (stepType: 'origin' | 'intent' | 'next', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (stepType === 'origin') {
      const step = continuitySteps?.find((s) => s.type === 'ORIGIN');
      setEvidenceModalData({
        isOpen: true,
        title: hasOrigin ? 'Origem & Tráfego Comprovado' : 'Origem Direta / Não Rastreada',
        subtitle: acquisition.campaignName || acquisition.adHeadline || 'Origem direta ou orgânica',
        confidence: hasOrigin ? 'CONFIRMED' : 'TO_CONFIRM',
        evidences: step?.evidence || [
          {
            id: 'ev-orig',
            source: 'ACQUISITION_CONTEXT',
            label: isCTWA ? 'Payload CTWA Meta Ads' : 'Registro de Entrada',
            excerpt: isCTWA
              ? `Campanha: ${acquisition.campaignName || 'Meta Ads'} | Oferta: ${acquisition.referralOffer || 'Padrão'}`
              : 'Sem metadados de anúncio CTWA capturados no webhook.',
            occurredAt: acquisition.entryTimestamp
              ? new Date(acquisition.entryTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Início',
          },
        ],
      });
    } else if (stepType === 'intent') {
      const step = continuitySteps?.find((s) => s.type === 'CURRENT_INTENT');
      setEvidenceModalData({
        isOpen: true,
        title: 'Desejo Atual & Contexto do Lead',
        subtitle: lastLeadMessage ? `"${lastLeadMessage}"` : 'Aguardando mensagem do lead',
        confidence: lastLeadMessage ? 'CONFIRMED' : 'TO_CONFIRM',
        evidences: step?.evidence || [
          {
            id: 'ev-int',
            source: 'CUSTOMER_MESSAGE',
            label: 'Mensagem Viva do Lead',
            excerpt: lastLeadMessage || 'Lead ainda não enviou mensagem.',
            occurredAt: 'Recente',
          },
        ],
      });
    } else {
      const step = continuitySteps?.find((s) => s.type === 'NEXT_ACTION');
      setEvidenceModalData({
        isOpen: true,
        title: 'Próximo Passo Comercial Seguro',
        subtitle: recommendation?.suggestedAction || 'Ação sugerida pelo Copilot',
        confidence: recommendation?.policyStatus === 'compliant' ? 'CONFIRMED' : 'INFERRED',
        blockedReason:
          recommendation?.blockedReason ||
          (!recommendation ? 'Evidências insuficientes para sugerir ação segura com alta confiança.' : undefined),
        evidences:
          step?.evidence ||
          recommendation?.evidences.map((ev) => ({
            id: ev.id,
            source: 'SYSTEM_INFERENCE' as const,
            label: ev.source,
            excerpt: ev.text,
            occurredAt: ev.timestamp,
          })) ||
          [],
      });
    }
  };

  // Find step 1 title text
  const originText = hasOrigin
    ? acquisition.campaignName || acquisition.adHeadline || 'Meta Ads'
    : 'Direto / Orgânico';

  // Step 2 intent text
  const intentText = lastLeadMessage || 'Aguardando fala do lead...';

  // Step 3 action text
  const nextActionText = recommendation
    ? recommendation.suggestedAction
    : 'Aguardando contexto...';

  return (
    <>
      <nav
        id="continuity-ribbon-container"
        aria-label="Linha de Continuidade Comercial"
        className={`bg-slate-900 text-slate-100 rounded-xl border border-slate-800 shadow-sm transition-all duration-200 overflow-hidden ${className}`}
      >
        {/* Streamlined Horizontal Strip */}
        <div className="flex items-stretch min-h-[42px] px-2 py-1.5 gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
          {/* Label / Pulse Tag */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/80 rounded-lg shrink-0 border border-slate-700/60"
            title="Cadeia de Continuidade Comercial em Tempo Real"
          >
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200 font-heading select-none hidden sm:inline">
              Continuidade
            </span>
            <Zap className="w-3 h-3 text-amber-400 sm:hidden" />
          </div>

          {/* Segment 1: Origem */}
          <div
            id="continuity-ribbon-origin"
            onClick={() => handleOpenStepEvidence('origin')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleOpenStepEvidence('origin')}
            className={`flex-1 min-w-[130px] sm:min-w-[150px] max-w-[240px] px-2.5 py-1 rounded-lg flex items-center justify-between gap-1.5 transition-all cursor-pointer select-none border group ${
              hasOrigin
                ? 'bg-slate-800/90 border-slate-700 hover:bg-slate-750 hover:border-blue-500/50'
                : 'bg-slate-800/40 border-dashed border-slate-700 hover:bg-slate-800'
            }`}
            title="Clique para auditar evidências da origem do anúncio"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Tag className="w-3 h-3 text-blue-400 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold text-blue-300 uppercase tracking-wider">1. Origem</span>
                  {acquisition.referralOffer && (
                    <span className="text-[8px] bg-blue-950 text-blue-300 px-1 py-0.2 rounded border border-blue-800 font-mono hidden md:inline truncate max-w-[70px]">
                      {acquisition.referralOffer}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-slate-100 truncate leading-tight">
                  {originText}
                </p>
              </div>
            </div>
            <Eye className="w-3 h-3 text-slate-400 group-hover:text-blue-300 shrink-0 transition-colors" />
          </div>

          {/* Connector Arrow 1 */}
          <div className="flex items-center text-slate-600 shrink-0" aria-hidden="true">
            <ChevronRight className="w-3.5 h-3.5" />
          </div>

          {/* Segment 2: Desejo Atual */}
          <div
            id="continuity-ribbon-intent"
            onClick={() => handleOpenStepEvidence('intent')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleOpenStepEvidence('intent')}
            className="flex-1 min-w-[140px] sm:min-w-[170px] max-w-[280px] px-2.5 py-1 rounded-lg flex items-center justify-between gap-1.5 bg-slate-800/90 border border-slate-700 hover:bg-slate-750 hover:border-amber-500/50 transition-all cursor-pointer select-none group"
            title="Clique para auditar evidências da intenção do lead"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <MessageSquareQuote className="w-3 h-3 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider block leading-none mb-0.5">
                  2. Desejo Atual
                </span>
                <p className="text-[11px] font-medium text-slate-100 italic truncate leading-tight">
                  "{intentText}"
                </p>
              </div>
            </div>
            <Eye className="w-3 h-3 text-slate-400 group-hover:text-amber-300 shrink-0 transition-colors" />
          </div>

          {/* Connector Arrow 2 */}
          <div className="flex items-center text-slate-600 shrink-0" aria-hidden="true">
            <ChevronRight className="w-3.5 h-3.5" />
          </div>

          {/* Segment 3: Próximo Passo Seguro */}
          <div
            id="continuity-ribbon-next"
            onClick={() => handleOpenStepEvidence('next')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleOpenStepEvidence('next')}
            className={`flex-1 min-w-[150px] sm:min-w-[190px] px-2.5 py-1 rounded-lg flex items-center justify-between gap-1.5 transition-all cursor-pointer select-none border group ${
              recommendation
                ? 'bg-purple-950/50 border-purple-600/60 hover:bg-purple-900/60 hover:border-purple-500'
                : 'bg-slate-800/40 border-dashed border-slate-700 hover:bg-slate-800'
            }`}
            title="Clique para auditar a recomendação comercial segura"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="w-3 h-3 text-purple-400 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold text-purple-300 uppercase tracking-wider">
                    3. Próximo Passo
                  </span>
                  {recommendation && (
                    <span className="text-[8px] bg-emerald-950 text-emerald-300 px-1 py-0.2 rounded border border-emerald-800 font-bold hidden lg:inline">
                      Validado
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-semibold text-slate-100 truncate leading-tight">
                  {nextActionText}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Eye className="w-3 h-3 text-slate-400 group-hover:text-purple-300 transition-colors" />
            </div>
          </div>

          {/* Quick Action CTAs on the Right */}
          <div className="flex items-center gap-1 pl-1 border-l border-slate-800 shrink-0">
            {recommendation && (
              <>
                <button
                  id="btn-copy-next-step-ribbon"
                  onClick={handleCopyNextStep}
                  className="flex items-center gap-1 text-[10px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-1.5 rounded-lg border border-slate-700 transition-colors shadow-2xs"
                  title="Copiar mensagem sugerida para a área de transferência"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 font-bold hidden sm:inline">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-slate-300" />
                      <span className="hidden xl:inline">Copiar</span>
                    </>
                  )}
                </button>

                {onApplyRecommendation && (
                  <button
                    id="continuity-use-draft-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onApplyRecommendation();
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold bg-[#00A884] hover:bg-[#008f6f] text-white rounded-lg transition-colors shadow-2xs shrink-0"
                    title="Inserir rascunho validado no compositor WhatsApp"
                  >
                    <span className="hidden sm:inline">Usar</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </>
            )}

            {/* Quick Peeking Toggle */}
            <button
              id="continuity-expand-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              title={isExpanded ? 'Recolher detalhes' : 'Expandir visão completa da trilha'}
              aria-label="Expandir ou recolher detalhes da linha de continuidade"
            >
              {isExpanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Optional Expandable Detailed Drawer / Peek Area */}
        {isExpanded && (
          <div
            id="continuity-ribbon-expanded-details"
            className="p-3 bg-slate-950/80 border-t border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-2.5 animate-in slide-in-from-top-2 duration-150"
          >
            {/* Origin Details */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-blue-300 font-bold">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3" /> 1. Origem Comercial
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-blue-950 text-blue-300 font-mono">
                    {isCTWA ? 'CTWA Meta' : 'Orgânico'}
                  </span>
                </div>
                <p className="text-xs text-slate-200 font-medium">{originText}</p>
                {acquisition.referralOffer && (
                  <p className="text-[10px] text-slate-400 font-mono">
                    Oferta de entrada: <span className="text-blue-300 font-semibold">{acquisition.referralOffer}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => handleOpenStepEvidence('origin')}
                className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 font-medium"
              >
                <Eye className="w-2.5 h-2.5" /> Ver evidência de origem
              </button>
            </div>

            {/* Intent Details */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-amber-300 font-bold">
                  <span className="flex items-center gap-1">
                    <MessageSquareQuote className="w-3 h-3" /> 2. Desejo Atual do Lead
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300">
                    Mensagem Viva
                  </span>
                </div>
                <p className="text-xs text-slate-200 italic">"{intentText}"</p>
              </div>
              <button
                onClick={() => handleOpenStepEvidence('intent')}
                className="mt-2 text-[10px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 font-medium"
              >
                <Eye className="w-2.5 h-2.5" /> Ver histórico de mensagens
              </button>
            </div>

            {/* Next Action Details */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-purple-300 font-bold">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> 3. Próximo Passo Seguro
                  </span>
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                      recommendation ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {recommendation ? 'Recomendação Copilot' : 'Aguardando'}
                  </span>
                </div>
                <p className="text-xs text-slate-200 font-semibold">{nextActionText}</p>
                {recommendation?.draftText && (
                  <div className="p-1.5 rounded bg-slate-800/80 border border-slate-700/80 text-[10px] text-slate-300 font-mono line-clamp-2">
                    "{recommendation.draftText}"
                  </div>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-1 pt-1 border-t border-slate-800">
                <button
                  onClick={() => handleOpenStepEvidence('next')}
                  className="text-[10px] text-purple-400 hover:text-purple-300 hover:underline flex items-center gap-1 font-medium"
                >
                  <Eye className="w-2.5 h-2.5" /> Ver evidências e regras
                </button>
                {recommendation && onApplyRecommendation && (
                  <button
                    onClick={onApplyRecommendation}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-[#00A884] hover:bg-[#008f6f] text-white rounded transition-colors"
                  >
                    <span>Usar rascunho</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Audit Evidence Modal */}
      <EvidenceModal
        isOpen={evidenceModalData.isOpen}
        onClose={() => setEvidenceModalData((prev) => ({ ...prev, isOpen: false }))}
        title={evidenceModalData.title}
        subtitle={evidenceModalData.subtitle}
        confidence={evidenceModalData.confidence}
        evidences={evidenceModalData.evidences}
        blockedReason={evidenceModalData.blockedReason}
      />
    </>
  );
};
