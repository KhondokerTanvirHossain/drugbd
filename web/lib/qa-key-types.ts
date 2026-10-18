/*
 * Shapes and rules of the self-service QA keys (spec §5.18, §7.10.2, §7.10.5) shared by the QA tools page (server), the key
 * actions and the QaKeys island (client). This module imports nothing, so an island may import it.
 */

export type QaKeyStatus = "active" | "expired" | "revoked";
/** One of the viewer's own keys as the island receives it (§4.2): never an email, never a hash, never the key. */
export type QaKeyView = { id: number; name: string; createdAt: string; expiresAt: string; lastUsedAt: string | null; status: QaKeyStatus };

/** §7.10.2 (Decision): at most 5 active keys per owner; names of 1 to 40 code points. */
export const QA_ACTIVE_MAX = 5;
export const QA_KEY_NAME_MAX = 40;
/** A typed name longer than this is refused before it is trimmed (a name is at most 40 code points, so this is generous). */
const RAW_NAME_MAX = 400;
/** §7.10.2: C0, DEL and C1 (U+0000 to U+001F, U+007F to U+009F); the API's QaKeyRule and V9's check refuse the same. */
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

/** Code points, not UTF-16 units: Bengali and emoji count as the API counts them. */
export const nameLength = (s: string): number => [...s].length;

/**
 * §7.10.2 name rule (web and API alike): trimmed with JavaScript trim(), 1 to 40 code points, no control character.
 * The trimmed name, or null when the rule refuses it.
 */
export function validQaKeyName(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > RAW_NAME_MAX) return null;
  const name = raw.trim();
  const n = nameLength(name);
  if (n < 1 || n > QA_KEY_NAME_MAX || CONTROL.test(name)) return null;
  return name;
}

/** §7.10.5: a key id in a form field. */
export const QA_KEY_ID = /^[1-9][0-9]{0,17}$/;

export type CreateQaKeyCode = "created" | "invalid" | "active_limit" | "daily_limit" | "captcha" | "forbidden" | "unauthenticated" | "failed";
/**
 * §7.10.5: the key is in the result for `created` only, and nowhere else. `row` is null only when the API's answer could not
 * be read (the key exists, so it is still shown once; the page's refresh lists it).
 */
export type CreateQaKeyResult =
  | { code: "created"; key: string; row: QaKeyView | null }
  | { code: Exclude<CreateQaKeyCode, "created"> };

export type RevokeQaKeyCode = "revoked" | "already_revoked" | "not_found" | "invalid" | "rate_limited" | "captcha" | "forbidden"
  | "unauthenticated" | "failed";
export type RevokeQaKeyResult = { code: RevokeQaKeyCode; row?: QaKeyView };

const STATUSES: readonly string[] = ["active", "expired", "revoked"];
const isIso = (v: unknown): v is string => typeof v === "string" && v.length <= 64 && !Number.isNaN(Date.parse(v));

/** The allowlisted view of an API QaKey (§7.10.3), or null when it is malformed. Only these six fields ever reach the browser. */
export function toQaKeyView(x: unknown): QaKeyView | null {
  if (typeof x !== "object" || x === null) return null;
  const r = x as Record<string, unknown>;
  if (typeof r.id !== "number" || !Number.isSafeInteger(r.id) || r.id < 1) return null;
  if (typeof r.name !== "string" || !isIso(r.createdAt) || !isIso(r.expiresAt)) return null;
  if (r.lastUsedAt !== null && r.lastUsedAt !== undefined && !isIso(r.lastUsedAt)) return null;
  if (typeof r.status !== "string" || !STATUSES.includes(r.status)) return null;
  return { id: r.id, name: r.name, createdAt: r.createdAt, expiresAt: r.expiresAt, lastUsedAt: (r.lastUsedAt as string | null) ?? null,
    status: r.status as QaKeyStatus };
}
