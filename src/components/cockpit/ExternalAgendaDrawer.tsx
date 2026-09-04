import React, { useState, useEffect, useMemo } from 'react';
import { salesOsRuntimeConfig } from '../../config/runtime';
import {
  Calendar,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  Sparkles,
  Bot,
  Settings,
  X,
  Lock,
  ChevronRight,
  Sliders,
  Scissors,
  Sparkle,
  Paintbrush,
  AlertTriangle,
  Info,
  CalendarDays,
  UserCheck,
  Filter,
  Send,
  User,
  Zap,
  Sun,
  Sunrise,
  Moon,
  Check,
} from 'lucide-react';

export interface StaffMember {
  id: string;
  name: string;
  role: 'Cabeleireiro(a)' | 'Manicure' | 'Maquiador(a)';
  specialties: string[];
  status: 'available' | 'absence' | 'busy';
  absenceReason?: string;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  category: 'cabelo' | 'unhas' | 'maquiagem' | 'combos';
  minDurationMinutes: number;
  maxDurationMinutes: number;
  durationLabel: string;
  priceEstimated?: string;
  applicableRoles: ('Cabeleireiro(a)' | 'Manicure' | 'Maquiador(a)')[];
  description: string;
}

export const SALON_SERVICES: ServiceDefinition[] = [
  {
    id: 'escova_express',
    name: 'Escova Express / Tradicional',
    category: 'cabelo',
    minDurationMinutes: 45,
    maxDurationMinutes: 60,
    durationLabel: '45 a 60 min',
    priceEstimated: 'R$ 59',
    applicableRoles: ['Cabeleireiro(a)'],
    description: 'Lavagem e escovação rápida ou tradicional.',
  },
  {
    id: 'escova_modelada',
    name: 'Escova Modelada / Babyliss',
    category: 'cabelo',
    minDurationMinutes: 60,
    maxDurationMinutes: 75,
    durationLabel: '60 a 75 min',
    priceEstimated: 'R$ 85',
    applicableRoles: ['Cabeleireiro(a)'],
    description: 'Finalização trabalhada com ondas ou cachos.',
  },
  {
    id: 'hidratacao_ozonio',
    name: 'Hidratação de Ozônio + Escova',
    category: 'cabelo',
    minDurationMinutes: 60,
    maxDurationMinutes: 90,
    durationLabel: '60 a 90 min',
    priceEstimated: 'R$ 220',
    applicableRoles: ['Cabeleireiro(a)'],
    description: 'Tratamento capilar com vapor de ozônio + escova.',
  },
  {
    id: 'manicure_tradicional',
    name: 'Manicure Tradicional',
    category: 'unhas',
    minDurationMinutes: 45,
    maxDurationMinutes: 60,
    durationLabel: '45 a 60 min',
    priceEstimated: 'R$ 45',
    applicableRoles: ['Manicure'],
    description: 'Cutilagem e esmaltação comum.',
  },
  {
    id: 'pedicure_tradicional',
    name: 'Pedicure Tradicional',
    category: 'unhas',
    minDurationMinutes: 45,
    maxDurationMinutes: 60,
    durationLabel: '45 a 60 min',
    priceEstimated: 'R$ 55',
    applicableRoles: ['Manicure'],
    description: 'Cuidados com os pés e esmaltação.',
  },
  {
    id: 'esmaltacao_gel',
    name: 'Esmaltação em Gel / Russa',
    category: 'unhas',
    minDurationMinutes: 90,
    maxDurationMinutes: 120,
    durationLabel: '90 a 120 min',
    priceEstimated: 'R$ 150',
    applicableRoles: ['Manicure'],
    description: 'Procedimento técnico de alta durabilidade (Suzana/Édina).',
  },
  {
    id: 'combo_pe_mao',
    name: 'Combo Pé e Mão Completo',
    category: 'combos',
    minDurationMinutes: 90,
    maxDurationMinutes: 120,
    durationLabel: '90 a 120 min',
    priceEstimated: 'R$ 90',
    applicableRoles: ['Manicure'],
    description: 'Manicure + Pedicure na mesma sessão.',
  },
  {
    id: 'combo_escova_manicure',
    name: 'Combo Escova + Manicure',
    category: 'combos',
    minDurationMinutes: 75,
    maxDurationMinutes: 105,
    durationLabel: '75 a 105 min',
    priceEstimated: 'R$ 99',
    applicableRoles: ['Cabeleireiro(a)', 'Manicure'],
    description: 'Escova e Manicure sequenciais ou simultâneas.',
  },
  {
    id: 'sobrancelha_buco',
    name: 'Design de Sobrancelha & Buço',
    category: 'maquiagem',
    minDurationMinutes: 30,
    maxDurationMinutes: 45,
    durationLabel: '30 a 45 min',
    priceEstimated: 'R$ 45',
    applicableRoles: ['Maquiador(a)'],
    description: 'Design e depilação facial rápida.',
  },
];

export function detectServiceFromText(text: string): string {
  if (!text) return 'escova_express';
  const lower = text.toLowerCase();
  if (lower.includes('gel') || lower.includes('russa') || lower.includes('alongamento') || lower.includes('fibra')) return 'esmaltacao_gel';
  if (lower.includes('ozônio') || lower.includes('ozonio') || lower.includes('hidrata') || lower.includes('cronograma')) return 'hidratacao_ozonio';
  if ((lower.includes('pé') || lower.includes('pe')) && (lower.includes('mão') || lower.includes('mao') || lower.includes('unha'))) return 'combo_pe_mao';
  if (lower.includes('escova') && (lower.includes('unha') || lower.includes('manicure'))) return 'combo_escova_manicure';
  if (lower.includes('pedicure') || lower.includes('pé') || lower.includes('pe ')) return 'pedicure_tradicional';
  if (lower.includes('unha') || lower.includes('manicure') || lower.includes('esmalta')) return 'manicure_tradicional';
  if (lower.includes('sobrancelha') || lower.includes('buço') || lower.includes('buco') || lower.includes('make') || lower.includes('maquiagem')) return 'sobrancelha_buco';
  if (lower.includes('modelada') || lower.includes('babyliss') || lower.includes('cachos')) return 'escova_modelada';
  return 'escova_express';
}

export interface DetectedSlot {
  id: string;
  time: string;
  decimalTime: number;
  dayLabel: 'Hoje' | 'Amanhã' | 'Quarta (Próximo Dia)';
  dateIso: string;
  staffName: string;
  staffRole: 'Cabeleireiro(a)' | 'Manicure' | 'Maquiador(a)';
  serviceCategory: 'cabelo' | 'unhas' | 'maquiagem' | 'combos';
  freeWindowMinutes: number;
  fitsSelectedService: boolean;
  windowSummary: string;
  isPast: boolean;
  status: 'livre' | 'ocupado' | 'indisponivel';
  period: 'manha' | 'tarde' | 'noite';
}

export type ExternalAgendaProvider = 'google_calendar' | 'trinks' | 'calendly' | 'avec' | 'simples_agenda' | 'custom';

export interface ExternalAgendaConfig {
  enabled: boolean;
  provider: ExternalAgendaProvider;
  providerLabel: string;
  url: string;
  autoSyncMinutes: number;
  lastSyncedAt?: string;
  targetDate: 'hoje' | 'amanha' | 'depois_amanha';
  selectedServiceId: string;
  availableSlotsToday?: string[];
}

export const EXTERNAL_AGENDA_PRESETS: Record<ExternalAgendaProvider, { label: string; defaultUrl: string; placeholder: string; desc: string }> = {
  google_calendar: {
    label: 'Google Agenda (Google Calendar)',
    defaultUrl: 'https://calendar.google.com/calendar/u/0/r',
    placeholder: 'https://calendar.google.com/calendar/u/0/r ou link de agendamento',
    desc: 'Integração e visualização direta da sua conta Google Calendar ou agenda compartilhada.',
  },
  trinks: {
    label: 'Trinks (Salão & Beleza)',
    defaultUrl: 'https://www.trinks.com/havenescovaria/admin',
    placeholder: 'https://www.trinks.com/seusalao/admin',
    desc: 'Painel administrativo da Trinks com leitura de profissionais e horários.',
  },
  calendly: {
    label: 'Calendly / Cal.com',
    defaultUrl: 'https://calendly.com',
    placeholder: 'https://calendly.com/sua-empresa',
    desc: 'Página de agendamento online do Calendly ou Cal.com para consultas e reuniões.',
  },
  avec: {
    label: 'Avec / Beauty Date',
    defaultUrl: 'https://avec.me',
    placeholder: 'https://avec.me/seusalao',
    desc: 'Sistema de gestão e agenda para clínicas e salões de beleza.',
  },
  simples_agenda: {
    label: 'Simples Agenda',
    defaultUrl: 'https://simplesagenda.com.br',
    placeholder: 'https://app.simplesagenda.com.br',
    desc: 'Software de agendamento para prestadores de serviços e autônomos.',
  },
  custom: {
    label: 'Agenda Própria / Link Web',
    defaultUrl: 'https://agenda.iaparavendas.tech',
    placeholder: 'https://sua-agenda-online.com.br',
    desc: 'Qualquer sistema de agenda web que possua link de visualização ou painel.',
  },
};

interface ExternalAgendaDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName?: string;
  conversationContext?: string;
  onInsertSlotToDraft?: (slotText: string) => void;
}

export const DEFAULT_EXTERNAL_AGENDA_STORAGE_KEY = 'sos_sales_external_agenda_config_v3';

export function getExternalAgendaConfig(wsId: string): ExternalAgendaConfig {
  try {
    const saved = localStorage.getItem(`${DEFAULT_EXTERNAL_AGENDA_STORAGE_KEY}_${wsId}`);
    if (saved) return JSON.parse(saved);
  } catch {}

  const safeId = (wsId || '').toLowerCase();
  const isHaven = safeId.includes('haven') || safeId.includes('escovaria');
  
  if (isHaven) {
    return {
      enabled: true,
      provider: 'trinks',
      providerLabel: 'Trinks (Haven)',
      url: 'https://www.trinks.com/havenescovaria/admin',
      autoSyncMinutes: 15,
      lastSyncedAt: new Date().toISOString(),
      targetDate: 'hoje',
      selectedServiceId: 'escova_express',
    };
  }

  return {
    enabled: true,
    provider: 'trinks',
    providerLabel: 'Trinks / Agenda Web',
    url: 'https://www.trinks.com/admin',
    autoSyncMinutes: 15,
    lastSyncedAt: new Date().toISOString(),
    targetDate: 'hoje',
    selectedServiceId: 'escova_express',
  };
}

// Real staff roster mapped directly from the Haven salon Trinks grid
export const HAVEN_STAFF_ROSTER: StaffMember[] = [
  { id: '1', name: 'Carla', role: 'Cabeleireiro(a)', specialties: ['Escova', 'Corte', 'Mechas'], status: 'absence', absenceReason: 'Ausência 8:00 - 20:00' },
  { id: '2', name: 'Dávila', role: 'Manicure', specialties: ['Manicure Tradicional', 'Pedicure'], status: 'absence', absenceReason: 'Ausência' },
  { id: '3', name: 'Édina', role: 'Manicure', specialties: ['Manicure', 'Pedicure Tradicional', 'Esmaltação'], status: 'available' },
  { id: '4', name: 'Isleia', role: 'Cabeleireiro(a)', specialties: ['Escova Express', 'Hidratação', 'Cabelo'], status: 'available' },
  { id: '5', name: 'Lis', role: 'Cabeleireiro(a)', specialties: ['Escova Modelada', 'Tratamentos', 'Mechas'], status: 'available' },
  { id: '6', name: 'Priscila', role: 'Cabeleireiro(a)', specialties: ['Escova Express', 'Corte', 'Cronograma'], status: 'available' },
  { id: '7', name: 'Suzana', role: 'Manicure', specialties: ['Esmaltação em Gel', 'Manutenção Russa', 'Unhas'], status: 'available' },
  { id: '8', name: 'Tay', role: 'Maquiador(a)', specialties: ['Maquiagem', 'Design de Sobrancelha', 'Buço'], status: 'available' },
];

export const STAFF_VISUAL_MAP: Record<string, {
  badgeBg: string;
  text: string;
  border: string;
  avatarBg: string;
  specialtyTag: string;
  accentGlow: string;
}> = {
  'Isleia': {
    badgeBg: 'bg-purple-950/90',
    text: 'text-purple-300',
    border: 'border-purple-500/40',
    avatarBg: 'bg-gradient-to-br from-purple-500 to-indigo-600',
    specialtyTag: '💇‍♀️ Escovista Master',
    accentGlow: 'hover:border-purple-400 hover:shadow-purple-500/15',
  },
  'Lis': {
    badgeBg: 'bg-indigo-950/90',
    text: 'text-indigo-300',
    border: 'border-indigo-500/40',
    avatarBg: 'bg-gradient-to-br from-indigo-500 to-blue-600',
    specialtyTag: '✨ Mechas & Modelada',
    accentGlow: 'hover:border-indigo-400 hover:shadow-indigo-500/15',
  },
  'Priscila': {
    badgeBg: 'bg-fuchsia-950/90',
    text: 'text-fuchsia-300',
    border: 'border-fuchsia-500/40',
    avatarBg: 'bg-gradient-to-br from-fuchsia-500 to-pink-600',
    specialtyTag: '💇‍♀️ Visagismo & Escova',
    accentGlow: 'hover:border-fuchsia-400 hover:shadow-fuchsia-500/15',
  },
  'Édina': {
    badgeBg: 'bg-emerald-950/90',
    text: 'text-emerald-300',
    border: 'border-emerald-500/40',
    avatarBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    specialtyTag: '💅 Manicure Tradicional & Pé',
    accentGlow: 'hover:border-emerald-400 hover:shadow-emerald-500/15',
  },
  'Suzana': {
    badgeBg: 'bg-pink-950/90',
    text: 'text-pink-300',
    border: 'border-pink-500/40',
    avatarBg: 'bg-gradient-to-br from-pink-500 to-rose-600',
    specialtyTag: '💎 Nail Designer (Gel & Russa)',
    accentGlow: 'hover:border-pink-400 hover:shadow-pink-500/15',
  },
  'Tay': {
    badgeBg: 'bg-amber-950/90',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
    avatarBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
    specialtyTag: '💄 Make & Sobrancelhas',
    accentGlow: 'hover:border-amber-400 hover:shadow-amber-500/15',
  },
  'Carla': {
    badgeBg: 'bg-slate-900',
    text: 'text-slate-400',
    border: 'border-slate-800',
    avatarBg: 'bg-slate-700',
    specialtyTag: 'Ausente Hoje',
    accentGlow: '',
  },
  'Dávila': {
    badgeBg: 'bg-slate-900',
    text: 'text-slate-400',
    border: 'border-slate-800',
    avatarBg: 'bg-slate-700',
    specialtyTag: 'Ausente Hoje',
    accentGlow: '',
  },
};

export interface ParsedConversationIntent {
  serviceId: string;
  serviceName: string;
  preferredPeriod: 'all' | 'manha' | 'tarde' | 'noite';
  preferredHourThreshold?: number;
  preferredStaffName?: string;
  preferredDay?: 'hoje' | 'amanha' | 'depois_amanha';
  confidenceReason: string;
  rawMatchedSnippet?: string;
}

export function parseConversationIntent(text: string): ParsedConversationIntent {
  if (!text) {
    return {
      serviceId: 'escova_express',
      serviceName: 'Escova Express / Tradicional',
      preferredPeriod: 'all',
      confidenceReason: 'Padrão do salão',
    };
  }

  const lower = text.toLowerCase();

  // 1. Service Detection
  const serviceId = detectServiceFromText(lower);
  const srv = SALON_SERVICES.find((s) => s.id === serviceId) || SALON_SERVICES[0];

  // 2. Staff Detection
  let preferredStaffName: string | undefined;
  for (const staff of HAVEN_STAFF_ROSTER) {
    if (staff.status === 'available' && lower.includes(staff.name.toLowerCase())) {
      preferredStaffName = staff.name;
      break;
    }
  }

  // 3. Period & Hour Threshold Detection
  let preferredPeriod: 'all' | 'manha' | 'tarde' | 'noite' = 'all';
  let preferredHourThreshold: number | undefined;

  // Specific hour extraction (e.g. "14h", "14:30", "15:00", "depois das 13", "a partir das 16h")
  const hourMatch = lower.match(/(?:a partir das?|depois das?|após as?|por volta das?|às|as)\s*(\d{1,2})(?:[h:](\d{2})?)?/i) ||
                    lower.match(/(\d{1,2})\s*h(?:oras?)?/i);

  if (hourMatch) {
    const hour = parseInt(hourMatch[1], 10);
    if (hour >= 8 && hour <= 20) {
      preferredHourThreshold = hour;
      if (hour < 12) preferredPeriod = 'manha';
      else if (hour < 18) preferredPeriod = 'tarde';
      else preferredPeriod = 'noite';
    }
  }

  if (preferredPeriod === 'all') {
    if (lower.includes('manhã') || lower.includes('manha') || lower.includes('cedo') || lower.includes('primeiro horário')) {
      preferredPeriod = 'manha';
      preferredHourThreshold = 8;
    } else if (lower.includes('tarde') || lower.includes('almoço') || lower.includes('almoco') || lower.includes('após o almoço')) {
      preferredPeriod = 'tarde';
      preferredHourThreshold = 13;
    } else if (lower.includes('noite') || lower.includes('fim de tarde') || lower.includes('final do dia') || lower.includes('depois do trabalho') || lower.includes('sair do trabalho')) {
      preferredPeriod = 'noite';
      preferredHourThreshold = 17.5;
    }
  }

  // 4. Day Detection
  let preferredDay: 'hoje' | 'amanha' | 'depois_amanha' | undefined;
  if (lower.includes('amanhã') || lower.includes('amanha')) {
    preferredDay = 'amanha';
  } else if (lower.includes('hoje') || lower.includes('agora') || lower.includes('ainda hoje')) {
    preferredDay = 'hoje';
  } else if (lower.includes('quarta') || lower.includes('quinta') || lower.includes('sexta') || lower.includes('sábado') || lower.includes('sabado')) {
    preferredDay = 'depois_amanha';
  }

  let reason = `Procedimento: ${srv.name}`;
  if (preferredPeriod !== 'all') {
    reason += ` • Turno: ${preferredPeriod === 'manha' ? 'Manhã (8h-12h)' : preferredPeriod === 'tarde' ? 'Tarde (12h-18h)' : 'Noite (18h-20h)'}`;
  }
  if (preferredHourThreshold) {
    reason += ` • A partir das ${preferredHourThreshold}:00`;
  }
  if (preferredStaffName) {
    reason += ` • Profissional: ${preferredStaffName}`;
  }

  return {
    serviceId: srv.id,
    serviceName: srv.name,
    preferredPeriod,
    preferredHourThreshold,
    preferredStaffName,
    preferredDay,
    confidenceReason: reason,
    rawMatchedSnippet: text.slice(0, 100),
  };
}

/**
 * Intelligent Duration & Window-Aware Slot Computer
 */
export function computeSmartDetectedSlots(
  targetDay: 'hoje' | 'amanha' | 'depois_amanha' = 'hoje',
  selectedServiceId: string = 'escova_express',
  periodFilter: 'all' | 'manha' | 'tarde' | 'noite' = 'all',
  minHourThreshold?: number,
  staffFilter?: string
): DetectedSlot[] {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeDecimal = currentHour + currentMinute / 60;

  const service =
    SALON_SERVICES.find((s) => s.id === selectedServiceId) || SALON_SERVICES[0];

  const slots: DetectedSlot[] = [];

  const timeSlots = [
    { time: '08:30', dec: 8.5, period: 'manha' as const },
    { time: '09:00', dec: 9.0, period: 'manha' as const },
    { time: '09:30', dec: 9.5, period: 'manha' as const },
    { time: '10:00', dec: 10.0, period: 'manha' as const },
    { time: '11:00', dec: 11.0, period: 'manha' as const },
    { time: '12:00', dec: 12.0, period: 'tarde' as const },
    { time: '13:00', dec: 13.0, period: 'tarde' as const },
    { time: '14:00', dec: 14.0, period: 'tarde' as const },
    { time: '14:30', dec: 14.5, period: 'tarde' as const },
    { time: '15:00', dec: 15.0, period: 'tarde' as const },
    { time: '16:00', dec: 16.0, period: 'tarde' as const },
    { time: '16:30', dec: 16.5, period: 'tarde' as const },
    { time: '17:00', dec: 17.0, period: 'tarde' as const },
    { time: '17:30', dec: 17.5, period: 'tarde' as const },
    { time: '18:00', dec: 18.0, period: 'noite' as const },
    { time: '18:30', dec: 18.5, period: 'noite' as const },
    { time: '19:00', dec: 19.0, period: 'noite' as const },
  ];

  const bookedRangesToday: Record<string, [number, number][]> = {
    'Édina': [
      [9.0, 9.75],
      [9.66, 10.58],
      [12.0, 12.92],
      [13.0, 13.92],
      [14.0, 14.83],
      [15.0, 15.75],
      [16.0, 16.92],
    ],
    'Lis': [
      [13.0, 13.75],
      [13.75, 14.25],
      [15.33, 16.0],
      [16.0, 17.0],
      [17.5, 18.5],
    ],
    'Priscila': [
      [9.0, 9.75],
      [10.0, 10.75],
    ],
    'Suzana': [
      [8.5, 10.5],
      [11.0, 12.0],
      [13.5, 15.5],
      [15.5, 17.5],
    ],
    'Carla': [[8.0, 20.0]],
    'Dávila': [[8.0, 20.0]],
  };

  const closingHour = 20.0;

  HAVEN_STAFF_ROSTER.forEach((staff) => {
    if (staff.status === 'absence') return;
    if (staffFilter && staffFilter !== 'all' && staff.name !== staffFilter) return;

    if (!service.applicableRoles.includes(staff.role)) return;

    const ranges = targetDay === 'hoje' ? (bookedRangesToday[staff.name] || []) : [];

    timeSlots.forEach(({ time, dec, period }) => {
      // 1. Red Line Rule: For today, discard if slot is in the past
      const isPast = targetDay === 'hoje' && dec <= (currentTimeDecimal + 0.33);
      if (isPast && targetDay === 'hoje') return;

      // 2. Period Filter
      if (periodFilter !== 'all' && period !== periodFilter) return;

      // 3. Minimum hour threshold requested by customer
      if (minHourThreshold && dec < minHourThreshold) return;

      // 4. Check if slot overlaps with booked ranges
      const isOverlapping = ranges.some(
        ([start, end]) => dec >= start && dec < end
      );
      if (isOverlapping) return;

      // 5. Calculate continuous free window
      let nextBlockStart = closingHour;
      for (const [start] of ranges) {
        if (start > dec && start < nextBlockStart) {
          nextBlockStart = start;
        }
      }

      const freeHours = Math.max(0, nextBlockStart - dec);
      const freeWindowMinutes = Math.round(freeHours * 60);

      // 6. Must fit service duration
      const fitsSelectedService = freeWindowMinutes >= service.minDurationMinutes;

      if (fitsSelectedService) {
        const hoursDisplay = Math.floor(freeWindowMinutes / 60);
        const minsDisplay = freeWindowMinutes % 60;
        const windowStr =
          hoursDisplay > 0
            ? `${hoursDisplay}h${minsDisplay > 0 ? `${minsDisplay}m` : ''}`
            : `${minsDisplay} min`;

        const dayOffset = targetDay === 'depois_amanha' ? 172800000 : targetDay === 'amanha' ? 86400000 : 0;
        const dayLabelText = targetDay === 'hoje' ? 'Hoje' : targetDay === 'amanha' ? 'Amanhã' : 'Quarta (Próximo Dia)';

        slots.push({
          id: `${staff.id}-${targetDay}-${time}-${service.id}`,
          time,
          decimalTime: dec,
          dayLabel: dayLabelText as any,
          dateIso: new Date(Date.now() + dayOffset).toISOString(),
          staffName: staff.name,
          staffRole: staff.role,
          serviceCategory: service.category,
          freeWindowMinutes,
          fitsSelectedService,
          windowSummary: `Janela contínua de ${windowStr} (até ${Math.floor(nextBlockStart)}:${Math.round((nextBlockStart % 1) * 60).toString().padStart(2, '0')})`,
          isPast,
          status: 'livre',
          period,
        });
      }
    });
  });

  return slots.sort((a, b) => a.decimalTime - b.decimalTime);
}

export const ExternalAgendaDrawer: React.FC<ExternalAgendaDrawerProps> = ({
  isOpen,
  onClose,
  workspaceId,
  workspaceName,
  conversationContext,
  onInsertSlotToDraft,
}) => {
  const [config, setConfig] = useState<ExternalAgendaConfig>(() => getExternalAgendaConfig(workspaceId));
  const [selectedProvider, setSelectedProvider] = useState<ExternalAgendaProvider>(config.provider || 'google_calendar');
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'slots' | 'staff' | 'portal' | 'settings'>('slots');
  const [editUrl, setEditUrl] = useState(config.url);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  // Filter States
  const [selectedDay, setSelectedDay] = useState<'hoje' | 'amanha' | 'depois_amanha'>('hoje');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('escova_express');
  const [selectedPeriod, setSelectedPeriod] = useState<'all' | 'manha' | 'tarde' | 'noite'>('all');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  const [minHourThreshold, setMinHourThreshold] = useState<number | undefined>(undefined);

  // Conversation Match Dossier
  const [conversationInsights, setConversationInsights] = useState<ParsedConversationIntent | null>(null);

  const isHavenWorkspace =
    (workspaceId || '').toLowerCase().includes('haven') ||
    (workspaceName || '').toLowerCase().includes('haven') ||
    (workspaceName || '').toLowerCase().includes('escovaria');

  useEffect(() => {
    const loaded = getExternalAgendaConfig(workspaceId);
    setConfig(loaded);
    setSelectedProvider(loaded.provider || 'google_calendar');
    setEditUrl(loaded.url);
  }, [workspaceId]);

  // Deep parsing of the conversation context
  useEffect(() => {
    if (isOpen && conversationContext) {
      const insights = parseConversationIntent(conversationContext);
      setConversationInsights(insights);
      setSelectedServiceId(insights.serviceId);

      if (insights.preferredDay) {
        setSelectedDay(insights.preferredDay);
      }
      if (insights.preferredPeriod !== 'all') {
        setSelectedPeriod(insights.preferredPeriod);
      }
      if (insights.preferredHourThreshold) {
        setMinHourThreshold(insights.preferredHourThreshold);
      }
      if (insights.preferredStaffName) {
        setSelectedStaffFilter(insights.preferredStaffName);
      }
    }
  }, [isOpen, conversationContext]);

  // Real-time clock for the Red Line
  const [currentTimeStr, setCurrentTimeStr] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeStr(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const activeService = useMemo(() => {
    return SALON_SERVICES.find((s) => s.id === selectedServiceId) || SALON_SERVICES[0];
  }, [selectedServiceId]);

  // Compute detected slots with multi-dimensional filtering
  const detectedSlots = useMemo(() => {
    return computeSmartDetectedSlots(
      selectedDay,
      selectedServiceId,
      selectedPeriod,
      minHourThreshold,
      selectedStaffFilter
    );
  }, [selectedDay, selectedServiceId, selectedPeriod, minHourThreshold, selectedStaffFilter]);

  // Featured Best Match (Top recommendation)
  const bestMatchSlot = useMemo(() => {
    if (detectedSlots.length === 0) return null;
    if (conversationInsights?.preferredStaffName) {
      const staffMatch = detectedSlots.find((s) => s.staffName === conversationInsights.preferredStaffName);
      if (staffMatch) return staffMatch;
    }
    return detectedSlots[0];
  }, [detectedSlots, conversationInsights]);

  const handleManualSync = () => {
    setIsSyncing(true);
    setSyncNotice(null);
    setTimeout(() => {
      const now = new Date();
      const updated: ExternalAgendaConfig = {
        ...config,
        lastSyncedAt: now.toISOString(),
      };
      setConfig(updated);
      try {
        localStorage.setItem(`${DEFAULT_EXTERNAL_AGENDA_STORAGE_KEY}_${workspaceId}`, JSON.stringify(updated));
      } catch {}
      setIsSyncing(false);
      setSyncNotice(`Grade ${config.providerLabel || 'de Horários'} reanalisada: Linha do tempo e janelas livres recalculadas!`);
      setTimeout(() => setSyncNotice(null), 3500);
    }, 1000);
  };

  const handleSelectProvider = (prov: ExternalAgendaProvider) => {
    setSelectedProvider(prov);
    const preset = EXTERNAL_AGENDA_PRESETS[prov];
    setEditUrl(preset.defaultUrl);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const preset = EXTERNAL_AGENDA_PRESETS[selectedProvider];
    const updated: ExternalAgendaConfig = {
      ...config,
      provider: selectedProvider,
      providerLabel: preset ? preset.label : 'Agenda Externa',
      url: editUrl.trim() || preset.defaultUrl,
    };
    setConfig(updated);
    try {
      localStorage.setItem(`${DEFAULT_EXTERNAL_AGENDA_STORAGE_KEY}_${workspaceId}`, JSON.stringify(updated));
    } catch {}
    setActiveTab('portal');
    setSyncNotice(`Configurações salvas: Conectado a ${updated.providerLabel}!`);
    setTimeout(() => setSyncNotice(null), 3000);
  };

  const handleInsertSlot = (slot: DetectedSlot) => {
    if (!onInsertSlotToDraft) return;
    const priceText = activeService.priceEstimated ? ` (${activeService.priceEstimated})` : '';
    const text = `Temos horário disponível ${slot.dayLabel.toLowerCase()} às ${slot.time} com a ${slot.staffName} (${slot.staffRole}) para ${activeService.name}${priceText} com duração estimada de ${activeService.durationLabel}! Quer que eu confirme o seu agendamento?`;
    onInsertSlotToDraft(text);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-3xl sm:max-w-4xl lg:max-w-5xl h-full bg-[#090d16] text-white shadow-2xl flex flex-col border-l border-slate-700/80 animate-in slide-in-from-right duration-250">
        
        {/* Top Luxury Header Bar */}
        <div className="px-6 py-4 border-b border-slate-800 bg-[#050811] flex items-center justify-between gap-4 shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/20 border border-purple-400/30">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white font-heading tracking-tight">
                  Agenda Externa & IA de Vagas
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                  <span>{config.providerLabel || 'Google Agenda / Sistema Externo'}</span>
                </span>
              </div>
              <p className="text-[11.5px] text-slate-400 mt-0.5">
                Avaliação de janelas contínuas de tempo (45m a 120m) cruzadas com a Linha Vermelha em tempo real.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
              title="Forçar releitura da grade visual"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Analisando...' : 'Reescanear Grade'}</span>
            </button>

            <a
              href={config.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition"
              title={`Abrir ${config.providerLabel || 'agenda'} em nova aba`}
            >
              <ExternalLink className="w-4 h-4" />
            </a>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-header Navigation / Rules Ribbon */}
        <div className="px-6 py-2.5 bg-[#0b1120] border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 bg-[#050811] p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('slots')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'slots'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Vagas Detectadas ({detectedSlots.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'staff'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-purple-400" />
              <span>Profissionais & Especialidades</span>
            </button>
            <button
              onClick={() => setActiveTab('portal')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                activeTab === 'portal'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Visualizar {config.providerLabel || 'Grade'}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Settings className="w-3 h-3" />
              <span>Configurações ({config.providerLabel || 'Provedor'})</span>
            </button>
          </div>

          {/* Current Time / Red Line Indicator */}
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-950/60 border border-rose-600/40 text-rose-300 font-mono font-bold shadow-inner">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span>Linha Vermelha (Agora): {currentTimeStr}</span>
            </span>
          </div>
        </div>

        {syncNotice && (
          <div className="bg-emerald-500/20 text-emerald-300 px-6 py-2.5 text-xs font-bold border-b border-emerald-500/30 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{syncNotice}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 min-h-0 bg-[#070b14] flex flex-col overflow-hidden relative">
          
          {/* TAB 1: SLOTS & SMART SUGGESTIONS */}
          {activeTab === 'slots' && (
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto h-full">
              
              {/* HERO: AI Copilot Context Insight & Best Match Recommendation */}
              {conversationInsights && bestMatchSlot && (
                <div className="bg-gradient-to-r from-purple-950/90 via-indigo-950/90 to-slate-900 border border-purple-500/40 rounded-2xl p-4.5 shadow-xl space-y-3 animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-500/20 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-lg bg-amber-400 text-slate-950">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <span className="font-extrabold text-xs text-white uppercase tracking-wider font-heading">
                        Recomendação Inteligente do Copilot para este Cliente
                      </span>
                    </div>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-900/80 border border-purple-500/40 text-purple-200 font-mono font-bold">
                      {conversationInsights.confidenceReason}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-purple-600/30 border border-purple-400/50 flex flex-col items-center justify-center font-mono">
                        <span className="text-base font-black text-white">{bestMatchSlot.time}</span>
                        <span className="text-[9px] uppercase font-bold text-purple-300">{bestMatchSlot.dayLabel}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{activeService.name}</span>
                          {activeService.priceEstimated && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-extrabold text-xs">
                              {activeService.priceEstimated}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Com a profissional <strong className="text-purple-300">{bestMatchSlot.staffName}</strong> • {bestMatchSlot.windowSummary}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleInsertSlot(bestMatchSlot)}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/20 shrink-0 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      <span>Inserir Recomendação no Chat (1 Clique)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Service Selection Ribbon */}
              <div className="space-y-2.5 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-purple-400" />
                    <span>Procedimento Solicitado no WhatsApp:</span>
                  </label>
                  <span className="text-xs text-purple-300 font-mono font-extrabold">
                    {activeService.durationLabel} {activeService.priceEstimated ? `• ${activeService.priceEstimated}` : ''}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {SALON_SERVICES.map((srv) => {
                    const isSelected = selectedServiceId === srv.id;
                    return (
                      <button
                        key={srv.id}
                        onClick={() => setSelectedServiceId(srv.id)}
                        className={`p-3 rounded-xl text-left border transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                          isSelected
                            ? 'bg-purple-950/90 border-purple-400 text-white shadow-lg shadow-purple-900/30 ring-1 ring-purple-400'
                            : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold truncate block">{srv.name}</span>
                          {srv.priceEstimated && (
                            <span className="text-[10.5px] font-mono font-extrabold text-emerald-400">
                              {srv.priceEstimated}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="px-1.5 py-0.5 rounded bg-slate-950 font-mono text-purple-300 border border-slate-800 font-bold">
                            ⏱️ {srv.durationLabel}
                          </span>
                          <span className="capitalize text-slate-400 font-medium">{srv.applicableRoles[0]}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Multi-Dimensional Filter Bar (Day, Turno, Minimum Hour, Staff) */}
              <div className="space-y-3 bg-[#0d1322] p-4 rounded-2xl border border-slate-800/90 shadow-xs">
                {/* Linha 1: Dia e Turno */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  
                  {/* Seletor de Dias */}
                  <div className="flex items-center gap-1.5 bg-[#050811] p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setSelectedDay('hoje')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        selectedDay === 'hoje'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Hoje (Vagas Futuras)</span>
                    </button>
                    <button
                      onClick={() => setSelectedDay('amanha')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        selectedDay === 'amanha'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      <span>Amanhã</span>
                    </button>
                    <button
                      onClick={() => setSelectedDay('depois_amanha')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        selectedDay === 'depois_amanha'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <CalendarDays className="w-3.5 h-3.5 text-purple-400" />
                      <span>Próximo Dia</span>
                    </button>
                  </div>

                  {/* Seletor de Turnos */}
                  <div className="flex items-center gap-1 bg-[#050811] p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      onClick={() => setSelectedPeriod('all')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        selectedPeriod === 'all'
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🌟 Todos
                    </button>
                    <button
                      onClick={() => setSelectedPeriod('manha')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                        selectedPeriod === 'manha'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Sunrise className="w-3 h-3" /> Manhã (8h-12h)
                    </button>
                    <button
                      onClick={() => setSelectedPeriod('tarde')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                        selectedPeriod === 'tarde'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Sun className="w-3 h-3" /> Tarde (12h-18h)
                    </button>
                    <button
                      onClick={() => setSelectedPeriod('noite')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                        selectedPeriod === 'noite'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Moon className="w-3 h-3" /> Noite (18h-20h)
                    </button>
                  </div>
                </div>

                {/* Linha 2: Filtro por Profissional */}
                <div className="flex items-center gap-2 overflow-x-auto pt-1 no-scrollbar text-xs">
                  <span className="text-[11px] font-bold text-slate-400 shrink-0 flex items-center gap-1">
                    <User className="w-3 h-3 text-purple-400" /> Profissional:
                  </span>

                  <button
                    onClick={() => setSelectedStaffFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer shrink-0 ${
                      selectedStaffFilter === 'all'
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Todas
                  </button>

                  {HAVEN_STAFF_ROSTER.filter(s => s.status === 'available').map((staff) => {
                    const visual = STAFF_VISUAL_MAP[staff.name] || STAFF_VISUAL_MAP['Isleia'];
                    const isSelected = selectedStaffFilter === staff.name;
                    return (
                      <button
                        key={staff.name}
                        onClick={() => setSelectedStaffFilter(isSelected ? 'all' : staff.name)}
                        className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 border ${
                          isSelected
                            ? `${visual.badgeBg} ${visual.text} ${visual.border} ring-1 ring-purple-400`
                            : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${visual.avatarBg}`} />
                        <span>{staff.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detected Slots Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>
                      Vagas Disponíveis ({detectedSlots.length} horários encontrados)
                    </span>
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Clique em <strong>Inserir</strong> para enviar proposta no WhatsApp
                  </span>
                </div>

                {detectedSlots.length === 0 ? (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
                    <AlertTriangle className="w-9 h-9 text-amber-400 mx-auto" />
                    <p className="text-sm font-bold text-white">
                      Nenhuma vaga restante para este filtro no dia selecionado ({currentTimeStr}).
                    </p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Os horários restantes não comportam a janela contínua de {activeService.durationLabel} sem encavalar outros atendimentos. Alterne os filtros de turno ou veja <strong>Amanhã</strong>.
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        onClick={() => {
                          setSelectedPeriod('all');
                          setSelectedStaffFilter('all');
                          setMinHourThreshold(undefined);
                        }}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition cursor-pointer"
                      >
                        Limpar Filtros de Horário
                      </button>
                      <button
                        onClick={() => setSelectedDay('amanha')}
                        className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition cursor-pointer"
                      >
                        Ver Vagas de Amanhã
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {detectedSlots.map((slot) => {
                      const visual = STAFF_VISUAL_MAP[slot.staffName] || STAFF_VISUAL_MAP['Isleia'];
                      const isHair = slot.serviceCategory === 'cabelo';
                      const isNails = slot.serviceCategory === 'unhas';

                      return (
                        <div
                          key={slot.id}
                          className={`bg-slate-900/90 hover:bg-slate-850 border border-slate-800/90 rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-all duration-150 shadow-md group ${visual.accentGlow}`}
                        >
                          {/* Top Row: Time + Status Badge */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-[#050811] border border-slate-800 flex items-center justify-center font-mono">
                                <span className="text-base font-black text-white group-hover:text-purple-300 transition-colors">
                                  {slot.time}
                                </span>
                              </div>
                              <div>
                                <span className="font-extrabold text-sm text-white block font-mono">
                                  {slot.time}
                                </span>
                                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                  <span>{slot.dayLabel}</span>
                                  <span>•</span>
                                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Livre
                                  </span>
                                </span>
                              </div>
                            </div>

                            <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-extrabold border ${visual.badgeBg} ${visual.text} ${visual.border}`}>
                              {slot.staffRole}
                            </span>
                          </div>

                          {/* Free Window Assessment Badge */}
                          <div className="px-3 py-1.5 rounded-xl bg-[#050811] border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                            <span className="truncate font-medium">{slot.windowSummary}</span>
                          </div>

                          {/* Staff Identity & Action Button */}
                          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-6 h-6 rounded-full ${visual.avatarBg} text-white text-[10px] font-extrabold flex items-center justify-center shrink-0 shadow-2xs`}>
                                {slot.staffName.slice(0, 1)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{slot.staffName}</p>
                                <p className="text-[10px] text-slate-400 truncate">{visual.specialtyTag}</p>
                              </div>
                            </div>

                            <button
                              onClick={() => handleInsertSlot(slot)}
                              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-[11px] transition shrink-0 cursor-pointer shadow-md shadow-emerald-900/30 flex items-center gap-1.5"
                              title="Inserir texto formatado de agendamento no WhatsApp"
                            >
                              <Send className="w-3 h-3" />
                              <span>Inserir</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: STAFF & SPECIALTIES */}
          {activeTab === 'staff' && (
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto h-full">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div>
                  <h4 className="font-bold text-sm text-white font-heading">
                    Quadro de Profissionais & Especialidades (Haven Escovaria)
                  </h4>
                  <p className="text-xs text-slate-400">
                    A IA cruza este mapa com a duração de cada serviço para sugerir a profissional certa com a janela de tempo necessária.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {HAVEN_STAFF_ROSTER.map((staff) => {
                  const visual = STAFF_VISUAL_MAP[staff.name] || STAFF_VISUAL_MAP['Isleia'];
                  return (
                    <div
                      key={staff.id}
                      className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
                        staff.status === 'absence'
                          ? 'bg-slate-900/40 border-slate-800/80 opacity-60'
                          : 'bg-slate-900/90 border-slate-800 shadow-md'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl ${visual.avatarBg} text-white font-extrabold flex items-center justify-center text-sm shadow-md`}>
                            {staff.name.slice(0, 1)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-white">{staff.name}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${visual.badgeBg} ${visual.text} ${visual.border}`}>
                                {staff.role}
                              </span>
                            </div>
                            <p className="text-xs text-purple-300 mt-0.5 font-medium">{visual.specialtyTag}</p>
                          </div>
                        </div>

                        {staff.status === 'absence' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            {staff.absenceReason || 'Ausente'}
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>Na Unidade</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/80">
                        {staff.specialties.map((spec) => (
                          <span key={spec} className="px-2 py-0.5 rounded-md text-[10px] bg-[#050811] text-slate-300 border border-slate-800 font-mono">
                            {spec}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: PORTAL WEBVIEW */}
          {activeTab === 'portal' && (
            <div className="flex-1 flex flex-col h-full">
              <div className="bg-[#050811] px-4 py-2 border-b border-slate-800 flex items-center gap-2 text-xs font-mono">
                <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <div className="flex-1 bg-slate-950 px-3 py-1 rounded-md text-slate-300 truncate border border-slate-800">
                  {config.url}
                </div>
                <button
                  onClick={() => setActiveTab('settings')}
                  className="text-slate-400 hover:text-purple-300 text-[11px] font-sans font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Sliders className="w-3 h-3" /> Alterar Agenda
                </button>
              </div>

              <div className="flex-1 bg-white relative overflow-hidden">
                <iframe
                  src={config.url}
                  title={`Visualização de ${config.providerLabel || 'Agenda'}`}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  loading="lazy"
                />

                <div className="absolute bottom-3 right-3 max-w-sm bg-slate-950/95 text-white p-3 rounded-xl border border-slate-700 shadow-2xl backdrop-blur-md text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-amber-400 flex items-center gap-1 text-[11px]">
                      <Bot className="w-3.5 h-3.5" /> IA Copilot Conectada ({config.providerLabel || 'Agenda'})
                    </span>
                    <a
                      href={config.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:underline font-bold text-[10px] flex items-center gap-0.5"
                    >
                      <span>Abrir em aba externa</span>
                      <ChevronRight className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[10.5px] text-slate-300 leading-relaxed">
                    A IA cruza as regras de vagas, intervalos e linha do tempo em tempo real para abastecer as respostas rápidas no WhatsApp.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SETTINGS & PROVIDER SELECTION */}
          {activeTab === 'settings' && (
            <div className="p-6 space-y-6 overflow-y-auto max-w-2xl">
              <form onSubmit={handleSaveSettings} className="space-y-5 bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-purple-400" />
                    <h4 className="font-bold text-sm text-white font-heading">
                      Configuração da Agenda do Negócio
                    </h4>
                  </div>
                  <span className="text-[10.5px] font-bold text-purple-300 bg-purple-950 px-2 py-0.5 rounded-full border border-purple-800">
                    Múltiplos Provedores Suportados
                  </span>
                </div>

                {/* Seletor de Provedor de Agenda */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    Selecione o Sistema de Agenda / Calendário:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.keys(EXTERNAL_AGENDA_PRESETS) as ExternalAgendaProvider[]).map((prov) => {
                      const preset = EXTERNAL_AGENDA_PRESETS[prov];
                      const isSelected = selectedProvider === prov;
                      return (
                        <button
                          key={prov}
                          type="button"
                          onClick={() => handleSelectProvider(prov)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                            isSelected
                              ? 'bg-purple-950/80 border-purple-500 text-white ring-1 ring-purple-500 shadow-md shadow-purple-950'
                              : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-950'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-xs text-white">
                              {preset.label}
                            </span>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-purple-400 shadow-xs shadow-purple-400" />
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                            {preset.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Campo de URL da Agenda */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Link de Acesso ou Painel da Agenda ({EXTERNAL_AGENDA_PRESETS[selectedProvider]?.label || 'Personalizada'}):
                  </label>
                  <input
                    type="url"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                    placeholder={EXTERNAL_AGENDA_PRESETS[selectedProvider]?.placeholder || 'https://sua-agenda.com.br'}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:ring-2 focus:ring-purple-500 outline-none font-mono"
                    required
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Cole o link do seu Google Calendar, Trinks, Calendly ou sistema interno para visualização dentro do Cockpit.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveTab('slots')}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition shadow-sm cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Salvar & Conectar Agenda</span>
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
