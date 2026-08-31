/**
 * Workspace Commercial Configuration Service.
 *
 * In demo mode this module may provide fixture defaults for the visual
 * prototype. In API mode it is deliberately empty until the authenticated
 * operational-settings endpoint hydrates it; a browser must never invent a
 * Pix key, price, address or provider for a real workspace.
 */

import { salesOsRuntimeConfig } from '../config/runtime';

export type AgendaProviderType = 'google_calendar' | 'trinks' | 'calendly' | 'avec' | 'simples_agenda' | 'custom';

export interface WorkspaceCommercialConfig {
  workspaceId: string;
  businessName: string;
  businessType: 'hair_salon' | 'clinic' | 'consulting' | 'b2b_sales' | 'auto_film' | 'general';
  agendaProviderType?: AgendaProviderType;
  agendaProviderName: string;
  agendaUrl?: string;
  pixKey: string;
  pixReceiverName: string;
  businessAddress: string;
  customMacros: Array<{
    id: string;
    label: string;
    template: string;
  }>;
}

const STORAGE_PREFIX = 'sos_workspace_commercial_config_';
const memoryConfig = new Map<string, WorkspaceCommercialConfig>();

function emptyConfig(workspaceId: string): WorkspaceCommercialConfig {
  return {
    workspaceId,
    businessName: '',
    businessType: 'general',
    agendaProviderName: '',
    pixKey: '',
    pixReceiverName: '',
    businessAddress: '',
    customMacros: [],
  };
}

function demoConfig(workspaceId: string): WorkspaceCommercialConfig {
  const safeId = (workspaceId || 'default').toLowerCase();
  const isHaven = safeId.includes('escovaria') || safeId.includes('haven');

  if (isHaven) {
    return {
      workspaceId,
      businessName: 'Haven Escovaria & Esmalteria',
      businessType: 'hair_salon',
      agendaProviderType: 'trinks',
      agendaProviderName: 'Trinks (Haven)',
      agendaUrl: 'https://www.trinks.com/havenescovaria/admin',
      pixKey: 'pix@havenescovaria.com.br',
      pixReceiverName: 'Haven Escovaria Eireli',
      businessAddress: 'Chapecó, SC',
      customMacros: [
        {
          id: 'pix',
          label: '💰 Pix & Sinal',
          template: 'Segue nossa chave Pix oficial para confirmação do seu horário na Haven: pix@havenescovaria.com.br. Assim que fizer o envio, me manda o comprovante aqui, {{nome}}! ✨',
        },
        {
          id: 'horarios',
          label: '📅 Horários Trinks',
          template: 'Oi {{nome}}! Conferi nossa grade e temos vagas livres hoje às {{horarios}}. Qual dessas opções fica melhor para você?',
        },
        {
          id: 'oferta',
          label: '🏷️ Oferta Escova',
          template: 'Oi {{nome}}! A nossa Escova Tradicional com lavagem especial e massagem capilar está por apenas R$ 59 hoje. Vamos garantir seu horário?',
        },
        {
          id: 'localizacao',
          label: '📍 Localização',
          template: 'Ficamos localizados no centro de Chapecó, com estacionamento exclusivo para clientes. Quer que eu te envie a rota no Google Maps?',
        },
      ],
    };
  }

  return {
    workspaceId,
    businessName: 'SOS Sales Comercial',
    businessType: 'general',
    agendaProviderType: 'google_calendar',
    agendaProviderName: 'Google Agenda',
    agendaUrl: 'https://calendar.google.com/calendar/u/0/r',
    pixKey: 'pix@salesos.com.br',
    pixReceiverName: 'SOS Sales Inteligência Comercial',
    businessAddress: 'Brasil',
    customMacros: [
      {
        id: 'pix',
        label: '💰 Pix & Confirmação',
        template: 'Segue nossa chave Pix oficial para confirmação: pix@salesos.com.br. Assim que fizer o envio, me manda o comprovante aqui, {{nome}}!',
      },
      {
        id: 'horarios',
        label: '📅 Horários Livres',
        template: 'Oi {{nome}}! Conferi nossa agenda e temos horários livres hoje às {{horarios}}. Qual dessas opções fica melhor para você?',
      },
      {
        id: 'oferta',
        label: '🏷️ Condição Especial',
        template: 'Oi {{nome}}! Conseguimos uma condição especial exclusiva para o seu atendimento hoje. Posso reservar sua vaga agora?',
      },
      {
        id: 'localizacao',
        label: '📍 Localização & Rota',
        template: 'Estamos à disposição para te receber! Segue o link com nossa localização no mapa.',
      },
    ],
  };
}

export function normalizeWorkspaceCommercialConfig(
  workspaceId: string,
  value: Record<string, unknown> | null | undefined,
): WorkspaceCommercialConfig {
  const source = value && typeof value === 'object' ? value : {};
  const macros = Array.isArray(source.customMacros)
    ? source.customMacros.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: String(item.id || '').trim(),
        label: String(item.label || '').trim(),
        template: String(item.template || '').trim(),
      }))
      .filter((item) => item.id && item.label && item.template)
    : [];
  const result: WorkspaceCommercialConfig = {
    ...emptyConfig(workspaceId),
    businessName: typeof source.businessName === 'string' ? source.businessName.trim() : '',
    businessType: ['hair_salon', 'clinic', 'consulting', 'b2b_sales', 'auto_film', 'general'].includes(String(source.businessType))
      ? source.businessType as WorkspaceCommercialConfig['businessType']
      : 'general',
    agendaProviderType: ['google_calendar', 'trinks', 'calendly', 'avec', 'simples_agenda', 'custom'].includes(String(source.agendaProviderType))
      ? source.agendaProviderType as AgendaProviderType
      : undefined,
    agendaProviderName: typeof source.agendaProviderName === 'string' ? source.agendaProviderName.trim() : '',
    agendaUrl: typeof source.agendaUrl === 'string' ? source.agendaUrl.trim() : undefined,
    pixKey: typeof source.pixKey === 'string' ? source.pixKey.trim() : '',
    pixReceiverName: typeof source.pixReceiverName === 'string' ? source.pixReceiverName.trim() : '',
    businessAddress: typeof source.businessAddress === 'string' ? source.businessAddress.trim() : '',
    customMacros: macros,
  };
  return result;
}

export const AGENDA_PROVIDER_PRESETS: Record<AgendaProviderType, { label: string; defaultUrl: string; placeholder: string }> = {
  google_calendar: {
    label: 'Google Agenda',
    defaultUrl: 'https://calendar.google.com/calendar/u/0/r',
    placeholder: 'https://calendar.google.com/calendar/u/0/r ou link de agendamento',
  },
  trinks: {
    label: 'Trinks',
    defaultUrl: 'https://www.trinks.com/havenescovaria/admin',
    placeholder: 'https://www.trinks.com/seusalao/admin',
  },
  calendly: {
    label: 'Calendly',
    defaultUrl: 'https://calendly.com',
    placeholder: 'https://calendly.com/sua-empresa',
  },
  avec: {
    label: 'Avec / Beauty Date',
    defaultUrl: 'https://avec.me',
    placeholder: 'https://avec.me/seusalao',
  },
  simples_agenda: {
    label: 'Simples Agenda',
    defaultUrl: 'https://simplesagenda.com.br',
    placeholder: 'https://app.simplesagenda.com.br',
  },
  custom: {
    label: 'Agenda Própria / Web',
    defaultUrl: 'https://agenda.iaparavendas.tech',
    placeholder: 'https://sua-agenda.com.br',
  },
};

export function getWorkspaceCommercialConfig(workspaceId: string): WorkspaceCommercialConfig {
  const safeId = (workspaceId || 'default').toLowerCase();

  const cached = memoryConfig.get(safeId);
  if (cached) return JSON.parse(JSON.stringify(cached));

  if (salesOsRuntimeConfig.mode !== 'demo') {
    return emptyConfig(workspaceId);
  }

  try {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}${safeId}`);
    if (saved) {
      const parsed = normalizeWorkspaceCommercialConfig(workspaceId, JSON.parse(saved));
      memoryConfig.set(safeId, parsed);
      return JSON.parse(JSON.stringify(parsed));
    }
  } catch (e) {
    console.error('Error reading commercial config from storage:', e);
  }

  const initial = demoConfig(workspaceId);
  memoryConfig.set(safeId, initial);
  return JSON.parse(JSON.stringify(initial));
}

export function hydrateWorkspaceCommercialConfig(
  workspaceId: string,
  value: Record<string, unknown> | null | undefined,
): WorkspaceCommercialConfig {
  const safeId = (workspaceId || 'default').toLowerCase();
  const normalized = normalizeWorkspaceCommercialConfig(workspaceId, value);
  memoryConfig.set(safeId, normalized);
  return JSON.parse(JSON.stringify(normalized));
}

export function saveWorkspaceCommercialConfig(
  workspaceId: string,
  config: WorkspaceCommercialConfig
): void {
  const safeId = (workspaceId || config.workspaceId || 'default').toLowerCase();
  memoryConfig.set(safeId, normalizeWorkspaceCommercialConfig(workspaceId, config as unknown as Record<string, unknown>));
  if (salesOsRuntimeConfig.mode !== 'demo') {
    console.warn('Commercial settings are API-owned in production; use the authenticated operational-settings endpoint.');
    return;
  }
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${safeId}`, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving commercial config to storage:', e);
  }
}
