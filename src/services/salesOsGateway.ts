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
  mockWorkspaces,
  mockJourneysEscovaria,
  mockJourneysTitanium,
  mockMessagesByJourney,
} from '../data/fixtures';

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
}

const JOURNEYS_STORAGE_KEY = 'sales_os_journeys_v2';

export class MockSalesOsGateway implements SalesOsGateway {
  private workspaces: Workspace[];
  private journeys: Map<string, Journey[]> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private drafts: Map<string, string> = new Map();
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
      this.journeys.set('ws-escovaria', JSON.parse(JSON.stringify(mockJourneysEscovaria)));
      this.journeys.set('ws-peliculas', JSON.parse(JSON.stringify(mockJourneysTitanium)));
      this.journeys.set('ws-agencia', JSON.parse(JSON.stringify(mockJourneysEscovaria)));
      this.persistJourneys();
    } else if (!this.journeys.has('ws-agencia')) {
      this.journeys.set('ws-agencia', JSON.parse(JSON.stringify(mockJourneysEscovaria)));
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
    const list = this.journeys.get(workspaceId) || [];
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
}

/**
 * HttpSalesOsGateway Stub
 * Pronta para quando os endpoints REST/RPC do Supabase / Backend estiverem disponíveis.
 */
export class HttpSalesOsGateway implements SalesOsGateway {
  private baseUrl: string;

  constructor(baseUrl = '/api/v1') {
    this.baseUrl = baseUrl;
  }

  async getWorkspaces(): Promise<Workspace[]> {
    const res = await fetch(`${this.baseUrl}/workspaces`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  }

  async getJourneys(workspaceId: string, search?: string): Promise<Journey[]> {
    const url = new URL(`${this.baseUrl}/workspaces/${workspaceId}/journeys`, window.location.origin);
    if (search) url.searchParams.set('q', search);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  }

  async getJourneyById(journeyId: string): Promise<Journey | null> {
    const res = await fetch(`${this.baseUrl}/journeys/${journeyId}`);
    if (!res.ok) return null;
    return res.json();
  }

  async getMessages(journeyId: string): Promise<Message[]> {
    const res = await fetch(`${this.baseUrl}/journeys/${journeyId}/messages`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  }

  async claimHandoff(journeyId: string, operatorId: string, operatorName: string): Promise<Journey> {
    const res = await fetch(`${this.baseUrl}/journeys/${journeyId}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorId, operatorName }),
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  }

  async releaseHandoff(journeyId: string): Promise<Journey> {
    const res = await fetch(`${this.baseUrl}/journeys/${journeyId}/release`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  }

  async sendMessage(payload: SendMessagePayload): Promise<Message> {
    const res = await fetch(`${this.baseUrl}/journeys/${payload.journeyId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  }

  saveDraft(journeyId: string, draftText: string): void {
    localStorage.setItem(`draft_${journeyId}`, draftText);
  }

  getDraft(journeyId: string): string {
    return localStorage.getItem(`draft_${journeyId}`) || '';
  }

  async markOutcome(journeyId: string, outcome: Omit<JourneyOutcome, 'id' | 'closedAt'>): Promise<Journey> {
    const res = await fetch(`${this.baseUrl}/journeys/${journeyId}/outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outcome),
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
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
    const res = await fetch(`${this.baseUrl}/journeys/${journeyId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, ...options }),
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  }

  async updateJourney(updated: Journey): Promise<Journey> {
    const res = await fetch(`${this.baseUrl}/journeys/${updated.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  }

  async resetJourneysToDefault(): Promise<void> {
    await fetch(`${this.baseUrl}/reset`, { method: 'POST' });
  }

  async toggleChannelPause(channelId: string, pausedBy: string, reason?: string): Promise<Channel> {
    const res = await fetch(`${this.baseUrl}/channels/${channelId}/toggle-pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pausedBy, reason }),
    });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  }

  async getTrafficStats(workspaceId: string): Promise<TrafficProofStats> {
    const res = await fetch(`${this.baseUrl}/workspaces/${workspaceId}/traffic-proof`);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return res.json();
  }

  async simulateIncomingLeadMessage(journeyId: string, text: string): Promise<Message> {
    throw new Error('Simulation only available in Mock gateway');
  }
}

// Singleton export of current active gateway
export const salesOsGateway = new MockSalesOsGateway();
