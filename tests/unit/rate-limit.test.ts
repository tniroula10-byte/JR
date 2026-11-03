import { beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, clearRateLimit, resetRateLimits } from '@/lib/rate-limit';

const cfg = { windowMs: 60_000, maxRequests: 3 };

describe('rate limiter', () => {
  beforeEach(() => resetRateLimits());

  it('blocks after the limit inside the window and recovers after it', () => {
    const t = 1_000_000;
    expect(checkRateLimit('k', cfg, t).allowed).toBe(true);
    expect(checkRateLimit('k', cfg, t + 1).allowed).toBe(true);
    expect(checkRateLimit('k', cfg, t + 2).allowed).toBe(true);
    expect(checkRateLimit('k', cfg, t + 3).allowed).toBe(false);
    expect(checkRateLimit('k', cfg, t + 60_010).allowed).toBe(true);
  });

  it('clearing a key (successful login) restores the full allowance', () => {
    checkRateLimit('login:a', cfg);
    checkRateLimit('login:a', cfg);
    clearRateLimit('login:a');
    expect(checkRateLimit('login:a', cfg).remaining).toBe(2);
  });
});
