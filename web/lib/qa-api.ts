import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { touchQaKey, verifyQaKey, type QaUpstream } from "./api";
import { recordAudit } from "./audit";
import { LIMITS, allowQaRateLimitedAudit, allowQaUnauthorizedAudit } from "./limits";
import { MalformedBody } from "./qa-map";
import { clientIp } from "./rate-limit";
import { withRequestLog } from "./request-log";
import { canUseQa, roleFor } from "./reviewers";

/*
 * The read-only QA API (spec §7.9, §7.10.4): keys, Bearer auth, the per-key limit, the platform envelope, the qa_read audit row
 * and the one handler every /api/qa/v1/* route uses. Order (§7.9.1 as amended by the QA portal): auth (401; env keys, then
 * DB keys) → rate limit (429) → input validation (400) → internal API read → map → audit → answer. There is no disabled
 * state: with no key at all every route is 401. Never 500. Cookies, sessions and any X-Internal-Token the caller sends are
 * never read: only a Bearer QA key authorises a QA call. Nothing here logs a key, a hash, a label, an email, an id or a
 * query value; the request line is withRequestLog's (route template only).
 */

// ---- keys (QA_API_KEYS = "label:sha256hex[,label:sha256hex…]")

export type QaKey = { label: string; digest: Buffer };
export type ParsedKeys = { ok: true; keys: QaKey[] } | { ok: false; invalidEntry: number | null };

const LABEL = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const HASH = /^[0-9a-f]{64}$/;

/**
 * Parses QA_API_KEYS. Unset or blank: no env keys (QA portal, D68: DB keys may still authenticate). A bad label or hash, an
 * empty entry, or a duplicate label or hash fails closed, naming the first bad entry (1-based): the env source then
 * authenticates nothing. Entries are trimmed; nothing inside an entry is.
 */
export function parseQaKeys(raw: string | undefined): ParsedKeys {
  if (raw === undefined || raw.trim() === "") return { ok: true, keys: [] };
  const keys: QaKey[] = [];
  const labels = new Set<string>(), hashes = new Set<string>();
  const entries = raw.split(",");
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i].trim();
    const at = entry.indexOf(":");
    const label = at < 0 ? "" : entry.slice(0, at), hash = at < 0 ? "" : entry.slice(at + 1);
    if (!LABEL.test(label) || !HASH.test(hash) || labels.has(label) || hashes.has(hash)) return { ok: false, invalidEntry: i + 1 };
    labels.add(label);
    hashes.add(hash);
    keys.push({ label, digest: Buffer.from(hash, "hex") });
  }
  return { ok: true, keys };
}

let cached: { raw: string | undefined; keys: QaKey[] } | null = null;
const reported = new Set<string>();

/**
 * The env keys: none when QA_API_KEYS is unset or blank, and none (fail closed: not even the valid entries) when it is
 * invalid. Read from the environment on every call and parsed once per value. An invalid value logs one line, once: the
 * entry index only. A malformed env never stops DB keys (§7.9.1 as amended, D68).
 */
export function qaKeys(): QaKey[] {
  const raw = process.env.QA_API_KEYS;
  if (cached !== null && cached.raw === raw) return cached.keys;
  const parsed = parseQaKeys(raw);
  if (!parsed.ok && parsed.invalidEntry !== null && raw !== undefined && !reported.has(raw)) {
    reported.add(raw);
    console.error(`QA_API_KEYS invalid: entry ${parsed.invalidEntry}`);
  }
  cached = { raw, keys: parsed.ok ? parsed.keys : [] };
  return cached.keys;
}

export const qaKeysForTests = { reset: () => { cached = null; reported.clear(); } };

// ---- auth

/** "Bearer <key>": the scheme in any case, one space, 32–256 characters of the token set (§7.9.1). */
const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{32,256})$/i;

/** The SHA-256 digest is compared with every env digest by timingSafeEqual, with no early exit. */
function envLabel(digest: Buffer, keys: readonly QaKey[]): string | null {
  let label: string | null = null;
  for (const k of keys) {
    const same = timingSafeEqual(digest, k.digest);
    if (same && label === null) label = k.label;
  }
  return label;
}

/**
 * The env label of the key the header carries, or null. The presented key's SHA-256 digest is compared with every configured
 * digest by timingSafeEqual, with no early exit, so the time taken never says which entry (if any) matched.
 */
export function authenticate(header: string | null, keys: readonly QaKey[]): string | null {
  const m = header === null ? null : BEARER.exec(header);
  if (!m) return null;
  return envLabel(createHash("sha256").update(m[1], "utf8").digest(), keys);
}

/** A self-service DB key (§7.10.2): "idqa_" + 43 base64url characters (32 random bytes). */
export const DB_KEY = /^idqa_[A-Za-z0-9_-]{43}$/;

export type QaAuth = { ok: true; label: string } | { ok: false; status: 401 | 502 };

/** The last-used touch (§7.10.4): at most once a minute per key, never awaited; a failure is ignored. */
function touch(keyId: number): void {
  if (!LIMITS.qaKeyTouch.allow(String(keyId))) return;
  void touchQaKey(keyId).catch(() => false);
}

/**
 * §7.10.4 (D68), for the QA API and the hosted MCP alike: the Bearer form (else 401); the env keys, every one compared in
 * constant time; then, only when no env key matched and the key has the DB form, POST /v1/qa-keys/verify with its SHA-256
 * hex. A verified key authenticates as `key.{id}` only while its owner's current REVIEWERS role passes canUseQa, read on
 * every request and never cached. An unknown, revoked or expired key, and an owner without QA access, are the same 401; a
 * verify call that fails is 502. The owner's email is used for the role check only: never logged, returned or stored.
 */
export async function authenticateQa(header: string | null): Promise<QaAuth> {
  const m = header === null ? null : BEARER.exec(header);
  if (!m) return { ok: false, status: 401 };
  const digest = createHash("sha256").update(m[1], "utf8").digest();
  const env = envLabel(digest, qaKeys());
  if (env !== null) return { ok: true, label: env };
  if (!DB_KEY.test(m[1])) return { ok: false, status: 401 };
  const v = await verifyQaKey(digest.toString("hex"));
  if (!v.ok) return { ok: false, status: v.status === 404 ? 401 : 502 };
  if (!canUseQa(roleFor(v.ownerEmail))) return { ok: false, status: 401 };
  touch(v.keyId);
  return { ok: true, label: `key.${v.keyId}` };
}

// ---- envelope and headers

export type QaRoute = "batches" | "batch" | "record" | "records" | "pairs";
/** A qa_read route name: a QA API route, or `mcp` for a hosted MCP request refused before any tool ran (§7.10.6). */
export type QaAuditRoute = QaRoute | "mcp";
export type QaCode = "INVALID_QUERY" | "UNAUTHORIZED" | "NOT_FOUND" | "RATE_LIMITED" | "UNAVAILABLE";
const ERRORS: Record<QaCode, { status: number; message: string }> = {
  INVALID_QUERY: { status: 400, message: "Invalid query" },
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  NOT_FOUND: { status: 404, message: "Not found" },
  RATE_LIMITED: { status: 429, message: "Too many requests" },
  UNAVAILABLE: { status: 502, message: "Unavailable" },
};
/** On every QA response, errors included (§7.9.1). No Access-Control-* header, ever. */
export const QA_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Content-Type": "application/json",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The middleware's x-request-id (§9.4): the envelope's requestId and the qa_read row's request_id. */
function requestIdOf(request: Request): string {
  const id = request.headers.get("x-request-id");
  return id && UUID.test(id) ? id : crypto.randomUUID();
}

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...QA_HEADERS, ...extra } });
}

const metadata = (requestId: string) => ({ timestamp: new Date().toISOString(), requestId });

function ok(requestId: string, data: unknown): Response {
  return json(200, { success: true, data, message: "OK", errors: [], metadata: metadata(requestId) });
}

function fail(requestId: string, code: QaCode, field: string | null = null, extra: Record<string, string> = {}): Response {
  const { status, message } = ERRORS[code];
  return json(status, { success: false, data: null, message, errors: [{ field, code, message }], metadata: metadata(requestId) }, extra);
}

// ---- input validation (§7.9.2)

export const BATCH_ID = /^[A-Za-z0-9._-]{1,100}$/;
export const BDS_ID = /^BDS-[0-9]{6}$/;
const PAGE = /^[0-9]{1,3}$/;
export const QA_FILTERS = ["strength_missing", "parse_partial", "route_assumed", "no_ddinter_data", "unaligned", "stage_warn", "stage_fail"] as const;
export const QA_STAGES = ["dgda", "substances", "clinical", "ddinter"] as const;

/** What a route's run step returns: the mapped data, or a 400, 404 or 502 with its field. */
export type QaOutcome = { ok: true; data: unknown } | { ok: false; code: "INVALID_QUERY" | "NOT_FOUND" | "UNAVAILABLE"; field: string | null };
export const invalid = (field: string): QaOutcome => ({ ok: false, code: "INVALID_QUERY", field });
const UNAVAILABLE: QaOutcome = { ok: false, code: "UNAVAILABLE", field: null };

/** A refused parameter's name is the field; capped, so an error stays small. */
const fieldName = (name: string) => [...name].slice(0, 100).join("");

/**
 * The query parameters, each at most once and each one the route takes; the first one that is not (in request order) is
 * the 400's field. "?x" (no "=") is x = "".
 */
export function queryOf(url: URL, allowed: readonly string[]): { ok: true; q: Map<string, string> } | { ok: false; field: string } {
  const q = new Map<string, string>();
  for (const [name, value] of url.searchParams) {
    if (!allowed.includes(name) || q.has(name)) return { ok: false, field: fieldName(name) };
    q.set(name, value);
  }
  return { ok: true, q };
}

/**
 * The path's id segments, decoded, by the route's own pattern over the raw pathname (so an encoded "/" stays inside its
 * segment). A segment that fails to decode is a 400 for its field; a path the pattern does not match is a 404.
 */
export function pathIds(url: URL, pattern: RegExp, fields: readonly string[]):
    { ok: true; ids: string[] } | { ok: false; outcome: QaOutcome } {
  const m = pattern.exec(url.pathname);
  if (!m) return { ok: false, outcome: { ok: false, code: "NOT_FOUND", field: null } };
  const ids: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    try {
      ids.push(decodeURIComponent(m[i + 1]));
    } catch {
      return { ok: false, outcome: invalid(fields[i]) };
    }
  }
  return { ok: true, ids };
}

/** `page`: absent is 0; else a decimal integer 0–999. Null when invalid. */
export function pageOf(value: string | undefined): number | null {
  if (value === undefined) return 0;
  return PAGE.test(value) ? Number(value) : null;
}

const API_FIELD = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * The internal API's answer as a QA outcome: data through the route's allowlist mapper (a malformed body is 502); an API 400
 * is a 400 with its field; an API 404 is a 404 when its field is one of the route's id fields (else the API is not the one
 * this web expects: 502); anything else (5xx, 401, a timeout, no token) is 502.
 */
export function fromUpstream(u: QaUpstream, idFields: readonly string[], map: (data: unknown) => unknown): QaOutcome {
  if (u.ok) {
    try {
      return { ok: true, data: map(u.data) };
    } catch (e) {
      if (e instanceof MalformedBody) return UNAVAILABLE;
      throw e;
    }
  }
  if (u.status === 400) return { ok: false, code: "INVALID_QUERY", field: u.field !== null && API_FIELD.test(u.field) ? u.field : null };
  if (u.status === 404 && u.field !== null && idFields.includes(u.field)) return { ok: false, code: "NOT_FOUND", field: u.field };
  return UNAVAILABLE;
}

// ---- audit (§7.9.6)

/** One qa_read row: no actor; target `{label}/{route}`, or `{route}` unauthenticated; never a key, hash, id or query value. */
export async function auditQa(route: QaAuditRoute, label: string | null, outcome: string, requestId: string): Promise<boolean> {
  try {
    return await recordAudit({ event: "qa_read", targetType: "qa_route", targetId: label === null ? route : `${label}/${route}`,
      outcome, requestId });
  } catch {
    return false;
  }
}

// ---- handlers

/**
 * A QA GET handler. `run` validates the inputs, reads the internal API and maps the body; it runs only for an authenticated,
 * unthrottled request. A 200 is sent only after its qa_read row is written; if that write fails the answer is 502 with no
 * data. Every other outcome's row is best effort, and 401 and 429 rows are throttled (§7.9.6).
 */
export function qaHandler(route: QaRoute, template: string, run: (url: URL) => Promise<QaOutcome>): (request: Request) => Promise<Response> {
  return withRequestLog(template, async (request: Request): Promise<Response> => {
    const rid = requestIdOf(request);
    try {
      const auth = await authenticateQa(request.headers.get("authorization"));
      if (!auth.ok && auth.status === 502) {
        // The key could not be checked (§7.10.4): best effort, unauthenticated, like any other non-200 row.
        await auditQa(route, null, "unavailable", rid);
        return fail(rid, "UNAVAILABLE");
      }
      if (!auth.ok) {
        if (allowQaUnauthorizedAudit(route, clientIp(request.headers), LIMITS)) await auditQa(route, null, "unauthorized", rid);
        return fail(rid, "UNAUTHORIZED", null, { "WWW-Authenticate": "Bearer" });
      }
      const label = auth.label;
      if (!LIMITS.qa.allow(label)) {
        if (allowQaRateLimitedAudit(label, LIMITS)) await auditQa(route, label, "rate_limited", rid);
        return fail(rid, "RATE_LIMITED", null, { "Retry-After": "60" });
      }
      let outcome: QaOutcome;
      try {
        outcome = await run(new URL(request.url));
      } catch {
        outcome = UNAVAILABLE;
      }
      if (outcome.ok) {
        if (!(await auditQa(route, label, "ok", rid))) return fail(rid, "UNAVAILABLE");
        return ok(rid, outcome.data);
      }
      await auditQa(route, label, outcome.code.toLowerCase(), rid);
      return fail(rid, outcome.code, outcome.field);
    } catch {
      return fail(rid, "UNAVAILABLE");
    }
  });
}

/** `/api/qa` and every unknown QA path (§7.9): the 404 envelope, with no auth check and no audit row. */
export function qaNotFound(template: string): (request: Request) => Promise<Response> {
  return withRequestLog(template, async (request: Request) => fail(requestIdOf(request), "NOT_FOUND"));
}
