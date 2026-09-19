/**
 * SOS Sales V3 — useConnectivity Hook (MCT OS v2.0)
 * Real-time connectivity polling against Fastify /ready endpoint.
 * Truth in Data: Never displays "Online" without verified HTTP 200 health check.
 */

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../services/api-client";

export type ConnectivityStatus = "checking" | "connected" | "degraded" | "offline";

export interface ConnectivityState {
  status: ConnectivityStatus;
  dbLatencyMs: number | null;
  redisLatencyMs: number | null;
  lastChecked: Date | null;
  checkNow: () => Promise<void>;
}

export function useConnectivity(pollIntervalMs = 15000): ConnectivityState {
  const [status, setStatus] = useState<ConnectivityStatus>("checking");
  const [dbLatencyMs, setDbLatencyMs] = useState<number | null>(null);
  const [redisLatencyMs, setRedisLatencyMs] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkNow = useCallback(async () => {
    try {
      const data = await apiClient.getReady();
      if (data.status === "ready") {
        setStatus("connected");
        setDbLatencyMs(data.checks?.database?.latencyMs ?? null);
        setRedisLatencyMs(data.checks?.redis?.latencyMs ?? null);
      } else {
        setStatus("degraded");
      }
    } catch {
      setStatus("offline");
      setDbLatencyMs(null);
      setRedisLatencyMs(null);
    } finally {
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    checkNow();
    const timer = setInterval(checkNow, pollIntervalMs);
    return () => clearInterval(timer);
  }, [checkNow, pollIntervalMs]);

  return {
    status,
    dbLatencyMs,
    redisLatencyMs,
    lastChecked,
    checkNow,
  };
}
