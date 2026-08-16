import React, { useState, useMemo } from 'react';
import { Workspace } from '../../types/cockpit';
import {
  CommercialAppointment,
  FollowUpAlarm,
  AppointmentStatus,
} from '../../types/agendaAndNotes';
import {
  mockAppointments,
  mockFollowUpAlarms,
} from '../../data/agendaAndNotesFixtures';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Phone,
  CheckCircle2,
  AlertCircle,
  Plus,
  Search,
  Filter,
  DollarSign,
  MapPin,
  Bot,
  BellRing,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Check,
  CalendarDays,
  List,
  Columns3,
} from 'lucide-react';
import { MonthlyCalendarView } from './MonthlyCalendarView';
import { WeeklyCalendarView } from './WeeklyCalendarView';
import { DailyCalendarView } from './DailyCalendarView';
import { SalesOsGateway } from '../../services/salesOsGateway';
import { salesOsRuntimeConfig } from '../../config/runtime';

interface AgendaViewProps {
  workspace: Workspace;
  onGoToCockpitWithJourney?: (journeyId: string) => void;
  gateway?: SalesOsGateway;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  workspace,
  onGoToCockpitWithJourney,
  gateway,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'month' | 'week' | 'day'>('list');
  const [appointments, setAppointments] = useState<CommercialAppointment[]>(() =>
    salesOsRuntimeConfig.mode === 'api' ? [] : mockAppointments
  );
  const [alarms, setAlarms] = useState<FollowUpAlarm[]>(() =>
    salesOsRuntimeConfig.mode === 'api' ? [] : mockFollowUpAlarms
  );
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'tomorrow' | 'week' | 'all'>('today');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  // Form State for new appointment
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [newServiceName, setNewServiceName] = useState('Consulta / Atendimento Comercial');
  const [newServiceValue, setNewServiceValue] = useState(150);
  const [newScheduledAt, setNewScheduledAt] = useState(() => {
    const nextHour = new Date(Date.now() + 3600000);
    return nextHour.toISOString().slice(0, 16);
  });
  const [newDuration, setNewDuration] = useState(45);
  const [newLocation, setNewLocation] = useState('Atendimento Online / Presencial');
  const [newNotes, setNewNotes] = useState('');

  React.useEffect(() => {
    if (gateway?.listAppointments) {
      setLoading(true);
      gateway
        .listAppointments(workspace.id)
        .then((data) => {
          setAppointments(data || []);
        })
        .catch((err) => {
          console.error('Failed to load appointments:', err);
        })
        .finally(() => setLoading(false));
    }
  }, [workspace.id, gateway]);

  // Stats Calculations
  const stats = useMemo(() => {
    const totalCount = appointments.length;
    const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length;
    const pendingDepositCount = appointments.filter((a) => a.status === 'pending_deposit').length;
    const totalRevenue = appointments
      .filter((a) => a.status === 'confirmed' || a.status === 'completed')
      .reduce((sum, a) => sum + a.serviceValue, 0);
    const pendingAlarmsCount = alarms.filter((al) => al.status === 'pending').length;

    return {
      totalCount,
      confirmedCount,
      pendingDepositCount,
      totalRevenue,
      pendingAlarmsCount,
    };
  }, [appointments, alarms]);

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      const matchesSearch =
        apt.leadName.toLowerCase().includes(search.toLowerCase()) ||
        apt.leadPhone.includes(search) ||
        apt.serviceName.toLowerCase().includes(search.toLowerCase()) ||
        (apt.operatorName && apt.operatorName.toLowerCase().includes(search.toLowerCase()));

      const matchesStatus = statusFilter === 'all' || apt.status === statusFilter;

      let matchesDate = true;
      if (dateFilter === 'today') {
        matchesDate = apt.scheduledAt.startsWith('2026-08-15');
      } else if (dateFilter === 'tomorrow') {
        matchesDate = apt.scheduledAt.startsWith('2026-08-16');
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [appointments, search, statusFilter, dateFilter]);

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim() || !newLeadPhone.trim()) return;

    const payload: Partial<CommercialAppointment> = {
      workspaceId: workspace.id,
      leadName: newLeadName.trim(),
      leadPhone: newLeadPhone.trim(),
      serviceName: newServiceName,
      serviceValue: Number(newServiceValue),
      scheduledAt: newScheduledAt,
      durationMinutes: Number(newDuration),
      status: 'confirmed',
      source: 'operator',
      operatorName: 'Você (Gestor)',
      location: newLocation,
      notes: newNotes.trim() || undefined,
    };

    if (gateway?.createAppointment) {
      try {
        const created = await gateway.createAppointment(workspace.id, payload);
        setAppointments((prev) => [created, ...prev]);
      } catch {
        const fallbackApt: CommercialAppointment = {
          id: `apt-${Date.now()}`,
          workspaceId: workspace.id,
          leadName: newLeadName.trim(),
          leadPhone: newLeadPhone.trim(),
          serviceName: newServiceName,
          serviceValue: Number(newServiceValue),
          scheduledAt: newScheduledAt,
          durationMinutes: Number(newDuration),
          status: 'confirmed',
          source: 'operator',
          operatorName: 'Você (Gestor)',
          location: newLocation,
          notes: newNotes.trim() || undefined,
        };
        setAppointments((prev) => [fallbackApt, ...prev]);
      }
    } else {
      const fallbackApt: CommercialAppointment = {
        id: `apt-${Date.now()}`,
        workspaceId: workspace.id,
        leadName: newLeadName.trim(),
        leadPhone: newLeadPhone.trim(),
        serviceName: newServiceName,
        serviceValue: Number(newServiceValue),
        scheduledAt: newScheduledAt,
        durationMinutes: Number(newDuration),
        status: 'confirmed',
        source: 'operator',
        operatorName: 'Você (Gestor)',
        location: newLocation,
        notes: newNotes.trim() || undefined,
      };
      setAppointments((prev) => [fallbackApt, ...prev]);
    }

    setIsNewModalOpen(false);
    setNewLeadName('');
    setNewLeadPhone('');
    setNewNotes('');
  };

  const handleCompleteAlarm = (alarmId: string) => {
    setAlarms((prev) =>
      prev.map((a) => (a.id === alarmId ? { ...a, status: 'completed' } : a))
    );
  };

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Confirmado
          </span>
        );
      case 'pending_deposit':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600 animate-pulse" /> Aguardando Sinal
          </span>
        );
      case 'completed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
            <Check className="w-3 h-3 text-slate-500" /> Realizado
          </span>
        );
      case 'rescheduled':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
            <CalendarIcon className="w-3 h-3 text-blue-600" /> Reagendado
          </span>
        );
      case 'cancelled':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-rose-600" /> Cancelado
          </span>
        );
    }
  };

  return (
    <div id="agenda-view-container" className="h-full overflow-y-auto w-full p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 font-heading">
              Agenda Comercial & Compromissos
            </h1>
            <span className="bg-emerald-50 text-[#00a884] font-bold text-xs px-2.5 py-0.5 rounded-full border border-[#00a884]/30 flex items-center gap-1">
              <CalendarDays className="w-3 h-3" /> Grade Ativa
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Agendamentos confirmados pelo WhatsApp, vagas do dia e alarmes de retorno comercial para {workspace.name}.
          </p>
        </div>

        {/* View Mode Selector & New Appointment Button */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Lista</span>
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                viewMode === 'month'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Mês</span>
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                viewMode === 'week'
                  ? 'bg-white text-blue-800 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Semana</span>
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 ${
                viewMode === 'day'
                  ? 'bg-white text-purple-800 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Dia</span>
            </button>
          </div>

          <button
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#00a884] hover:bg-[#008069] text-white text-xs font-bold rounded-xl transition-all shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Agendamento</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Hoje (Sábado)</span>
            <CalendarIcon className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-heading">
            {appointments.filter((a) => a.scheduledAt.startsWith('2026-08-15')).length} <span className="text-xs font-normal text-slate-400">horários</span>
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">
            {stats.confirmedCount} confirmados pela IA/Operador
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Receita em Agenda</span>
            <DollarSign className="w-4 h-4 text-[#00a884]" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            R$ {stats.totalRevenue.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Ticket médio: R$ {(stats.totalRevenue / (stats.confirmedCount || 1)).toFixed(0)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Aguardando Sinal Pix</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-900 font-heading">
            {stats.pendingDepositCount} <span className="text-xs font-normal text-amber-700">pendentes</span>
          </div>
          <div className="text-[11px] text-amber-700 font-medium mt-1">
            Vagas reservadas temporariamente
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-1">
            <span>Alarmes de Follow-up</span>
            <BellRing className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-heading">
            {stats.pendingAlarmsCount} <span className="text-xs font-normal text-rose-600">ativos</span>
          </div>
          <div className="text-[11px] text-rose-700 font-medium mt-1">
            Retornos programados para hoje
          </div>
        </div>
      </div>

      {/* Alarms Section (if any pending) */}
      {alarms.filter((a) => a.status === 'pending').length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 via-indigo-50/50 to-white border border-purple-200 rounded-2xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-purple-600 text-white shadow-xs">
                <BellRing className="w-3.5 h-3.5 animate-bounce" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-purple-950 font-heading">
                  Alarmes de Follow-up & Retomadas para Hoje
                </h3>
                <p className="text-[11px] text-purple-800">
                  Leads aguardando contato no horário prometido para não perder o timing comercial.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {alarms
              .filter((a) => a.status === 'pending')
              .map((alarm) => (
                <div
                  key={alarm.id}
                  className="bg-white rounded-xl p-3 border border-purple-200/80 shadow-2xs flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-900 truncate">
                        {alarm.leadName}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                        {alarm.triggerAt.split('T')[1]?.substring(0, 5) || 'Hoje'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                      {alarm.reason}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                    <span className="text-slate-400 font-mono text-[10px]">
                      {alarm.leadPhone}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleCompleteAlarm(alarm.id)}
                        className="px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:text-emerald-700 bg-slate-50 hover:bg-emerald-50 rounded border border-slate-200 transition-colors"
                        title="Marcar como concluído"
                      >
                        ✓ Feito
                      </button>
                      {onGoToCockpitWithJourney && (
                        <button
                          onClick={() => onGoToCockpitWithJourney(alarm.journeyId)}
                          className="px-2 py-0.5 text-[10px] font-bold text-white bg-[#00a884] hover:bg-[#008069] rounded transition-colors flex items-center gap-1"
                        >
                          <span>Atender</span>
                          <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Views Routing: Month, Week, Day or List */}
      {viewMode === 'month' && (
        <MonthlyCalendarView
          appointments={appointments}
          onGoToCockpit={onGoToCockpitWithJourney}
        />
      )}

      {viewMode === 'week' && (
        <WeeklyCalendarView
          appointments={appointments}
          onGoToCockpit={onGoToCockpitWithJourney}
        />
      )}

      {viewMode === 'day' && (
        <DailyCalendarView
          appointments={appointments}
          onGoToCockpit={onGoToCockpitWithJourney}
        />
      )}

      {viewMode === 'list' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-4">
        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto text-xs">
            <button
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                dateFilter === 'today'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Hoje (Sáb)
            </button>
            <button
              onClick={() => setDateFilter('tomorrow')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                dateFilter === 'tomorrow'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Amanhã (Dom)
            </button>
            <button
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                dateFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Todos os Agendamentos
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar cliente, serviço ou atendente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#00a884]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#00a884]"
            >
              <option value="all">Todos os Status</option>
              <option value="confirmed">Confirmados</option>
              <option value="pending_deposit">Aguardando Sinal</option>
              <option value="completed">Realizados</option>
              <option value="rescheduled">Reagendados</option>
            </select>
          </div>
        </div>

        {/* Appointments List / Timeline */}
        {filteredAppointments.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            Nenhum agendamento encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredAppointments.map((apt) => {
              const timeFormatted = apt.scheduledAt.split('T')[1]?.substring(0, 5) || '14:00';
              const dateFormatted = apt.scheduledAt.split('T')[0];

              return (
                <div
                  key={apt.id}
                  className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-white transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center shrink-0 shadow-xs">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase">
                        {dateFormatted === '2026-08-15' ? 'HOJE' : dateFormatted === '2026-08-16' ? 'DOM' : 'DATA'}
                      </span>
                      <span className="text-xs font-black font-mono">
                        {timeFormatted}
                      </span>
                    </div>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-slate-900 truncate font-heading">
                          {apt.leadName}
                        </h4>
                        {getStatusBadge(apt.status)}
                        {apt.source === 'bot_ai' && (
                          <span className="text-[10px] text-purple-700 bg-purple-50 border border-purple-100 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1">
                            <Bot className="w-2.5 h-2.5 text-purple-600" /> IA Copilot
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-600 flex-wrap">
                        <span className="font-medium text-slate-800">
                          {apt.serviceName}
                        </span>
                        <span>·</span>
                        <span className="font-mono font-bold text-emerald-700">
                          R$ {apt.serviceValue.toFixed(2)}
                        </span>
                        <span>·</span>
                        <span className="text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {apt.durationMinutes}min
                        </span>
                        {apt.location && (
                          <>
                            <span>·</span>
                            <span className="text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" /> {apt.location}
                            </span>
                          </>
                        )}
                      </div>

                      {apt.notes && (
                        <p className="text-[10.5px] text-slate-500 italic mt-0.5 line-clamp-1">
                          "{apt.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <div className="text-right hidden lg:block">
                      <div className="text-[11px] text-slate-500">
                        Atendente: <span className="font-medium text-slate-800">{apt.operatorName || 'Não atribuído'}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {apt.leadPhone}
                      </div>
                    </div>

                    {apt.journeyId && onGoToCockpitWithJourney && (
                      <button
                        onClick={() => onGoToCockpitWithJourney(apt.journeyId!)}
                        className="px-3 py-1.5 bg-[#00a884] hover:bg-[#008069] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                      >
                        <span>Abrir Conversa</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Modal: Novo Agendamento */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#00a884] flex items-center justify-center font-bold">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900">
                  Novo Agendamento Comercial
                </h3>
              </div>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAppointment} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Nome do Cliente:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Fernanda Lima"
                  value={newLeadName}
                  onChange={(e) => setNewLeadName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  WhatsApp:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: +55 11 98888-7777"
                  value={newLeadPhone}
                  onChange={(e) => setNewLeadPhone(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Serviço / Procedimento:
                  </label>
                  <input
                    type="text"
                    required
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Valor (R$):
                  </label>
                  <input
                    type="number"
                    required
                    value={newServiceValue}
                    onChange={(e) => setNewServiceValue(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Data & Hora:
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={newScheduledAt}
                    onChange={(e) => setNewScheduledAt(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Duração:
                  </label>
                  <select
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                  >
                    <option value={30}>30 minutos</option>
                    <option value={45}>45 minutos</option>
                    <option value={60}>1 hora</option>
                    <option value={90}>1h 30min</option>
                    <option value={120}>2 horas</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Local / Cadeira / Sala:
                </label>
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Observações Comerciais:
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Cliente tem compromisso logo após; solicitou profissional Larissa."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#00a884] hover:bg-[#008069] text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  Salvar na Agenda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
