/**
 * Show mode on the public site (spec §6.10, §7.4.1, D74). Client-safe, pure. The API owns the switch; the web reads it with
 * getPublicMode() (lib/public-mode-read.ts, server-only) or from /v1/stats, never from its own environment.
 */
export type PublicMode = "approved_only" | "show_unreviewed";
/** A visible record's public review label (§7.4.1). */
export type PublicLabel = "approved" | "not_reviewed" | "problem";
/** The pair line a public pair card carries (PairRecordLine, §3.4): problem wins over unreviewed. */
export type PairRecord = "unreviewed" | "problem";

export const MODES: readonly PublicMode[] = ["approved_only", "show_unreviewed"];
export const LABELS: readonly PublicLabel[] = ["approved", "not_reviewed", "problem"];
export const isMode = (v: unknown): v is PublicMode => typeof v === "string" && (MODES as readonly string[]).includes(v);
export const isLabel = (v: unknown): v is PublicLabel => typeof v === "string" && (LABELS as readonly string[]).includes(v);

/** The pill a label shows (§3.4): approved → "approved"; not_reviewed and problem → "pending". */
export const pillOf = (label: PublicLabel | null | undefined): "approved" | "pending" => (label === "approved" ? "approved" : "pending");

/** True when the record is labelled and not approved; an unlabelled record (approved-only data) is never unreviewed. */
export const unapproved = (label: PublicLabel | null | undefined): boolean => isLabel(label) && label !== "approved";

/** problem over not_reviewed over approved (§7.4.1 PublicReview.worst); null for no labels. */
export function worst(labels: Iterable<PublicLabel | null | undefined>): PublicLabel | null {
  let out: PublicLabel | null = null;
  for (const l of labels) {
    if (!isLabel(l)) continue;
    if (l === "problem") return "problem";
    if (l === "not_reviewed" || out === null) out = l;
  }
  return out;
}

/** The pair line for a card whose sides carry these labels: PAIR_PROBLEM when any is problem, PAIR_UNREVIEWED when any is not approved. */
export function pairRecord(...labels: (PublicLabel | null | undefined)[]): PairRecord | null {
  const w = worst(labels);
  return w === "problem" ? "problem" : w === "not_reviewed" ? "unreviewed" : null;
}

/**
 * Whether a page renders at least one record that is not approved, so it opens with UnreviewedCaution (§6.10). One rule for
 * every page type: pass the labels of every record the page renders. Never true in approved-only mode.
 */
export function rendersUnreviewed(mode: PublicMode, labels: Iterable<PublicLabel | null | undefined>): boolean {
  if (mode !== "show_unreviewed") return false;
  for (const l of labels) if (unapproved(l)) return true;
  return false;
}
