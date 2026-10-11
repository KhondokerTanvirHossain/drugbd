import { SEVERITY_NOT_CLASSIFIED } from "./copy";

/** DDInter severities, most severe first; anything else is shown under "unknown" (same rule as the API). */
export const SEVERITIES = ["major", "moderate", "minor", "unknown"] as const;
export type Severity = (typeof SEVERITIES)[number];

export function severityOf(s: string): Severity {
  return (SEVERITIES as readonly string[]).includes(s) ? (s as Severity) : "unknown";
}

/** Groups by severity, most severe first, keeping input order inside each group; empty groups are left out. */
export function groupBySeverity<T extends { severity: string }>(xs: T[]): [Severity, T[]][] {
  return SEVERITIES.map((s) => [s, xs.filter((x) => severityOf(x.severity) === s)] as [Severity, T[]])
    .filter(([, group]) => group.length > 0);
}

/** A group heading: "Major", ..., and "Severity not classified by DDInter" for unknown (never the bare word). */
export const severityLabel = (s: Severity) =>
  s === "unknown" ? SEVERITY_NOT_CLASSIFIED : s.charAt(0).toUpperCase() + s.slice(1);

/** One record's severity as shown in a badge or table cell: the DDInter value, or the not-classified sentence. */
export const severityText = (raw: string) => (severityOf(raw) === "unknown" ? SEVERITY_NOT_CLASSIFIED : raw);
