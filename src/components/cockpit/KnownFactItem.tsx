import React from 'react';
import { KnownFact } from '../../types/cockpit';
import { CheckCircle2, HelpCircle, AlertTriangle, Clock, MessageSquare, Globe, Database, ShieldCheck, Eye } from 'lucide-react';

interface KnownFactItemProps {
  fact: KnownFact;
  onViewEvidence?: (fact: KnownFact) => void;
}

export const KnownFactItem: React.FC<KnownFactItemProps> = ({ fact, onViewEvidence }) => {
  const getConfidenceBadge = () => {
    switch (fact.confidence) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Confirmado
          </span>
        );
      case 'PROBABLE':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-1.5 py-0.5 rounded">
            <HelpCircle className="w-2.5 h-2.5" />
            Provável
          </span>
        );
      case 'TO_CONFIRM':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded">
            <AlertTriangle className="w-2.5 h-2.5" />
            A confirmar
          </span>
        );
      case 'STALE':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
            <Clock className="w-2.5 h-2.5" />
            Desatualizado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
            Registrado
          </span>
        );
    }
  };

  const primaryEvidence = fact.evidence?.[0];

  const getSourceIcon = (source?: string) => {
    switch (source) {
      case 'CUSTOMER_MESSAGE':
        return <MessageSquare className="w-3 h-3 text-emerald-600" />;
      case 'ACQUISITION_CONTEXT':
        return <Globe className="w-3 h-3 text-blue-600" />;
      case 'OPERATOR_RECORD':
        return <Database className="w-3 h-3 text-purple-600" />;
      case 'SYSTEM_INFERENCE':
        return <ShieldCheck className="w-3 h-3 text-indigo-600" />;
      default:
        return <Database className="w-3 h-3 text-slate-500" />;
    }
  };

  return (
    <div
      id={`known-fact-${fact.id}`}
      className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs transition-all text-xs group"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-bold text-slate-700 truncate text-[11px]">{fact.label}</span>
        <div className="shrink-0">{getConfidenceBadge()}</div>
      </div>

      <div className="font-semibold text-slate-900 leading-snug mb-2">{fact.value}</div>

      {/* Footer: Origin, Time, Action */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-slate-100">
        <div className="flex items-center gap-1 min-w-0">
          {getSourceIcon(primaryEvidence?.source)}
          <span className="truncate max-w-[120px]">
            {primaryEvidence?.label || 'Registro comercial'}
          </span>
          {primaryEvidence?.occurredAt && (
            <span className="text-slate-400 font-mono shrink-0">· {primaryEvidence.occurredAt}</span>
          )}
        </div>

        {onViewEvidence && (
          <button
            id={`btn-view-fact-evidence-${fact.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onViewEvidence(fact);
            }}
            className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100 px-1.5 py-0.5 rounded transition-colors"
          >
            <Eye className="w-2.5 h-2.5" />
            <span>Ver evidência</span>
          </button>
        )}
      </div>
    </div>
  );
};
