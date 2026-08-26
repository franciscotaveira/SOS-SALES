import React, { useState, useMemo } from 'react';
import { CommercialAppointment } from '../../types/agendaAndNotes';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  User,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface MonthlyCalendarViewProps {
  appointments: CommercialAppointment[];
  onSelectAppointment?: (apt: CommercialAppointment) => void;
  onGoToCockpit?: (journeyId: string) => void;
}

export const MonthlyCalendarView: React.FC<MonthlyCalendarViewProps> = ({
  appointments,
  onSelectAppointment,
  onGoToCockpit,
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(() => new Date().getDate());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(currentDate);
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  // Calculate calendar days
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Domingo

  const appointmentsByDay = useMemo(() => {
    const map: Record<number, CommercialAppointment[]> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      map[d] = [];
    }

    appointments.forEach((apt) => {
      // Parse ISO date '2026-08-15T14:15:00'
      const datePart = apt.scheduledAt.split('T')[0];
      if (!datePart) return;
      const parts = datePart.split('-');
      if (parts.length === 3 && parseInt(parts[0]) === year && parseInt(parts[1]) === month + 1) {
        const d = parseInt(parts[2]);
        if (map[d]) {
          map[d].push(apt);
        }
      }
    });

    return map;
  }, [appointments, year, month, daysInMonth]);

  const selectedDayAppointments = selectedDay ? appointmentsByDay[selectedDay] || [] : [];
  const selectedDayRevenue = selectedDayAppointments.reduce((acc, a) => acc + (a.serviceValue || 0), 0);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDay(null);
  };

  const getTimeFromScheduledAt = (iso: string) => {
    if (!iso) return '14:00';
    const timePart = iso.split('T')[1];
    return timePart ? timePart.slice(0, 5) : '14:00';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Calendar Matrix (Left 2 cols) */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        {/* Month Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 font-heading">
              {capitalizedMonth} {year}
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
              {appointments.length} agendamentos no mês
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => { setCurrentDate(new Date(2026, 7, 15)); setSelectedDay(15); }}
              className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
            >
              Hoje
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center font-bold text-slate-400 text-xs py-1 border-b border-slate-100">
          <div>Dom</div>
          <div>Seg</div>
          <div>Ter</div>
          <div>Qua</div>
          <div>Qui</div>
          <div>Sex</div>
          <div>Sáb</div>
        </div>

        {/* Month Days Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {/* Empty prefix slots */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`empty-${i}`} className="h-20 rounded-xl bg-slate-50/50 border border-transparent" />
          ))}

          {/* Actual days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dayApts = appointmentsByDay[dayNum] || [];
            const isSelected = selectedDay === dayNum;
            const isToday = dayNum === 15 && month === 7 && year === 2026;
            const hasApts = dayApts.length > 0;

            return (
              <div
                key={`day-${dayNum}`}
                onClick={() => setSelectedDay(dayNum)}
                className={`h-20 p-1.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between select-none ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20'
                    : isToday
                    ? 'border-blue-300 bg-blue-50/30'
                    : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-blue-600 text-white'
                        : isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-700'
                    }`}
                  >
                    {dayNum}
                  </span>

                  {hasApts && (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1 rounded">
                      {dayApts.length}
                    </span>
                  )}
                </div>

                {/* Day Mini Badges */}
                <div className="space-y-0.5 overflow-hidden">
                  {dayApts.slice(0, 2).map((apt) => (
                    <div
                      key={apt.id}
                      className="text-[9.5px] truncate px-1 py-0.2 rounded font-medium bg-slate-100 text-slate-800"
                    >
                      {getTimeFromScheduledAt(apt.scheduledAt)} {apt.leadName.split(' ')[0]}
                    </div>
                  ))}
                  {dayApts.length > 2 && (
                    <div className="text-[8.5px] text-slate-400 font-bold">
                      +{dayApts.length - 2} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Details Panel (Right 1 col) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4 flex flex-col justify-between">
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Detalhamento do Dia</span>
              <h3 className="text-sm font-black text-slate-900 font-heading">
                {selectedDay ? `${selectedDay} de ${capitalizedMonth}` : 'Selecione um dia'}
              </h3>
            </div>

            {selectedDayRevenue > 0 && (
              <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
                R$ {(Number(selectedDayRevenue) || 0).toFixed(2)}
              </span>
            )}
          </div>

          {selectedDayAppointments.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Nenhum agendamento marcado para esta data.
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto max-h-[380px] pr-1">
              {selectedDayAppointments.map((apt) => (
                <div
                  key={apt.id}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-emerald-300 transition-all space-y-1.5 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900">{apt.leadName}</span>
                        {apt.source === 'bot_ai' && (
                          <span className="text-[9px] font-bold px-1.5 rounded bg-purple-100 text-purple-700">
                            🤖 IA
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 font-medium">{apt.serviceName}</p>
                    </div>

                    <span className="text-xs font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
                      {getTimeFromScheduledAt(apt.scheduledAt)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10.5px] text-slate-500 pt-1 border-t border-slate-200/60">
                    <span className="font-bold text-emerald-700">R$ {(Number(apt.serviceValue) || 0).toFixed(2)}</span>
                    <span className="text-slate-400">{apt.operatorName || 'Fila'}</span>

                    {apt.journeyId && onGoToCockpit && (
                      <button
                        onClick={() => onGoToCockpit(apt.journeyId!)}
                        className="text-purple-600 hover:text-purple-800 font-bold hover:underline"
                      >
                        Abrir Chat →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            Dica: Clique em qualquer dia para ver a grade horária e receita prevista.
          </p>
        </div>
      </div>
    </div>
  );
};
