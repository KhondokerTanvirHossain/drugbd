import { createHash } from "node:crypto";

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

export type WindowLimiterOptions = { limit: number; windowMs: number; now?: () => number; maxKeys?: number };

/** At most `limit` events per key in any window of `windowMs` (sliding). Memory is bounded by `maxKeys`. */
export function createWindowLimiter({ limit, windowMs, now = Date.now, maxKeys = 10_000 }: WindowLimiterOptions) {
  const hits = new Map<string, number[]>();
  function allow(key: string): boolean {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((h) => t - h < windowMs);
    hits.delete(key);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    while (hits.size > maxKeys) hits.delete(hits.keys().next().value as string);
    return true;
  }
  return { allow, size: () => hits.size };
}

const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3_600_000; // Asia/Dhaka is UTC+6 all year

/** The Dhaka calendar day number of an instant. */
export const dhakaDay = (ms: number) => Math.floor((ms + DHAKA_OFFSET_MS) / DAY_MS);

/** Seconds from `ms` until the next 00:00 in Dhaka (18:00 UTC); used for Retry-After on daily caps. */
export function secondsUntilDhakaMidnight(ms: number): number {
  const local = ms + DHAKA_OFFSET_MS;
  return Math.ceil(((Math.floor(local / DAY_MS) + 1) * DAY_MS - local) / 1000);
}

/** Up to `limit` events per key per Dhaka calendar day. */
export function createDailyCounter({ limit, now = Date.now, maxKeys = 100_000 }: { limit: number; now?: () => number; maxKeys?: number }) {
  let day = dhakaDay(now());
  const counts = new Map<string, number>();
  function allow(key: string): boolean {
    const d = dhakaDay(now());
    if (d !== day) {
      day = d;
      counts.clear();
    }
    const n = (counts.get(key) ?? 0) + 1;
    if (n > limit) return false;
    counts.delete(key);
    counts.set(key, n);
    while (counts.size > maxKeys) counts.delete(counts.keys().next().value as string);
    return true;
  }
  return { allow, size: () => counts.size };
}

/** §9.3 "per account" key: SHA-256 of the trimmed, lower-cased session email. Kept in memory only, never logged. */
export function accountKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
