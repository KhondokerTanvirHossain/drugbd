import { createHash } from "node:crypto";
import { accountKey, createDailyCounter, createRateLimiter, createWindowLimiter } from "./rate-limit";

/** Every limit in spec §9.3. In memory, single process. */
export function createLimits(now: () => number = Date.now, overrides: { anonymousDaily?: number; accountDaily?: number } = {}) {
  return {
    perIp: createRateLimiter({ ratePerSecond: 10, burst: 30, now }),
    anonymousDaily: createDailyCounter({ limit: overrides.anonymousDaily ?? 50_000, now }),
    accountDaily: createDailyCounter({ limit: overrides.accountDaily ?? 5_000, now }),
    suggest: createRateLimiter({ ratePerSecond: 5, burst: 10, now }),
    versions: createRateLimiter({ ratePerSecond: 0.2, burst: 3, now }),
    signIn: createWindowLimiter({ limit: 10, windowMs: 10 * 60_000, now }),
    signOut: createWindowLimiter({ limit: 10, windowMs: 10 * 60_000, now }),
    decision: createWindowLimiter({ limit: 60, windowMs: 60_000, now }),
    flag: createWindowLimiter({ limit: 10, windowMs: 3_600_000, now }),
    partner: createWindowLimiter({ limit: 3, windowMs: 86_400_000, now }),
    /** decision_denied audit rows (§5.15, §7.6): 1 per minute per (actor, outcome); at most 10,000 keys (LRU). */
    deniedAudit: createWindowLimiter({ limit: 1, windowMs: 60_000, now, maxKeys: 10_000 }),
  };
}
export type Limits = ReturnType<typeof createLimits>;

/** The process-wide limits used by the server actions (the middleware bundle holds its own instance). */
export const LIMITS: Limits = createLimits();

export type AccountAction = "decision" | "flag" | "partner";
/** True when the account may perform one more `kind` action now (and counts it). */
export function allowAccountAction(kind: AccountAction, email: string, limits: Limits = LIMITS): boolean {
  return limits[kind].allow(accountKey(email));
}

/**
 * True when one more decision_denied audit row may be written now for this actor and outcome (and counts it): one per
 * minute per (account, outcome), or per (IP, outcome) without a session. The account key is the §9.3 per-account hash;
 * the IP is hashed with SHA-256 and held in memory only, never stored or logged. A spent window skips the audit write
 * only; the caller's answer never changes. Every decision_denied writer (the legacy review action, P1B's desk) uses it.
 */
export function allowDeniedAudit(outcome: string, email: string | null, ip: string, limits: Limits = LIMITS): boolean {
  const actor = email ? `a:${accountKey(email)}` : `i:${createHash("sha256").update(ip).digest("hex")}`;
  return limits.deniedAudit.allow(`${outcome}:${actor}`);
}
