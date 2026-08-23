/**
 * Workspace Commercial Configuration Service
 * Provides tenant-isolated settings for ERP/Agenda provider, Pix keys, addresses, and customizable macros.
 */

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
  
  try {
    const saved = localStorage.getItem(`${STORAGE_PREFIX}${safeId}`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error reading commercial config from storage:', e);
  }

  // Smart defaults based on workspace identity
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

  // Universal default for other clients (Google Agenda as default)
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

export function saveWorkspaceCommercialConfig(
  workspaceId: string,
  config: WorkspaceCommercialConfig
): void {
  const safeId = (workspaceId || config.workspaceId || 'default').toLowerCase();
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${safeId}`, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving commercial config to storage:', e);
  }
}

