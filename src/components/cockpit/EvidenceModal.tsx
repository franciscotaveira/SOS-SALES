import React from 'react';
import { EvidenceReference, FactConfidence, KnownFact, ContinuityStep } from '../../types/cockpit';
import { X, CheckCircle2, HelpCircle, AlertTriangle, Clock, MessageSquare, Globe, Database, Calendar, ShieldCheck, Copy, Check } from 'lucide-react';

interface EvidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  confidence?: FactConfidence | 'CONFIRMED' | 'INFERRED' | 'BLOCKED';
  evidences: EvidenceReference[];
  blockedReason?: string;
}

export const EvidenceModal: React.FC<EvidenceModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  confidence,
  evidences,
  blockedReason,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const getConfidenceBadge = () => {
    switch (confidence) {
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Fato Confirmado
          </span>
        );
      case 'PROBABLE':
      case 'INFERRED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <HelpCircle className="w-3.5 h-3.5" />
            Inferência Provável
          </span>
        );
      case 'TO_CONFIRM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            A Confirmar com Lead
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            Ação Bloqueada
          </span>
        );
      case 'STALE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
            <Clock className="w-3.5 h-3.5" />
            Evidência Desatualizada
          </span>
        );
      default:
        return null;
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'CUSTOMER_MESSAGE':
        return <MessageSquare className="w-4 h-4 text-emerald-600" />;
      case 'ACQUISITION_CONTEXT':
        return <Globe className="w-4 h-4 text-blue-600" />;
      case 'OPERATOR_RECORD':
        return <Database className="w-4 h-4 text-purple-600" />;
      case 'SYSTEM_INFERENCE':
        return <ShieldCheck className="w-4 h-4 text-indigo-600" />;
      default:
        return <Calendar className="w-4 h-4 text-slate-600" />;
    }
  };

  const handleCopyEvidence = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="evidence-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="evidence-modal-content"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Auditoria de Evidência & Proveniência
              </span>
              {getConfidenceBadge()}
            </div>
            <h3 className="text-sm font-bold text-slate-900 leading-snug">{title}</h3>
            {subtitle && <p className="text-xs text-slate-600">{subtitle}</p>}
          </div>
          <button
            id="close-evidence-modal-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {blockedReason && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Motivo do Bloqueio:
              </div>
              <p className="leading-relaxed">{blockedReason}</p>
            </div>
          )}

          <div className="space-y-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Registros e Trechos Comprovatórios ({evidences.length})
            </span>

            {evidences.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center text-xs text-slate-500">
                Origem direta ou inferência sem payload detalhado anexado.
              </div>
            ) : (
              evidences.map((ev, index) => (
                <div
                  key={ev.id || index}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      {getSourceIcon(ev.source)}
                      <span>{ev.label}</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {ev.occurredAt}
                    </span>
                  </div>

                  {ev.excerpt && (
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs font-mono text-slate-700 leading-relaxed relative group">
                      <p className="italic">"{ev.excerpt}"</p>
                      <button
                        onClick={() => handleCopyEvidence(ev.excerpt || '')}
                        className="absolute top-2 right-2 p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copiar trecho"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Transparência auditável Sales OS
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
