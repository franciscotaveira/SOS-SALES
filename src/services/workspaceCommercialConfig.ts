/**
 * Workspace Commercial Configuration Service
 * Provides tenant-isolated settings for ERP/Agenda provider, Pix keys, addresses, and customizable macros.
 */

export interface WorkspaceCommercialConfig {
  workspaceId: string;
  businessName: string;
  businessType: 'hair_salon' | 'clinic' | 'consulting' | 'b2b_sales' | 'auto_film' | 'general';
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
      agendaProviderName: 'Trinks',
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

  // Universal default for other clients
  return {
    workspaceId,
    businessName: 'SOS Sales Comercial',
    businessType: 'general',
    agendaProviderName: 'Agenda & Vagas',
    agendaUrl: 'https://agenda.iaparavendas.tech',
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
        label: '📍 Endereço & Contato',
        template: 'Atendemos com hora marcada e suporte completo. Gostaria de agendar uma demonstração ou atendimento presencial, {{nome}}?',
      },
    ],
  };
}

export function saveWorkspaceCommercialConfig(
  workspaceId: string,
  config: WorkspaceCommercialConfig
): void {
  const safeId = (workspaceId || 'default').toLowerCase();
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${safeId}`, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving commercial config to storage:', e);
  }
}
