/** In-memory token bucket per client. The site runs as a single container behind the shared Caddy proxy. */
type Bucket = { tokens: number; updatedAt: number };

export type RateLimiterOptions = {
  ratePerSecond: number;
  burst: number;
  now?: () => number;
  maxClients?: number;
};

export function createRateLimiter({ ratePerSecond, burst, now = Date.now, maxClients = 10_000 }: RateLimiterOptions) {
  const buckets = new Map<string, Bucket>();

  function allow(key: string): boolean {
    const t = now();
    const previous = buckets.get(key);
    const bucket = previous ?? { tokens: burst, updatedAt: t };
    bucket.tokens = Math.min(burst, bucket.tokens + ((t - bucket.updatedAt) / 1000) * ratePerSecond);
    bucket.updatedAt = t;
    // Re-insert so Map order is least-recently-used first.
    buckets.delete(key);
    buckets.set(key, bucket);
    while (buckets.size > maxClients) {
      const oldest = buckets.keys().next().value as string;
      buckets.delete(oldest);
    }
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  return { allow, size: () => buckets.size };
}

/** Caddy sets X-Forwarded-For to the real client address; its first entry is the client. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
