import React from 'react';
import { salesOsRuntimeConfig } from '../../config/runtime';
import { Workspace } from '../../types/cockpit';
import { authenticatedFetch } from '../../services/authenticatedFetch';
import { ClientIntelligenceBundle } from '../../types/intelligence';
import { CompanyProfileSection } from './CompanyProfileSection';
import { AgentSettingsSection } from './AgentSettingsSection';
import { ProductCatalogSection } from './ProductCatalogSection';
import { AgentKnowledgeBaseSection } from './AgentKnowledgeBaseSection';
import { ContinuousLearningSection } from './ContinuousLearningSection';
import { HistoricalDiagnosisSection } from './HistoricalDiagnosisSection';
import { QaSimulatorView } from './QaSimulatorView';
import { AiAssuranceAuditView } from './AiAssuranceAuditView';
import {
  Building2,
  ShoppingBag,
  Brain,
  Radio,
  TrendingUp,
  Award,
  Bot,
  Layers,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Users,
  ChevronDown,
  Save,
  Loader2,
  Zap,
  FileText,
} from 'lucide-react';

import { SalesAiThesisConfig } from '../settings/SalesAiThesisConfig';

interface ClientAgentHubViewProps {
  currentWorkspace: Workspace;
  workspaces: Workspace[];
  onSelectWorkspace: (ws: Workspace) => void;
  activeSubTab?: IntelligenceTab;
  onChangeSubTab?: (tab: IntelligenceTab) => void;
  canManage?: boolean;
}

export type IntelligenceTab =
  | 'profile'
  | 'thesis'
  | 'diagnosis'
  | 'knowledge'
  | 'catalog'
  | 'simulator'
  | 'assurance'
  | 'learning'
  | 'agent';

export function resolveWorkspaceIntelligenceBundle(wsId: string, wsName?: string): ClientIntelligenceBundle {
  const normId = (wsId || '').toLowerCase().trim();
  const normName = (wsName || '').toLowerCase().trim();

  const isHaven = normId === '22222222-2222-2222-2222-222222222222' || normId === 'ws-haven-beauty' || normName.includes('haven') || normName.includes('escovaria');
  const isSora = normId === '33333333-3333-3333-3333-333333333333' || normId === 'ws-sora-spa' || normName.includes('sora') || normName.includes('headspa');

  if (isHaven) {
    return {
      workspaceId: wsId,
      companyProfile: {
        legalName: 'Haven Escovaria & Esmalteria LTDA',
        tradeName: 'Haven Escovaria & Esmalteria',
        taxId: '48.912.441/0001-89',
        segment: 'Escovaria e Salão de Beleza Premium',
        tagline: 'A beleza do seu momento sem hora marcada em Chapecó',
        phone: '+55 49 8837-0054',
        email: 'contato@havenescovaria.com.br',
        website: 'https://www.trinks.com/haven-escovaria',
        instagram: '@havenescovaria',
        address: { street: 'Rua Benjamin Constant', number: '200 D', neighborhood: 'Centro', city: 'Chapecó', state: 'SC', postalCode: '89802-000' },
        businessHours: {
          seg: { open: '09:00', close: '19:00', isOpen: true },
          ter: { open: '09:00', close: '19:00', isOpen: true },
          qua: { open: '09:00', close: '19:00', isOpen: true },
          qui: { open: '09:00', close: '19:00', isOpen: true },
          sex: { open: '09:00', close: '19:00', isOpen: true },
          sab: { open: '09:00', close: '19:00', isOpen: true },
          dom: { open: '', close: '', isOpen: false },
        },
        wabaOfficialInfo: {
          verifiedName: 'Haven Escovaria',
          metaBusinessId: 'haven-meta-waba-official',
          phoneId: 'haven-phone-id',
          phoneNumber: '+55 49 8837-0054',
          greenBadgeVerified: true,
          qualityRating: 'GREEN',
          messagingTier: '10k',
          wabaCatalogSync: true,
          metaFlowsEnabled: true,
          businessAiEnabled: true,
        },
        valueProposition: 'Escovas expressas impecáveis com lavagem e ozônioterapia inclusas, sem fila e com agendamento direto pelo WhatsApp e Trinks.',
        targetAudience: 'Mulheres que buscam praticidade, cuidado capilar e estética de alta performance em Chapecó.',
        guaranteesAndPolicies: 'Sinal de R$ 30 via Pix para reserva exclusiva aos sábados. Reagendamento sem custo até 2 horas antes.',
        acceptedPaymentMethods: ['Pix', 'Cartão de Crédito', 'Cartão de Débito'],
      },
      agentConfig: {
        id: 'haven-agent',
        workspaceId: wsId,
        name: 'Camila · Concierge Haven 24/7',
        persona: 'Concierge elegante, acolhedora e eficiente. Conduz agendamentos com rapidez e orienta os clientes com simpatia e requinte.',
        toneOfVoice: 'elegante_acolhedor',
        autonomyMode: 'autonomous_24_7',
        creativityTemperature: 0.6,
        maxDiscountPercent: 10,
        installmentLimitWithoutInterest: 3,
        allowedPaymentMethods: ['Pix', 'Cartão de Crédito', 'Cartão de Débito'],
        escalationTriggers: [
          'Cliente pede para falar com atendente humano ou recepcionista física',
          'Dúvidas sobre procedimentos químicos sensíveis (coloração/luzes/progressiva)',
          'Reclamação sobre atendimento ou insatisfação com horário',
        ],
        safetyGuardrails: [
          'Apresentar a Escova Express por R$ 59 com lavagem e ozônioterapia inclusas.',
          'Direcionar agendamentos e conferência de tabela atualizada para o link oficial do Trinks (https://www.trinks.com/haven-escovaria).',
          'Cobrar sinal de R$ 30 via Pix para segurar vaga concorrida de sábado.',
          'Tom de voz sempre caloroso, sofisticado, acolhedor e ágil.',
          'Banco Oculto de Humanização: tom natural e humano de WhatsApp, sem clichês de IA e sem travessões tipográficos.',
        ],
        workingHoursOnly: false,
        metaAiComparisonEnabled: false,
        activeChannels: ['whatsapp_waba'],
      },
      catalog: [
        { id: 'haven-escova-express', sku: 'ESC-EXP', name: 'Escova Express', category: 'Cabelo', description: 'Lavagem com produtos de alta performance + ozônioterapia + modelagem expressa.', basePrice: 59, minPromoPrice: 59, durationOrExecutionTime: '45-60 min', imageUrl: '', inStock: true, tags: ['Mais Pedida', 'Express', 'Lavagem Inclusa'] },
        { id: 'haven-esmalte-gel', sku: 'ESM-GEL', name: 'Esmaltação em Gel Premium', category: 'Unhas', description: 'Dura até 21 dias sem lascar, acabamento impecável e brilho espelhado.', basePrice: 150, minPromoPrice: 150, durationOrExecutionTime: '60 min', imageUrl: '', inStock: true, tags: ['Unhas', 'Gel', 'Longa Duração'] },
        { id: 'haven-spa-pes', sku: 'SPA-PES', name: 'Spa dos Pés Relaxante', category: 'Bem-estar', description: 'Esfoliação, hidratação profunda e massagem nos pés com produtos aromáticos.', basePrice: 80, minPromoPrice: 80, durationOrExecutionTime: '45 min', imageUrl: '', inStock: true, tags: ['Relaxamento', 'Pés'] },
        { id: 'haven-terapia-capilar', sku: 'TER-CAP', name: 'Terapia Capilar Regenerativa', category: 'Tratamentos', description: 'Tratamento intensivo para fios danificados e couro cabeludo.', basePrice: 190, minPromoPrice: 190, durationOrExecutionTime: '90 min', imageUrl: '', inStock: true, tags: ['Tratamento', 'Recuperação'] },
      ],
      documents: [
        { id: 'haven-doc-1', name: 'Tabela_Servicos_Trinks_Haven.pdf', fileType: 'pdf', fileSize: '340 KB', uploadedAt: new Date().toISOString(), uploadedBy: 'Haven Gestão', category: 'tabela_precos', status: 'indexed', extractedChunksCount: 6, tokenCount: 1200, summary: 'Tabela oficial de serviços da Haven sincronizada com Trinks.', isPrioritizedFact: true, factType: 'pricing' },
      ],
      learningRecords: [],
      sources: [],
      destinations: [],
    };
  }

  if (isSora) {
    return {
      workspaceId: wsId,
      companyProfile: {
        legalName: 'Sora Headspa & Terapias Orientais LTDA',
        tradeName: 'Sora Ritual Spa · Headspa Japonês',
        taxId: '50.319.821/0001-14',
        segment: 'Headspa Sensorial & Massagem Craniana',
        tagline: 'O primeiro Headspa Japonês e relaxamento sensorial de Chapecó',
        phone: '+55 49 99123-4567',
        email: 'contato@soraspa.com.br',
        website: 'https://soraspa.com.br',
        instagram: '@soraspa',
        address: { street: 'Rua Clevelândia', number: '150 D', neighborhood: 'Centro', city: 'Chapecó', state: 'SC', postalCode: '89801-000' },
        businessHours: {
          seg: { open: '10:00', close: '20:00', isOpen: true },
          ter: { open: '10:00', close: '20:00', isOpen: true },
          qua: { open: '10:00', close: '20:00', isOpen: true },
          qui: { open: '10:00', close: '20:00', isOpen: true },
          sex: { open: '10:00', close: '20:00', isOpen: true },
          sab: { open: '09:00', close: '18:00', isOpen: true },
          dom: { open: '', close: '', isOpen: false },
        },
        wabaOfficialInfo: {
          verifiedName: 'Sora Ritual Spa',
          metaBusinessId: 'sora-meta-waba-official',
          phoneId: 'sora-phone-id',
          phoneNumber: '+55 49 99123-4567',
          greenBadgeVerified: true,
          qualityRating: 'GREEN',
          messagingTier: '10k',
          wabaCatalogSync: true,
          metaFlowsEnabled: true,
          businessAiEnabled: true,
        },
        valueProposition: 'Experiência multissensorial de alívio do estresse, arco de água aquecida, massagem craniana milenar e diagnóstico do couro cabeludo.',
        targetAudience: 'Pessoas que buscam descompressão profunda, alívio de enxaquecas, relaxamento mental e cuidado capilar integrativo.',
        guaranteesAndPolicies: 'Ambiente exclusivo individual ou a dois com hora marcada. Cancelamentos com reembolso integral com 24h de antecedência.',
        acceptedPaymentMethods: ['Pix', 'Cartão de Crédito'],
      },
      agentConfig: {
        id: 'sora-agent',
        workspaceId: wsId,
        name: 'Sora Concierge 24/7',
        persona: 'Concierge atenciosa, zen, acolhedora e delicada. Apresenta os rituais com tranquilidade, transmitindo relaxamento e bem-estar.',
        toneOfVoice: 'acolhedor_empatico',
        autonomyMode: 'autonomous_24_7',
        creativityTemperature: 0.6,
        maxDiscountPercent: 10,
        installmentLimitWithoutInterest: 3,
        allowedPaymentMethods: ['Pix', 'Cartão de Crédito'],
        escalationTriggers: [
          'Cliente solicita atendimento humano ou personalização de evento',
          'Dúvidas sobre restrições médicas ou gestantes',
          'Pedidos de reagendamento de última hora',
        ],
        safetyGuardrails: [
          'Apresentar o Ritual Headspa Sensorial como experiência única de relaxamento e saúde capilar.',
          'Oferecer opções de Vale Presente dos Sonhos para aniversários e datas especiais.',
          'Manter tom zen, empático, relaxante e atencioso.',
          'Banco Oculto de Humanização: tom natural e humano de WhatsApp, sem clichês de IA e sem travessões tipográficos.',
        ],
        workingHoursOnly: false,
        metaAiComparisonEnabled: false,
        activeChannels: ['whatsapp_waba'],
      },
      catalog: [
        { id: 'sora-ritual-sensorial', sku: 'RIT-SEN', name: 'Ritual Headspa Sensorial', category: 'Rituais', description: 'Diagnóstico por microcâmera + arco de água sensorial + massagem craniana + secagem natural.', basePrice: 290, minPromoPrice: 290, durationOrExecutionTime: '75 min', imageUrl: '', inStock: true, tags: ['Exclusivo', 'Relaxamento', 'Arco de Água'] },
        { id: 'sora-experiencia-dois', sku: 'EXP-DOIS', name: 'Experiência Sora a Dois', category: 'Casal / Dupla', description: 'Headspa duplo em sala privativa com espumante e aromaterapia.', basePrice: 580, minPromoPrice: 580, durationOrExecutionTime: '90 min', imageUrl: '', inStock: true, tags: ['Casal', 'Privativo', 'Espumante'] },
        { id: 'sora-vale-presente', sku: 'VAL-PRES', name: 'Vale Presente dos Sonhos', category: 'Presentes', description: 'Caixa de cetim personalizada com cartão convite para presentear quem você ama.', basePrice: 290, minPromoPrice: 290, durationOrExecutionTime: 'Válido por 90 dias', imageUrl: '', inStock: true, tags: ['Presente', 'Especial'] },
      ],
      documents: [
        { id: 'sora-doc-1', name: 'Manual_Experiencias_Headspa_Sora.pdf', fileType: 'pdf', fileSize: '480 KB', uploadedAt: new Date().toISOString(), uploadedBy: 'Sora Spa', category: 'manual_tecnico', status: 'indexed', extractedChunksCount: 8, tokenCount: 1600, summary: 'Guia completo de rituais, aromaterapia e benefícios do Headspa japonês.', isPrioritizedFact: true, factType: 'service' },
      ],
      learningRecords: [],
      sources: [],
      destinations: [],
    };
  }

  // SOS Vendas (Default Canon)
  return {
    workspaceId: wsId,
    companyProfile: {
      legalName: 'MCT LTDA',
      tradeName: wsName || 'SOS Vendas · Sistema Operacional de Vendas',
      taxId: '51.842.129/0001-00',
      segment: 'Software Comercial (SaaS) & Inteligência de Vendas no WhatsApp',
      tagline: 'Cockpit de vendas no WhatsApp com IA 24/7 e fechamento em menos de 30 segundos',
      phone: '+55 49 99999-9999',
      email: 'contato@iaparavendas.tech',
      website: 'https://crm.iaparavendas.tech',
      instagram: '@iaparavendas',
      address: { street: 'Av. Fernando Machado', number: '100 D', neighborhood: 'Centro', city: 'Chapecó', state: 'SC', postalCode: '89802-112' },
      businessHours: {
        seg: { open: '08:00', close: '20:00', isOpen: true },
        ter: { open: '08:00', close: '20:00', isOpen: true },
        qua: { open: '08:00', close: '20:00', isOpen: true },
        qui: { open: '08:00', close: '20:00', isOpen: true },
        sex: { open: '08:00', close: '20:00', isOpen: true },
        sab: { open: '09:00', close: '18:00', isOpen: true },
        dom: { open: '', close: '', isOpen: false },
      },
      wabaOfficialInfo: {
        verifiedName: 'SOS Vendas Oficial',
        metaBusinessId: 'sos-meta-waba-matriz',
        phoneId: 'sos-phone-id-official',
        phoneNumber: '+55 49 99999-9999',
        greenBadgeVerified: true,
        qualityRating: 'GREEN',
        messagingTier: '100k',
        wabaCatalogSync: true,
        metaFlowsEnabled: true,
        businessAiEnabled: true,
      },
      valueProposition: 'Aumentamos a taxa de conversão do WhatsApp em até 3x combinando Cockpit em tempo real, IA Receptionist 24/7 que responde em < 30s sem clichês de robô e atribuição fechada com Meta Ads CAPI.',
      targetAudience: 'Empresas, clínicas, consultórios, salões, prestadores de serviços e e-commerces que investem em tráfego pago ou recebem leads no WhatsApp e perdem vendas por demora ou atendimento despadronizado.',
      guaranteesAndPolicies: 'Garantia incondicional de 7 dias com devolução integral; cancelamento sem multa no plano mensal.',
      acceptedPaymentMethods: ['Pix', 'Cartão de Crédito', 'Boleto Bancário'],
    },
    agentConfig: {
      id: 'sos-agent-sofia',
      workspaceId: wsId,
      name: 'Sofia · Consultora SOS Vendas',
      persona: 'Consultora comercial experiente, ágil, acolhedora e focada em entender a dor do cliente para direcionar ao plano ideal com total transparência e velocidade.',
      toneOfVoice: 'comercial_fechador',
      autonomyMode: 'autonomous_24_7',
      creativityTemperature: 0.6,
      maxDiscountPercent: 50,
      installmentLimitWithoutInterest: 12,
      allowedPaymentMethods: ['Pix', 'Cartão de Crédito'],
      escalationTriggers: [
        'Cliente solicita falar com atendente humano ou especialista técnico',
        'Dúvidas complexas de infraestrutura dedicada ou migração enterprise',
        'Reclamação financeira ou contestação de cobrança',
      ],
      safetyGuardrails: [
        'Apresentar as condições ativas: mensal R$ 97,00; anual no Pix R$ 582,00 à vista (50% OFF); anual no cartão 12x de R$ 58,20.',
        'Nunca encerrar a resposta sem propor uma escolha fechada (Menor Próximo Passo).',
        'Não conceder descontos adicionais além da alçada autorizada.',
        'Destacar o Cockpit em < 30s e espelhamento de agenda.',
        'Banco Oculto de Humanização: falar como atendente humano real, frases curtas de WhatsApp, sem clichês de IA (proibido certamente/compreendo sua dor), sem travessão longo (—) e sem listas burocráticas.',
      ],
      workingHoursOnly: false,
      metaAiComparisonEnabled: false,
      activeChannels: ['whatsapp_waba'],
    },
    catalog: [
      { id: 'sos-plano-anual-pix', sku: 'SOS-ANUAL-PIX', name: 'Plano Anual SOS Vendas (Pix)', category: 'Assinatura Anual', description: 'Cockpit completo, IA Receptionist 24/7, Simulador Nemotron e CAPI Meta Ads com 50% de desconto à vista.', basePrice: 582, minPromoPrice: 582, durationOrExecutionTime: 'Acesso por 12 meses', imageUrl: '', inStock: true, tags: ['Anual', 'Pix', '50% OFF', 'Mais Vendido'] },
      { id: 'sos-plano-anual-cartao', sku: 'SOS-ANUAL-CARD', name: 'Plano Anual SOS Vendas (Cartão 12x)', category: 'Assinatura Anual', description: 'Acesso anual completo parcelado em 12x de R$ 58,20 no cartão de crédito.', basePrice: 698.4, minPromoPrice: 698.4, durationOrExecutionTime: 'Acesso por 12 meses', imageUrl: '', inStock: true, tags: ['Anual', 'Cartão', '12x'] },
      { id: 'sos-plano-mensal', sku: 'SOS-MENSAL', name: 'Plano Mensal SOS Vendas', category: 'Assinatura Mensal', description: 'Assinatura mensal recorrente sem fidelidade, cancele quando quiser.', basePrice: 97, minPromoPrice: 97, durationOrExecutionTime: 'Assinatura mensal', imageUrl: '', inStock: true, tags: ['Mensal', 'Sem Fidelidade'] },
    ],
    documents: [
      { id: 'sos-doc-1', name: 'SOS_Sales_Tabela_Planos_Precos.pdf', fileType: 'pdf', fileSize: '420 KB', uploadedAt: new Date().toISOString(), uploadedBy: 'SOS Vendas Gestão', category: 'tabela_precos', status: 'indexed', extractedChunksCount: 8, tokenCount: 1500, summary: 'Preços dos planos mensal e anual com alçadas e formas de pagamento.', isPrioritizedFact: true, factType: 'pricing' },
      { id: 'sos-doc-2', name: 'Playbook_Quebra_Objecoes_Garantia.md', fileType: 'txt', fileSize: '185 KB', uploadedAt: new Date().toISOString(), uploadedBy: 'SOS Vendas Gestão', category: 'scripts_vendas', status: 'indexed', extractedChunksCount: 5, tokenCount: 950, summary: 'Script de desarmamento de objeções, condições comerciais e garantia de 7 dias.', isPrioritizedFact: true, factType: 'faq' },
    ],
    learningRecords: [],
    sources: [],
    destinations: [],
  };
}

export const ClientAgentHubView: React.FC<ClientAgentHubViewProps> = ({
  currentWorkspace,
  workspaces,
  onSelectWorkspace,
  activeSubTab: externalActiveSubTab,
  onChangeSubTab,
  canManage = false,
}) => {
  const [internalTab, setInternalTab] = React.useState<IntelligenceTab>(externalActiveSubTab ?? 'knowledge');

  React.useEffect(() => {
    if (externalActiveSubTab) {
      setInternalTab(externalActiveSubTab);
    }
  }, [externalActiveSubTab]);

  const productionTabs = new Set<IntelligenceTab>(['profile', 'agent', 'knowledge', 'catalog', 'simulator', 'assurance', 'diagnosis']);
  const requestedTab = externalActiveSubTab ?? internalTab;
  const activeTab: IntelligenceTab = salesOsRuntimeConfig.mode === 'api' && !productionTabs.has(requestedTab)
    ? 'knowledge'
    : requestedTab;

  const handleTabChange = (tab: IntelligenceTab) => {
    setInternalTab(tab);
    onChangeSubTab?.(tab);
  };

  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [bundleStatus, setBundleStatus] = React.useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [wabaChannelInfo, setWabaChannelInfo] = React.useState<{
    configured?: boolean;
    credentialsAvailable?: boolean;
    phoneNumber?: string | null;
    phoneNumberId?: string | null;
    wabaId?: string | null;
    verifiedName?: string | null;
    qualityRating?: string | null;
  } | null>(null);

  const [bundleMap, setBundleMap] = React.useState<Record<string, ClientIntelligenceBundle>>({});
  const intelligenceCanManage = canManage && bundleStatus !== 'loading' && bundleStatus !== 'error';

  React.useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setBundleStatus('loading');
    authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/intelligence`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Intelligence API ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!isMounted || !data) return;
        if (data.bundle && typeof data.bundle === 'object') {
          setBundleMap((prev) => ({
            ...prev,
            [currentWorkspace.id]: data.bundle,
          }));
          setBundleStatus('ready');
        } else {
          setBundleMap((prev) => {
            const next = { ...prev };
            delete next[currentWorkspace.id];
            return next;
          });
          setBundleStatus('empty');
        }
      })
      .catch(() => {
        if (isMounted) setBundleStatus('error');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentWorkspace.id]);

  React.useEffect(() => {
    let isMounted = true;
    setWabaChannelInfo(null);
    authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/channels/waba/channel-info`)
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (isMounted) setWabaChannelInfo(data && typeof data === 'object' ? data : null);
      })
      .catch(() => {
        if (isMounted) setWabaChannelInfo(null);
      });
    return () => {
      isMounted = false;
    };
  }, [currentWorkspace.id]);

  const currentBundle = React.useMemo(() => {
    const fallback = resolveWorkspaceIntelligenceBundle(currentWorkspace.id, currentWorkspace.name);
    const existing = (bundleMap[currentWorkspace.id] || null) as any;

    const liveQuality = String(wabaChannelInfo?.qualityRating || '').toUpperCase();
    const normalizedQuality = liveQuality === 'GREEN' || liveQuality === 'YELLOW' || liveQuality === 'RED'
      ? liveQuality as 'GREEN' | 'YELLOW' | 'RED'
      : fallback.companyProfile.wabaOfficialInfo.qualityRating;
    const liveWabaInfo = wabaChannelInfo?.configured && wabaChannelInfo.credentialsAvailable === true
      ? {
          ...fallback.companyProfile.wabaOfficialInfo,
          verifiedName: wabaChannelInfo.verifiedName || fallback.companyProfile.wabaOfficialInfo.verifiedName,
          metaBusinessId: wabaChannelInfo.wabaId || fallback.companyProfile.wabaOfficialInfo.metaBusinessId,
          phoneId: wabaChannelInfo.phoneNumberId || fallback.companyProfile.wabaOfficialInfo.phoneId,
          phoneNumber: wabaChannelInfo.phoneNumber || fallback.companyProfile.wabaOfficialInfo.phoneNumber,
          qualityRating: normalizedQuality,
        }
      : null;

    // Helper resiliente para conversão de preço (string monetária ou número)
    const parsePrice = (val: unknown, fallbackNum = 0): number => {
      if (typeof val === 'number' && Number.isFinite(val)) return val;
      if (typeof val === 'string') {
        const cleaned = val.replace(/[^\d.,]/g, '').replace(',', '.');
        const parsed = parseFloat(cleaned);
        if (Number.isFinite(parsed)) return parsed;
      }
      return fallbackNum;
    };

    // Normalização resiliente do Perfil da Empresa
    const existingProfile = existing?.companyProfile || {};
    const normalizedProfile = {
      ...fallback.companyProfile,
      ...existingProfile,
      legalName: existingProfile.legalName || existing?.legalName || fallback.companyProfile.legalName,
      tradeName: existingProfile.tradeName || existing?.tradeName || fallback.companyProfile.tradeName,
      segment: existingProfile.segment || existing?.businessType || fallback.companyProfile.segment,
      tagline: existingProfile.tagline || fallback.companyProfile.tagline,
      phone: existingProfile.phone || existing?.phone || fallback.companyProfile.phone,
      email: existingProfile.email || fallback.companyProfile.email,
      website: existingProfile.website || existing?.bookingUrl || fallback.companyProfile.website,
      instagram: existingProfile.instagram || fallback.companyProfile.instagram,
      address: {
        ...fallback.companyProfile.address,
        ...(existingProfile.address || {}),
        city: existingProfile.address?.city || existing?.city || fallback.companyProfile.address.city,
      },
      businessHours: existingProfile.businessHours || fallback.companyProfile.businessHours,
      valueProposition: existingProfile.valueProposition || fallback.companyProfile.valueProposition,
      targetAudience: existingProfile.targetAudience || fallback.companyProfile.targetAudience,
      guaranteesAndPolicies: existingProfile.guaranteesAndPolicies || fallback.companyProfile.guaranteesAndPolicies,
      acceptedPaymentMethods: Array.isArray(existingProfile.acceptedPaymentMethods) && existingProfile.acceptedPaymentMethods.length > 0
        ? existingProfile.acceptedPaymentMethods
        : fallback.companyProfile.acceptedPaymentMethods,
      wabaOfficialInfo: {
        ...fallback.companyProfile.wabaOfficialInfo,
        ...(existingProfile.wabaOfficialInfo || {}),
        ...(liveWabaInfo || {}),
      },
    };

    // Normalização resiliente da Configuração do Agente (Sofia)
    const existingAgent = existing?.agentConfig || {};
    const flatDirectives = Array.isArray(existing?.directives) ? existing.directives : [];
    const normalizedGuardrails = Array.isArray(existingAgent.safetyGuardrails) && existingAgent.safetyGuardrails.length > 0
      ? existingAgent.safetyGuardrails
      : flatDirectives.length > 0
        ? flatDirectives
        : fallback.agentConfig.safetyGuardrails;

    const normalizedAgentConfig = {
      ...fallback.agentConfig,
      ...existingAgent,
      name: existingAgent.name || existing?.agentName || fallback.agentConfig.name,
      persona: existingAgent.persona || fallback.agentConfig.persona,
      toneOfVoice: existingAgent.toneOfVoice || fallback.agentConfig.toneOfVoice,
      autonomyMode: existingAgent.autonomyMode || fallback.agentConfig.autonomyMode,
      creativityTemperature: typeof existingAgent.creativityTemperature === 'number'
        ? existingAgent.creativityTemperature
        : fallback.agentConfig.creativityTemperature,
      maxDiscountPercent: typeof existingAgent.maxDiscountPercent === 'number'
        ? existingAgent.maxDiscountPercent
        : fallback.agentConfig.maxDiscountPercent,
      installmentLimitWithoutInterest: typeof existingAgent.installmentLimitWithoutInterest === 'number'
        ? existingAgent.installmentLimitWithoutInterest
        : fallback.agentConfig.installmentLimitWithoutInterest,
      allowedPaymentMethods: Array.isArray(existingAgent.allowedPaymentMethods) && existingAgent.allowedPaymentMethods.length > 0
        ? existingAgent.allowedPaymentMethods
        : fallback.agentConfig.allowedPaymentMethods,
      safetyGuardrails: normalizedGuardrails,
      escalationTriggers: Array.isArray(existingAgent.escalationTriggers) && existingAgent.escalationTriggers.length > 0
        ? existingAgent.escalationTriggers
        : fallback.agentConfig.escalationTriggers,
    };

    // Normalização resiliente do Catálogo & Preços
    const rawCatalog = Array.isArray(existing?.catalog) && existing.catalog.length > 0
      ? existing.catalog
      : fallback.catalog;

    const normalizedCatalog = rawCatalog.map((item: any, idx: number) => {
      const basePrice = parsePrice(item.basePrice ?? item.price, 0);
      const minPromo = parsePrice(item.minPromoPrice, basePrice);
      return {
        id: String(item.id || `item-${idx + 1}`),
        sku: String(item.sku || `SKU-${idx + 1}`),
        name: String(item.name || item.title || `Item ${idx + 1}`),
        category: String(item.category || 'Serviços'),
        description: String(item.description || ''),
        basePrice,
        minPromoPrice: minPromo,
        durationOrExecutionTime: String(item.durationOrExecutionTime || item.duration || ''),
        imageUrl: String(item.imageUrl || ''),
        inStock: item.inStock !== false,
        tags: Array.isArray(item.tags) ? item.tags : [],
        frequentlyAsked: Array.isArray(item.frequentlyAsked) ? item.frequentlyAsked : [],
      };
    });

    const normalizedDocs = Array.isArray(existing?.documents) && existing.documents.length > 0
      ? existing.documents
      : fallback.documents;

    return {
      ...fallback,
      ...(existing || {}),
      companyProfile: normalizedProfile,
      agentConfig: normalizedAgentConfig,
      catalog: normalizedCatalog,
      documents: normalizedDocs,
      learningRecords: Array.isArray(existing?.learningRecords) && existing.learningRecords.length > 0
        ? existing.learningRecords
        : fallback.learningRecords,
      sources: Array.isArray(existing?.sources) ? existing.sources : fallback.sources,
      destinations: Array.isArray(existing?.destinations) ? existing.destinations : fallback.destinations,
    };
  }, [bundleMap, currentWorkspace, wabaChannelInfo]);

  const hasWabaConfiguration = Boolean(
    wabaChannelInfo?.configured
      && wabaChannelInfo.credentialsAvailable === true
      && wabaChannelInfo.phoneNumberId,
  );

  const updateCurrentBundle = async (updater: (prev: ClientIntelligenceBundle) => ClientIntelligenceBundle): Promise<boolean> => {
    if (!intelligenceCanManage) {
      setSaveError('Somente o proprietário ou administrador pode editar a inteligência.');
      return false;
    }
    const updated = updater(currentBundle);
    setSaveError(null);
    setBundleMap((prev) => ({
      ...prev,
      [currentWorkspace.id]: updated,
    }));

    setIsSaving(true);
    try {
      const response = await authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/intelligence`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: updated }),
      });
      if (!response.ok) {
        setSaveError(`Não foi possível persistir a inteligência (HTTP ${response.status}).`);
        return false;
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return true;
    } catch {
      setSaveError('Não foi possível alcançar o backend para persistir a inteligência.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/intelligence`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: currentBundle }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(`Não foi possível persistir a inteligência (HTTP ${res.status}).`);
      }
    } catch {
      setSaveError('Não foi possível alcançar o backend para persistir a inteligência.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div id="client-agent-hub-view" className="h-full overflow-y-auto w-full p-3 sm:p-4 max-w-7xl mx-auto space-y-4">
      {/* Top Client Header */}
      <div className="bg-[var(--sos-surface)] border border-[var(--sos-border)] rounded-xl p-3 sm:p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[var(--sos-ai)]/20 text-[var(--sos-ai)] flex items-center justify-center font-bold text-base shadow-2xs shrink-0">
            {currentWorkspace.name.substring(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-sm font-bold text-[var(--sos-ink)] font-heading truncate">
                {currentWorkspace.name}
              </h1>
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--sos-ai-subtle)] text-[var(--sos-ai)] border border-[var(--sos-ai)]/30 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-[var(--sos-ai)]" /> Inteligência Comercial & Sofia 24/7
              </span>
              {!canManage && (
                <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Somente leitura
                </span>
              )}
              {hasWabaConfiguration ? (
                <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5 text-sky-600" /> WhatsApp Conectado
                </span>
              ) : (
                <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                  <Radio className="w-2.5 h-2.5 text-slate-400" /> WhatsApp Pendente
                </span>
              )}
            </div>

            <p className="text-[9.5px] text-[var(--sos-muted)] truncate">
              {currentBundle.companyProfile.tagline || currentWorkspace.tagline}
            </p>
          </div>
        </div>

        {/* Action Controls & Save Status */}
        <div className="flex items-center gap-2 shrink-0">
          {isSaving ? (
            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
            </span>
          ) : saveSuccess ? (
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Salvo no Supabase
            </span>
          ) : saveError ? (
            <span role="alert" className="text-[11px] font-medium text-rose-600 flex items-center gap-1">
              {saveError}
            </span>
          ) : null}

          <button
            type="button"
            onClick={handleManualSave}
            disabled={isSaving || !intelligenceCanManage}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar Inteligência</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-[var(--sos-border)]">
        <button
          type="button"
          onClick={() => handleTabChange('profile')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-[var(--sos-ink)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Perfil da Empresa</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('agent')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'agent'
              ? 'bg-[var(--sos-ai)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-purple-200" />
          <span>Agente IA 24/7 & Regras</span>
          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-purple-400/20 text-purple-200 font-bold border border-purple-400/30">
            Nemotron 3.5
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('catalog')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'catalog'
              ? 'bg-[var(--sos-ink)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Catálogo & Preços</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            activeTab === 'catalog'
              ? 'bg-white/20 text-white'
              : 'bg-[var(--sos-border)] text-[var(--sos-muted)]'
          }`}>
            {currentBundle.catalog.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('knowledge')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'knowledge'
              ? 'bg-[var(--sos-ink)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          <span>Base de Conhecimento</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            activeTab === 'knowledge'
              ? 'bg-white/20 text-white'
              : 'bg-[var(--sos-border)] text-[var(--sos-muted)]'
          }`}>
            {currentBundle.documents.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('simulator')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'simulator'
              ? 'bg-[var(--sos-ai)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-amber-300" />
          <span>Simulador & Treinador IA</span>
          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30">
            Padrão Meta
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('assurance')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'assurance'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
          <span>Auditoria AI Assurance</span>
          <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-400/20 text-emerald-300 font-bold border border-emerald-400/30">
            Selo de Certificação
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('diagnosis')}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'diagnosis'
              ? 'bg-[var(--sos-ink)] text-white shadow-xs'
              : 'text-[var(--sos-muted)] hover:text-[var(--sos-ink)] hover:bg-[var(--sos-surface)]'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Diagnóstico</span>
        </button>
      </div>

      {bundleStatus === 'error' && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-900">
          <strong>Falha ao carregar a inteligência do backend.</strong> Exibindo dados canônicos locais.
        </div>
      )}

      {activeTab === 'profile' && (
        <CompanyProfileSection
          profile={currentBundle.companyProfile}
          readOnly={!intelligenceCanManage}
          onSaveProfile={async (profile) => {
            return updateCurrentBundle((prev) => ({ ...prev, companyProfile: profile }));
          }}
        />
      )}

      {activeTab === 'agent' && (
        <AgentSettingsSection
          agentConfig={currentBundle.agentConfig}
          canManage={intelligenceCanManage}
          onSaveAgentConfig={async (updatedConfig) => {
            return updateCurrentBundle((prev) => ({
              ...prev,
              agentConfig: updatedConfig,
            }));
          }}
        />
      )}

      {activeTab === 'catalog' && (
        <ProductCatalogSection
          catalog={currentBundle.catalog}
          canManage={intelligenceCanManage}
          onUpdateCatalog={(items) => {
            void updateCurrentBundle((prev) => ({ ...prev, catalog: items }));
          }}
        />
      )}

      {activeTab === 'knowledge' && (
        <AgentKnowledgeBaseSection
          documents={currentBundle.documents}
          onUploadDocument={async (input) => {
            if (!intelligenceCanManage) throw new Error('Somente o proprietário ou administrador pode editar a base de conhecimento.');
            const res = await authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/knowledge-docs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: input.name,
                category: input.category,
                content: input.content,
                fileName: input.name,
                fileSize: input.fileSize,
              }),
            });
            if (!res.ok) throw new Error(`Knowledge document API ${res.status}`);
            const data = await res.json();
            const document = data?.document;
            if (!document?.id) throw new Error('Knowledge document response missing id');
            return {
              id: String(document.id),
              name: String(document.title || input.name),
              fileType: input.fileType,
              fileSize: String(document.file_size || input.fileSize),
              uploadedAt: String(document.created_at || new Date().toISOString()),
              uploadedBy: 'Backend SOS Vendas',
              category: input.category,
              status: document.status === 'ready' ? 'indexed' : 'pending',
              extractedChunksCount: Number(document.chunks_count || 1),
              tokenCount: Math.max(1, Math.floor(input.content.length / 4)),
              summary: String(document.title || input.name),
              rawContentSnippet: input.content.slice(0, 1400),
              isPrioritizedFact: false,
              factType: input.category === 'tabela_precos' ? 'pricing' : 'faq',
            };
          }}
          onDeleteDocument={async (id) => {
            if (!intelligenceCanManage) return false;
            const res = await authenticatedFetch(`/api/v1/workspaces/${currentWorkspace.id}/knowledge-docs/${id}`, {
              method: 'DELETE',
            });
            return res.ok;
          }}
          onUpdateDocuments={(docs) => {
            void updateCurrentBundle((prev) => ({ ...prev, documents: docs }));
          }}
          canManage={intelligenceCanManage}
        />
      )}

      {activeTab === 'simulator' && (
        <QaSimulatorView currentWorkspace={currentWorkspace} bundle={currentBundle} />
      )}

      {activeTab === 'assurance' && (
        <AiAssuranceAuditView currentWorkspace={currentWorkspace} bundle={currentBundle} />
      )}

      {activeTab === 'diagnosis' && (
        <HistoricalDiagnosisSection workspace={currentWorkspace} />
      )}

      {activeTab === 'thesis' && <SalesAiThesisConfig workspaceId={currentWorkspace.id} />}

      {activeTab === 'learning' && (
        <ContinuousLearningSection
          learningRecords={currentBundle.learningRecords}
          onApproveRecord={(id) => {
            updateCurrentBundle((prev) => ({
              ...prev,
              learningRecords: prev.learningRecords.map((r) =>
                r.id === id ? { ...r, status: 'curated_approved' } : r
              ),
            }));
          }}
          onRejectRecord={(id) => {
            updateCurrentBundle((prev) => ({
              ...prev,
              learningRecords: prev.learningRecords.map((r) =>
                r.id === id ? { ...r, status: 'rejected' } : r
              ),
            }));
          }}
        />
      )}
    </div>
  );
};
