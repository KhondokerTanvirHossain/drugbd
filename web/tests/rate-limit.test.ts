import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "../lib/rate-limit";

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
