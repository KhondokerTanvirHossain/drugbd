export function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

/** Every value of a repeated query parameter, trimmed, without blanks or repeats, in first-seen order. */
export function listParam(v: string | string[] | undefined): string[] {
  const all = Array.isArray(v) ? v : v === undefined ? [] : [v];
  return [...new Set(all.map((s) => s.trim()).filter((s) => s.length > 0))];
}
