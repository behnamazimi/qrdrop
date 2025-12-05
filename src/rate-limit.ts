/**
 * Rate limiting implementation
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if request should be allowed
   * @param identifier - Unique identifier (usually IP address)
   * @returns true if request is allowed, false if rate limited
   */
  check(identifier: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(identifier);

    if (!entry || now > entry.resetTime) {
      // Create new entry or reset expired entry
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false; // Rate limited
    }

    entry.count++;
    return true;
  }

  /**
   * Get remaining requests for an identifier
   * @param identifier - Unique identifier
   * @returns Number of remaining requests, or maxRequests if no entry
   */
  getRemaining(identifier: string): number {
    const entry = this.requests.get(identifier);
    if (!entry || Date.now() > entry.resetTime) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - entry.count);
  }

  /**
   * Get reset time for an identifier
   * @param identifier - Unique identifier
   * @returns Reset time in milliseconds, or 0 if no entry
   */
  getResetTime(identifier: string): number {
    const entry = this.requests.get(identifier);
    if (!entry) {
      return 0;
    }
    return Math.max(0, entry.resetTime - Date.now());
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.requests.clear();
  }
}

/**
 * Create a rate limiter with custom settings
 */
export function createRateLimiter(
  maxRequests: number = 100,
  windowMs: number = 60000
): RateLimiter {
  return new RateLimiter(maxRequests, windowMs);
}
