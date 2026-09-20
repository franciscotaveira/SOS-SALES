import type { Redis } from "ioredis";
import { logger } from "@sos-sales/observability";

export interface RateLimiterOptions {
  readonly maxIpRequests?: number;
  readonly maxChannelRequests?: number;
  readonly windowMs?: number;
  readonly maxCardinality?: number;
}

/**
 * Bounded two-tier rate limiter protecting both per-IP ingress before database lookup
 * and per-channel capacity after resolution. Guaranteed bounded memory (max 10,000 keys)
 * preventing resource exhaustion when thousands of rotating invalid tokens are sent.
 */
export class BoundedTwoTierRateLimiter {
  private readonly windowMs: number;
  private readonly maxIpRequests: number;
  private readonly maxChannelRequests: number;
  private readonly maxCardinality: number;
  private readonly hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions = {}) {
    this.maxIpRequests = options.maxIpRequests ?? 100;
    this.maxChannelRequests = options.maxChannelRequests ?? 300;
    this.windowMs = options.windowMs ?? 60_000;
    this.maxCardinality = options.maxCardinality ?? 10_000;
  }

  isIpAllowed(ip: string): boolean {
    return this.checkIpLimit(ip).allowed;
  }

  isChannelAllowed(channelId: string): boolean {
    return this.checkChannelLimit(channelId).allowed;
  }

  checkIpLimit(ip: string): RateLimitCheckResult {
    return this.checkLimitWithDetails(`ip:${ip}`, this.maxIpRequests);
  }

  checkChannelLimit(channelId: string): RateLimitCheckResult {
    return this.checkLimitWithDetails(`ch:${channelId}`, this.maxChannelRequests);
  }

  checkOutboundIpLimit(ip: string): RateLimitCheckResult {
    return this.checkLimitWithDetails(`outbound:ip:${ip}`, this.maxIpRequests);
  }

  checkOutboundTenantLimit(params: {
    workspaceId: string;
    actorId: string;
    channelInstanceId: string;
  }): RateLimitCheckResult {
    return this.checkLimitWithDetails(
      `outbound:tenant:${params.workspaceId}:${params.actorId}:${params.channelInstanceId}`,
      this.maxChannelRequests
    );
  }

  private checkLimitWithDetails(key: string, limit: number): RateLimitCheckResult {
    const now = Date.now();
    let timestamps = this.hits.get(key);

    if (!timestamps) {
      if (this.hits.size >= this.maxCardinality) {
        this.evictExpiredOrOldest(now);
      }
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    const valid = timestamps.filter((t) => now - t < this.windowMs);
    if (valid.length >= limit) {
      this.hits.set(key, valid);
      const oldest = valid[0] ?? now;
      const resetMs = Math.max(0, oldest + this.windowMs - now);
      return {
        allowed: false,
        remaining: 0,
        resetMs,
        limit,
      };
    }

    valid.push(now);
    this.hits.set(key, valid);
    const oldest = valid[0] ?? now;
    const resetMs = Math.max(0, oldest + this.windowMs - now);
    return {
      allowed: true,
      remaining: Math.max(0, limit - valid.length),
      resetMs,
      limit,
    };
  }

  private evictExpiredOrOldest(now: number): void {
    for (const [key, list] of this.hits.entries()) {
      if (list.length === 0 || now - list[list.length - 1]! >= this.windowMs) {
        this.hits.delete(key);
      }
    }
    while (this.hits.size >= this.maxCardinality) {
      const firstKey = this.hits.keys().next().value;
      if (firstKey) {
        this.hits.delete(firstKey);
      } else {
        break;
      }
    }
  }

  getCardinality(): number {
    return this.hits.size;
  }

  reset(): void {
    this.hits.clear();
  }
}

export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetMs: number;
  readonly limit: number;
}

export interface IRateLimiter {
  isIpAllowed(ip: string): Promise<boolean> | boolean;
  isChannelAllowed(channelId: string): Promise<boolean> | boolean;
  checkIpLimit?(ip: string): Promise<RateLimitCheckResult> | RateLimitCheckResult;
  checkChannelLimit?(channelId: string): Promise<RateLimitCheckResult> | RateLimitCheckResult;
  checkOutboundIpLimit?(ip: string): Promise<RateLimitCheckResult> | RateLimitCheckResult;
  checkOutboundTenantLimit?(params: {
    workspaceId: string;
    actorId: string;
    channelInstanceId: string;
  }): Promise<RateLimitCheckResult> | RateLimitCheckResult;
  reset?(): Promise<void> | void;
}

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clearBefore = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)
local currentRequests = redis.call('ZCARD', key)
if currentRequests < limit then
  redis.call('ZADD', key, now, now .. ':' .. redis.call('INCR', key .. ':seq'))
  redis.call('PEXPIRE', key, windowMs)
  redis.call('PEXPIRE', key .. ':seq', windowMs)
  return { 1, limit - currentRequests - 1, 0 }
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetMs = 0
  if #oldest > 0 then
    resetMs = math.max(0, math.floor(tonumber(oldest[2]) + windowMs - now))
  else
    resetMs = windowMs
  end
  return { 0, 0, resetMs }
end
`;

export interface RedisTwoTierRateLimiterOptions extends RateLimiterOptions {
  readonly redisClient: Redis;
  readonly keyPrefix?: string;
  readonly fallbackLimiter?: BoundedTwoTierRateLimiter;
}

/**
 * RedisTwoTierRateLimiter
 *
 * Distributed two-tier sliding-window rate limiter powered by Redis:
 * - Tier 1: Per-client IP rate limiting before database lookup.
 * - Tier 2: Per-channel capacity rate limiting after channel resolution.
 * - Atomic Lua sliding window execution guarantees consistency across multiple API replicas.
 * - Graceful Fallback: Automatically falls back to BoundedTwoTierRateLimiter if Redis is unavailable.
 */
export class RedisTwoTierRateLimiter implements IRateLimiter {
  private readonly redis: Redis;
  private readonly keyPrefix: string;
  private readonly maxIpRequests: number;
  private readonly maxChannelRequests: number;
  private readonly windowMs: number;
  private readonly fallbackLimiter: BoundedTwoTierRateLimiter;

  constructor(options: RedisTwoTierRateLimiterOptions) {
    this.redis = options.redisClient;
    this.keyPrefix = options.keyPrefix ?? "sos:ratelimit:v1";
    this.maxIpRequests = options.maxIpRequests ?? 100;
    this.maxChannelRequests = options.maxChannelRequests ?? 300;
    this.windowMs = options.windowMs ?? 60_000;
    this.fallbackLimiter =
      options.fallbackLimiter ??
      new BoundedTwoTierRateLimiter({
        maxIpRequests: this.maxIpRequests,
        maxChannelRequests: this.maxChannelRequests,
        windowMs: this.windowMs,
        maxCardinality: options.maxCardinality ?? 10_000,
      });
  }

  async isIpAllowed(ip: string): Promise<boolean> {
    const res = await this.checkIpLimit(ip);
    return res.allowed;
  }

  async isChannelAllowed(channelId: string): Promise<boolean> {
    const res = await this.checkChannelLimit(channelId);
    return res.allowed;
  }

  async checkIpLimit(ip: string): Promise<RateLimitCheckResult> {
    const key = `${this.keyPrefix}:ip:${ip}`;
    return this.executeSlidingWindow(key, this.maxIpRequests, () => this.fallbackLimiter.isIpAllowed(ip));
  }

  async checkChannelLimit(channelId: string): Promise<RateLimitCheckResult> {
    const key = `${this.keyPrefix}:ch:${channelId}`;
    return this.executeSlidingWindow(key, this.maxChannelRequests, () =>
      this.fallbackLimiter.isChannelAllowed(channelId)
    );
  }

  async checkOutboundIpLimit(ip: string): Promise<RateLimitCheckResult> {
    const key = `${this.keyPrefix}:outbound:ip:${ip}`;
    return this.executeSlidingWindow(key, this.maxIpRequests, () =>
      this.fallbackLimiter.checkOutboundIpLimit(ip).allowed
    );
  }

  async checkOutboundTenantLimit(params: {
    workspaceId: string;
    actorId: string;
    channelInstanceId: string;
  }): Promise<RateLimitCheckResult> {
    const key = `${this.keyPrefix}:outbound:tenant:${params.workspaceId}:${params.actorId}:${params.channelInstanceId}`;
    return this.executeSlidingWindow(key, this.maxChannelRequests, () =>
      this.fallbackLimiter.checkOutboundTenantLimit(params).allowed
    );
  }

  private async executeSlidingWindow(
    key: string,
    limit: number,
    fallbackFn: () => boolean
  ): Promise<RateLimitCheckResult> {
    const now = Date.now();
    try {
      const rawResult = (await this.redis.eval(
        SLIDING_WINDOW_LUA,
        1,
        key,
        now,
        this.windowMs,
        limit
      )) as [number, number, number];

      const allowed = rawResult[0] === 1;
      const remaining = rawResult[1];
      const resetMs = rawResult[2];

      return {
        allowed,
        remaining,
        resetMs,
        limit,
      };
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), key },
        "Redis rate limiter error. Falling back to bounded in-memory rate limiter."
      );
      const allowed = fallbackFn();
      return {
        allowed,
        remaining: allowed ? 1 : 0,
        resetMs: this.windowMs,
        limit,
      };
    }
  }

  async reset(): Promise<void> {
    this.fallbackLimiter.reset();
    try {
      const keys = await this.redis.keys(`${this.keyPrefix}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (err) {
      logger.warn({ err }, "Failed to clear rate limiter keys in Redis during reset");
    }
  }
}
