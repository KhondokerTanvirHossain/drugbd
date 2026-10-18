import type { QaConfig } from "./config.js";

/*
 * One GET to the QA API (spec §7.9.8). The key goes only into the Authorization header, to the configured origin, with
 * redirects refused (so it can never follow a Location elsewhere) and a 30-second timeout covering the body. No error's
 * own text is ever returned: a failure is a fixed message with the HTTP status and the envelope's code, nothing else.
 */

export const TIMEOUT_MS = 30_000;

export type FetchOptions = { fetch?: typeof globalThis.fetch; timeoutMs?: number };
export type QaAnswer = { ok: true; body: unknown } | { ok: false; message: string };

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** The platform envelope of a success (§7.9.1): success true, a data member, a message, an errors list. */
function isSuccessEnvelope(body: unknown): boolean {
  return isObject(body) && body.success === true && Object.hasOwn(body, "data") && typeof body.message === "string"
    && Array.isArray(body.errors);
}

/** An error code as the QA API sends it (UPPER_SNAKE); anything else is not repeated. */
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/** The first error code of an error envelope, or null when the body is not one. */
function errorCode(body: unknown): string | null {
  if (!isObject(body) || body.success !== false || !Array.isArray(body.errors)) return null;
  const first: unknown = body.errors[0];
  return isObject(first) && typeof first.code === "string" && CODE.test(first.code) ? first.code : null;
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function qaGet(config: QaConfig, path: string, options: FetchOptions = {}): Promise<QaAnswer> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let status: number, text: string;
  try {
    const res = await fetchImpl(`${config.origin}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${config.key}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });
    status = res.status;
    text = await res.text();
  } catch {
    return { ok: false, message: "QA API unreachable" };
  }
  const body = parse(text);
  if (status >= 200 && status < 300) {
    return isSuccessEnvelope(body) ? { ok: true, body } : { ok: false, message: `QA API error ${status} invalid response` };
  }
  const code = errorCode(body);
  return { ok: false, message: code === null ? `QA API error ${status}` : `QA API error ${status} ${code}` };
}
