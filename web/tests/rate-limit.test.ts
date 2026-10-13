import { describe, expect, it } from "vitest";
import {
  accountKey, clientIp, createDailyCounter, createRateLimiter, createWindowLimiter, dhakaDay, secondsUntilDhakaMidnight,
} from "../lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows a burst, then refuses until tokens refill", () => {
    let now = 0;
    const limiter = createRateLimiter({ ratePerSecond: 10, burst: 30, now: () => now });
    for (let i = 0; i < 30; i++) expect(limiter.allow("1.2.3.4")).toBe(true);
    expect(limiter.allow("1.2.3.4")).toBe(false);
    now = 100; // 0.1 s refills one token at 10/s
    expect(limiter.allow("1.2.3.4")).toBe(true);
    expect(limiter.allow("1.2.3.4")).toBe(false);
  });

  it("keeps a separate bucket per client", () => {
    const limiter = createRateLimiter({ ratePerSecond: 1, burst: 1, now: () => 0 });
    expect(limiter.allow("a")).toBe(true);
    expect(limiter.allow("a")).toBe(false);
    expect(limiter.allow("b")).toBe(true);
  });

  it("never refills above the burst size", () => {
    let now = 0;
    const limiter = createRateLimiter({ ratePerSecond: 10, burst: 2, now: () => now });
    now = 60_000;
    expect(limiter.allow("x")).toBe(true);
    expect(limiter.allow("x")).toBe(true);
    expect(limiter.allow("x")).toBe(false);
  });

  it("evicts idle clients so memory stays bounded", () => {
    let now = 0;
    const limiter = createRateLimiter({ ratePerSecond: 10, burst: 30, now: () => now, maxClients: 2 });
    limiter.allow("a");
    limiter.allow("b");
    now = 1;
    limiter.allow("c");
    expect(limiter.size()).toBeLessThanOrEqual(2);
  });
});

describe("clientIp", () => {
  it("uses the first X-Forwarded-For entry set by the proxy", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 172.18.0.2" }))).toBe("203.0.113.7");
  });
  it("falls back to x-real-ip, then a shared key", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("createWindowLimiter (sliding window)", () => {
  it("allows `limit` events per window, then refuses until the oldest leaves the window", () => {
    let now = 0;
    const l = createWindowLimiter({ limit: 10, windowMs: 600_000, now: () => now });
    for (let i = 0; i < 10; i++) expect(l.allow("ip")).toBe(true);
    expect(l.allow("ip")).toBe(false);
    now = 599_999;
    expect(l.allow("ip")).toBe(false);
    now = 600_000;
    expect(l.allow("ip")).toBe(true);
    expect(l.allow("other")).toBe(true);
  });
  it("keeps memory bounded", () => {
    const l = createWindowLimiter({ limit: 1, windowMs: 1000, now: () => 0, maxKeys: 2 });
    l.allow("a"); l.allow("b"); l.allow("c");
    expect(l.size()).toBe(2);
  });
});

describe("Dhaka day (UTC+6, no daylight saving)", () => {
  const at = (h: number, m = 0, s = 0) => Date.UTC(2026, 9, 12, h, m, s);
  it("counts seconds to 00:00 Dhaka, which is 18:00 UTC", () => {
    expect(secondsUntilDhakaMidnight(at(17, 59))).toBe(60);
    expect(secondsUntilDhakaMidnight(at(18))).toBe(86_400);
    expect(secondsUntilDhakaMidnight(at(0))).toBe(18 * 3600);
  });
  it("resets daily counters at 18:00 UTC (Review Focus 2)", () => {
    let now = at(17, 59, 59);
    const c = createDailyCounter({ limit: 2, now: () => now });
    expect(c.allow("ip")).toBe(true);
    expect(c.allow("ip")).toBe(true);
    expect(c.allow("ip")).toBe(false);
    expect(dhakaDay(at(17, 59, 59)) + 1).toBe(dhakaDay(at(18)));
    now = at(18);
    expect(c.allow("ip")).toBe(true);
  });
});

describe("accountKey", () => {
  it("hashes the trimmed, lower-cased email with SHA-256 and never returns the email", () => {
    const k = accountKey("  Pharm@Example.org ");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).toBe(accountKey("pharm@example.org"));
    expect(k).not.toContain("pharm");
  });
});
