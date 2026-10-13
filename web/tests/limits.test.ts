import { describe, expect, it } from "vitest";
import { allowAccountAction, createLimits } from "@/lib/limits";

const burst = (allow: (k: string) => boolean, n: number) => Array.from({ length: n }, () => allow("k"));

describe("§9.3 limits", () => {
  it("per IP: 10/s with a burst of 30", () => {
    const l = createLimits(() => 0);
    expect(burst((k) => l.perIp.allow(k), 31).filter(Boolean)).toHaveLength(30);
  });
  it("sign-in and sign-out: 10 per 10 minutes each, counted separately", () => {
    let now = 0;
    const l = createLimits(() => now);
    expect(burst((k) => l.signIn.allow(k), 11).filter(Boolean)).toHaveLength(10);
    expect(l.signOut.allow("k")).toBe(true);
    now = 9 * 60_000;
    expect(l.signIn.allow("k")).toBe(false);
    now = 10 * 60_000;
    expect(l.signIn.allow("k")).toBe(true);
  });
  it("suggest 5/s burst 10; versions 1 per 5 s burst 3", () => {
    let now = 0;
    const l = createLimits(() => now);
    expect(burst((k) => l.suggest.allow(k), 11).filter(Boolean)).toHaveLength(10);
    expect(burst((k) => l.versions.allow(k), 4).filter(Boolean)).toHaveLength(3);
    now = 5000;
    expect(l.versions.allow("k")).toBe(true);
    expect(l.versions.allow("k")).toBe(false);
  });
  it("decisions 60 per minute, flags 10 per hour, partner requests 3 per day, per account", () => {
    const l = createLimits(() => 0);
    expect(burst(() => allowAccountAction("decision", "p@x.org", l), 61).filter(Boolean)).toHaveLength(60);
    expect(burst(() => allowAccountAction("flag", "p@x.org", l), 11).filter(Boolean)).toHaveLength(10);
    expect(burst(() => allowAccountAction("partner", "p@x.org", l), 4).filter(Boolean)).toHaveLength(3);
    expect(allowAccountAction("flag", "P@X.org", l)).toBe(false);     // same account, other case
    expect(allowAccountAction("flag", "q@x.org", l)).toBe(true);
  });
  it("daily caps default to 50,000 anonymous per IP and 5,000 per account", () => {
    const l = createLimits(() => 0);
    expect(burst((k) => l.accountDaily.allow(k), 5001).filter(Boolean)).toHaveLength(5000);
    expect(burst((k) => l.anonymousDaily.allow(k), 50_001).filter(Boolean)).toHaveLength(50_000);
  });
});
