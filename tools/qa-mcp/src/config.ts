/*
 * The server's environment (spec §7.9.8 Env). INTELLIDRUGS_QA_KEY is required; INTELLIDRUGS_QA_BASE_URL defaults to the
 * production origin and must be https:, or http: on localhost or 127.0.0.1 for local testing, with no credentials, path,
 * query or fragment. A refusal message never quotes either value.
 */

export const DEFAULT_BASE_URL = "https://drugdb.eliooo.org";

/** `key` is sent only as `Authorization: Bearer …` to `origin` (scheme://host[:port], no trailing slash). */
export type QaConfig = { key: string; origin: string };
export type ParsedConfig = { ok: true; config: QaConfig } | { ok: false; message: string };

/** The QA API's Bearer token set and length (§7.9.1): a key outside it can never authenticate, so it is refused at start. */
const KEY = /^[A-Za-z0-9._~+/=-]{32,256}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
/** Whitespace, a C0 control or DEL anywhere: the URL parser would silently strip or re-encode it. */
const UNSAFE = /[\s\u0000-\u001F\u007F]/;

const BASE_URL_INVALID = "INTELLIDRUGS_QA_BASE_URL is invalid: use an https: origin (or http://localhost or http://127.0.0.1 "
  + "for local testing) with no credentials, path, query or fragment";

/** The origin of a valid base URL, or null. */
export function originOf(raw: string): string | null {
  if (UNSAFE.test(raw) || raw.includes("?") || raw.includes("#")) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const secure = url.protocol === "https:";
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  if (!secure && !local) return null;
  if (url.username !== "" || url.password !== "" || raw.includes("@")) return null;
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") return null;
  return url.origin;
}

export function parseConfig(env: Readonly<Record<string, string | undefined>>): ParsedConfig {
  const key = env.INTELLIDRUGS_QA_KEY;
  if (key === undefined || key === "") return { ok: false, message: "INTELLIDRUGS_QA_KEY is not set" };
  if (!KEY.test(key)) {
    return { ok: false, message: "INTELLIDRUGS_QA_KEY is not a valid QA key: 32 to 256 characters of A-Z a-z 0-9 . _ ~ + / = -" };
  }
  const base = env.INTELLIDRUGS_QA_BASE_URL;
  const origin = originOf(base === undefined || base === "" ? DEFAULT_BASE_URL : base);
  if (origin === null) return { ok: false, message: BASE_URL_INVALID };
  return { ok: true, config: { key, origin } };
}
