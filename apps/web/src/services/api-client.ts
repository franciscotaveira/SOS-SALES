/**
 * SOS Sales V3 — API Client (MCT OS v2.0)
 * Strict, typed Fastify client with AbortController, tenant headers & correlation tracking.
 */

export interface MeUser {
  id: string;
  email: string;
  activeRole: string;
  activeWorkspaceId: string | null;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: string;
}

export interface MeResponse {
  user: MeUser;
  workspaces: WorkspaceSummary[];
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  defaultPixKey?: string | null;
  defaultPixKeyType?: string | null;
  defaultPixMerchantName?: string | null;
  defaultPixMerchantCity?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceDetailsResponse {
  workspace: WorkspaceRecord;
  userRole: string;
  permissions: string[];
  membership?: {
    role: string;
  };
}

export interface HealthResponse {
  status: string;
  checks?: {
    database?: { healthy: boolean; latencyMs: number };
    redis?: { healthy: boolean; latencyMs: number };
  };
  timestamp?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail: string,
    public correlationId?: string,
    public instance?: string
  ) {
    super(`[${status}] ${title}: ${detail}`);
    this.name = "ApiError";
  }
}

export class AuthError extends ApiError {
  constructor(detail = "Sessão inválida ou expirada", correlationId?: string) {
    super(401, "Não Autorizado", detail, correlationId);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(detail = "Acesso negado para este workspace", correlationId?: string) {
    super(403, "Acesso Proibido", detail, correlationId);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends ApiError {
  constructor(detail = "Recurso não encontrado", correlationId?: string) {
    super(404, "Não Encontrado", detail, correlationId);
    this.name = "NotFoundError";
  }
}

export class NetworkError extends Error {
  constructor(message = "Falha de conectividade com a API Fastify") {
    super(message);
    this.name = "NetworkError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  token?: string | null;
  workspaceId?: string | null;
  correlationId?: string;
}

export interface ChannelSummary {
  id: string;
  workspaceId: string;
  provider: "meta_waba" | "waha" | "evolution" | "meta_messenger" | "meta_instagram";
  displayName: string;
  phoneNumberE164: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialThreadSummary {
  id: string;
  workspaceId: string;
  channelInstanceId: string;
  channelProvider: string;
  channelName: string;
  contactId: string;
  contactPhone: string;
  contactName: string | null;
  status: "active" | "waiting_client" | "waiting_human" | "closed";
  lastMessageAt: string;
  lastMessage: {
    body: string;
    direction: "inbound" | "outbound";
    createdAt: string;
    deliveryStatus: string;
  } | null;
  nextAction?: {
    id: string;
    title: string;
    dueAt: string | null;
    status: string;
    assigneeUserId: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialActionSummary {
  id: string;
  workspaceId: string;
  threadId: string;
  journeyId: string | null;
  suggestionId: string | null;
  title: string;
  description: string | null;
  assigneeUserId: string | null;
  dueAt: string;
  status: "open" | "completed" | "cancelled";
  origin: "manual" | "radar_suggestion" | "system";
  postponedCount: number;
  postponedReason: string | null;
  postponedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialActionHistorySummary {
  id: string;
  actionId: string;
  actionType: "created" | "assigned" | "rescheduled" | "completed" | "cancelled";
  previousDueAt: string | null;
  newDueAt: string | null;
  previousAssigneeId: string | null;
  newAssigneeId: string | null;
  reason: string | null;
  createdByUserId: string | null;
  createdAt: string;
}

export interface CommercialProposalItem {
  productId: string | null;
  title: string;
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
}

export interface CommercialProposalSummary {
  id: string;
  workspaceId: string;
  threadId: string;
  contactId: string;
  journeyId: string | null;
  title: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "cancelled";
  items: CommercialProposalItem[];
  totalCents: number;
  currency: string;
  conditions: string | null;
  validUntil: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadMessageSummary {
  id: string;
  workspaceId: string;
  channelInstanceId: string;
  threadId: string;
  provider: string;
  direction: "inbound" | "outbound";
  senderE164: string;
  recipientE164: string;
  contentType: string;
  body: string | null;
  mediaUrl: string | null;
  metadata?: Record<string, unknown> | null;
  providerMessageId: string | null;
  deliveryStatus: "queued" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface MessageTemplateSummary {
  id: string;
  workspaceId: string;
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  language: string;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  buttons: MessageTemplateButton[];
  variables: string[];
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";
  metaTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WabaTemplateComponent {
  type: "header" | "body" | "button";
  parameters?: Array<Record<string, unknown>>;
  sub_type?: string;
  index?: number;
}

export interface WabaTemplateMessage {
  name: string;
  language: string;
  components?: WabaTemplateComponent[];
}

export interface FlowScreenField {
  id: string;
  type: "text" | "select" | "radio" | "date" | "textarea";
  label: string;
  required?: boolean;
  options?: Array<{ id: string; title: string }>;
}

export interface FlowScreen {
  id: string;
  title: string;
  fields: FlowScreenField[];
}

export interface WhatsAppFlowSummary {
  id: string;
  workspaceId: string;
  name: string;
  title: string;
  description: string | null;
  category: "LEAD_GENERATION" | "APPOINTMENT_BOOKING" | "CUSTOMER_SUPPORT" | "SURVEY";
  status: "DRAFT" | "PUBLISHED" | "DEPRECATED" | "BLOCKED";
  metaFlowId: string;
  ctaLabel: string;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  initialScreen: string;
  screensPreview: FlowScreen[];
  createdAt: string;
  updatedAt: string;
}

export interface WabaInteractiveFlowActionParameters {
  flow_message_version: string;
  flow_token: string;
  flow_id: string;
  flow_cta: string;
  flow_action: "navigate" | "data_exchange";
  flow_action_payload?: {
    screen: string;
    data?: Record<string, unknown>;
  };
}

export interface ProductRecord {
  id: string;
  workspaceId: string;
  catalogId: string;
  retailerId: string;
  title: string;
  subtitle: string | null;
  description: string;
  priceCents: number;
  priceFormatted: string;
  currency: string;
  category: string;
  imageUrl: string;
  badge: string | null;
  status: "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK";
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PixChargeSummary {
  id: string;
  workspaceId: string;
  threadId: string;
  contactId: string;
  productId: string | null;
  title: string;
  amountCents: number;
  amountFormatted: string;
  currency: string;
  pixCode: string;
  pixQrUrl: string | null;
  verificationMethod?: "UNVERIFIED" | "MANUAL_CASHIER" | "BANK_WEBHOOK" | null;
  verifiedByUserId?: string | null;
  verifiedAt?: string | null;
  verificationNotes?: string | null;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationSuggestionSummary {
  id: string;
  idempotencyKey: string;
  source: string;
  threadId: string | null;
  contactId: string | null;
  suggestionType: string;
  title: string;
  body: string;
  draftMessage: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  metadata: Record<string, unknown>;
  status: "pending" | "accepted" | "dismissed" | "expired";
  stateVersion: number;
  decidedByUserId: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationSuggestionDecisionResult {
  id: string;
  status: "accepted" | "dismissed";
  stateVersion: number;
  decidedByUserId: string | null;
  decidedAt: string | null;
  draftMessage: string | null;
  threadId: string | null;
  action?: CommercialActionSummary | null;
}

export interface WabaInteractiveMessage {
  type: "flow" | "button" | "list" | "product" | "product_list" | "catalog_message";
  header?: {
    type: "text" | "image" | "video" | "document";
    text?: string;
  };
  body: {
    text: string;
  };
  footer?: {
    text: string;
  };
  action: {
    name?: string;
    parameters?: WabaInteractiveFlowActionParameters | Record<string, unknown>;
    catalog_id?: string;
    product_retailer_id?: string;
    sections?: Array<{
      title: string;
      product_items: Array<{ product_retailer_id: string }>;
    }>;
    [key: string]: unknown;
  };
}

export interface SendOutboundMessagePayload {
  recipientPhoneE164: string;
  contentType: "text" | "image" | "audio" | "video" | "document" | "template" | "interactive";
  body: string;
  mediaUrl?: string;
  template?: WabaTemplateMessage;
  interactive?: WabaInteractiveMessage;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface ContactSummary {
  id: string;
  workspaceId: string;
  phoneE164: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = "http://localhost:4400") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "");
  }

  private getCorrelationId(custom?: string): string {
    return (
      custom ||
      `v3-web-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`
    );
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-correlation-id": this.getCorrelationId(options.correlationId),
    };

    if (options.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }

    if (options.workspaceId) {
      headers["X-Workspace-Id"] = options.workspaceId;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      throw new NetworkError(
        `Falha ao conectar com o serviço em ${url}. Verifique a API Fastify no Docker Lab.`
      );
    }

    if (!response.ok) {
      let body: { title?: string; detail?: string; correlationId?: string; instance?: string } = {};
      try {
        body = await response.json();
      } catch {
        // Body was not JSON
      }

      const correlationId = response.headers.get("x-correlation-id") || body.correlationId;
      const detail = body.detail || response.statusText;

      if (response.status === 401) {
        throw new AuthError(detail, correlationId);
      }
      if (response.status === 403) {
        throw new ForbiddenError(detail, correlationId);
      }
      if (response.status === 404) {
        throw new NotFoundError(detail, correlationId);
      }

      throw new ApiError(
        response.status,
        body.title || "Erro da API",
        detail,
        correlationId,
        body.instance
      );
    }

    return response.json() as Promise<T>;
  }

  async getReady(options?: RequestOptions): Promise<HealthResponse> {
    return this.request<HealthResponse>("/ready", options);
  }

  async getMe(options?: RequestOptions): Promise<MeResponse> {
    return this.request<MeResponse>("/v1/me", options);
  }

  async getWorkspace(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<WorkspaceDetailsResponse> {
    const raw = await this.request<{
      workspace: WorkspaceRecord;
      userRole?: string;
      permissions?: string[];
      membership?: { role?: string };
    }>(`/v1/workspaces/${workspaceId}`, {
      ...options,
      workspaceId,
    });

    const userRole = raw.userRole || raw.membership?.role || "owner";
    const defaultPermissionsForRole = (role: string): string[] => {
      switch (role) {
        case "owner":
        case "admin":
          return [
            "workspace:view",
            "workspace:manage",
            "workspace:invite",
            "cockpit:access",
            "cockpit:send_message",
            "cockpit:handoff",
            "journey:view",
            "journey:transition_stage",
            "outcome:register",
            "integration:view",
            "integration:manage",
            "capi:dispatch",
            "audit:view",
          ];
        case "manager":
          return [
            "workspace:view",
            "workspace:invite",
            "cockpit:access",
            "cockpit:send_message",
            "cockpit:handoff",
            "journey:view",
            "journey:transition_stage",
            "outcome:register",
            "integration:view",
            "audit:view",
          ];
        case "operator":
          return [
            "cockpit:access",
            "cockpit:send_message",
            "cockpit:handoff",
            "journey:view",
            "journey:transition_stage",
            "outcome:register",
          ];
        case "analyst":
          return ["workspace:view", "journey:view", "integration:view", "audit:view"];
        default:
          return ["workspace:view", "cockpit:access"];
      }
    };

    return {
      workspace: raw.workspace,
      userRole,
      permissions:
        Array.isArray(raw.permissions) && raw.permissions.length > 0
          ? raw.permissions
          : defaultPermissionsForRole(userRole),
      membership: { role: raw.membership?.role || userRole },
    };
  }

  async getChannels(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{ channels: ChannelSummary[]; total: number }> {
    return this.request<{ channels: ChannelSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/channels`,
      { ...options, workspaceId }
    );
  }

  async getThreads(
    workspaceId: string,
    query?: { status?: string; needsAttention?: boolean },
    options?: RequestOptions
  ): Promise<{ threads: CommercialThreadSummary[]; total: number }> {
    const params = new URLSearchParams();
    if (query?.status) params.set("status", query.status);
    if (query?.needsAttention) params.set("needsAttention", "true");
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request<{ threads: CommercialThreadSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/threads${qs}`,
      { ...options, workspaceId }
    );
  }

  async getThreadActions(
    workspaceId: string,
    threadId: string,
    options?: RequestOptions
  ): Promise<{ actions: CommercialActionSummary[]; openAction: CommercialActionSummary | null }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/actions`,
      { ...options, workspaceId }
    );
  }

  async createThreadAction(
    workspaceId: string,
    threadId: string,
    payload: {
      title: string;
      description?: string | null;
      dueAt: string;
      assigneeUserId?: string | null;
      origin?: "manual" | "radar_suggestion" | "system";
    },
    options?: RequestOptions
  ): Promise<{ created: boolean; action: CommercialActionSummary }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/actions`,
      {
        ...options,
        method: "POST",
        body: payload,
        workspaceId,
      }
    );
  }

  async patchCommercialAction(
    workspaceId: string,
    actionId: string,
    payload:
      | { action: "complete" }
      | { action: "cancel"; reason?: string | null }
      | { action: "reschedule"; newDueAt: string; reason: string }
      | { action: "assign"; assigneeUserId: string | null },
    options?: RequestOptions
  ): Promise<{ action: CommercialActionSummary }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/actions/${actionId}`,
      {
        ...options,
        method: "PATCH",
        body: payload,
        workspaceId,
      }
    );
  }

  async getActionHistory(
    workspaceId: string,
    actionId: string,
    options?: RequestOptions
  ): Promise<{ history: CommercialActionHistorySummary[] }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/actions/${actionId}/history`,
      { ...options, workspaceId }
    );
  }

  // ─── Commercial Proposals (M6) ──────────────────────────────────────────

  async getThreadProposals(
    workspaceId: string,
    threadId: string,
    options?: RequestOptions
  ): Promise<{ items: CommercialProposalSummary[] }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/proposals`,
      { ...options, workspaceId }
    );
  }

  async createThreadProposal(
    workspaceId: string,
    threadId: string,
    payload: {
      contactId: string;
      journeyId?: string | null;
      title: string;
      items: Array<{
        productId?: string | null;
        title?: string;
        unitPriceCents?: number;
        quantity: number;
      }>;
      currency?: string;
      conditions?: string | null;
      validUntil?: string | null;
    },
    options?: RequestOptions
  ): Promise<CommercialProposalSummary> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/proposals`,
      {
        ...options,
        method: "POST",
        body: payload,
        workspaceId,
      }
    );
  }

  async getProposal(
    workspaceId: string,
    proposalId: string,
    options?: RequestOptions
  ): Promise<CommercialProposalSummary> {
    return this.request(
      `/v1/workspaces/${workspaceId}/proposals/${proposalId}`,
      { ...options, workspaceId }
    );
  }

  async patchProposalStatus(
    workspaceId: string,
    proposalId: string,
    payload: {
      status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "cancelled";
      reason?: string | null;
    },
    options?: RequestOptions
  ): Promise<CommercialProposalSummary> {
    return this.request(
      `/v1/workspaces/${workspaceId}/proposals/${proposalId}/status`,
      {
        ...options,
        method: "PATCH",
        body: payload,
        workspaceId,
      }
    );
  }

  async getThreadMessages(
    workspaceId: string,
    threadId: string,
    options?: RequestOptions
  ): Promise<{ messages: ThreadMessageSummary[]; total: number }> {
    return this.request<{ messages: ThreadMessageSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/messages`,
      { ...options, workspaceId }
    );
  }

  async sendOutboundMessage(
    workspaceId: string,
    channelInstanceId: string,
    payload: SendOutboundMessagePayload,
    options?: RequestOptions
  ): Promise<{
    messageId: string;
    outboundCommandId: string;
    deliveryStatus: string;
    idempotentReplay: boolean;
  }> {
    const idempotencyKey =
      payload.idempotencyKey ||
      `web-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;

    return this.request(
      `/v1/workspaces/${workspaceId}/channels/${channelInstanceId}/messages`,
      {
        ...options,
        workspaceId,
        method: "POST",
        body: {
          recipientPhoneE164: payload.recipientPhoneE164,
          contentType: payload.contentType,
          body: payload.body,
          mediaUrl: payload.mediaUrl,
          template: payload.template,
          interactive: payload.interactive,
          metadata: payload.metadata,
          idempotencyKey,
        },
      }
    );
  }

  async updateThreadStatus(
    workspaceId: string,
    threadId: string,
    status: "active" | "waiting_client" | "waiting_human" | "closed",
    options?: RequestOptions
  ): Promise<{ thread: CommercialThreadSummary }> {
    return this.request(`/v1/workspaces/${workspaceId}/threads/${threadId}`, {
      ...options,
      workspaceId,
      method: "PATCH",
      body: { status },
    });
  }

  async recordOutcome(
    workspaceId: string,
    threadId: string,
    payload: {
      status: "won" | "lost";
      valueCents: number;
      currency?: string;
      reason?: string;
    },
    options?: RequestOptions
  ): Promise<{
    outcome: {
      id: string;
      workspaceId: string;
      journeyId: string;
      status: "won" | "lost";
      valueCents: number;
      currency: string;
      reason: string | null;
      createdAt: string;
    };
    conversionEvent: {
      id: string;
      eventName: string;
      valueCents: number | null;
      status: string;
      createdAt: string;
    } | null;
  }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/outcomes`,
      {
        ...options,
        workspaceId,
        method: "POST",
        body: payload,
      }
    );
  }

  async getThreadJourney(
    workspaceId: string,
    threadId: string,
    options?: RequestOptions
  ): Promise<{
    journey: {
      id: string;
      workspaceId: string;
      contactId: string;
      threadId: string | null;
      stage: string;
      status: string;
      estimatedValueCents: number;
      createdAt: string;
    } | null;
    latestOutcome: {
      id: string;
      status: "won" | "lost";
      valueCents: number;
      currency: string;
      reason: string | null;
      createdAt: string;
    } | null;
  }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/journey`,
      {
        ...options,
        workspaceId,
        method: "GET",
      }
    );
  }

  async getConversions(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{
    items: Array<{
      id: string;
      journeyId: string;
      outcomeId: string | null;
      eventName: string;
      valueCents: number | null;
      currency: string;
      status: string;
      providerReceipt: Record<string, unknown> | null;
      errorMessage: string | null;
      createdAt: string;
    }>;
    total: number;
  }> {
    return this.request(`/v1/workspaces/${workspaceId}/conversions`, {
      ...options,
      workspaceId,
      method: "GET",
    });
  }

  async createChannel(
    workspaceId: string,
    payload: {
      provider: "meta_waba" | "waha" | "evolution" | "meta_messenger" | "meta_instagram";
      displayName: string;
      phoneNumberE164?: string;
      endpointToken?: string;
      credentials?: {
        accessToken?: string;
        phoneNumberId?: string;
        wabaAccountId?: string;
        appSecret?: string;
        apiKey?: string;
        baseUrl?: string;
      };
    },
    options?: RequestOptions
  ): Promise<{
    channel: ChannelSummary;
    webhookToken: string;
    webhookUrl: string;
  }> {
    return this.request(`/v1/workspaces/${workspaceId}/channels`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }

  async testChannelConnection(
    workspaceId: string,
    payload: {
      provider: "meta_waba" | "waha" | "evolution";
      credentials: {
        accessToken?: string;
        phoneNumberId?: string;
        wabaAccountId?: string;
        appSecret?: string;
        apiKey?: string;
        baseUrl?: string;
      };
    },
    options?: RequestOptions
  ): Promise<{
    success: boolean;
    verifiedName?: string;
    displayPhoneNumber?: string;
    qualityRating?: string;
    codeVerificationStatus?: string;
    error?: string;
  }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/channels/test-connection`,
      {
        ...options,
        workspaceId,
        method: "POST",
        body: payload,
      }
    );
  }

  async updateWorkspace(
    workspaceId: string,
    payload: {
      name?: string;
      defaultPixKey?: string | null;
      defaultPixKeyType?: string | null;
      defaultPixMerchantName?: string | null;
      defaultPixMerchantCity?: string | null;
    },
    options?: RequestOptions
  ): Promise<{ workspace: WorkspaceRecord }> {
    return this.request<{ workspace: WorkspaceRecord }>(
      `/v1/workspaces/${workspaceId}`,
      {
        ...options,
        workspaceId,
        method: "PATCH",
        body: payload,
      }
    );
  }

  async getContacts(
    workspaceId: string,
    query?: { search?: string; limit?: number; offset?: number },
    options?: RequestOptions
  ): Promise<{
    contacts: ContactSummary[];
    total: number;
  }> {
    const params = new URLSearchParams();
    if (query?.search) params.set("search", query.search);
    if (query?.limit) params.set("limit", String(query.limit));
    if (query?.offset) params.set("offset", String(query.offset));
    const qs = params.toString() ? `?${params.toString()}` : "";

    return this.request(`/v1/workspaces/${workspaceId}/contacts${qs}`, {
      ...options,
      workspaceId,
      method: "GET",
    });
  }

  async createContact(
    workspaceId: string,
    payload: { phoneE164: string; name?: string },
    options?: RequestOptions
  ): Promise<{ contact: ContactSummary }> {
    return this.request(`/v1/workspaces/${workspaceId}/contacts`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }

  async getTemplates(
    workspaceId: string,
    query?: { category?: string; status?: string },
    options?: RequestOptions
  ): Promise<{ templates: MessageTemplateSummary[]; total: number }> {
    const params = new URLSearchParams();
    if (query?.category) params.set("category", query.category);
    if (query?.status) params.set("status", query.status);
    const qs = params.toString() ? `?${params.toString()}` : "";

    return this.request(`/v1/workspaces/${workspaceId}/templates${qs}`, {
      ...options,
      workspaceId,
      method: "GET",
    });
  }

  async createTemplate(
    workspaceId: string,
    payload: {
      name: string;
      category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
      language?: string;
      headerText?: string | null;
      bodyText: string;
      footerText?: string | null;
      buttons?: MessageTemplateButton[];
      variables?: string[];
      status?: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";
      metaTemplateId?: string;
    },
    options?: RequestOptions
  ): Promise<{ template: MessageTemplateSummary }> {
    return this.request(`/v1/workspaces/${workspaceId}/templates`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }

  async getFlows(
    workspaceId: string,
    query?: { category?: string; status?: string },
    options?: RequestOptions
  ): Promise<{ flows: WhatsAppFlowSummary[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (query?.category) searchParams.set("category", query.category);
    if (query?.status) searchParams.set("status", query.status);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return this.request<{ flows: WhatsAppFlowSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/flows${qs}`,
      {
        ...options,
        method: "GET",
        workspaceId,
      }
    );
  }

  async getProducts(
    workspaceId: string,
    query?: { category?: string; search?: string },
    options?: RequestOptions
  ): Promise<{ products: ProductRecord[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (query?.category) searchParams.set("category", query.category);
    if (query?.search) searchParams.set("search", query.search);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return this.request<{ products: ProductRecord[]; total: number }>(
      `/v1/workspaces/${workspaceId}/products${qs}`,
      {
        ...options,
        method: "GET",
        workspaceId,
      }
    );
  }

  async createPixCharge(
    workspaceId: string,
    threadId: string,
    payload: {
      contactId: string;
      productId?: string | null;
      title: string;
      amountCents: number;
      expiresMinutes?: number;
    },
    options?: RequestOptions
  ): Promise<{ charge: PixChargeSummary }> {
    return this.request<{ charge: PixChargeSummary }>(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/pix-charges`,
      {
        ...options,
        method: "POST",
        workspaceId,
        body: payload,
      }
    );
  }

  async getPixChargesByThread(
    workspaceId: string,
    threadId: string,
    options?: RequestOptions
  ): Promise<{ charges: PixChargeSummary[]; total: number }> {
    return this.request<{ charges: PixChargeSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/pix-charges`,
      {
        ...options,
        method: "GET",
        workspaceId,
      }
    );
  }

  async confirmPixPayment(
    workspaceId: string,
    chargeId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; charge: PixChargeSummary; outcomeId?: string }> {
    return this.request<{ success: boolean; charge: PixChargeSummary; outcomeId?: string }>(
      `/v1/workspaces/${workspaceId}/pix-charges/${chargeId}/confirm-payment`,
      {
        ...options,
        method: "POST",
        workspaceId,
      }
    );
  }

  // ─── Integration Suggestions (F1 Radar) ──────────────────────────────────

  async getIntegrationSuggestionCount(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{ pendingCount: number }> {
    return this.request<{ pendingCount: number }>(
      `/v1/workspaces/${workspaceId}/integrations/suggestions/count`,
      {
        ...options,
        method: "GET",
        workspaceId,
      }
    );
  }

  async getIntegrationSuggestions(
    workspaceId: string,
    params?: { status?: string; threadId?: string; limit?: number; offset?: number },
    options?: RequestOptions
  ): Promise<{ items: IntegrationSuggestionSummary[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.threadId) searchParams.set("threadId", params.threadId);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const qs = searchParams.toString();
    const url = `/v1/workspaces/${workspaceId}/integrations/suggestions${qs ? `?${qs}` : ""}`;
    return this.request<{ items: IntegrationSuggestionSummary[]; total: number }>(url, {
      ...options,
      method: "GET",
      workspaceId,
    });
  }

  async decideIntegrationSuggestion(
    workspaceId: string,
    suggestionId: string,
    decision: { status: "accepted" | "dismissed"; stateVersion: number },
    options?: RequestOptions
  ): Promise<IntegrationSuggestionDecisionResult> {
    return this.request<IntegrationSuggestionDecisionResult>(
      `/v1/workspaces/${workspaceId}/integrations/suggestions/${suggestionId}`,
      {
        ...options,
        method: "PATCH",
        workspaceId,
        body: decision,
      }
    );
  }
}

export const apiClient = new ApiClient();


