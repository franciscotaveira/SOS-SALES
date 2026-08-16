import React from 'react';
import { Journey, FollowUpSchedule } from '../../types/cockpit';
import { Clock, Calendar, X, Check, BellRing, Sparkles } from 'lucide-react';

interface SnoozeFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  journey: Journey;
  onScheduleFollowUp: (schedule: FollowUpSchedule) => void;
}

export const SnoozeFollowUpModal: React.FC<SnoozeFollowUpModalProps> = ({
  isOpen,
  onClose,
  journey,
  onScheduleFollowUp,
}) => {
  const [selectedPreset, setSelectedPreset] = React.useState<string>('tomorrow_morning');
  const [customDateTime, setCustomDateTime] = React.useState<string>('');
  const [reason, setReason] = React.useState<string>(
    'Cliente pediu para retornar o contato após validar disponibilidade'
  );

  if (!isOpen) return null;

  const getPresetTime = (presetKey: string): { dueAt: string; label: string } => {
    const now = new Date();
    switch (presetKey) {
      case 'today_end': {
        const d = new Date();
        d.setHours(18, 0, 0, 0);
        if (d.getTime() <= now.getTime()) {
          d.setHours(now.getHours() + 2);
        }
        return { dueAt: d.toISOString(), label: 'Hoje às 18:00 (Fim de expediente)' };
      }
      case 'tomorrow_morning': {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(10, 0, 0, 0);
        return { dueAt: d.toISOString(), label: 'Amanhã às 10:00 (Manhã)' };
      }
      case 'tomorrow_afternoon': {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(15, 0, 0, 0);
        return { dueAt: d.toISOString(), label: 'Amanhã às 15:00 (Tarde)' };
      }
      case 'in_2_days': {
        const d = new Date();
        d.setDate(d.getDate() + 2);
        d.setHours(11, 0, 0, 0);
        return { dueAt: d.toISOString(), label: 'Em 2 dias às 11:00' };
      }
      case 'next_monday': {
        const d = new Date();
        const day = d.getDay();
        const diff = d.getDate() + (day === 0 ? 1 : 8 - day);
        d.setDate(diff);
        d.setHours(10, 0, 0, 0);
        return { dueAt: d.toISOString(), label: 'Próxima Segunda-feira às 10:00' };
      }
      case 'custom': {
        const d = customDateTime ? new Date(customDateTime) : new Date(Date.now() + 3600 * 1000);
        return {
          dueAt: d.toISOString(),
          label: d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        };
      }
      default:
        return { dueAt: new Date().toISOString(), label: 'Agora' };
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { dueAt, label } = getPresetTime(selectedPreset);
    onScheduleFollowUp({
      dueAt,
      label,
      reason: reason.trim() || 'Follow-up comercial programado',
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div
      id="snooze-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="snooze-modal-content"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-700">
              <BellRing className="w-3.5 h-3.5" />
              <span>Programar Retomada Comercial</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 leading-snug">
              Lembrete de Follow-up · {journey.leadName || journey.contact?.name || 'Cliente'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Quando deseja que o alarme retorne este lead ao topo da fila?
            </label>

            <div className="grid grid-cols-1 gap-1.5">
              {[
                { id: 'today_end', label: 'Hoje às 18:00 (Fim de expediente)' },
                { id: 'tomorrow_morning', label: 'Amanhã às 10:00 (Manhã)' },
                { id: 'tomorrow_afternoon', label: 'Amanhã às 15:00 (Tarde)' },
                { id: 'in_2_days', label: 'Em 2 dias (48 horas)' },
                { id: 'next_monday', label: 'Próxima Segunda-feira às 10:00' },
                { id: 'custom', label: 'Data e horário personalizados' },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                    selectedPreset === opt.id
                      ? 'bg-purple-50/80 border-purple-500 text-purple-900 font-semibold ring-1 ring-purple-500'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="snooze_preset"
                      value={opt.id}
                      checked={selectedPreset === opt.id}
                      onChange={() => setSelectedPreset(opt.id)}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <span>{opt.label}</span>
                  </div>
                  {selectedPreset === opt.id && (
                    <Check className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  )}
                </label>
              ))}
            </div>

            {selectedPreset === 'custom' && (
              <div className="pt-2 animate-in fade-in">
                <input
                  type="datetime-local"
                  value={customDateTime}
                  onChange={(e) => setCustomDateTime(e.target.value)}
                  className="w-full p-2 text-xs rounded-lg border border-slate-300 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  required
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">
              Motivo do combinado / Objeção a ser superada:
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Vai ver com o marido; aguardando confirmação da escala..."
              className="w-full p-2.5 text-xs text-slate-800 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-none"
            />
            <span className="text-[11px] text-slate-400 block">
              Este combinado será registrado no Dossiê Vivo (Bloco 4: Último Combinado).
            </span>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Salvar Agendamento de Follow-up</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
