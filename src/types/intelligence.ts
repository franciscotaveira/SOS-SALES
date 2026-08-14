export type ToneOfVoice =
  | 'consultivo_premium'
  | 'energetico_direto'
  | 'acolhedor_empatico'
  | 'tecnico_especialista';

export type AgentAutonomyMode =
  | 'copilot_supervised'
  | 'semi_autonomous'
  | 'autonomous_24_7';

export type DocumentCategory =
  | 'manual_tecnico'
  | 'tabela_precos'
  | 'scripts_vendas'
  | 'politicas_garantia'
  | 'faq_empresa'
  | 'catalogo_meta';

export type DocumentStatus = 'indexed' | 'indexing' | 'error' | 'pending';

export interface KnowledgeDocument {
  id: string;
  name: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'csv' | 'txt' | 'image' | 'url';
  fileSize: string;
  uploadedAt: string;
  uploadedBy: string;
  category: DocumentCategory;
  status: DocumentStatus;
  extractedChunksCount: number;
  tokenCount: number;
  summary: string;
  rawContentSnippet?: string;
  isPrioritizedFact?: boolean;
  factType?: 'faq' | 'policy' | 'pricing' | 'service';
}

export interface BusinessDayHours {
  open: string;
  close: string;
  isOpen: boolean;
}

export interface CompanyAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  googleMapsUrl?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface WabaOfficialInfo {
  verifiedName: string;
  metaBusinessId: string;
  phoneId: string;
  phoneNumber: string;
  greenBadgeVerified: boolean;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED';
  messagingTier: '1k' | '10k' | '100k' | 'unlimited';
  wabaCatalogSync: boolean;
  metaFlowsEnabled: boolean;
  businessAiEnabled: boolean;
  catalogId?: string;
}

export interface CompanyProfile {
  legalName: string;
  tradeName: string;
  taxId: string; // CNPJ / CPF
  segment: string;
  tagline: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  address: CompanyAddress;
  businessHours: {
    seg: BusinessDayHours;
    ter: BusinessDayHours;
    qua: BusinessDayHours;
    qui: BusinessDayHours;
    sex: BusinessDayHours;
    sab: BusinessDayHours;
    dom: BusinessDayHours;
  };
  wabaOfficialInfo: WabaOfficialInfo;
  valueProposition: string;
  targetAudience: string;
  guaranteesAndPolicies: string;
  parkingAndAccessInfo?: string;
  acceptedPaymentMethods: string[];
}

export interface ProductCatalogItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  description: string;
  basePrice: number;
  minPromoPrice: number;
  durationOrExecutionTime?: string;
  imageUrl: string;
  inStock: boolean;
  wabaProductLink?: string;
  metaCatalogId?: string;
  tags: string[];
  frequentlyAsked: {
    question: string;
    answer: string;
  }[];
}

export interface AiAgentConfig {
  id: string;
  workspaceId: string;
  name: string;
  avatarUrl?: string;
  persona: string;
  toneOfVoice: ToneOfVoice;
  autonomyMode: AgentAutonomyMode;
  creativityTemperature: number; // 0.0 - 1.0
  maxDiscountPercent: number;
  installmentLimitWithoutInterest: number;
  allowedPaymentMethods: string[];
  escalationTriggers: string[];
  safetyGuardrails: string[];
  workingHoursOnly: boolean;
  metaAiComparisonEnabled: boolean;
  activeChannels: string[];
}

export type ContinuousLearningType =
  | 'operator_correction'
  | 'deal_won_insight'
  | 'unresolved_question'
  | 'playbook_rule_proposed';

export interface ContinuousLearningRecord {
  id: string;
  workspaceId: string;
  type: ContinuousLearningType;
  date: string;
  leadContext: string;
  originalAiProposal: string;
  humanCorrection: string;
  learnedFact: string;
  confidenceScore: number;
  status: 'active_learning' | 'curated_approved' | 'rejected';
  impactMetric: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface IntelligenceSource {
  id: string;
  name: string;
  type: 'meta_ctwa' | 'waba_catalog' | 'uploaded_docs' | 'chat_history' | 'human_feedback';
  count: string;
  status: 'active' | 'synced' | 'pending';
  lastSync: string;
  description: string;
  badge: string;
}

export interface IntelligenceDestination {
  id: string;
  name: string;
  target: 'cockpit_copilot' | 'waba_direct_reply' | 'waha_groups' | 'dossier_live' | 'crm_webhook';
  throughput: string;
  status: 'live' | 'active';
  description: string;
  latency: string;
}

export interface ClientIntelligenceBundle {
  workspaceId: string;
  companyProfile: CompanyProfile;
  agentConfig: AiAgentConfig;
  catalog: ProductCatalogItem[];
  documents: KnowledgeDocument[];
  learningRecords: ContinuousLearningRecord[];
  sources: IntelligenceSource[];
  destinations: IntelligenceDestination[];
}

export interface BusinessContext {
  workspaceId: string;
  companyProfile: CompanyProfile;
  productCatalog: ProductCatalogItem[];
  serviceInformation: {
    businessHours: CompanyProfile['businessHours'];
    address: CompanyAddress;
    acceptedPaymentMethods: string[];
    guaranteesAndPolicies: string;
    escalationTriggers: string[];
    safetyGuardrails: string[];
  };
  knowledgeDocuments: KnowledgeDocument[];
  agentConfig: AiAgentConfig;
  activePrompts: string;
}
