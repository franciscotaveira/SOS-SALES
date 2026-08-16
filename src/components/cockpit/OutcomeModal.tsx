import React from 'react';
import { Journey, OutcomeStatus } from '../../types/cockpit';
import { X, CheckCircle, XCircle, Calendar, DollarSign, Award, ThumbsUp } from 'lucide-react';

interface OutcomeModalProps {
  journey: Journey;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (outcomeData: {
    status: OutcomeStatus;
    dealValueBrl?: number;
    serviceOrProduct?: string;
    reason?: string;
    closedBy: string;
  }) => Promise<void>;
  currentOperatorName: string;
}

export const OutcomeModal: React.FC<OutcomeModalProps> = ({
  journey,
  isOpen,
  onClose,
  onSubmit,
  currentOperatorName,
}) => {
  const [status, setStatus] = React.useState<OutcomeStatus>(journey.outcome?.status || 'won');
  const [dealValue, setDealValue] = React.useState<string>(
    journey.outcome?.dealValueBrl ? journey.outcome.dealValueBrl.toString() : '59.00'
  );
  const [service, setService] = React.useState<string>(
    journey.outcome?.serviceOrProduct || journey.acquisition.referralOffer || 'Atendimento Comercial'
  );
  const [reason, setReason] = React.useState<string>(
    journey.outcome?.reason || 'Lead confirmou interesse e fechou horário'
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        status,
        dealValueBrl: parseFloat(dealValue) || 0,
        serviceOrProduct: service,
        reason,
        closedBy: currentOperatorName,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="outcome-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        id="outcome-modal-card"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-sm text-slate-900">Registrar Desfecho Comercial</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="text-xs text-slate-600">
            Lead: <strong className="text-slate-900">{journey.leadName || journey.contact?.name || 'Cliente'}</strong> {journey.leadPhone || journey.contact?.phone ? `(${journey.leadPhone || journey.contact?.phone})` : ''}
          </div>

          {/* Outcome Status Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Resultado da Conversa</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus('won')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  status === 'won'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Ganho / Fechado</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('lost')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  status === 'lost'
                    ? 'bg-rose-50 text-rose-800 border-rose-500 ring-2 ring-rose-500/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Perdido / Desistiu</span>
              </button>
            </div>
          </div>

          {/* Deal Value */}
          {status === 'won' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Valor Fechado (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">R$</span>
                <input
                  type="number"
                  step="0.01"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  required
                  placeholder="0,00"
                  className="w-full pl-9 pr-3 py-2 text-sm text-slate-900 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Service / Product */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Serviço / Procedimento / Linha
            </label>
            <input
              type="text"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="Ex: Escova Modelada + Hidratação"
              className="w-full px-3 py-2 text-sm text-slate-900 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Reason / Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Motivo / Observação Comercial
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Cliente aprovou o valor da campanha e agendou para o sábado..."
              className="w-full p-2.5 text-xs text-slate-900 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              id="confirm-outcome-submit-btn"
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs"
            >
              {isSubmitting ? 'Salvando...' : 'Confirmar e Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
