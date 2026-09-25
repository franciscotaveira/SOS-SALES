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
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceDetailsResponse {
  workspace: WorkspaceRecord;
  userRole: string;
  permissions: string[];
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
  providerMessageId: string | null;
  deliveryStatus: "queued" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface SendOutboundMessagePayload {
  recipientPhoneE164: string;
  contentType: "text" | "image" | "audio" | "video" | "document" | "template";
  body: string;
  mediaUrl?: string;
  idempotencyKey?: string;
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
    return this.request<WorkspaceDetailsResponse>(`/v1/workspaces/${workspaceId}`, {
      ...options,
      workspaceId,
    });
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
    query?: { status?: string },
    options?: RequestOptions
  ): Promise<{ threads: CommercialThreadSummary[]; total: number }> {
    const qs = query?.status ? `?status=${encodeURIComponent(query.status)}` : "";
    return this.request<{ threads: CommercialThreadSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/threads${qs}`,
      { ...options, workspaceId }
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
}

export const apiClient = new ApiClient();
