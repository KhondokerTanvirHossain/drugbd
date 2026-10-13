/** §3.3 theme. Client-safe (no server-only): the ThemeSwitch island imports it. */
export const THEME_COOKIE = "intellidrugs-theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_MAX_AGE = 31_536_000;
/** Window event that keeps every ThemeSwitch on the page in step. */
export const THEME_EVENT = "intellidrugs-theme";

export function parseTheme(v: unknown): Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v) ? (v as Theme) : "system";
}

/** `<html data-theme>`: light or dark; no attribute for system (tokens.css follows prefers-color-scheme). */
export function htmlThemeAttr(t: Theme): "light" | "dark" | undefined {
  return t === "system" ? undefined : t;
}

export function themeCookieOptions(production = process.env.NODE_ENV === "production") {
  return { maxAge: THEME_MAX_AGE, sameSite: "lax" as const, path: "/", secure: production, httpOnly: false };
}

export function themeCookieString(t: Theme, secure: boolean): string {
  return `${THEME_COOKIE}=${t}; Max-Age=${THEME_MAX_AGE}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function applyTheme(el: HTMLElement, t: Theme): void {
  const attr = htmlThemeAttr(t);
  if (attr) el.setAttribute("data-theme", attr);
  else el.removeAttribute("data-theme");
}
