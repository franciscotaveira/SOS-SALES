export interface QueueRetryOptions {
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly backoffFactor?: number;
  readonly jitterRatio?: number; // e.g. 0.15 = ±15% jitter
  readonly randomFn?: () => number;
}

export interface QueueRetryDecision {
  readonly shouldRetry: boolean;
  readonly nextStatus: "failed" | "dead_letter";
  readonly nextRetryCount: number;
  readonly nextAttemptAt: Date | null;
  readonly delayMs: number;
  readonly attemptsRemaining: number;
  readonly totalAttemptsAllowed: number;
}

/**
 * QueueRetryPolicy
 *
 * Deterministic retry and dead-letter progression policy for durable transactional queues
 * (channel_webhook_inbox and outbound_commands).
 *
 * Rules:
 * 1. max_retries defines the number of additional attempts AFTER the initial attempt.
 *    Total maximum attempts = 1 + max_retries.
 * 2. Deterministic execution: requires an explicit `now: Date` parameter. No internal Date.now()!
 * 3. Exponential backoff: delayMs = min(baseDelayMs * (backoffFactor ^ currentRetryCount), maxDelayMs).
 * 4. Terminal status: When currentRetryCount >= maxRetries, status transitions directly to 'dead_letter'
 *    with nextAttemptAt = null.
 */
export class QueueRetryPolicy {
  public static readonly DEFAULT_BASE_DELAY_MS = 5_000; // 5 seconds
  public static readonly DEFAULT_MAX_DELAY_MS = 300_000; // 5 minutes
  public static readonly DEFAULT_BACKOFF_FACTOR = 2;

  /**
   * Evaluates queue item failure and calculates the next attempt timestamp and status.
   *
   * @param currentRetryCount Number of retries already performed (0 = initial failure)
   * @param maxRetries Maximum number of retries allowed after initial failure
   * @param now Current reference timestamp (must be valid Date)
   * @param options Optional overrides for base delay, max delay, and factor
   */
  public static evaluate(
    currentRetryCount: number,
    maxRetries: number,
    now: Date,
    options: QueueRetryOptions = {}
  ): QueueRetryDecision {
    if (isNaN(now.getTime())) {
      throw new Error("QUEUE_RETRY_POLICY_ERROR: Parameter 'now' must be a valid Date object");
    }

    const safeRetryCount = Math.max(0, Math.floor(currentRetryCount));
    const safeMaxRetries = Math.max(0, Math.floor(maxRetries));
    const totalAttemptsAllowed = 1 + safeMaxRetries;

    const baseDelayMs = options.baseDelayMs ?? QueueRetryPolicy.DEFAULT_BASE_DELAY_MS;
    const maxDelayMs = options.maxDelayMs ?? QueueRetryPolicy.DEFAULT_MAX_DELAY_MS;
    const backoffFactor = options.backoffFactor ?? QueueRetryPolicy.DEFAULT_BACKOFF_FACTOR;

    // Boundary Check: If all retries exhausted, transition immediately to dead_letter
    if (safeRetryCount >= safeMaxRetries) {
      return {
        shouldRetry: false,
        nextStatus: "dead_letter",
        nextRetryCount: safeMaxRetries,
        nextAttemptAt: null,
        delayMs: 0,
        attemptsRemaining: 0,
        totalAttemptsAllowed,
      };
    }

    // Exponential Backoff calculation
    const baseCalculatedDelayMs = Math.min(
      Math.round(baseDelayMs * Math.pow(backoffFactor, safeRetryCount)),
      maxDelayMs
    );

    // Apply bounded jitter if jitterRatio is specified (e.g. 0.15 = ±15% variance)
    let delayMs = baseCalculatedDelayMs;
    if (options.jitterRatio && options.jitterRatio > 0) {
      const rand = options.randomFn ? options.randomFn() : Math.random();
      const multiplier = 1 + (rand * 2 - 1) * Math.min(0.5, options.jitterRatio);
      delayMs = Math.min(Math.round(baseCalculatedDelayMs * multiplier), maxDelayMs);
    }

    const nextAttemptAt = new Date(now.getTime() + delayMs);
    const nextRetryCount = safeRetryCount + 1;
    const attemptsRemaining = safeMaxRetries - nextRetryCount;

    return {
      shouldRetry: true,
      nextStatus: "failed",
      nextRetryCount,
      nextAttemptAt,
      delayMs,
      attemptsRemaining,
      totalAttemptsAllowed,
    };
  }
}
