import type { FilterKey } from "@/lib/review-types";

const enc = encodeURIComponent;

/** /review/{b}/{c}?show=&q=&pane= with defaults left out, so every row and Previous/Next link carries the filter. */
export function recordHref(batchId: string, conceptId: string, opts: { show?: FilterKey; q?: string; pane?: "list" } = {}): string {
  const params = new URLSearchParams();
  if (opts.show && opts.show !== "all") params.set("show", opts.show);
  if (opts.q && opts.q.trim()) params.set("q", opts.q.trim());
  if (opts.pane) params.set("pane", opts.pane);
  const query = params.toString();
  return `/review/${enc(batchId)}/${enc(conceptId)}${query ? `?${query}` : ""}`;
}
export const batchHref = (batchId: string) => `/review/${enc(batchId)}`;
export const versionsHref = (batchId: string) => `/review/${enc(batchId)}/versions`;
export const signInHref = (returnTo: string) => `/signin?${new URLSearchParams({ returnTo })}`;

/** True for a record page of this batch: in-desk navigation that keeps the undo window (§5.8.1). */
export function isDeskPath(pathname: string, batchId: string): boolean {
  const prefix = `${batchHref(batchId)}/`;
  return pathname.startsWith(prefix) && pathname.length > prefix.length && pathname !== versionsHref(batchId);
}
