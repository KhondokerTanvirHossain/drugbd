/**
 * DDInter free text (interaction, management, disease text, food description/management). DDInter prints "None"
 * (or "-", or nothing) where it has no text; printed bare next to an alert, "None" can read as "no interaction".
 * The ETL and the API already turn these into null; this is the page's own defence. Same list as both of them.
 */
const PLACEHOLDERS = new Set(["none", "null", "n/a", "na", "-", "--", ""]);

/** The text, trimmed; null when it is missing, blank or a placeholder. Use as `ddinterText(x) || FALLBACK`. */
export function ddinterText(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return PLACEHOLDERS.has(text.toLowerCase()) ? null : text;
}
