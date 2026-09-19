import pino from "pino";

export interface LoggerOptions {
  serviceName?: string;
  level?: string;
}

export function createLogger(options: LoggerOptions = {}) {
  const isDev = process.env.NODE_ENV !== "production";

  return pino({
    name: options.serviceName || process.env.OTEL_SERVICE_NAME || "sos-sales-v3",
    level: options.level || process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
    serializers: {
      req(req: any) {
        const rawUrl = req.raw?.url || req.url || "";
        const sanitizedUrl = typeof rawUrl === "string"
          ? rawUrl.replace(/\/v1\/webhooks\/whatsapp\/[^/?#]+/g, "/v1/webhooks/whatsapp/[redacted]")
          : "";
        return {
          id: req.id,
          method: req.method,
          url: sanitizedUrl,
          query: req.query,
          parameters: req.params,
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
      err(err: any) {
        const msg = typeof err?.message === "string"
          ? err.message.replace(/\/v1\/webhooks\/whatsapp\/[^/?#]+/g, "/v1/webhooks/whatsapp/[redacted]")
          : err?.message;
        const stack = typeof err?.stack === "string"
          ? err.stack.replace(/\/v1\/webhooks\/whatsapp\/[^/?#]+/g, "/v1/webhooks/whatsapp/[redacted]")
          : undefined;
        return {
          type: err?.name,
          message: msg,
          stack,
        };
      },
    },
    redact: {
      censor: "[REDACTED_BY_SOVEREIGN_POLICY]",
      paths: [
        "token",
        "*.token",
        "*.*.token",
        "password",
        "*.password",
        "secret",
        "*.secret",
        "apiKey",
        "*.apiKey",
        "authorization",
        "*.authorization",
        "headers.authorization",
        "req.headers.authorization",
        "accessToken",
        "*.accessToken",
        "appSecret",
        "*.appSecret",
        "payload",
        "*.payload",
        "*.*.payload",
        "claims",
        "*.claims",
        "email",
        "*.email",
        "sub",
        "*.sub",
        "connectionString",
        "*.connectionString",
      ],
    },
    transport: isDev
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
            translateTime: "HH:MM:ss Z",
          },
        }
      : undefined,
  });
}

export const logger = createLogger();
