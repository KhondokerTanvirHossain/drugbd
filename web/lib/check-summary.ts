import { PUBLIC_NEW, fill } from "./copy";
import type { CheckResult } from "./public-types";
import { CHECK, plural } from "./public-copy";

/** §6.7.2 summary formatting. The API counts (§7.4); this only words it. Pure and client-safe. */
const N = PUBLIC_NEW.checker;
const medicines = (n: number) => plural(n, CHECK.medicineOne, CHECK.medicineMany);
const pairs = (n: number) => plural(n, CHECK.pairOne, CHECK.pairMany);
const SEVERITIES = ["major", "moderate", "minor", "unknown"] as const;

export const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
export const medicinesOnly = (m: number) => `${m} ${medicines(m)}`;

/** The substances, by name and in result order, that make the not-checked pairs not checked because of no data. */
export function noDataNames(r: CheckResult): string[] {
  const names: string[] = [];
  for (const n of r.notChecked) {
    if (n.reason !== "no_data") continue;
    const name = (n.side === "a" ? n.a : n.b).name;
    if (!names.includes(name)) names.push(name);
  }
  return names;
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
