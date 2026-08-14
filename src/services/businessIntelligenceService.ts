import { BusinessContext, KnowledgeDocument, DocumentCategory } from '../types/intelligence';

const STORAGE_KEY = 'sos_sales_business_context_v1';

const defaultBusinessContext: BusinessContext = {
  workspaceId: 'ws-default-01',
  companyProfile: {
    legalName: 'Lumina Salon & Spa Ltda',
    tradeName: 'Lumina',
    taxId: '12.345.678/0001-90',
    segment: 'Estética & Beleza Premium',
    tagline: 'Transformando beleza e bem-estar',
    phone: '+55 11 99888-7766',
    email: 'contato@luminasalon.com.br',
    website: 'https://luminasalon.com.br',
    instagram: '@luminasalon',
    address: {
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01310-100',
    },
    businessHours: {
      seg: { open: '09:00', close: '20:00', isOpen: true },
      ter: { open: '09:00', close: '20:00', isOpen: true },
      qua: { open: '09:00', close: '20:00', isOpen: true },
      qui: { open: '09:00', close: '20:00', isOpen: true },
      sex: { open: '09:00', close: '20:00', isOpen: true },
      sab: { open: '09:00', close: '18:00', isOpen: true },
      dom: { open: '10:00', close: '14:00', isOpen: false },
    },
    wabaOfficialInfo: {
      verifiedName: 'Lumina Oficial',
      metaBusinessId: 'meta-biz-01',
      phoneId: 'phone-id-01',
      phoneNumber: '+55 11 99888-7766',
      greenBadgeVerified: true,
      qualityRating: 'GREEN',
      messagingTier: '10k',
      wabaCatalogSync: true,
      metaFlowsEnabled: true,
      businessAiEnabled: true,
    },
    valueProposition: 'Atendimento premium com pontualidade garantida para compromissos.',
    targetAudience: 'Clientes exigentes buscando beleza e agilidade.',
    guaranteesAndPolicies: 'Cancelamentos com até 24h de antecedência sem taxa.',
    acceptedPaymentMethods: ['Pix (5% desconto)', 'Cartão de Crédito', 'Dinheiro'],
  },
  productCatalog: [
    {
      id: 'prod-1',
      sku: 'ESC-01',
      name: 'Escova Modelada Premium',
      category: 'Cabelo',
      description: 'Escova com modelagem duradoura, protector térmico e finalização.',
      basePrice: 89.00,
      minPromoPrice: 79.00,
      durationOrExecutionTime: '40 min',
      imageUrl: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=300',
      inStock: true,
      tags: ['Cabelo', 'Escova', 'Mais Vendido'],
      frequentlyAsked: [
        { question: 'Quanto tempo dura?', answer: 'Em média 40 minutos.' }
      ],
    },
    {
      id: 'prod-2',
      sku: 'COR-02',
      name: 'Corte Designer + Hidratação',
      category: 'Cabelo',
      description: 'Corte personalizado visagismo + hidratação profunda.',
      basePrice: 180.00,
      minPromoPrice: 160.00,
      durationOrExecutionTime: '60 min',
      imageUrl: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=300',
      inStock: true,
      tags: ['Cabelo', 'Corte'],
      frequentlyAsked: [],
    },
  ],
  serviceInformation: {
    businessHours: {
      seg: { open: '09:00', close: '20:00', isOpen: true },
      ter: { open: '09:00', close: '20:00', isOpen: true },
      qua: { open: '09:00', close: '20:00', isOpen: true },
      qui: { open: '09:00', close: '20:00', isOpen: true },
      sex: { open: '09:00', close: '20:00', isOpen: true },
      sab: { open: '09:00', close: '18:00', isOpen: true },
      dom: { open: '10:00', close: '14:00', isOpen: false },
    },
    address: {
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01310-100',
    },
    acceptedPaymentMethods: ['Pix', 'Cartão de Crédito', 'Dinheiro'],
    guaranteesAndPolicies: 'Cancelamentos com até 24h de antecedência sem taxa.',
    escalationTriggers: ['Reclamações de alergia', 'Desconto > 15%'],
    safetyGuardrails: ['Nunca prometer resultados médicos milagrosos'],
  },
  knowledgeDocuments: [
    {
      id: 'doc-1',
      name: 'Política de Cancelamento e Reagendamento',
      fileType: 'txt',
      fileSize: '1.2 KB',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Admin',
      category: 'politicas_garantia',
      status: 'indexed',
      extractedChunksCount: 3,
      tokenCount: 140,
      summary: 'Regras de cancelamento e tolerância.',
      rawContentSnippet: 'Cancelamentos com até 24h de antecedência sem cobrança de taxa de no-show.',
      isPrioritizedFact: true,
      factType: 'policy',
    },
    {
      id: 'doc-2',
      name: 'Tabela de Preços e Condições de Pagamento',
      fileType: 'txt',
      fileSize: '2.1 KB',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Admin',
      category: 'tabela_precos',
      status: 'indexed',
      extractedChunksCount: 5,
      tokenCount: 220,
      summary: 'Desconto Pix e condições parceladas.',
      rawContentSnippet: 'Pix tem 5% de desconto automático em qualquer procedimento.',
      isPrioritizedFact: true,
      factType: 'pricing',
    },
    {
      id: 'doc-3',
      name: 'FAQ Dúvidas Frequentes',
      fileType: 'txt',
      fileSize: '1.8 KB',
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Admin',
      category: 'faq_empresa',
      status: 'indexed',
      extractedChunksCount: 4,
      tokenCount: 190,
      summary: 'Convênio com estacionamento e pets.',
      rawContentSnippet: 'Convênio com estacionamento no subsolo e aceitação de pets de pequeno porte.',
      isPrioritizedFact: true,
      factType: 'faq',
    },
  ],
  agentConfig: {
    id: 'agent-01',
    workspaceId: 'ws-default-01',
    name: 'Camila (IA Comercial)',
    persona: 'Consultora de atendimento acolhedora e eficiente.',
    toneOfVoice: 'acolhedor_empatico',
    autonomyMode: 'semi_autonomous',
    creativityTemperature: 0.3,
    maxDiscountPercent: 15,
    installmentLimitWithoutInterest: 3,
    allowedPaymentMethods: ['Pix', 'Cartão de Crédito', 'Dinheiro'],
    escalationTriggers: ['falar com humano', 'gerente'],
    safetyGuardrails: ['Nunca ofender clientes', 'Respeitar preços oficiais'],
    workingHoursOnly: false,
    metaAiComparisonEnabled: true,
    activeChannels: ['whatsapp'],
  },
  activePrompts: 'Responda sempre priorizando os fatos cadastrados na base de conhecimento.',
};

export const businessIntelligenceService = {
  getBusinessContext(): BusinessContext {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load business context', e);
    }
    return defaultBusinessContext;
  },

  saveBusinessContext(context: BusinessContext): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    } catch (e) {
      console.error('Failed to save business context', e);
    }
  },

  getKnowledgeDocuments(): KnowledgeDocument[] {
    const ctx = this.getBusinessContext();
    return ctx.knowledgeDocuments || [];
  },

  saveKnowledgeDocuments(documents: KnowledgeDocument[]): void {
    const ctx = this.getBusinessContext();
    ctx.knowledgeDocuments = documents;
    this.saveBusinessContext(ctx);
  },

  addKnowledgeDocument(doc: Omit<KnowledgeDocument, 'id' | 'uploadedAt' | 'status' | 'extractedChunksCount' | 'tokenCount'>): KnowledgeDocument {
    const documents = this.getKnowledgeDocuments();
    const newDoc: KnowledgeDocument = {
      ...doc,
      id: 'doc-' + Date.now(),
      uploadedAt: new Date().toISOString(),
      uploadedBy: 'Operador',
      status: 'indexed',
      extractedChunksCount: 3,
      tokenCount: Math.floor((doc.rawContentSnippet?.length || 100) / 4),
    };
    const updated = [newDoc, ...documents];
    this.saveKnowledgeDocuments(updated);
    return newDoc;
  },

  updateKnowledgeDocument(id: string, updates: Partial<KnowledgeDocument>): KnowledgeDocument | null {
    const documents = this.getKnowledgeDocuments();
    let target: KnowledgeDocument | null = null;
    const updated = documents.map((d) => {
      if (d.id === id) {
        target = { ...d, ...updates };
        return target;
      }
      return d;
    });
    if (target) {
      this.saveKnowledgeDocuments(updated);
    }
    return target;
  },

  deleteKnowledgeDocument(id: string): void {
    const documents = this.getKnowledgeDocuments();
    const updated = documents.filter((d) => d.id !== id);
    this.saveKnowledgeDocuments(updated);
  },
};
