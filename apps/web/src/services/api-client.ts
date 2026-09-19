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
  signal?: AbortSignal;
  token?: string | null;
  workspaceId?: string | null;
  correlationId?: string;
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
        method: "GET",
        headers,
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
}

export const apiClient = new ApiClient();
