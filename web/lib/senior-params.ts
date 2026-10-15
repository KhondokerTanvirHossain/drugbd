import { PAIR_SCOPES, PAIR_SHOWS, SEVERITY_FILTERS, type PairQuery, type PairScope, type PairShow, type SeverityFilter } from "./senior-types";

/*
 * Query parameters of the senior pages (§5.17). An unknown or malformed value falls back to its default, so a stale or
 * hand-edited link still shows a page (Review Focus 5); the API would answer 400 for it.
 */
type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] ?? "" : v ?? "");
const oneOf = <T extends string>(v: string, list: readonly T[], fallback: T): T => ((list as readonly string[]).includes(v) ? (v as T) : fallback);
const PAGE_MAX = 10_000, Q_MAX = 100;
const page = (v: string) => (/^\d{1,5}$/.test(v) && Number(v) <= PAGE_MAX ? Number(v) : 0);
const severity = (v: string): SeverityFilter | null => ((SEVERITY_FILTERS as readonly string[]).includes(v) ? (v as SeverityFilter) : null);

/** The queue with no parameter: what the toolbar's "{t} pair[s] to review" counts on every senior page (§5.17). */
export const DEFAULT_PAIR_QUERY: PairQuery = { show: "todo", pairs: "all", severity: null, page: 0 };

export function parsePairQuery(sp: SP): PairQuery {
  return { show: oneOf<PairShow>(first(sp.show), PAIR_SHOWS, "todo"), pairs: oneOf<PairScope>(first(sp.pairs), PAIR_SCOPES, "all"),
    severity: severity(first(sp.severity)), page: page(first(sp.page)) };
}

export function parseSubstanceQuery(sp: SP): Omit<PairQuery, "show"> {
  return { pairs: oneOf<PairScope>(first(sp.pairs), PAIR_SCOPES, "all"), severity: severity(first(sp.severity)), page: page(first(sp.page)) };
}

export function parseSubstancesQuery(sp: SP): { q: string; page: number } {
  return { q: [...first(sp.q).trim()].slice(0, Q_MAX).join(""), page: page(first(sp.page)) };
}

const query = (entries: [string, string | number | null | undefined, string | number | null][]) => {
  const p = new URLSearchParams();
  for (const [k, v, dflt] of entries) if (v !== undefined && v !== null && v !== "" && v !== dflt) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export function pairsHref(q: Partial<PairQuery>): string {
  return `/review/pairs${query([["show", q.show, "todo"], ["pairs", q.pairs, "all"], ["severity", q.severity, null], ["page", q.page, 0]])}`;
}
export function substanceHref(bdsId: string, q: Partial<Omit<PairQuery, "show">> = {}): string {
  return `/review/substances/${encodeURIComponent(bdsId)}${query([["pairs", q.pairs, "all"], ["severity", q.severity, null], ["page", q.page, 0]])}`;
}
export function substancesHref(q: string, pageNo: number): string {
  return `/review/substances${query([["q", q, ""], ["page", pageNo, 0]])}`;
}
