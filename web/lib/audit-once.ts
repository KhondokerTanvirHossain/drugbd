import "server-only";

/** True the first time a key is seen in `ttlMs`, then false until it expires (§5.15 "at most one per … 10 minutes"). */
export function createOnce(ttlMs: number, now: () => number = Date.now, maxKeys = 50_000): (key: string) => boolean {
  const seen = new Map<string, number>();
  return (key: string) => {
    const t = now();
    const at = seen.get(key);
    if (at !== undefined && t - at < ttlMs) return false;
    seen.delete(key);
    seen.set(key, t);
    while (seen.size > maxKeys) seen.delete(seen.keys().next().value as string);
    return true;
  };
}

/** Shared by review_open and evidence_open; keys hold the account key, never the email itself. */
export const AUDIT_ONCE = createOnce(10 * 60_000);
