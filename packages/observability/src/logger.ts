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
    redact: {
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
      ],
      censor: "[REDACTED_BY_SOVEREIGN_POLICY]",
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
