import type { Version, VersionRow } from "@/lib/review-types";

export const POLL_MS = 20_000;
export type PollVerdict = { kind: "rows"; rows: VersionRow[] } | { kind: "signedOut" } | { kind: "forbidden" } | { kind: "ignore" };

const isRow = (x: unknown): x is VersionRow => typeof x === "object" && x !== null && typeof (x as VersionRow).conceptId === "string"
  && "extractedAt" in x && "lastDecisionId" in x && typeof (x as VersionRow).displayStatus === "string";

/**
 * §5.11 and Review Focus 3: only a readable list changes anything. A dropped connection (null), a 429, a 5xx or a body
 * that is not the list is ignored and the 20 s poll carries on; a 401 means the session ended.
 */
export async function pollVerdict(res: Response | null): Promise<PollVerdict> {
  if (res === null) return { kind: "ignore" };
  if (res.status === 401) return { kind: "signedOut" };
  if (res.status === 403) return { kind: "forbidden" };
  if (!res.ok) return { kind: "ignore" };
  try {
    const body: unknown = await res.json();
    return Array.isArray(body) && body.every(isRow) ? { kind: "rows", rows: body } : { kind: "ignore" };
  } catch {
    return { kind: "ignore" };
  }
}

/** The open record's row (null when it left the batch) and whether any other row changed, appeared or disappeared. */
export function compareRows(known: { conceptId: string; version: Version; displayStatus: string }[], rows: VersionRow[],
    openId: string | null): { open: VersionRow | null; othersChanged: boolean } {
  const byId = new Map(rows.map((r) => [r.conceptId, r]));
  const others = known.filter((k) => k.conceptId !== openId);
  const otherRows = rows.filter((r) => r.conceptId !== openId);
  const othersChanged = otherRows.length !== others.length || others.some((k) => {
    const r = byId.get(k.conceptId);
    return !r || r.extractedAt !== k.version.extractedAt || r.lastDecisionId !== k.version.lastDecisionId || r.displayStatus !== k.displayStatus;
  });
  return { open: openId === null ? null : byId.get(openId) ?? null, othersChanged };
}
