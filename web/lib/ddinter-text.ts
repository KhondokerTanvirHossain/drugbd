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

/** "Chloramphenicol (ophthalmic)" already names its route; the "checked against" statement adds the route once (§5.6.4, §6.7.3 item 7). */
export function entryBaseName(name: string | null, id: string, route: string): string {
  return (name ?? id).replace(new RegExp(` \\(${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)$`), "");
}
