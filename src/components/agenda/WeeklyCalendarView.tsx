import React, { useState, useMemo } from 'react';
import { CommercialAppointment } from '../../types/agendaAndNotes';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface WeeklyCalendarViewProps {
  appointments: CommercialAppointment[];
  onGoToCockpit?: (journeyId: string) => void;
}

export const WeeklyCalendarView: React.FC<WeeklyCalendarViewProps> = ({
  appointments,
  onGoToCockpit,
}) => {
  const daysOfWeek = [
    { name: 'Segunda', date: '2026-08-10', dayNum: '10' },
    { name: 'Terça', date: '2026-08-11', dayNum: '11' },
    { name: 'Quarta', date: '2026-08-12', dayNum: '12' },
    { name: 'Quinta', date: '2026-08-13', dayNum: '13' },
    { name: 'Sexta', date: '2026-08-14', dayNum: '14' },
    { name: 'Sábado (Hoje)', date: '2026-08-15', dayNum: '15', isToday: true },
    { name: 'Domingo', date: '2026-08-16', dayNum: '16' },
  ];

  const getAppointmentsForDay = (dateStr: string) => {
    return appointments.filter((a) => a.scheduledAt.startsWith(dateStr));
  };

  const getTime = (iso: string) => {
    const timePart = iso.split('T')[1];
    return timePart ? timePart.slice(0, 5) : '14:00';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4 overflow-hidden">
      {/* Week Header Navigation */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 font-heading">
            Semana de 10 a 16 de Agosto de 2026
          </h2>
          <p className="text-xs text-slate-500">
            Grade semanal com horários disponíveis e ocupação de cadeiras/salas.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" />
          <span className="text-slate-600 mr-2">Confirmado</span>
          <span className="w-3 h-3 rounded bg-amber-100 border border-amber-300 inline-block" />
          <span className="text-slate-600 mr-2">Aguardando Sinal</span>
          <span className="w-3 h-3 rounded bg-purple-100 border border-purple-300 inline-block" />
          <span className="text-slate-600">Agendado pela IA</span>
        </div>
      </div>

      {/* Week Matrix */}
      <div className="overflow-x-auto">
        <div className="min-w-[750px] grid grid-cols-7 gap-2">
          {daysOfWeek.map((day) => {
            const dayApts = getAppointmentsForDay(day.date);
            const totalRevenue = dayApts.reduce((acc, a) => acc + (a.serviceValue || 0), 0);

            return (
              <div
                key={day.date}
                className={`rounded-xl border flex flex-col ${
                  day.isToday
                    ? 'border-emerald-500 bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-slate-50/30'
                }`}
              >
                {/* Day Header */}
                <div
                  className={`p-2.5 text-center border-b rounded-t-xl ${
                    day.isToday
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-white text-slate-700 font-bold border-slate-200'
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-wider">{day.name}</div>
                  <div className="text-sm font-black">{day.dayNum}</div>
                  {totalRevenue > 0 && (
                    <div className={`text-[10px] mt-0.5 font-mono ${day.isToday ? 'text-emerald-100' : 'text-emerald-700'}`}>
                      R$ {totalRevenue.toFixed(0)}
                    </div>
                  )}
                </div>

                {/* Day Appointments Slots */}
                <div className="p-2 space-y-2 flex-1 min-h-[300px]">
                  {dayApts.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[10.5px] text-slate-400 py-10">
                      Livre
                    </div>
                  ) : (
                    dayApts.map((apt) => {
                      const isPending = apt.status === 'pending_deposit';

                      return (
                        <div
                          key={apt.id}
                          className={`p-2 rounded-lg border text-left transition-all space-y-1 shadow-2xs ${
                            isPending
                              ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                              : 'bg-white border-slate-200 text-slate-900 hover:border-emerald-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-[10px] bg-slate-100 px-1 rounded">
                              {getTime(apt.scheduledAt)}
                            </span>
                            <span className="font-bold text-[10px] text-emerald-700">
                              R$ {apt.serviceValue.toFixed(0)}
                            </span>
                          </div>

                          <div className="font-bold text-xs truncate leading-tight">
                            {apt.leadName}
                          </div>

                          <div className="text-[10.5px] text-slate-500 truncate">
                            {apt.serviceName}
                          </div>

                          {apt.journeyId && onGoToCockpit && (
                            <button
                              onClick={() => onGoToCockpit(apt.journeyId!)}
                              className="text-[10px] font-bold text-purple-600 hover:text-purple-800 flex items-center gap-0.5 pt-0.5"
                            >
                              <span>Atender</span>
                              <ArrowRight className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
