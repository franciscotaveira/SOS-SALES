import React from 'react';
import { Recommendation } from '../../types/cockpit';
import { Sparkles, ShieldCheck, ChevronDown, ChevronUp, ArrowRight, Info, AlertTriangle } from 'lucide-react';

interface RecommendationCardProps {
  recommendation?: Recommendation;
  onApplyDraft: (text: string) => void;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  recommendation,
  onApplyDraft,
}) => {
  const [showEvidences, setShowEvidences] = React.useState(false);

  if (!recommendation) {
    return (
      <div
        id="recommendation-card-empty"
        className="mx-4 mb-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-600 text-xs flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-400 shrink-0" />
          <span>Sem sugestão automática: aguardando evidências suficientes para garantir recomendação segura.</span>
        </div>
      </div>
    );
  }

  const isCompliant = recommendation.policyStatus === 'compliant';

  return (
    <div
      id="recommendation-card-active"
      className="mx-4 mb-3 rounded-xl border border-purple-200 bg-purple-50/50 shadow-xs overflow-hidden"
    >
      {/* Card Header */}
      <div className="px-3.5 py-2.5 bg-purple-100/60 border-b border-purple-200/80 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-purple-600 text-white flex items-center justify-center shrink-0">
            <Sparkles className="w-3 h-3" />
          </div>
          <span className="text-xs font-bold text-purple-950 truncate">
            Sugestão Supervisionada ({Math.round(recommendation.confidence * 100)}% de confiança)
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Policy tag */}
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
              isCompliant
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : 'bg-amber-100 text-amber-800 border border-amber-200'
            }`}
          >
            {isCompliant ? <ShieldCheck className="w-3 h-3 text-emerald-600" /> : <AlertTriangle className="w-3 h-3 text-amber-600" />}
            <span>{isCompliant ? 'Política Validada' : 'Atenção às Políticas'}</span>
          </div>
        </div>
      </div>

      {/* Suggested Action & Draft Preview */}
      <div className="p-3.5 space-y-2.5 text-xs">
        <div>
          <span className="font-bold text-slate-700 block mb-0.5">Ação recomendada:</span>
          <p className="text-slate-800 font-medium leading-relaxed">{recommendation.suggestedAction}</p>
        </div>

        <div className="p-2.5 rounded-lg bg-white border border-purple-200/90 text-slate-800 font-mono text-[11px] leading-relaxed shadow-2xs">
          "{recommendation.draftText}"
        </div>

        {/* Evidences toggle */}
        <div className="pt-1 flex items-center justify-between">
          <button
            id="toggle-evidences-btn"
            onClick={() => setShowEvidences(!showEvidences)}
            className="flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900 transition-colors"
          >
            <span>{recommendation.evidences.length} Evidências vinculadas</span>
            {showEvidences ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            id="apply-recommendation-draft-btn"
            onClick={() => onApplyDraft(recommendation.draftText)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition-all shadow-xs"
          >
            <span>Usar como rascunho</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Evidences list */}
        {showEvidences && (
          <div
            id="recommendation-evidences-list"
            className="mt-2.5 pt-2.5 border-t border-purple-200/80 space-y-1.5 animate-in fade-in duration-150"
          >
            {recommendation.evidences.map((ev) => (
              <div
                key={ev.id}
                className="p-2 rounded bg-purple-100/40 border border-purple-200/60 text-[11px]"
              >
                <div className="flex items-center justify-between font-bold text-purple-900 mb-0.5">
                  <span>{ev.source}</span>
                  <span className="font-mono text-purple-700 text-[10px]">{ev.timestamp}</span>
                </div>
                <div className="text-slate-700">{ev.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
