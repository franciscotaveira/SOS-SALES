/**
 * TX COMMERCIAL CORE — DISTRIBUTED IDEMPOTENCY GATE
 *
 * Prevents race conditions and duplicate webhook processing from Meta Cloud API
 * and WAHA / Evolution instances.
 *
 * Uses Redis atomic SETNX with TTL if available, with automatic fallback
 * to a high-throughput in-memory expiring sliding-window cache.
 */

import { Redis } from 'ioredis';

export interface IdempotencyGateOptions {
  redisClient?: Redis;
  defaultTtlSeconds?: number;
}

export class IdempotencyGate {
  private static instance: IdempotencyGate;
  private readonly redisClient?: Redis;
  private readonly memoryCache = new Map<string, number>();
  private readonly defaultTtlSeconds: number;

  constructor(options?: IdempotencyGateOptions) {
    this.redisClient = options?.redisClient;
    this.defaultTtlSeconds = options?.defaultTtlSeconds ?? 120;

    // Periodic sweep for in-memory cache to prevent memory leaks (every 60s)
    if (typeof setInterval !== 'undefined') {
      const sweepTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, expiresAt] of this.memoryCache.entries()) {
          if (now > expiresAt) {
            this.memoryCache.delete(key);
          }
        }
      }, 60000);
      if (sweepTimer && typeof sweepTimer === 'object' && 'unref' in sweepTimer) {
        sweepTimer.unref();
      }
    }
  }

  public static getInstance(options?: IdempotencyGateOptions): IdempotencyGate {
    if (!IdempotencyGate.instance) {
      IdempotencyGate.instance = new IdempotencyGate(options);
    }
    return IdempotencyGate.instance;
  }

  /**
   * Checks whether the given key has already been seen in the current TTL window.
   * If not seen, atomically marks it as seen and returns `false` (not duplicate).
   * If already seen, returns `true` (is duplicate, should be skipped).
   *
   * @param key Unique identifier (e.g. `webhook:waba:msg_id_12345` or `waha:event:uuid`)
   * @param ttlSeconds Time-to-live in seconds (defaults to 120s)
   */
  public async isDuplicate(key: string, ttlSeconds = this.defaultTtlSeconds): Promise<boolean> {
    if (!key) return false;

    // 1. Try Redis Atomic SETNX if connected
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        const result = await this.redisClient.set(key, '1', 'EX', ttlSeconds, 'NX');
        // 'OK' means the key was set (first time seen -> not duplicate).
        // null means the key already existed -> duplicate!
        return result === null;
      } catch (err) {
        // Fallback to in-memory on Redis transient error
      }
    }

    // 2. In-Memory Atomic Check
    const now = Date.now();
    const existingExpiresAt = this.memoryCache.get(key);

    if (existingExpiresAt && now < existingExpiresAt) {
      return true; // Duplicate!
    }

    // Mark as seen with expiration timestamp
    this.memoryCache.set(key, now + ttlSeconds * 1000);
    return false;
  }

  /**
   * Explicitly clears a key (useful in tests or rollback scenarios).
   */
  public async release(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (this.redisClient && this.redisClient.status === 'ready') {
      try {
        await this.redisClient.del(key);
      } catch {
        // ignore
      }
    }
  }
}
