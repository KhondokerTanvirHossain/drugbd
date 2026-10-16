import { firstParam, listParam } from "./params";
import type { SeverityFilter } from "./public-types";

/** Request parameters of the public pages, read defensively: a bad value is the default, never an API 400 (Review Focus 2, 3, 5). Pure. */
export const Q_MIN = 2, Q_MAX = 100, SEARCH_PAGE_MAX = 9, INDEX_MAX = 10_000, CHECK_MAX = 20, ID_MAX = 200;
type Raw = string | string[] | undefined;
const chars = (s: string) => [...s].length;
const DIGITS = /^[0-9]+$/;
const CONTROL = /[\u0000-\u001F\u007F]/g;
const HAS_CONTROL = /[\u0000-\u001F\u007F]/;

/**
 * §6.3 query. A C0 control or DEL reads as a space (final review finding 2): Postgres rejects NUL and Java's strip()
 * removes U+001C–U+001F, so either would surface as an API error instead of the page's own problem line.
 */
export function parseQuery(raw: Raw): { q: string; problem: "short" | "long" | null } {
  const q = firstParam(raw).replace(CONTROL, " ").trim();
  const n = chars(q);
  return { q, problem: n < Q_MIN ? "short" : n > Q_MAX ? "long" : null };
}

function digits(raw: Raw): number | null {
  const v = firstParam(raw);
  if (!DIGITS.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** §6.3: every session can open at most page index 9; past it the page reads 9 and shows the cap line. */
export function parseSearchPage(raw: Raw): { page: number; capped: boolean } {
  const n = digits(raw);
  if (n === null) return { page: 0, capped: false };
  return n > SEARCH_PAGE_MAX ? { page: SEARCH_PAGE_MAX, capped: true } : { page: n, capped: false };
}

export function parseIndex(raw: Raw): number {
  const n = digits(raw);
  return n === null ? 0 : Math.min(n, INDEX_MAX);
}

const SEVERITIES: readonly SeverityFilter[] = ["major", "moderate", "minor", "unknown"];
export function parseSeverity(raw: Raw): SeverityFilter | null {
  const v = firstParam(raw);
  return (SEVERITIES as readonly string[]).includes(v) ? (v as SeverityFilter) : null;
}

/** A product or substance id from a URL path: 1 to ID_MAX characters, no control character; anything else is not found. */
export function isPathId(id: string): boolean {
  return id.length > 0 && id.length <= ID_MAX && !HAS_CONTROL.test(id);
}

/** The checker's selection: the URL's ids, then the no-JavaScript actions (clear, remove, add). The URL is the only store (§6.7.1). */
export function parseCheckIds(sp: { ids?: Raw; add?: Raw; remove?: Raw; clear?: Raw }): { ids: string[]; changed: boolean } {
  const raw = Array.isArray(sp.ids) ? sp.ids : sp.ids === undefined ? [] : [sp.ids];
  let ids = listParam(sp.ids).filter(isPathId);
  const clear = firstParam(sp.clear) !== "", remove = firstParam(sp.remove).trim(), add = firstParam(sp.add).trim();
  if (clear) ids = [];
  if (remove) ids = ids.filter((id) => id !== remove);
  if (add && isPathId(add) && !ids.includes(add) && ids.length < CHECK_MAX) ids.push(add);
  ids = ids.slice(0, CHECK_MAX);
  const changed = clear || remove !== "" || add !== "" || raw.length !== ids.length || raw.some((id, i) => id !== ids[i]);
  return { ids, changed };
}

export function checkHref(ids: string[]): string {
  return ids.length ? `/check?${new URLSearchParams(ids.map((id) => ["ids", id]))}` : "/check";
}
