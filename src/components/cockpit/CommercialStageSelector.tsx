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
  const [showDropdown, setShowDropdown] = React.useState(false);
  const currentStage: CommercialStage = journey.stage || (journey.outcome?.status === 'won' ? 'won' : 'contacted');
  const qualStatus = evaluateQualification(journey);
  const currentConfig = COMMERCIAL_STAGES[currentStage] || COMMERCIAL_STAGES.contacted;

  const stagesList: CommercialStage[] = ['new', 'contacted', 'qualified', 'proposal', 'won'];

  return (
    <div className="relative">
      {/* Compact Dropdown Trigger Pill (Only 110px) */}
      <button
        type="button"
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white border border-slate-300 hover:border-slate-400 text-xs font-bold text-slate-800 shadow-2xs transition-colors"
        title="Alterar estágio comercial do lead"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
        <span>{currentConfig.label}</span>
        <ChevronRight className={`w-3 h-3 text-slate-400 transition-transform ${showDropdown ? 'rotate-90' : ''}`} />
      </button>

      {/* Stage Selector & Qualification checklist popover */}
      {showDropdown && (
        <div className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-40 animate-in fade-in zoom-in-95 duration-100 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1.5 px-1">
            <span className="font-bold text-slate-800 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Estágio no Funil
            </span>
            <button
              onClick={() => setShowDropdown(false)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          </div>

          {/* List of Stages */}
          <div className="space-y-1">
            {stagesList.map((stageKey) => {
              const cfg = COMMERCIAL_STAGES[stageKey];
              const isCurrent = stageKey === currentStage;
              return (
                <button
                  key={stageKey}
                  onClick={() => {
                    onStageChange(stageKey);
                    setShowDropdown(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between text-xs transition-colors ${
                    isCurrent
                      ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${isCurrent ? 'bg-blue-600' : 'bg-slate-300'}`} />
                    <div>
                      <span className="block leading-tight">{cfg.label}</span>
                      <span className="text-[10px] text-slate-400 font-normal">{cfg.shortLabel}</span>
                    </div>
                  </div>
                  {isCurrent && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="mt-2 pt-1.5 border-t border-slate-100 px-1">
            <p className="text-[10.5px] text-slate-500 italic">
              {currentConfig.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
