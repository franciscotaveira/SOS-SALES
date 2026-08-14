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
} from 'lucide-react';

interface ContinuityLineProps {
  acquisition: AcquisitionContext;
  lastLeadMessage: string;
  recommendation?: Recommendation;
  continuitySteps?: ContinuityStep[];
  onApplyRecommendation?: () => void;
}

export const ContinuityLine: React.FC<ContinuityLineProps> = ({
  acquisition,
  lastLeadMessage,
  recommendation,
  continuitySteps,
  onApplyRecommendation,
}) => {
  const isCTWA = acquisition.source === 'ctwa';
  const hasOrigin = isCTWA || !!acquisition.campaignName || !!acquisition.adHeadline;
  const isNextBlocked = !recommendation || !!recommendation.blockedReason;

  const [copied, setCopied] = React.useState(false);
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

  const handleCopyNextStep = () => {
    if (!recommendation?.draftText && !recommendation?.suggestedAction) return;
    const textToCopy = recommendation.draftText || recommendation.suggestedAction;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenStepEvidence = (stepType: 'origin' | 'intent' | 'next') => {
    if (stepType === 'origin') {
      const step = continuitySteps?.find((s) => s.type === 'ORIGIN');
      setEvidenceModalData({
        isOpen: true,
        title: hasOrigin ? 'Origem / Anúncio Comprovado' : 'Origem ainda não confirmada',
        subtitle: acquisition.campaignName || acquisition.adHeadline || 'Origem direta/orgânica',
        confidence: hasOrigin ? 'CONFIRMED' : 'TO_CONFIRM',
        evidences: step?.evidence || [
          {
            id: 'ev-orig',
            source: 'ACQUISITION_CONTEXT',
            label: isCTWA ? 'Payload CTWA Meta Ads' : 'Registro de Entrada',
            excerpt: isCTWA
              ? `Campanha: ${acquisition.campaignName || 'Meta Ads'} | Oferta: ${acquisition.referralOffer || 'Padrão'}`
              : 'Sem metadados de anúncio CTWA capturados.',
            occurredAt: acquisition.entryTimestamp ? new Date(acquisition.entryTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Início',
          },
        ],
      });
    } else if (stepType === 'intent') {
      const step = continuitySteps?.find((s) => s.type === 'CURRENT_INTENT');
      setEvidenceModalData({
        isOpen: true,
        title: 'Desejo Atual do Cliente',
        subtitle: lastLeadMessage ? `"${lastLeadMessage}"` : 'Aguardando mensagem',
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
        subtitle: recommendation?.suggestedAction || 'Ação sugerida',
        confidence: recommendation?.policyStatus === 'compliant' ? 'CONFIRMED' : 'INFERRED',
        blockedReason: recommendation?.blockedReason || (!recommendation ? 'Evidências insuficientes para sugerir ação segura com alta confiança.' : undefined),
        evidences: step?.evidence || recommendation?.evidences.map((e) => ({
          id: e.id,
          source: 'SYSTEM_INFERENCE' as const,
          label: e.source,
          excerpt: e.text,
          occurredAt: e.timestamp,
        })) || [],
      });
    }
  };

  return (
    <>
      <div
        id="continuity-line-container"
        className="bg-slate-900 text-white rounded-xl p-3 shadow-md border border-slate-800 mb-3"
      >
        {/* Header line with status pulse */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
              Linha de Continuidade Comercial
            </span>
          </div>

          <div className="flex items-center gap-2">
            {recommendation && (
              <button
                id="btn-copy-next-step"
                onClick={handleCopyNextStep}
                className="flex items-center gap-1 text-[10px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-colors"
                title="Copiar próximo passo"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-slate-400" />
                    <span>Copiar próximo passo</span>
                  </>
                )}
              </button>
            )}
            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
              Origem ➔ Desejo ➔ Ação
            </span>
          </div>
        </div>

        {/* 3 Connected Step Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 items-stretch relative">
          {/* STEP 1: Origem / Anúncio */}
          <div
            id="continuity-step-origin"
            className={`border rounded-lg p-2.5 flex flex-col justify-between transition-all ${
              hasOrigin
                ? 'bg-slate-800/90 border-slate-700'
                : 'bg-slate-800/40 border-dashed border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-300">
                  {hasOrigin ? (
                    <Tag className="w-3 h-3 text-blue-400" />
                  ) : (
                    <HelpCircle className="w-3 h-3 text-amber-400" />
                  )}
                  <span>1. Origem / Anúncio</span>
                </div>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                    hasOrigin
                      ? 'bg-blue-950 text-blue-200 border border-blue-800'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}
                >
                  {hasOrigin ? 'Confirmado' : 'A confirmar'}
                </span>
              </div>

              <div className="text-xs font-semibold text-slate-100 leading-snug line-clamp-2">
                {hasOrigin
                  ? acquisition.campaignName || acquisition.adHeadline
                  : 'Origem ainda não confirmada'}
              </div>

              {acquisition.referralOffer && (
                <div className="mt-1.5 text-[10px] bg-blue-950/70 text-blue-200 border border-blue-800/60 px-1.5 py-0.5 rounded font-mono truncate">
                  Oferta: {acquisition.referralOffer}
                </div>
              )}
            </div>

            <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">
                {isCTWA ? 'Meta Ads CTWA' : 'Tráfego Orgânico'}
              </span>
              <button
                id="btn-evidence-origin"
                onClick={() => handleOpenStepEvidence('origin')}
                className="flex items-center gap-1 text-[10px] font-medium text-blue-300 hover:text-blue-200 hover:underline"
              >
                <Eye className="w-2.5 h-2.5" />
                <span>Ver evidências</span>
              </button>
            </div>
          </div>

          {/* STEP 2: Desejo Atual */}
          <div
            id="continuity-step-intent"
            className="bg-slate-800/90 border border-slate-700 rounded-lg p-2.5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                  <MessageSquareQuote className="w-3 h-3 text-amber-400" />
                  <span>2. Desejo Atual</span>
                </div>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-950 text-amber-200 border border-amber-800">
                  Mensagem Viva
                </span>
              </div>

              <div className="text-xs text-slate-100 font-medium italic leading-snug line-clamp-2">
                "{lastLeadMessage || 'Aguardando primeira mensagem do cliente'}"
              </div>
            </div>

            <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Extraído da conversa</span>
              <button
                id="btn-evidence-intent"
                onClick={() => handleOpenStepEvidence('intent')}
                className="flex items-center gap-1 text-[10px] font-medium text-amber-300 hover:text-amber-200 hover:underline"
              >
                <Eye className="w-2.5 h-2.5" />
                <span>Ver evidências</span>
              </button>
            </div>
          </div>

          {/* STEP 3: Próximo Passo Seguro */}
          <div
            id="continuity-step-next-action"
            className={`border rounded-lg p-2.5 flex flex-col justify-between transition-all ${
              recommendation
                ? 'bg-purple-950/40 border-purple-600/60'
                : 'bg-slate-800/50 border-dashed border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-300">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  <span>3. Próximo Passo Seguro</span>
                </div>
                {recommendation ? (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Ação Validada
                  </span>
                ) : (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                    Aguardando Dados
                  </span>
                )}
              </div>

              <div className="text-xs font-semibold text-slate-100 leading-snug line-clamp-2">
                {recommendation
                  ? recommendation.suggestedAction
                  : 'Aguardando evidências suficientes para sugerir ação segura.'}
              </div>
            </div>

            <div className="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center justify-between gap-1">
              <button
                id="btn-evidence-next"
                onClick={() => handleOpenStepEvidence('next')}
                className="flex items-center gap-1 text-[10px] font-medium text-purple-300 hover:text-purple-200 hover:underline"
              >
                <Eye className="w-2.5 h-2.5" />
                <span>Ver evidências</span>
              </button>

              {recommendation && onApplyRecommendation && (
                <button
                  id="continuity-use-draft-btn"
                  onClick={onApplyRecommendation}
                  className="flex items-center gap-1 py-1 px-2 text-[10px] font-bold bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors shadow-2xs shrink-0"
                >
                  <span>Aplicar ao rascunho</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Evidence Modal */}
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
