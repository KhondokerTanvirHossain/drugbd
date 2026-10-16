import { PUBLIC_NEW, fill } from "./copy";
import type { CheckResult, Side, SuggestRow } from "./public-types";
import { CHECK, plural } from "./public-copy";

/** §6.7.2 summary formatting. The API counts (§7.4); this only words it. Pure and client-safe. */
const N = PUBLIC_NEW.checker;
const medicines = (n: number) => plural(n, CHECK.medicineOne, CHECK.medicineMany);
const pairs = (n: number) => plural(n, CHECK.pairOne, CHECK.pairMany);
const SEVERITIES = ["major", "moderate", "minor", "unknown"] as const;

export const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export const medicinesOnly = (m: number) => `${m} ${medicines(m)}`;

/** True when that product's substance has coverage "none" in r.products (matched on conceptId + bdsId; an unmapped side,
 *  bdsId null, also by name, so it never matches another null-bdsId substance). Exported so the check page's no-data blocks
 *  (§6.7.3) can test both sides of a no_data row, not only the API's `side`. */
export const hasNoData = (r: CheckResult, s: Side) =>
  r.products.some((p) => p.conceptId === s.conceptId && p.substances.some((x) =>
    x.bdsId === s.bdsId && (s.bdsId !== null || x.name === s.name) && x.coverage === "none"));

type NotCheckedRow = CheckResult["notChecked"][number];

/** The no-data sides of a no_data row as [mine, other] pairs: the API's `side` (side "a" when both have none), then the
 *  opposite side too when its own substance has coverage "none". */
function noDataSides(r: CheckResult, n: NotCheckedRow): [Side, Side][] {
  const [chosen, other] = n.side === "a" ? [n.a, n.b] : [n.b, n.a];
  return hasNoData(r, other) ? [[chosen, other], [other, chosen]] : [[chosen, other]];
}

/** The substances, by name and in result order, that make the not-checked pairs not checked because of no data. */
export function noDataNames(r: CheckResult): string[] {
  const names: string[] = [];
  for (const n of r.notChecked) {
    if (n.reason !== "no_data") continue;
    for (const [mine] of noDataSides(r, n)) if (!names.includes(mine.name)) names.push(mine.name);
  }
  return names;
}

export type NoDataBlockItem = { conceptId: string; brand: string; name: string; bdsId: string | null; chips: string[] };

/** §6.7.3 item 3: one NO_DATA_SENTENCE block per product x no-data substance, in result order, each listing its not-checked
 *  pairs as "{brand} + {other brand}" (plus " ({other substance})" when the other product has several substances). Built
 *  from both sides of every no_data row, so a pair of two no-data medicines gives each its own block. */
export function noDataBlocks(r: CheckResult): NoDataBlockItem[] {
  const blocks = new Map<string, NoDataBlockItem>();
  for (const n of r.notChecked) {
    if (n.reason !== "no_data") continue;
    for (const [mine, other] of noDataSides(r, n)) {
      const key = `${mine.conceptId}|${mine.bdsId ?? mine.name}`;
      const block = blocks.get(key) ?? { conceptId: mine.conceptId, brand: mine.tradeName, name: mine.name, bdsId: mine.bdsId, chips: [] };
      const several = (r.products.find((p) => p.conceptId === other.conceptId)?.substances.length ?? 1) > 1;
      block.chips.push(`${mine.tradeName} + ${other.tradeName}${several ? ` (${other.name})` : ""}`);
      blocks.set(key, block);
    }
  }
  return [...blocks.values()];
}

export function summarySentence(r: CheckResult | null, m: number): string {
  if (m < 2 || r === null) return CHECK.empty;
  const s = r.summary;
  let out = fill(N.summary, { m, medicines: medicines(m), checked: s.checkedPairs, total: s.totalPairs, pairs: pairs(s.totalPairs),
    alerts: s.alertPairs });
  const counted = r.notChecked.filter((n) => n.reason !== "same_product");
  if (s.notCheckedPairs > 0) {
    if (counted.length > 0 && counted.every((n) => n.reason === "no_data")) {
      const names = noDataNames(r);
      out += fill(N.ncNoData, { nc: s.notCheckedPairs, pairs: pairs(s.notCheckedPairs), names: joinAnd(names),
        has: names.length === 1 ? CHECK.has : CHECK.have });
    } else {
      out += fill(N.nc, { nc: s.notCheckedPairs, pairs: pairs(s.notCheckedPairs) });
    }
  }
  if (s.notReviewed > 0) out += fill(N.nr, { nr: s.notReviewed, medicines: medicines(s.notReviewed) });
  return out;
}

export function countChips(r: CheckResult) {
  const severities = SEVERITIES.map((k) => [k, r.summary.bySeverity[k]] as [(typeof SEVERITIES)[number], number]).filter(([, n]) => n > 0);
  const noData = r.notChecked.filter((n) => n.reason === "no_data").length;
  return { severities, noData, other: Math.max(0, r.summary.notCheckedPairs - noData) };
}

/** §6.7.1 sub line of an approved suggestion or no-JS match: "{clinical display}[. Matches {synonym}, a name for {substance} | . Matches {substance}]". */
export function suggestionSub(r: Pick<SuggestRow, "status" | "clinicalDisplayName" | "matched">): string {
  if (r.status !== "approved" || !r.clinicalDisplayName) return "";
  if (!r.matched) return r.clinicalDisplayName;
  return r.clinicalDisplayName + (r.matched.name.toLowerCase() === r.matched.substance.toLowerCase()
    ? fill(CHECK.matches, { name: r.matched.substance }) : fill(CHECK.matchesFor, { name: r.matched.name, substance: r.matched.substance }));
}
