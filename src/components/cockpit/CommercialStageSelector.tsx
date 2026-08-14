import React from 'react';
import { Journey, CommercialStage } from '../../types/cockpit';
import { COMMERCIAL_STAGES, evaluateQualification, StageInfo } from '../../services/commercialDecisionEngine';
import { CheckCircle2, ChevronRight, HelpCircle, Layers, Award, AlertCircle } from 'lucide-react';

interface CommercialStageSelectorProps {
  journey: Journey;
  onStageChange: (newStage: CommercialStage) => void;
}

export const CommercialStageSelector: React.FC<CommercialStageSelectorProps> = ({
  journey,
  onStageChange,
}) => {
  const [showDetails, setShowDetails] = React.useState(false);
  const currentStage: CommercialStage = journey.stage || (journey.outcome?.status === 'won' ? 'won' : 'contacted');
  const qualStatus = evaluateQualification(journey);

  const stagesList: CommercialStage[] = ['new', 'contacted', 'qualified', 'proposal', 'won'];

  return (
    <div className="relative">
      {/* Compact Mini-Pipeline Stepper */}
      <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-[11px]">
        {stagesList.map((stageKey, idx) => {
          const cfg = COMMERCIAL_STAGES[stageKey];
          const isCurrent = stageKey === currentStage;
          const isPast = cfg.order < COMMERCIAL_STAGES[currentStage]?.order;

          return (
            <React.Fragment key={stageKey}>
              <button
                onClick={() => onStageChange(stageKey)}
                title={cfg.description}
                className={`px-2 py-0.5 rounded-lg font-bold flex items-center gap-1 transition-all ${
                  isCurrent
                    ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-300'
                    : isPast
                    ? 'text-emerald-700 hover:bg-white/60'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                }`}
              >
                {isPast && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />}
                <span>{cfg.shortLabel}</span>
              </button>
              {idx < stagesList.length - 1 && (
                <ChevronRight className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              )}
            </React.Fragment>
          );
        })}

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="ml-1 p-0.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
          title="Ver checklist de qualificação da etapa"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Qualification BANT checklist popover */}
      {showDetails && (
        <div className="absolute right-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Etapa: {COMMERCIAL_STAGES[currentStage]?.label}
            </span>
            <button
              onClick={() => setShowDetails(false)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          </div>

          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            {COMMERCIAL_STAGES[currentStage]?.description}
          </p>

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Critérios Recomendados (Módulo 6):
            </span>
            {qualStatus.completedItems.map((item, index) => (
              <div
                key={index}
                className={`p-1.5 rounded-lg flex items-center justify-between text-[11px] border ${
                  item.verified
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 font-medium'
                    : 'bg-amber-50/70 border-amber-200 text-amber-900'
                }`}
              >
                <span>{item.label}</span>
                {item.verified ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1 rounded">
                    OK
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1 rounded">
                    Falta validar
                  </span>
                )}
              </div>
            ))}
          </div>

          {qualStatus.missingItems.length > 0 && (
            <div className="mt-2 text-[10px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-200">
              💡 Dica: Obtenha o próximo microcompromisso antes de ofertar proposta final.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
