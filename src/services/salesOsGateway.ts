import {
  Journey,
  Workspace,
  Message,
  JourneyOutcome,
  SendMessagePayload,
  Channel,
  CommercialStage,
} from '../types/cockpit';
import {
  CommercialAppointment,
  OperationalNote,
  AppointmentStatus,
  NoteCategory,
} from '../types/agendaAndNotes';
import {
  mockWorkspaces,
  mockJourneysEscovaria,
  mockJourneysTitanium,
  mockMessagesByJourney,
} from '../data/fixtures';
import { mockAppointments, mockOperationalNotes } from '../data/agendaAndNotesFixtures';
import { salesOsRuntimeConfig } from '../config/runtime';
import { getSupabaseAccessToken } from './supabaseAuth';

export type AccessTokenProvider = () => Promise<string | null> | string | null;

export class SalesOsTransportError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'SalesOsTransportError';
  }
}

export class SalesOsOperationUnavailableError extends Error {
  constructor(operation: string) {
    super(`${operation} ainda não está disponível na API autenticada do SOS Vendas.`);
    this.name = 'SalesOsOperationUnavailableError';
  }
}

interface ApiEnvelope<T> {
  data: T;
  meta?: { nextCursor?: string | null };
}

export interface ApiOperator {
  id: string;
  email?: string;
}

export interface ApiWorkspace {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'operator' | 'viewer';
}

export interface ApiWorkspaceMember {
  membershipId: string;
  userId: string;
  role: 'owner' | 'operator' | 'viewer';
  createdAt: string;
  isCurrentActor: boolean;
}

export interface ApiAcceptedWorkspaceInvitation {
  workspaceId: string;
  role: 'owner' | 'operator' | 'viewer';
}

export type ApiCustomerLoyaltyType = 'NEW' | 'RECURRING';

export interface ApiWorkspaceOperationalSettings {
  workspaceId: string;
  commercialConfig: Record<string, unknown>;
  loyaltyOverrides: Record<string, ApiCustomerLoyaltyType>;
  dailyTargetRevenueMinor: number;
  slaPolicy: { firstResponseMinutes: number };
  updatedAt: string | null;
}

export interface ApiWorkspaceOperationalSettingsPatch {
  commercialConfig?: Record<string, unknown>;
  loyaltyOverrides?: Record<string, ApiCustomerLoyaltyType>;
  dailyTargetRevenueMinor?: number;
  slaPolicy?: { firstResponseMinutes: number };
}

export interface ApiUpdatedContact {
  contactId: string;
  name: string | null;
}

export interface ApiClientWorkspaceResult {
  workspaceId: string;
  workspaceName: string;
  membershipId: string;
  role: 'owner';
  channelConnectionId: string;
  slug: string;
  channelProvider: 'meta_cloud' | 'waha';
  channelStatus: 'DISCONNECTED';
  ownerAccess: 'agency_owner';
}

export interface ApiPriority {
  journeyId: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  pipelineStage: string | null;
  handoffCaseId: string | null;
  handoffStatus: string | null;
  assignedToUserId: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  followUpDueAt: string | null;
  slaDeadline: string | null;
  slaState: 'OK' | 'DUE' | 'OVERDUE';
  priorityReason: string;
  unreadCount: number;
}

export interface ApiJourney {
  id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  status: 'OPEN' | 'WON' | 'LOST' | 'ABANDONED';
  pipelineStage: string | null;
  primaryServiceOrProduct: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface ApiMediaPayload {
  mediaType: 'image' | 'audio' | 'video' | 'document' | 'ptt' | 'sticker' | 'other';
  url?: string;
  mimetype?: string;
  caption?: string;
  fileName?: string;
  fileSize?: number | string;
  duration?: number;
  authorOrSpeaker?: string;
}

export interface ApiMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  senderType: 'customer' | 'ai' | 'operator' | 'system';
  textContent: string | null;
  mediaPayload?: ApiMediaPayload | null;
  sentAt: string;
}

/**
 * The authenticated detail projection intentionally mirrors the API read
 * model. Keep it separate from the richer fixture-only `Journey` type: fields
 * that do not exist in the database must remain visibly unavailable instead
 * of being inferred by the browser.
 */
export interface ApiCockpitView {
  journey: {
    id: string;
    contactId: string;
    status: ApiJourney['status'];
    pipelineStage: string | null;
    primaryServiceOrProduct: string | null;
    totalRevenueMinor: number;
    currency: string;
    startedAt: string;
    closedAt: string | null;
    updatedAt: string;
    contact: { id: string; name: string | null; phone: string };
    channel: { id: string; provider: string; phoneNumber: string; name: string; status: string } | null;
  };
  acquisitionContexts: Array<{
    id: string;
    source: string;
    campaignId: string | null;
    campaignName: string | null;
    adSetId: string | null;
    adId: string | null;
    creativeCode: string | null;
    offerHook: string | null;
    entryMessage: string | null;
    confidence: string;
    occurredAt: string;
  }>;
  messages: ApiMessage[];
  knownFacts: Array<{
    id: string;
    key: string;
    value: unknown;
    source: string;
    confidence: number;
    confirmedByCustomer: boolean;
    observedAt: string;
  }>;
  decisionState: {
    currentStage: string;
    stageConfidence: number;
    primaryFriction: string | null;
    secondaryFrictions: unknown;
    frictionEvidence: string | null;
    frictionConfidence: number;
    frictionResolved: boolean;
    updatedAt: string;
  } | null;
  recommendation: {
    id: string;
    suggestedAction: string;
    suggestedDraftText: string | null;
    microCommitmentGoal: string;
    confidence: number;
    policyStatus: string;
    policyReason: string | null;
    createdAt: string;
  } | null;
  handoff: {
    id: string;
    status: string;
    assignedToUserId: string | null;
    briefing: unknown;
    triggerReason: string;
    openedAt: string;
    acceptedAt: string | null;
    resolvedAt: string | null;
  } | null;
  outcome: {
    id: string;
    result: string;
    finalRevenueMinor: number | null;
    currency: string;
    closedReason: string | null;
    capiStatus: string;
    occurredAt: string;
  } | null;
}

/**
 * Authenticated acquisition-cohort evidence returned by the Traffic Proof API.
 * `spendMinor` and `roas` deliberately remain nullable: a missing media import
 * is not the same thing as zero spend or zero return.
 */
export interface ApiTrafficProofCampaign {
  source: string;
  campaignId: string | null;
  campaignName: string | null;
  acquiredLeads: number;
  wonOutcomes: number;
  lostOutcomes: number;
  revenueMinor: number;
  spendMinor: number | null;
  roas: number | null;
  currency: 'BRL';
}

export interface ApiTrafficProofReport {
  data: ApiTrafficProofCampaign[];
  meta: {
    from: string;
    to: string;
    limit: number;
    basis: 'acquisition_cohort';
  };
}

export type ApiTrafficProofResponse = ApiTrafficProofReport;

export interface TrafficProofStats {
  workspaceId: string;
  totalLeadsAttributed: number;
  totalCtwaCostBrl: number;
  totalDealsWonBrl: number;
  roasRatio: number;
  slaAdherenceRate: number; // e.g. 96.4%
  avgFirstResponseMinutes: number;
  campaigns: {
    campaignName: string;
    leadsCount: number;
    spendBrl: number;
    conversionsCount: number;
    revenueBrl: number;
    conversionRate: number;
  }[];
}

export interface SalesOsGateway {
  getWorkspaces(): Promise<Workspace[]>;
  getJourneys(workspaceId: string, search?: string): Promise<Journey[]>;
  getJourneyById(journeyId: string): Promise<Journey | null>;
  getMessages(journeyId: string): Promise<Message[]>;
  claimHandoff(journeyId: string, operatorId: string, operatorName: string): Promise<Journey>;
  releaseHandoff(journeyId: string): Promise<Journey>;
  sendMessage(payload: SendMessagePayload): Promise<Message>;
  saveDraft(journeyId: string, draftText: string): void;
  getDraft(journeyId: string): string;
  markOutcome(journeyId: string, outcome: Omit<JourneyOutcome, 'id' | 'closedAt'>): Promise<Journey>;
  updateJourneyStage(
    journeyId: string,
    stage: CommercialStage,
    options?: {
      dealValueBrl?: number;
      reason?: string;
      operatorId?: string;
      operatorName?: string;
    }
  ): Promise<Journey>;
  updateJourney(updated: Journey): Promise<Journey>;
  toggleChannelPause(channelId: string, pausedBy: string, reason?: string): Promise<Channel>;
  getTrafficStats(workspaceId: string): Promise<TrafficProofStats>;
  simulateIncomingLeadMessage(journeyId: string, text: string): Promise<Message>;
  resetJourneysToDefault(): Promise<void>;

  listAppointments(workspaceId: string, filters?: { status?: AppointmentStatus; leadPhone?: string }): Promise<CommercialAppointment[]>;
  createAppointment(workspaceId: string, input: Partial<CommercialAppointment>): Promise<CommercialAppointment>;
  updateAppointment(workspaceId: string, appointmentId: string, input: Partial<CommercialAppointment>): Promise<CommercialAppointment>;
  deleteAppointment(workspaceId: string, appointmentId: string): Promise<void>;

  listNotes(workspaceId: string, filters?: { category?: NoteCategory; pinned?: boolean }): Promise<OperationalNote[]>;
  createNote(workspaceId: string, input: Partial<OperationalNote>): Promise<OperationalNote>;
  updateNote(workspaceId: string, noteId: string, input: Partial<OperationalNote>): Promise<OperationalNote>;
  deleteNote(workspaceId: string, noteId: string): Promise<void>;

  getWorkspaceOperationalSettings(workspaceId: string): Promise<ApiWorkspaceOperationalSettings>;
  listWorkspaceMembers(workspaceId: string): Promise<ApiWorkspaceMember[]>;
  acceptWorkspaceInvitation(code: string): Promise<ApiAcceptedWorkspaceInvitation>;
  updateWorkspaceOperationalSettings(
    workspaceId: string,
    input: ApiWorkspaceOperationalSettingsPatch,
  ): Promise<ApiWorkspaceOperationalSettings>;
  updateContactName(workspaceId: string, contactId: string, name: string): Promise<ApiUpdatedContact>;

  getGhostingOpportunities(workspaceId: string): Promise<any[]>;
  resurrectJourney(workspaceId: string, journeyId: string): Promise<any | null>;
  getRetentionOpportunities(workspaceId: string): Promise<any[]>;
}

const JOURNEYS_STORAGE_KEY = 'sales_os_journeys_v2';

export class MockSalesOsGateway implements SalesOsGateway {
  private workspaces: Workspace[];
  private journeys: Map<string, Journey[]> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private drafts: Map<string, string> = new Map();
  private operationalSettings: Map<string, ApiWorkspaceOperationalSettings> = new Map();
  public simulateNetworkDelayMs = 200;
  public shouldFailNextSend = false;

  constructor() {
    this.workspaces = JSON.parse(JSON.stringify(mockWorkspaces));

    // Try loading persisted journeys from localStorage
    let loadedFromStorage = false;
    try {
      const stored = localStorage.getItem(JOURNEYS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          Object.entries(parsed).forEach(([wsId, jList]) => {
            this.journeys.set(wsId, jList as Journey[]);
          });
          loadedFromStorage = true;
        }
      }
    } catch {
      // ignore
    }

    if (!loadedFromStorage || this.journeys.size === 0) {
      this.journeys.set('ws-haven-beauty', JSON.parse(JSON.stringify(mockJourneysEscovaria)));
      this.journeys.set('ws-sos-sales-official', JSON.parse(JSON.stringify(mockJourneysTitanium)));
      this.journeys.set('ws-escovaria', JSON.parse(JSON.stringify(mockJourneysEscovaria)));
      this.journeys.set('ws-peliculas', JSON.parse(JSON.stringify(mockJourneysTitanium)));
      this.journeys.set('ws-agencia', JSON.parse(JSON.stringify(mockJourneysEscovaria)));
      this.persistJourneys();
    } else {
      if (!this.journeys.has('ws-haven-beauty')) {
        this.journeys.set('ws-haven-beauty', JSON.parse(JSON.stringify(mockJourneysEscovaria)));
      }
      if (!this.journeys.has('ws-sos-sales-official')) {
        this.journeys.set('ws-sos-sales-official', JSON.parse(JSON.stringify(mockJourneysTitanium)));
      }
      this.persistJourneys();
    }

    Object.entries(mockMessagesByJourney).forEach(([jId, msgs]) => {
      this.messages.set(jId, JSON.parse(JSON.stringify(msgs)));
    });

    // Load drafts from localStorage if available
    try {
      const saved = localStorage.getItem('sales_os_drafts');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.entries(parsed).forEach(([k, v]) => this.drafts.set(k, v as string));
      }
    } catch {
      // ignore
    }
  }

  private persistJourneys() {
    try {
      const obj: Record<string, Journey[]> = {};
      this.journeys.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(JOURNEYS_STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  private async sleep(ms = this.simulateNetworkDelayMs) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async resetJourneysToDefault(): Promise<void> {
    await this.sleep(100);
    this.journeys.set('ws-haven-beauty', JSON.parse(JSON.stringify(mockJourneysEscovaria)));
    this.journeys.set('ws-sos-sales-official', JSON.parse(JSON.stringify(mockJourneysTitanium)));
    this.journeys.set('ws-escovaria', JSON.parse(JSON.stringify(mockJourneysEscovaria)));
    this.journeys.set('ws-peliculas', JSON.parse(JSON.stringify(mockJourneysTitanium)));
    this.persistJourneys();
  }

  async getWorkspaces(): Promise<Workspace[]> {
    await this.sleep(80);
    return JSON.parse(JSON.stringify(this.workspaces));
  }

  async getJourneys(workspaceId: string, search?: string): Promise<Journey[]> {
    await this.sleep(120);
    let list = this.journeys.get(workspaceId);
    if (!list || list.length === 0) {
      if (workspaceId.includes('haven') || workspaceId.includes('escovaria')) {
        list = JSON.parse(JSON.stringify(mockJourneysEscovaria));
      } else {
        list = JSON.parse(JSON.stringify(mockJourneysTitanium));
      }
      this.journeys.set(workspaceId, list);
      this.persistJourneys();
    }
    if (!search || !search.trim()) {
      return JSON.parse(JSON.stringify(list));
    }
    const q = search.toLowerCase().trim();
    const filtered = list.filter(
      (j) =>
        j.leadName.toLowerCase().includes(q) ||
        j.leadPhone.includes(q) ||
        j.urgencyReason.toLowerCase().includes(q) ||
        j.acquisition.campaignName?.toLowerCase().includes(q)
    );
    return JSON.parse(JSON.stringify(filtered));
  }

  async getJourneyById(journeyId: string): Promise<Journey | null> {
    await this.sleep(60);
    for (const list of this.journeys.values()) {
      const match = list.find((j) => j.id === journeyId);
      if (match) return JSON.parse(JSON.stringify(match));
    }
    return null;
  }

  async getMessages(journeyId: string): Promise<Message[]> {
    await this.sleep(80);
    const list = this.messages.get(journeyId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  async claimHandoff(journeyId: string, operatorId: string, operatorName: string): Promise<Journey> {
    await this.sleep(150);
    for (const [wsId, list] of this.journeys.entries()) {
      const index = list.findIndex((j) => j.id === journeyId);
      if (index !== -1) {
        list[index].handoffStatus = 'in_progress';
        list[index].assignedOperatorId = operatorId;
        list[index].assignedOperatorName = operatorName;
        list[index].unreadCount = 0;
        this.journeys.set(wsId, list);
        this.persistJourneys();
        return JSON.parse(JSON.stringify(list[index]));
      }
    }
    throw new Error(`Journey ${journeyId} not found`);
  }

  async releaseHandoff(journeyId: string): Promise<Journey> {
    await this.sleep(150);
    for (const [wsId, list] of this.journeys.entries()) {
      const index = list.findIndex((j) => j.id === journeyId);
      if (index !== -1) {
        list[index].handoffStatus = 'pending_operator';
        list[index].assignedOperatorId = undefined;
        list[index].assignedOperatorName = undefined;
        this.journeys.set(wsId, list);
        this.persistJourneys();
        return JSON.parse(JSON.stringify(list[index]));
      }
    }
    throw new Error(`Journey ${journeyId} not found`);
  }

  async updateJourneyStage(
    journeyId: string,
    stage: CommercialStage,
    options?: {
      dealValueBrl?: number;
      reason?: string;
      operatorId?: string;
      operatorName?: string;
    }
  ): Promise<Journey> {
    await this.sleep(120);
    for (const [wsId, list] of this.journeys.entries()) {
      const index = list.findIndex((j) => j.id === journeyId);
      if (index !== -1) {
        const item = list[index];
        item.stage = stage;
        item.lastActivityAt = new Date().toISOString();

        if (options?.dealValueBrl !== undefined) {
          item.estimatedDealValueBrl = options.dealValueBrl;
        }

        if (stage === 'won') {
          item.handoffStatus = 'resolved';
          item.outcome = {
            id: `out-${Date.now()}`,
            journeyId: item.id,
            status: 'won',
            dealValueBrl: options?.dealValueBrl || item.estimatedDealValueBrl || (wsId === 'ws-escovaria' ? 149 : 850),
            closedAt: new Date().toISOString(),
            closedBy: options?.operatorName || 'Operador Comercial',
            serviceOrProduct: item.knownFacts.find((f) => f.namespace === 'servico' || f.namespace === 'produto')?.value || 'Serviço Comercial',
            reason: options?.reason || 'Fechamento concluído via WhatsApp',
          };
        } else if (stage === 'lost') {
          item.handoffStatus = 'resolved';
          item.outcome = {
            id: `out-${Date.now()}`,
            journeyId: item.id,
            status: 'lost',
            dealValueBrl: 0,
            closedAt: new Date().toISOString(),
            closedBy: options?.operatorName || 'Operador Comercial',
            reason: options?.reason || 'Lead declinou proposta ou parou de responder',
          };
        } else {
          // If moved back to an active stage, remove outcome
          if (item.outcome) {
            item.outcome = undefined;
          }
          if (item.handoffStatus === 'resolved') {
            item.handoffStatus = 'in_progress';
          }
        }

        this.journeys.set(wsId, list);
        this.persistJourneys();
        return JSON.parse(JSON.stringify(item));
      }
    }
    throw new Error(`Journey ${journeyId} not found`);
  }

  async updateJourney(updated: Journey): Promise<Journey> {
    await this.sleep(100);
    for (const [wsId, list] of this.journeys.entries()) {
      const index = list.findIndex((j) => j.id === updated.id);
      if (index !== -1) {
        list[index] = { ...updated, lastActivityAt: new Date().toISOString() };
        this.journeys.set(wsId, list);
        this.persistJourneys();
        return JSON.parse(JSON.stringify(list[index]));
      }
    }
    throw new Error(`Journey ${updated.id} not found`);
  }

  async sendMessage(payload: SendMessagePayload): Promise<Message> {
    await this.sleep(250);

    // Verify channel health
    const journey = await this.getJourneyById(payload.journeyId);
    if (!journey) throw new Error('Jornada não encontrada');

    const channel = this.findChannel(journey.channelId);
    if (channel && channel.health === 'paused') {
      throw new Error(`Canal pausado por ${channel.pausedBy || 'Supervisor'}. Envio bloqueado para proteger a integridade.`);
    }

    if (this.shouldFailNextSend) {
      this.shouldFailNextSend = false;
      throw new Error('Falha temporária de conexão com o servidor de mensagens. Tente novamente.');
    }

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newMsg: Message = {
      id: `m-sent-${Date.now()}`,
      journeyId: payload.journeyId,
      sender: 'operator',
      senderName: payload.senderName,
      text: payload.text,
      timestamp: timeStr,
      status: 'delivered',
    };

    const currentMsgs = this.messages.get(payload.journeyId) || [];
    currentMsgs.push(newMsg);
    this.messages.set(payload.journeyId, currentMsgs);

    // Clear saved draft
    this.drafts.delete(payload.journeyId);
    this.persistDrafts();

    return JSON.parse(JSON.stringify(newMsg));
  }

  saveDraft(journeyId: string, draftText: string): void {
    if (!draftText.trim()) {
      this.drafts.delete(journeyId);
    } else {
      this.drafts.set(journeyId, draftText);
    }
    this.persistDrafts();
  }

  getDraft(journeyId: string): string {
    return this.drafts.get(journeyId) || '';
  }

  private persistDrafts() {
    try {
      const obj: Record<string, string> = {};
      this.drafts.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem('sales_os_drafts', JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  async markOutcome(
    journeyId: string,
    outcomeData: Omit<JourneyOutcome, 'id' | 'closedAt'>
  ): Promise<Journey> {
    await this.sleep(200);
    for (const [wsId, list] of this.journeys.entries()) {
      const index = list.findIndex((j) => j.id === journeyId);
      if (index !== -1) {
        const fullOutcome: JourneyOutcome = {
          id: `out-${Date.now()}`,
          journeyId,
          ...outcomeData,
          closedAt: new Date().toISOString(),
        };
        list[index].outcome = fullOutcome;
        list[index].handoffStatus = 'resolved';
        this.journeys.set(wsId, list);
        return JSON.parse(JSON.stringify(list[index]));
      }
    }
    throw new Error(`Journey ${journeyId} not found`);
  }

  async toggleChannelPause(channelId: string, pausedBy: string, reason?: string): Promise<Channel> {
    await this.sleep(150);
    for (const ws of this.workspaces) {
      const ch = ws.channels.find((c) => c.id === channelId);
      if (ch) {
        if (ch.health === 'paused') {
          ch.health = 'connected';
          ch.pausedBy = undefined;
          ch.pausedAt = undefined;
          ch.pauseReason = undefined;
        } else {
          ch.health = 'paused';
          ch.pausedBy = pausedBy;
          ch.pausedAt = new Date().toISOString();
          ch.pauseReason = reason || 'Pausa operacional manual';
        }
        return JSON.parse(JSON.stringify(ch));
      }
    }
    throw new Error(`Canal ${channelId} não encontrado`);
  }

  private findChannel(channelId: string): Channel | undefined {
    for (const ws of this.workspaces) {
      const ch = ws.channels.find((c) => c.id === channelId);
      if (ch) return ch;
    }
    return undefined;
  }

  async getTrafficStats(workspaceId: string): Promise<TrafficProofStats> {
    await this.sleep(200);
    const list = this.journeys.get(workspaceId) || [];
    let totalCtwaCost = 0;
    let totalDealsWon = 0;
    let totalLeads = list.length;

    const campaignMap = new Map<
      string,
      { leads: number; spend: number; conversions: number; revenue: number }
    >();

    list.forEach((j) => {
      const camp = j.acquisition.campaignName || 'Origem Orgânica / Direto';
      const cost = j.acquisition.attributedCostBrl || 0;
      const wonValue = j.outcome?.status === 'won' ? j.outcome.dealValueBrl || 0 : 0;

      totalCtwaCost += cost;
      totalDealsWon += wonValue;

      const current = campaignMap.get(camp) || {
        leads: 0,
        spend: 0,
        conversions: 0,
        revenue: 0,
      };
      current.leads += 1;
      current.spend += cost;
      if (j.outcome?.status === 'won') {
        current.conversions += 1;
        current.revenue += wonValue;
      }
      campaignMap.set(camp, current);
    });

    const campaigns = Array.from(campaignMap.entries()).map(([name, data]) => ({
      campaignName: name,
      leadsCount: data.leads,
      spendBrl: data.spend,
      conversionsCount: data.conversions,
      revenueBrl: data.revenue,
      conversionRate: data.leads > 0 ? (data.conversions / data.leads) * 100 : 0,
    }));

    const roas = totalCtwaCost > 0 ? totalDealsWon / totalCtwaCost : 0;

    return {
      workspaceId,
      totalLeadsAttributed: totalLeads,
      totalCtwaCostBrl: totalCtwaCost,
      totalDealsWonBrl: totalDealsWon,
      roasRatio: parseFloat(roas.toFixed(2)),
      slaAdherenceRate: 95.8,
      avgFirstResponseMinutes: 1.8,
      campaigns,
    };
  }

  async simulateIncomingLeadMessage(journeyId: string, text: string): Promise<Message> {
    await this.sleep(150);
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newMsg: Message = {
      id: `m-lead-${Date.now()}`,
      journeyId,
      sender: 'lead',
      text,
      timestamp: timeStr,
      status: 'read',
    };

    const currentMsgs = this.messages.get(journeyId) || [];
    currentMsgs.push(newMsg);
    this.messages.set(journeyId, currentMsgs);

    // Update journey lastLeadMessage and urgency
    for (const [, list] of this.journeys.entries()) {
      const match = list.find((j) => j.id === journeyId);
      if (match) {
        match.lastLeadMessage = text;
        match.lastActivityAt = now.toISOString();
        match.unreadCount += 1;
      }
    }

    return JSON.parse(JSON.stringify(newMsg));
  }

  private mockAppointmentsList: CommercialAppointment[] = JSON.parse(JSON.stringify(mockAppointments));
  private mockNotesList: OperationalNote[] = JSON.parse(JSON.stringify(mockOperationalNotes));

  async listAppointments(
    workspaceId: string,
    filters?: { status?: AppointmentStatus; leadPhone?: string },
  ): Promise<CommercialAppointment[]> {
    await this.sleep(100);
    return this.mockAppointmentsList.filter((a) => {
      if (a.workspaceId && a.workspaceId !== workspaceId) return false;
      if (filters?.status && a.status !== filters.status) return false;
      if (filters?.leadPhone && a.leadPhone !== filters.leadPhone) return false;
      return true;
    });
  }

  async createAppointment(
    workspaceId: string,
    input: Partial<CommercialAppointment>,
  ): Promise<CommercialAppointment> {
    await this.sleep(100);
    const newApt: CommercialAppointment = {
      id: `apt-${Date.now()}`,
      workspaceId,
      leadName: input.leadName || 'Novo Lead',
      leadPhone: input.leadPhone || '+5511999999999',
      serviceName: input.serviceName || 'Consulta Geral',
      serviceValue: input.serviceValue ?? 1500,
      scheduledAt: input.scheduledAt || new Date().toISOString(),
      durationMinutes: input.durationMinutes ?? 45,
      status: input.status || 'confirmed',
      source: input.source || 'operator',
      operatorName: input.operatorName || 'Operador',
      notes: input.notes,
      location: input.location,
    };
    this.mockAppointmentsList.unshift(newApt);
    return JSON.parse(JSON.stringify(newApt));
  }

  async updateAppointment(
    _workspaceId: string,
    appointmentId: string,
    input: Partial<CommercialAppointment>,
  ): Promise<CommercialAppointment> {
    await this.sleep(100);
    const idx = this.mockAppointmentsList.findIndex((a) => a.id === appointmentId);
    if (idx === -1) throw new Error(`Appointment ${appointmentId} not found`);
    this.mockAppointmentsList[idx] = { ...this.mockAppointmentsList[idx], ...input };
    return JSON.parse(JSON.stringify(this.mockAppointmentsList[idx]));
  }

  async deleteAppointment(_workspaceId: string, appointmentId: string): Promise<void> {
    await this.sleep(100);
    this.mockAppointmentsList = this.mockAppointmentsList.filter((a) => a.id !== appointmentId);
  }

  async listNotes(
    workspaceId: string,
    filters?: { category?: NoteCategory; pinned?: boolean },
  ): Promise<OperationalNote[]> {
    await this.sleep(100);
    return this.mockNotesList.filter((n) => {
      if (n.workspaceId && n.workspaceId !== workspaceId) return false;
      if (filters?.category && n.category !== filters.category) return false;
      if (filters?.pinned !== undefined && n.pinned !== filters.pinned) return false;
      return true;
    });
  }

  async createNote(
    workspaceId: string,
    input: Partial<OperationalNote>,
  ): Promise<OperationalNote> {
    await this.sleep(100);
    const now = new Date().toISOString();
    const newNote: OperationalNote = {
      id: `note-${Date.now()}`,
      workspaceId,
      title: input.title || 'Nova Anotação',
      content: input.content || '',
      category: input.category || 'general',
      tags: input.tags || [],
      pinned: input.pinned ?? false,
      color: input.color || 'emerald',
      authorName: input.authorName || 'Operador',
      createdAt: now,
      updatedAt: now,
    };
    this.mockNotesList.unshift(newNote);
    return JSON.parse(JSON.stringify(newNote));
  }

  async updateNote(
    _workspaceId: string,
    noteId: string,
    input: Partial<OperationalNote>,
  ): Promise<OperationalNote> {
    await this.sleep(100);
    const idx = this.mockNotesList.findIndex((n) => n.id === noteId);
    if (idx === -1) throw new Error(`Note ${noteId} not found`);
    this.mockNotesList[idx] = {
      ...this.mockNotesList[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    };
    return JSON.parse(JSON.stringify(this.mockNotesList[idx]));
  }

  async deleteNote(_workspaceId: string, noteId: string): Promise<void> {
    await this.sleep(100);
    this.mockNotesList = this.mockNotesList.filter((n) => n.id !== noteId);
  }

  async getWorkspaceOperationalSettings(workspaceId: string): Promise<ApiWorkspaceOperationalSettings> {
    await this.sleep(80);
    const settings = this.operationalSettings.get(workspaceId) ?? {
      workspaceId,
      commercialConfig: {},
      loyaltyOverrides: {},
      dailyTargetRevenueMinor: 0,
      slaPolicy: { firstResponseMinutes: 15 },
      updatedAt: null,
    };
    return JSON.parse(JSON.stringify(settings));
  }

  async listWorkspaceMembers(_workspaceId: string): Promise<ApiWorkspaceMember[]> {
    return [];
  }

  async acceptWorkspaceInvitation(_code: string): Promise<ApiAcceptedWorkspaceInvitation> {
    throw new SalesOsOperationUnavailableError('Aceitar convite de workspace');
  }

  async updateWorkspaceOperationalSettings(
    workspaceId: string,
    input: ApiWorkspaceOperationalSettingsPatch,
  ): Promise<ApiWorkspaceOperationalSettings> {
    await this.sleep(100);
    const current = await this.getWorkspaceOperationalSettings(workspaceId);
    const next: ApiWorkspaceOperationalSettings = {
      workspaceId,
      commercialConfig: input.commercialConfig ?? current.commercialConfig,
      loyaltyOverrides: input.loyaltyOverrides ?? current.loyaltyOverrides,
      dailyTargetRevenueMinor: input.dailyTargetRevenueMinor ?? current.dailyTargetRevenueMinor,
      slaPolicy: input.slaPolicy ?? current.slaPolicy,
      updatedAt: new Date().toISOString(),
    };
    this.operationalSettings.set(workspaceId, next);
    return JSON.parse(JSON.stringify(next));
  }

  async updateContactName(_workspaceId: string, _contactId: string, _name: string): Promise<ApiUpdatedContact> {
    throw new SalesOsOperationUnavailableError('Atualizar nome de contato');
  }

  async getGhostingOpportunities(_workspaceId: string): Promise<any[]> {
    return [];
  }

  async resurrectJourney(_workspaceId: string, _journeyId: string): Promise<any | null> {
    return null;
  }

  async getRetentionOpportunities(_workspaceId: string): Promise<any[]> {
    return [];
  }
}

/**
 * Authenticated transport for the API contracts that exist today.
 *
 * The current operator cockpit prototype expects a richer `Journey` projection
 * than the safe read API exposes. For that reason this class also exposes the
 * raw, contract-shaped `list*` methods below. Do not select this gateway for
 * the existing fixture-shaped cockpit until its read-model adapter is complete.
 */
export class HttpSalesOsGateway implements SalesOsGateway {
  private readonly baseUrl: string;
  private readonly accessTokenProvider: AccessTokenProvider;

  constructor(options: { baseUrl: string; accessTokenProvider: AccessTokenProvider }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.accessTokenProvider = options.accessTokenProvider;
  }

  async getCurrentOperator(): Promise<ApiOperator> {
    return this.request<ApiOperator>('/me');
  }

  async listWorkspaces(): Promise<ApiWorkspace[]> {
    return (await this.request<ApiEnvelope<ApiWorkspace[]>>('/workspaces')).data;
  }

  async initializeWorkspace(workspaceName?: string): Promise<{
    workspaceId: string;
    workspaceName: string;
    membershipId: string;
    role: 'owner';
    channelConnectionId: string;
    isExisting?: boolean;
  }> {
    const response = await this.request<ApiEnvelope<{
      workspaceId: string;
      workspaceName: string;
      membershipId: string;
      role: 'owner';
      channelConnectionId: string;
      isExisting?: boolean;
    }>>('/workspaces/init', {
      method: 'POST',
      body: workspaceName ? { workspaceName } : {},
    });
    return response.data;
  }

  async createClientWorkspace(
    parentWorkspaceId: string,
    input: {
      name: string;
      businessType: 'hair_salon' | 'auto_film' | 'general_services';
      tagline: string;
      ownerEmail?: string;
      whatsappNumber?: string;
      provider: 'waba' | 'waha';
    },
  ): Promise<ApiClientWorkspaceResult> {
    return (await this.request<ApiEnvelope<ApiClientWorkspaceResult>>(
      `/workspaces/${encodeURIComponent(parentWorkspaceId)}/client-workspaces`,
      { method: 'POST', body: input },
    )).data;
  }

  async deactivateWorkspace(workspaceId: string): Promise<void> {
    await this.request<ApiEnvelope<{ workspaceId: string; status: 'deactivated' }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}`,
      { method: 'DELETE' },
    );
  }

  async listPriorities(workspaceId: string, limit = 5): Promise<ApiPriority[]> {
    const params = new URLSearchParams({ limit: String(this.bounded(limit, 1, 50)) });
    return (await this.request<ApiEnvelope<ApiPriority[]>>(`/workspaces/${encodeURIComponent(workspaceId)}/priorities?${params}`)).data;
  }

  async listJourneys(
    workspaceId: string,
    options: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ data: ApiJourney[]; nextCursor: string | null }> {
    const params = new URLSearchParams({ limit: String(this.bounded(options.limit ?? 20, 1, 50)) });
    if (options.cursor) params.set('cursor', options.cursor);
    const response = await this.request<ApiEnvelope<ApiJourney[]>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/journeys?${params}`,
    );
    return { data: response.data, nextCursor: response.meta?.nextCursor ?? null };
  }

  async listMessages(
    journeyId: string,
    options: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ data: ApiMessage[]; nextCursor: string | null }> {
    const params = new URLSearchParams({ limit: String(this.bounded(options.limit ?? 50, 1, 100)) });
    if (options.cursor) params.set('cursor', options.cursor);
    const response = await this.request<ApiEnvelope<ApiMessage[]>>(
      `/journeys/${encodeURIComponent(journeyId)}/messages?${params}`,
    );
    return { data: response.data, nextCursor: response.meta?.nextCursor ?? null };
  }

  async getCockpit(
    workspaceId: string,
    journeyId: string,
    messageLimit = 50,
  ): Promise<ApiCockpitView> {
    const params = new URLSearchParams({ messageLimit: String(this.bounded(messageLimit, 1, 50)) });
    return (await this.request<ApiEnvelope<ApiCockpitView>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/journeys/${encodeURIComponent(journeyId)}/cockpit?${params}`,
    )).data;
  }

  async getTrafficProof(
    workspaceId: string,
    options: { from: string; to: string; limit?: number },
  ): Promise<ApiTrafficProofReport> {
    const params = new URLSearchParams({
      from: options.from,
      to: options.to,
      limit: String(this.bounded(options.limit ?? 50, 1, 100)),
    });
    return this.request<ApiTrafficProofReport>(
      `/workspaces/${encodeURIComponent(workspaceId)}/traffic-proof?${params}`,
    );
  }

  async getTrafficProofMetrics(
    workspaceId: string,
    options: { from: string; to: string; limit?: number },
  ): Promise<any> {
    return this.getTrafficProof(workspaceId, options);
  }

  async listAppointments(
    workspaceId: string,
    filters?: { status?: AppointmentStatus; leadPhone?: string },
  ): Promise<CommercialAppointment[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.leadPhone) params.set('leadPhone', filters.leadPhone);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await this.request<ApiEnvelope<any[]>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/appointments${qs}`,
    );
    return (response.data || []).map((item) => ({
      ...item,
      serviceValue: item.serviceValue ?? (item.serviceValueMinor !== undefined ? item.serviceValueMinor / 100 : 0),
    }));
  }

  async createAppointment(
    workspaceId: string,
    input: Partial<CommercialAppointment>,
  ): Promise<CommercialAppointment> {
    const serviceValueMinor = input.serviceValueMinor !== undefined
      ? input.serviceValueMinor
      : Math.round((input.serviceValue ?? 0) * 100);

    const body: Record<string, unknown> = {
      ...input,
      serviceValueMinor,
    };
    delete (body as any).serviceValue;

    const response = await this.request<ApiEnvelope<any>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/appointments`,
      {
        method: 'POST',
        body,
      },
    );
    const item = response.data;
    return {
      ...item,
      serviceValue: item.serviceValue ?? (item.serviceValueMinor !== undefined ? item.serviceValueMinor / 100 : 0),
    };
  }

  async updateAppointment(
    workspaceId: string,
    appointmentId: string,
    input: Partial<CommercialAppointment>,
  ): Promise<CommercialAppointment> {
    const body: Record<string, unknown> = { ...input };
    if (input.serviceValue !== undefined) {
      body.serviceValueMinor = Math.round(input.serviceValue * 100);
      delete body.serviceValue;
    }

    const response = await this.request<ApiEnvelope<any>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/appointments/${encodeURIComponent(appointmentId)}`,
      {
        method: 'PATCH',
        body,
      },
    );
    const item = response.data;
    return {
      ...item,
      serviceValue: item.serviceValue ?? (item.serviceValueMinor !== undefined ? item.serviceValueMinor / 100 : 0),
    };
  }

  async deleteAppointment(workspaceId: string, appointmentId: string): Promise<void> {
    await this.request<void>(
      `/workspaces/${encodeURIComponent(workspaceId)}/appointments/${encodeURIComponent(appointmentId)}`,
      {
        method: 'DELETE',
      },
    );
  }

  async listNotes(
    workspaceId: string,
    filters?: { category?: NoteCategory; pinned?: boolean },
  ): Promise<OperationalNote[]> {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.pinned !== undefined) params.set('pinnedOnly', String(filters.pinned));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await this.request<ApiEnvelope<OperationalNote[]>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notes${qs}`,
    );
    return response.data;
  }

  async createNote(
    workspaceId: string,
    input: Partial<OperationalNote>,
  ): Promise<OperationalNote> {
    const response = await this.request<ApiEnvelope<OperationalNote>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notes`,
      {
        method: 'POST',
        body: input,
      },
    );
    return response.data;
  }

  async updateNote(
    workspaceId: string,
    noteId: string,
    input: Partial<OperationalNote>,
  ): Promise<OperationalNote> {
    const response = await this.request<ApiEnvelope<OperationalNote>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notes/${encodeURIComponent(noteId)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
    return response.data;
  }

  async deleteNote(workspaceId: string, noteId: string): Promise<void> {
    await this.request<void>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notes/${encodeURIComponent(noteId)}`,
      {
        method: 'DELETE',
      },
    );
  }

  async getWorkspaceOperationalSettings(workspaceId: string): Promise<ApiWorkspaceOperationalSettings> {
    const response = await this.request<ApiEnvelope<ApiWorkspaceOperationalSettings>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/operational-settings`,
    );
    return response.data;
  }

  async listWorkspaceMembers(workspaceId: string): Promise<ApiWorkspaceMember[]> {
    return (await this.request<ApiEnvelope<ApiWorkspaceMember[]>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/members`,
    )).data;
  }

  async acceptWorkspaceInvitation(code: string): Promise<ApiAcceptedWorkspaceInvitation> {
    return (await this.request<ApiEnvelope<ApiAcceptedWorkspaceInvitation>>(
      '/workspace-member-invitations/accept',
      { method: 'POST', body: { code } },
    )).data;
  }

  async updateWorkspaceOperationalSettings(
    workspaceId: string,
    input: ApiWorkspaceOperationalSettingsPatch,
  ): Promise<ApiWorkspaceOperationalSettings> {
    const response = await this.request<ApiEnvelope<ApiWorkspaceOperationalSettings>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/operational-settings`,
      { method: 'PATCH', body: input },
    );
    return response.data;
  }

  async updateContactName(workspaceId: string, contactId: string, name: string): Promise<ApiUpdatedContact> {
    const response = await this.request<ApiEnvelope<ApiUpdatedContact>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contacts/${encodeURIComponent(contactId)}`,
      { method: 'PATCH', body: { name } },
    );
    return response.data;
  }

  async acceptHandoff(
    workspaceId: string,
    handoffCaseId: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ handoffCaseId: string; status: string; acceptedAt: string }> {
    const response = await this.request<ApiEnvelope<{ handoffCaseId: string; status: string; acceptedAt: string }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/handoffs/${encodeURIComponent(handoffCaseId)}/accept`,
      { method: 'POST', headers: { 'idempotency-key': idempotencyKey } },
    );
    return response.data;
  }

  async resolveHandoff(
    workspaceId: string,
    handoffCaseId: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ handoffCaseId: string; status: string; resolvedAt: string }> {
    const response = await this.request<ApiEnvelope<{ handoffCaseId: string; status: string; resolvedAt: string }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/handoffs/${encodeURIComponent(handoffCaseId)}/resolve`,
      { method: 'POST', headers: { 'idempotency-key': idempotencyKey } },
    );
    return response.data;
  }

  async returnHandoffToAi(
    workspaceId: string,
    handoffCaseId: string,
    reason: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ handoffCaseId: string; status: string }> {
    const response = await this.request<ApiEnvelope<{ handoffCaseId: string; status: string }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/handoffs/${encodeURIComponent(handoffCaseId)}/return-to-ai`,
      {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: { reason },
      },
    );
    return response.data;
  }

  async setJourneyStage(
    workspaceId: string,
    journeyId: string,
    stage: string,
    reason?: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ journeyId: string; stage: string }> {
    const response = await this.request<ApiEnvelope<{ journeyId: string; stage: string }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/journeys/${encodeURIComponent(journeyId)}/stage`,
      {
        method: 'PATCH',
        headers: { 'idempotency-key': idempotencyKey },
        body: { stage, ...(reason ? { reason } : {}) },
      },
    );
    return response.data;
  }

  async transitionJourneyStage(
    workspaceId: string,
    journeyId: string,
    stage: string,
    reason?: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ journeyId: string; stage: string }> {
    return this.setJourneyStage(workspaceId, journeyId, stage, reason, idempotencyKey);
  }

  async createFollowUp(
    workspaceId: string,
    journeyId: string,
    dueAt: string,
    reason: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ followUpId: string; journeyId: string; dueAt: string }> {
    const response = await this.request<ApiEnvelope<{ followUpId: string; journeyId: string; dueAt: string }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/journeys/${encodeURIComponent(journeyId)}/follow-ups`,
      {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: { dueAt, reason },
      },
    );
    return response.data;
  }

  async recordCommercialOutcome(
    workspaceId: string,
    journeyId: string,
    outcome: { result: 'WON' | 'LOST' | 'ABANDONED'; revenueMinor: number; reason?: string },
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ outcomeId: string; journeyId: string; result: string; revenueMinor: number }> {
    const response = await this.request<ApiEnvelope<{ outcomeId: string; journeyId: string; result: string; revenueMinor: number }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/journeys/${encodeURIComponent(journeyId)}/outcomes`,
      {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          result: outcome.result,
          revenueMinor: outcome.revenueMinor,
          currency: 'BRL',
          ...(outcome.reason ? { reason: outcome.reason } : {}),
        },
      },
    );
    return response.data;
  }

  async recordKnownFact(
    workspaceId: string,
    journeyId: string,
    fact: {
      key: string;
      value: unknown;
      confidence: number;
      confirmedByCustomer: boolean;
      evidenceMessageId?: string;
      supersedesFactId?: string;
    },
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ factId: string; journeyId: string; key: string }> {
    const response = await this.request<ApiEnvelope<{ factId: string; journeyId: string; key: string }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/journeys/${encodeURIComponent(journeyId)}/facts`,
      {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: {
          key: fact.key,
          value: fact.value,
          confidence: fact.confidence,
          confirmedByCustomer: fact.confirmedByCustomer,
          ...(fact.evidenceMessageId ? { evidenceMessageId: fact.evidenceMessageId } : {}),
          ...(fact.supersedesFactId ? { supersedesFactId: fact.supersedesFactId } : {}),
        },
      },
    );
    return response.data;
  }

  async sendDirectMessage(
    workspaceId: string,
    journeyId: string,
    text: string,
  ): Promise<{ success: boolean; dispatchId: string; status: string; message: string }> {
    return this.request<{ success: boolean; dispatchId: string; status: string; message: string }>(
      // baseUrl already ends in /api/v1 in authenticated production mode.
      // Keeping this path relative prevents the broken /api/v1/api/v1 route.
      `/workspaces/${encodeURIComponent(workspaceId)}/journeys/${encodeURIComponent(journeyId)}/send-message`,
      {
        method: 'POST',
        body: { text },
      },
    );
  }

  async createOutboundDraft(
    workspaceId: string,
    journeyId: string,
    textContent: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ dispatchId: string; status: string; idempotent: boolean }> {
    const response = await this.request<ApiEnvelope<{ dispatchId: string; status: string; idempotent: boolean }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/journeys/${encodeURIComponent(journeyId)}/outbound-drafts`,
      {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: { textContent },
      },
    );
    return response.data;
  }

  async approveOutboundDispatch(
    workspaceId: string,
    dispatchId: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ dispatchId: string; status: string; idempotent: boolean }> {
    const response = await this.request<ApiEnvelope<{ dispatchId: string; status: string; idempotent: boolean }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/outbound-dispatches/${encodeURIComponent(dispatchId)}/approve`,
      {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: {},
      },
    );
    return response.data;
  }

  async cancelOutboundDispatch(
    workspaceId: string,
    dispatchId: string,
    reason: string,
    idempotencyKey = crypto.randomUUID(),
  ): Promise<{ dispatchId: string; status: string; idempotent: boolean }> {
    const response = await this.request<ApiEnvelope<{ dispatchId: string; status: string; idempotent: boolean }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/outbound-dispatches/${encodeURIComponent(dispatchId)}/cancel`,
      {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: { reason },
      },
    );
    return response.data;
  }

  async getOutboundDispatch(
    workspaceId: string,
    dispatchId: string,
  ): Promise<{ dispatchId: string; status: string; textContent: string }> {
    const response = await this.request<ApiEnvelope<{ dispatchId: string; status: string; textContent: string }>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/outbound-dispatches/${encodeURIComponent(dispatchId)}`,
    );
    return response.data;
  }

  async getWorkspaces(): Promise<Workspace[]> {
    const workspaces = await this.listWorkspaces();
    // These shell-only values are not commercial facts; the API does not yet
    // expose workspace profile/channels. Keep the adapter honest and do not
    // pull them from local fixtures in authenticated mode.
    return workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      operatorRole: workspace.role,
      businessType: 'general_services',
      tagline: 'Dados autenticados do SOS Vendas',
      activeOperatorCount: 0,
      channels: [],
    }));
  }

  async getJourneys(_workspaceId: string, _search?: string): Promise<Journey[]> {
    throw new SalesOsOperationUnavailableError(
      'A projeção rica de jornadas para o cockpit',
    );
  }

  async getJourneyById(_journeyId: string): Promise<Journey | null> {
    throw new SalesOsOperationUnavailableError('O detalhe da jornada');
  }

  async getMessages(_journeyId: string): Promise<Message[]> {
    throw new SalesOsOperationUnavailableError(
      'A projeção visual de mensagens do cockpit',
    );
  }

  async claimHandoff(_journeyId: string, _operatorId: string, _operatorName: string): Promise<Journey> {
    throw new SalesOsOperationUnavailableError('Assumir handoff');
  }

  async releaseHandoff(_journeyId: string): Promise<Journey> {
    throw new SalesOsOperationUnavailableError('Liberar handoff');
  }

  async sendMessage(_payload: SendMessagePayload): Promise<Message> {
    throw new SalesOsOperationUnavailableError('Enviar mensagens');
  }

  saveDraft(_journeyId: string, _draftText: string): void {
    // Drafts are commercial records. API mode must not create an untracked
    // browser-side copy until the authenticated draft contract exists.
    throw new SalesOsOperationUnavailableError('Salvar rascunho autenticado');
  }

  getDraft(_journeyId: string): string {
    return '';
  }

  async markOutcome(_journeyId: string, _outcome: Omit<JourneyOutcome, 'id' | 'closedAt'>): Promise<Journey> {
    throw new SalesOsOperationUnavailableError('Registrar resultado comercial');
  }

  async updateJourneyStage(
    _journeyId: string,
    _stage: CommercialStage,
    _options?: {
      dealValueBrl?: number;
      reason?: string;
      operatorId?: string;
      operatorName?: string;
    }
  ): Promise<Journey> {
    throw new SalesOsOperationUnavailableError('Alterar estágio comercial');
  }

  async updateJourney(_updated: Journey): Promise<Journey> {
    throw new SalesOsOperationUnavailableError('Atualizar jornada');
  }

  async resetJourneysToDefault(): Promise<void> {
    throw new SalesOsOperationUnavailableError('Resetar jornadas');
  }

  async toggleChannelPause(_channelId: string, _pausedBy: string, _reason?: string): Promise<Channel> {
    throw new SalesOsOperationUnavailableError('Pausar canal');
  }

  async getTrafficStats(_workspaceId: string): Promise<TrafficProofStats> {
    throw new SalesOsOperationUnavailableError('Prova de resultado comercial');
  }

  async simulateIncomingLeadMessage(journeyId: string, text: string): Promise<Message> {
    throw new Error('Simulation only available in Mock gateway');
  }

  async getGhostingOpportunities(workspaceId: string): Promise<any[]> {
    try {
      const response = await this.request<ApiEnvelope<any[]>>(
        `/workspaces/${encodeURIComponent(workspaceId)}/ghosting/opportunities`,
      );
      return response.data;
    } catch {
      return [];
    }
  }

  async resurrectJourney(workspaceId: string, journeyId: string): Promise<any | null> {
    try {
      const response = await this.request<ApiEnvelope<any>>(
        `/workspaces/${encodeURIComponent(workspaceId)}/journeys/${encodeURIComponent(journeyId)}/resurrect`,
        { method: 'POST' }
      );
      return response.data;
    } catch {
      return null;
    }
  }

  async getRetentionOpportunities(workspaceId: string): Promise<any[]> {
    try {
      const response = await this.request<ApiEnvelope<any[]>>(
        `/workspaces/${encodeURIComponent(workspaceId)}/retention/opportunities`,
      );
      return response.data;
    } catch {
      return [];
    }
  }

  private bounded(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.floor(value)));
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const token = await this.accessTokenProvider();
    if (!token) {
      throw new SalesOsTransportError('A sessão autenticada ainda não foi conectada ao transporte do SOS Vendas.', 401);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        cache: (options.method ?? 'GET') === 'GET' ? 'no-store' : undefined,
      });
    } catch {
      throw new SalesOsTransportError('Não foi possível alcançar a API do SOS Vendas.');
    }

    if (!response.ok) {
      let message = `A API do SOS Vendas retornou ${response.status}.`;
      try {
        const errorJson = await response.json() as { message?: string };
        if (errorJson?.message) message = errorJson.message;
      } catch {
        // ignore
      }
      throw new SalesOsTransportError(message, response.status);
    }

    try {
      return await response.json() as T;
    } catch {
      throw new SalesOsTransportError('A API do SOS Vendas retornou uma resposta inválida.');
    }
  }
}

/**
 * Select the transport once at module startup. API mode never falls back to
 * local fixtures: an absent/expired Supabase session becomes an explicit 401.
 */
export const salesOsGateway: SalesOsGateway = salesOsRuntimeConfig.mode === 'api'
  ? new HttpSalesOsGateway({
    baseUrl: salesOsRuntimeConfig.apiUrl!,
    accessTokenProvider: getSupabaseAccessToken,
  })
  : new MockSalesOsGateway();
