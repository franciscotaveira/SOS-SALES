import React from 'react';
import { CommercialAppointment } from '../../types/agendaAndNotes';
import {
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface DailyCalendarViewProps {
  appointments: CommercialAppointment[];
  onGoToCockpit?: (journeyId: string) => void;
}

export const DailyCalendarView: React.FC<DailyCalendarViewProps> = ({
  appointments,
  onGoToCockpit,
}) => {
  const timeSlots = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
    '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
  ];

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayApts = appointments.filter((a) => a.scheduledAt.startsWith(todayStr));

  const dayName = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(today);
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);

  const getTime = (iso: string) => {
    const timePart = iso.split('T')[1];
    return timePart ? timePart.slice(0, 5) : '14:00';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
      {/* Daily Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-heading">
            Grade Horária do Dia · {capitalizedDay}
          </h2>
          <p className="text-xs text-slate-500">
            {todayApts.length} atendimentos programados · Visão de fluxo contínuo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
            Receita do Dia: R$ {todayApts.reduce((acc, a) => acc + (Number(a.serviceValue) || 0), 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Hourly Timeline */}
      <div className="space-y-3">
        {timeSlots.map((slot) => {
          // Find appointments in this hour range
          const slotApts = todayApts.filter((a) => {
            const time = getTime(a.scheduledAt);
            return time.startsWith(slot.slice(0, 2));
          });

          return (
            <div
              key={slot}
              className="flex items-start gap-4 p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors"
            >
              {/* Hour Marker */}
              <div className="w-16 font-mono font-bold text-xs text-slate-400 shrink-0 pt-1">
                {slot}
              </div>

              {/* Slot Content */}
              <div className="flex-1">
                {slotApts.length === 0 ? (
                  <div className="text-xs text-slate-300 py-1 italic">
                    Horário vago para agendamento
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {slotApts.map((apt) => (
                      <div
                        key={apt.id}
                        className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 font-heading">
                              {apt.leadName}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                              {getTime(apt.scheduledAt)}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-600 mt-0.5">
                            {apt.serviceName} · <span className="font-bold text-emerald-800">R$ {(Number(apt.serviceValue) || 0).toFixed(2)}</span>
                          </p>

                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Atendente: {apt.operatorName || 'Fila'} {apt.notes && `· "${apt.notes}"`}
                          </p>
                        </div>

                        {apt.journeyId && onGoToCockpit && (
                          <button
                            onClick={() => onGoToCockpit(apt.journeyId!)}
                            className="px-3 py-1.5 bg-[#00a884] hover:bg-[#008069] text-white text-xs font-bold rounded-lg shadow-2xs shrink-0 transition-all"
                          >
                            Abrir Chat
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
