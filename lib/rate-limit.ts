/**
 * Server-Side & RPC Rate Limiter (`lib/rate-limit.ts`)
 * Architecture Rule 8: Rate-limit login emails, offer submission, ticket creation and message sending.
 */

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

export const RATE_LIMIT_PRESETS = {
  LOGIN_EMAIL: { windowMs: 15 * 60 * 1000, maxRequests: 5 },
  SUBMIT_OFFER: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
  CREATE_TICKET: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
  SEND_MESSAGE: { windowMs: 60 * 1000, maxRequests: 30 }
} as const;

interface BucketEntry {
  timestamps: number[];
}

const globalBuckets = globalThis as unknown as {
  __jrRateLimitBuckets?: Map<string, BucketEntry>;
};

function getStore(): Map<string, BucketEntry> {
  if (!globalBuckets.__jrRateLimitBuckets) {
    globalBuckets.__jrRateLimitBuckets = new Map<string, BucketEntry>();
  }
  return globalBuckets.__jrRateLimitBuckets;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  nowMs: number = Date.now()
): RateLimitResult {
  const store = getStore();
  const windowStart = nowMs - config.windowMs;
  const existing = store.get(key) ?? { timestamps: [] };

  const activeTimestamps = existing.timestamps.filter((ts) => ts > windowStart);

  if (activeTimestamps.length >= config.maxRequests) {
    const oldest = activeTimestamps[0] ?? nowMs;
    store.set(key, { timestamps: activeTimestamps });
    return {
      allowed: false,
      remaining: 0,
      resetAtMs: oldest + config.windowMs
    };
  }

  activeTimestamps.push(nowMs);
  store.set(key, { timestamps: activeTimestamps });

  return {
    allowed: true,
    remaining: Math.max(0, config.maxRequests - activeTimestamps.length),
    resetAtMs: nowMs + config.windowMs
  };
}

export function resetRateLimits(): void {
  getStore().clear();
}
