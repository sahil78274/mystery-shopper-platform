import type { NextFunction, Request, Response } from "express";

type WindowEntry = { count: number; resetAt: number };

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/** Small per-process fixed-window counter. Use a shared store if the API is horizontally scaled. */
export class FixedWindowLimiter {
  private readonly windows = new Map<string, WindowEntry>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(limit: number, windowMs: number, maxKeys = 10_000) {
    if (!Number.isInteger(limit) || limit < 1 || windowMs < 1 || maxKeys < 1) {
      throw new Error("Rate-limit settings must be positive.");
    }
    this.limit = limit;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, entry);
    }

    if (entry.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }

    entry.count += 1;
    this.windows.set(key, entry);
    this.prune(now);
    return {
      allowed: true,
      remaining: Math.max(0, this.limit - entry.count),
      retryAfterSeconds: 0,
    };
  }

  private prune(now: number): void {
    if (this.windows.size <= this.maxKeys) return;
    for (const [key, entry] of this.windows) {
      if (entry.resetAt <= now || this.windows.size > this.maxKeys) this.windows.delete(key);
      if (this.windows.size <= this.maxKeys) break;
    }
  }
}

export function rateLimitByIp(limit: number, windowMs: number, message: string) {
  const limiter = new FixedWindowLimiter(limit, windowMs);
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const result = limiter.consume(key);
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      res.status(429).json({ error: message });
      return;
    }
    next();
  };
}
