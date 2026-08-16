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
        className={`bg-slate-900 text-slate-100 rounded-lg border border-slate-800 shadow-xs transition-all overflow-hidden ${className}`}
      >
        {/* Sleek Ultra-Compact Horizontal Strip (34px height) */}
        <div className="flex items-center min-h-[34px] px-2 py-1 gap-1.5 overflow-x-auto no-scrollbar text-xs">
          {/* Pulse Tag */}
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-800/90 rounded text-[10px] font-bold uppercase tracking-wider text-emerald-400 shrink-0 border border-slate-700/60"
            title="Linha de Continuidade Comercial"
          >
            <span className="flex h-1.5 w-1.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="hidden sm:inline font-bold">Continuidade</span>
          </div>

          {/* Segment 1: Origem */}
          <button
            type="button"
            onClick={() => handleOpenStepEvidence('origin')}
            className={`flex-1 min-w-[110px] max-w-[200px] px-2 py-0.5 rounded flex items-center justify-between gap-1 transition-all text-left truncate border ${
              hasOrigin
                ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-750 hover:border-blue-500/50'
                : 'bg-slate-800/30 border-dashed border-slate-700'
            }`}
            title="1. Origem do Anúncio (Clique para ver evidência)"
          >
            <span className="text-[9px] font-bold text-blue-300 uppercase shrink-0">1. Origem:</span>
            <span className="text-[11px] font-medium text-slate-200 truncate">{originText}</span>
          </button>

          {/* Segment 2: Desejo Atual */}
          <button
            type="button"
            onClick={() => handleOpenStepEvidence('intent')}
            className="flex-1 min-w-[120px] max-w-[240px] px-2 py-0.5 rounded flex items-center justify-between gap-1 transition-all text-left truncate border bg-slate-800/80 border-slate-700 hover:bg-slate-750 hover:border-amber-500/50"
            title="2. Desejo Atual do Lead (Clique para ver evidência)"
          >
            <span className="text-[9px] font-bold text-amber-300 uppercase shrink-0">2. Desejo:</span>
            <span className="text-[11px] font-medium text-slate-200 truncate italic">"{intentText}"</span>
          </button>

          {/* Segment 3: Próximo Passo */}
          <button
            type="button"
            onClick={() => handleOpenStepEvidence('next')}
            className={`flex-1 min-w-[130px] max-w-[260px] px-2 py-0.5 rounded flex items-center justify-between gap-1 transition-all text-left truncate border ${
              isNextBlocked
                ? 'bg-amber-950/40 border-amber-800/60'
                : 'bg-slate-800/80 border-slate-700 hover:bg-slate-750 hover:border-purple-500/50'
            }`}
            title="3. Próximo Passo Validado (Clique para ver evidência)"
          >
            <span className="text-[9px] font-bold text-purple-300 uppercase shrink-0">3. Próximo:</span>
            <span className="text-[11px] font-medium text-slate-200 truncate">{nextActionText}</span>
          </button>

          {/* Quick Copy / Use Buttons */}
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            {recommendation && (
              <button
                type="button"
                onClick={handleCopyNextStep}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1 border border-slate-700"
                title="Copiar texto da sugestão"
              >
                {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5 text-slate-400" />}
                <span className="hidden md:inline">{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
            )}

            {recommendation?.draftText && onApplyRecommendation && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApplyRecommendation();
                }}
                className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#00A884] hover:bg-[#008f6f] text-white transition-colors flex items-center gap-1 shadow-2xs"
                title="Inserir texto no compositor"
              >
                <span>Usar</span>
                <ArrowRight className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>
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
