/** Desk settings (§5.8.1, §5.14), stored in cookies so the server can render the promise. Client-safe. */
export const UNDO_COOKIE = "intellidrugs-undo";
export const KEYS_COOKIE = "intellidrugs-keys";
export const UNDO_SECONDS = [8, 20, 60] as const;
export type UndoSeconds = (typeof UNDO_SECONDS)[number];
export type KeysSetting = "on" | "off";
export const DESK_SETTINGS_EVENT = "intellidrugs-desk-settings";
const MAX_AGE = 31_536_000;

/** "8", "20" or "60"; any other value reads as 8 (the default window, COMMIT_MS = 8000). */
export function parseUndo(v: unknown): UndoSeconds {
  return v === "20" ? 20 : v === "60" ? 60 : 8;
}

/** "on" or "off"; any other value reads as on. */
export function parseKeys(v: unknown): KeysSetting {
  return v === "off" ? "off" : "on";
}

export function deskCookieOptions(production = process.env.NODE_ENV === "production") {
  return { maxAge: MAX_AGE, sameSite: "lax" as const, path: "/", secure: production, httpOnly: false };
}

export function deskCookieString(name: string, value: string, secure: boolean): string {
  return `${name}=${value}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}
