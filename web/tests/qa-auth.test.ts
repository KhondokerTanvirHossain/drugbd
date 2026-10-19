import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * §7.10.4 (D68): the QA API authenticates an env key (QA_API_KEYS) or a self-service DB key alike. A DB key is verified on
 * every request through POST /v1/qa-keys/verify, and its owner's current REVIEWERS role must allow QA tools. No keys at all
 * is 401, never the old disabled 404.
 */

const clock = vi.hoisted(() => ({ now: 2_000_000_000 }));
vi.mock("@/lib/limits", async (importOriginal) => {
  const m = await importOriginal<typeof import("@/lib/limits")>();
  return { ...m, LIMITS: m.createLimits(() => clock.now) };
});
// Counts every constant-time comparison: env keys are compared, all of them, before any DB call.
const compares = vi.hoisted(() => ({ n: 0, order: [] as string[] }));
vi.mock("node:crypto", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:crypto")>();
  return { ...real, timingSafeEqual: (a: NodeJS.ArrayBufferView, b: NodeJS.ArrayBufferView) => {
    compares.n++;
    compares.order.push("compare");
    return real.timingSafeEqual(a, b);
  } };
});

import { GET as batchesGET } from "@/app/api/qa/v1/batches/route";
import { GET as batchGET } from "@/app/api/qa/v1/batches/[batchId]/route";
import { GET as recordGET } from "@/app/api/qa/v1/batches/[batchId]/records/[conceptId]/route";
import { GET as recordsGET } from "@/app/api/qa/v1/records/route";
import { GET as pairsGET } from "@/app/api/qa/v1/substances/[bdsId]/pairs/route";
import { GET as restGET } from "@/app/api/qa/[[...rest]]/route";
import { authenticateQa, qaKeysForTests } from "@/lib/qa-api";
import { apiRecord, apiSubstance } from "./fixtures/qa";

const TOKEN = "test-internal-token-0123456789abcdef";
const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const ENV_KEY = "qa-key-checker-0123456789abcdefghijklmnop";
const DB_KEY = `idqa_${randomBytes(32).toString("base64url")}`, DB_KEY2 = `idqa_${randomBytes(32).toString("base64url")}`;
const OWNER = "qa.owner@example.org";

type Handler = (r: Request) => Promise<Response>;
const ROUTES: [string, Handler, string][] = [
  ["batches", batchesGET, "/api/qa/v1/batches"],
  ["batch", batchGET, "/api/qa/v1/batches/0001-pilot"],
  ["record", recordGET, "/api/qa/v1/batches/0001-pilot/records/186-0030-006--napa"],
  ["records", recordsGET, "/api/qa/v1/records?filter=stage_warn"],
  ["pairs", pairsGET, "/api/qa/v1/substances/BDS-000003/pairs"],
];

const envelope = (data: unknown) => ({ success: true, data, message: "OK", errors: [],
  metadata: { timestamp: "2026-10-18T00:00:00Z", requestId: "00000000-0000-4000-8000-000000000000" } });
const BATCHES = [{ batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 10,
  counts: { approved: 4, issue: 1, needsReview: 5, engineerChecked: 0, backInReview: 0, noData: 1, warnings: 8 } }];
const BATCH = { batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 1,
  items: [{ conceptId: "186-0030-006--napa", tradeName: "Napa", displayStatus: "pending", stages: [{ stage: "dgda", status: "ok", note: "" }] }] };
const RECORDS = { filter: "stage_warn", stage: null, batch: null, page: 0, size: 100, total: 0, items: [] };

/** The DB keys the mocked API knows: hash → { keyId, ownerEmail }. */
let dbKeys: Map<string, { keyId: number; ownerEmail: string }>;
let verifyAnswer: ((hash: string) => Response | Promise<Response>) | null;
let touchAnswer: () => Promise<Response>;
let audits: Record<string, unknown>[];
let verifies: string[];
let touches: string[];
let reads: string[];
let fetchMock: ReturnType<typeof vi.fn>;
let order: string[];

function upstream(path: string): Response {
  if (path === "/v1/review/batches") return new Response(JSON.stringify(envelope(BATCHES)));
  if (path.startsWith("/v1/qa/batches/")) return new Response(JSON.stringify(envelope(BATCH)));
  if (path.startsWith("/v1/review/batches/")) return new Response(JSON.stringify(envelope(apiRecord())));
  if (path.startsWith("/v1/qa/records")) return new Response(JSON.stringify(envelope(RECORDS)));
  if (path.startsWith("/v1/review/substances/")) return new Response(JSON.stringify(envelope(apiSubstance())));
  return new Response("{}", { status: 404 });
}

beforeEach(() => {
  clock.now += 3_600_000;
  compares.n = 0;
  compares.order = order = [];
  qaKeysForTests.reset();
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  vi.stubEnv("QA_API_KEYS", `checker:${sha(ENV_KEY)}`);
  vi.stubEnv("REVIEWERS", `${OWNER}:qa,eng@example.org:engineer,senior@example.org:senior,pharm@example.org:pharmacist`);
  dbKeys = new Map([[sha(DB_KEY), { keyId: 7, ownerEmail: OWNER }]]);
  verifyAnswer = null;
  touchAnswer = async () => new Response(null, { status: 204 });
  audits = [];
  verifies = [];
  touches = [];
  reads = [];
  fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api:8080", "");
    if (path === "/v1/audit-events" && init.method === "POST") {
      audits.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ success: true, data: { id: audits.length } }), { status: 201 });
    }
    if (path === "/v1/qa-keys/verify" && init.method === "POST") {
      const { keyHash } = JSON.parse(String(init.body));
      verifies.push(keyHash);
      order.push("verify");
      if (verifyAnswer) return verifyAnswer(keyHash);
      const k = dbKeys.get(keyHash);
      return k ? new Response(JSON.stringify(envelope(k)))
        : new Response(JSON.stringify({ success: false, data: null, message: "x", errors: [{ field: "keyHash", code: "NOT_FOUND", message: "x" }] }), { status: 404 });
    }
    const touch = /^\/v1\/qa-keys\/([0-9]+)\/used$/.exec(path);
    if (touch && init.method === "POST") {
      touches.push(touch[1]);
      return touchAnswer();
    }
    reads.push(path);
    return upstream(path);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const call = (handler: Handler, path: string, key: string | null, ip = "203.0.113.9") => handler(new Request(`http://localhost${path}`,
  { headers: { ...(key === null ? {} : { authorization: `Bearer ${key}` }), "x-request-id": RID, "x-forwarded-for": ip } }));
const flush = () => new Promise((r) => setTimeout(r, 0));

async function expectStatus(res: Response, status: number, code: string | null) {
  expect(res.status).toBe(status);
  expect(res.headers.get("cache-control")).toBe("private, no-store");
  const body = await res.json();
  if (code === null) expect(body.success).toBe(true);
  else expect(body.errors).toEqual([{ field: null, code, message: expect.any(String) }]);
  if (status === 401) expect(res.headers.get("www-authenticate")).toBe("Bearer");
  return body;
}

describe("enabled whenever a key source can authenticate (§7.9.1 as amended, D68)", () => {
  it.each([["unset", undefined], ["empty", ""], ["blank", "  "]])(
    "%s QA_API_KEYS and no DB key: every QA route is 401, never 404, with its throttled unauthorized row", async (_n, value) => {
      vi.stubEnv("QA_API_KEYS", value as string);
      dbKeys.clear();
      for (const [route, handler, path] of ROUTES) {
        await expectStatus(await call(handler, path, null), 401, "UNAUTHORIZED");
        await expectStatus(await call(handler, path, "z".repeat(40)), 401, "UNAUTHORIZED");
        await expectStatus(await call(handler, path, DB_KEY), 401, "UNAUTHORIZED");
        // one row per (route, IP) per minute
        expect(audits.filter((a) => a.targetId === route)).toEqual([expect.objectContaining({ event: "qa_read", outcome: "unauthorized",
          targetType: "qa_route", targetId: route, actorEmail: null, actorRole: null })]);
      }
      expect(reads).toEqual([]);
    });

  it("with no env keys a valid DB key still reads, as key.{id}", async () => {
    vi.stubEnv("QA_API_KEYS", "");
    const body = await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY), 200, null);
    expect(body.data.batches).toHaveLength(1);
    expect(audits).toEqual([expect.objectContaining({ event: "qa_read", targetId: "key.7/batches", outcome: "ok", requestId: RID })]);
  });

  it("/api/qa and unknown QA paths stay 404 with no auth check and no row", async () => {
    vi.stubEnv("QA_API_KEYS", "");
    for (const path of ["/api/qa", "/api/qa/v1", "/api/qa/v2/batches"]) {
      const res = await call(restGET, path, DB_KEY);
      expect(res.status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a malformed QA_API_KEYS logs its one line and makes every env key 401, while a DB key still answers 200", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("QA_API_KEYS", `checker:${sha(ENV_KEY)},Bad:${sha("x".repeat(40))}`);
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", ENV_KEY), 401, "UNAUTHORIZED");
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY), 200, null);
    await expectStatus(await call(batchGET, "/api/qa/v1/batches/0001-pilot", ENV_KEY), 401, "UNAUTHORIZED");
    expect(error.mock.calls).toEqual([["QA_API_KEYS invalid: entry 2"]]);
  });
});

describe("the verification rule (§7.10.4)", () => {
  it("env keys are compared, every one, before any DB call; an env key never calls verify", async () => {
    vi.stubEnv("QA_API_KEYS", `checker:${sha(ENV_KEY)},nightly:${sha("n".repeat(40))}`);
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", ENV_KEY), 200, null);
    expect(verifies).toEqual([]);
    expect(compares.n).toBe(2);
    compares.n = 0;
    order.length = 0;
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY), 200, null);
    expect(order).toEqual(["compare", "compare", "verify"]);
    expect(verifies).toEqual([sha(DB_KEY)]);
  });

  it("an env-matched key of the idqa_ form is still an env key: no verify call", async () => {
    vi.stubEnv("QA_API_KEYS", `legacy:${sha(DB_KEY2)}`);
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY2), 200, null);
    expect(verifies).toEqual([]);
    expect(audits[0]).toMatchObject({ targetId: "legacy/batches" });
  });

  it.each([
    ["an unknown key of another form", "z".repeat(40)],
    ["idqa_ with 42 characters", `idqa_${"a".repeat(42)}`],
    ["idqa_ with 44 characters", `idqa_${"a".repeat(44)}`],
    ["idqa_ with a character outside base64url", `idqa_${"a".repeat(42)}+`],
    ["IDQA_ in upper case", `IDQA_${"a".repeat(43)}`],
  ])("%s matches no env key and makes no verify call: 401", async (_n, key) => {
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", key), 401, "UNAUTHORIZED");
    expect(verifies).toEqual([]);
  });

  it("verify sends only the SHA-256 hex of the full key, prefix included, with the internal token", async () => {
    await call(batchesGET, "/api/qa/v1/batches", DB_KEY);
    const verify = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/v1/qa-keys/verify"))!;
    expect(JSON.parse(String(verify[1].body))).toEqual({ keyHash: sha(DB_KEY) });
    expect((verify[1].headers as Record<string, string>)["X-Internal-Token"]).toBe(TOKEN);
  });

  it("a verify 404 is the same undifferentiated 401", async () => {
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY2), 401, "UNAUTHORIZED");
    expect(reads).toEqual([]);
  });

  it.each([["pharmacist", "pharm@example.org"], ["user (not on REVIEWERS)", "nobody@example.org"]])(
    "an owner whose current role is %s is 401", async (_n, email) => {
      dbKeys.set(sha(DB_KEY2), { keyId: 8, ownerEmail: email });
      await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY2), 401, "UNAUTHORIZED");
      expect(reads).toEqual([]);
      expect(touches).toEqual([]);
    });

  it("an engineer's and a senior's key work; the owner's email is matched case-insensitively", async () => {
    dbKeys.set(sha(DB_KEY2), { keyId: 9, ownerEmail: "ENG@example.org" });
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY2), 200, null);
    dbKeys.set(sha(DB_KEY2), { keyId: 9, ownerEmail: "senior@example.org" });
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY2), 200, null);
  });

  it("an owner removed from REVIEWERS between two requests is 401 on the next one (never cached)", async () => {
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY), 200, null);
    vi.stubEnv("REVIEWERS", "eng@example.org:engineer");
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY), 401, "UNAUTHORIZED");
    vi.stubEnv("REVIEWERS", `${OWNER}:pharmacist`);
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY), 401, "UNAUTHORIZED");
    vi.stubEnv("REVIEWERS", `${OWNER}:qa`);
    await expectStatus(await call(batchesGET, "/api/qa/v1/batches", DB_KEY), 200, null);
    expect(verifies).toHaveLength(4);
  });

  it.each([
    ["a network failure", () => { throw new TypeError("fetch failed"); }],
    ["a 5xx", () => new Response("{}", { status: 503 })],
    ["a 401 from the API (token mismatch)", () => new Response("{}", { status: 401 })],
    ["a malformed body", () => new Response(JSON.stringify(envelope({ keyId: "7", ownerEmail: OWNER })))],
    ["a body with no email", () => new Response(JSON.stringify(envelope({ keyId: 7 })))],
    ["a non-JSON body", () => new Response("<html>")],
  ])("a failed verify call (%s) is 502 with an unauthenticated unavailable row", async (_n, answer) => {
    verifyAnswer = answer as () => Response;
    for (const [route, handler, path] of ROUTES) {
      const res = await call(handler, path, DB_KEY);
      expect(res.status).toBe(502);
      expect((await res.json()).errors[0].code).toBe("UNAVAILABLE");
      expect(audits.at(-1)).toEqual(expect.objectContaining({ event: "qa_read", targetType: "qa_route", targetId: route,
        outcome: "unavailable", actorEmail: null, actorRole: null }));
    }
    expect(reads).toEqual([]);
  });

  it("a verify without the internal token configured is 502, not 401", async () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "");
    const res = await call(batchesGET, "/api/qa/v1/batches", DB_KEY);
    expect(res.status).toBe(502);
  });
});

describe("a DB key is the label key.{id} for the limit and the audit (§7.9.1, §7.10.4)", () => {
  it("each route's qa_read row carries key.{id}/{route}", async () => {
    for (const [route, handler, path] of ROUTES) {
      expect((await call(handler, path, DB_KEY)).status).toBe(200);
      expect(audits.at(-1)).toEqual(expect.objectContaining({ targetId: `key.7/${route}`, outcome: "ok", actorEmail: null, actorRole: null }));
    }
  });

  it("its 61st request in a minute is 429 with one rate_limited row, and an env key is unaffected", async () => {
    for (let i = 0; i < 60; i++) expect((await call(batchesGET, "/api/qa/v1/batches", DB_KEY)).status).toBe(200);
    const res = await call(batchesGET, "/api/qa/v1/batches", DB_KEY);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    await call(batchesGET, "/api/qa/v1/batches", DB_KEY);
    expect(audits.filter((a) => a.outcome === "rate_limited")).toEqual([expect.objectContaining({ targetId: "key.7/batches" })]);
    expect((await call(batchesGET, "/api/qa/v1/batches", ENV_KEY)).status).toBe(200);
  });

  it("authenticateQa answers the label, or 401, or 502", async () => {
    expect(await authenticateQa(`Bearer ${DB_KEY}`)).toEqual({ ok: true, label: "key.7" });
    expect(await authenticateQa(`Bearer ${ENV_KEY}`)).toEqual({ ok: true, label: "checker" });
    expect(await authenticateQa(null)).toEqual({ ok: false, status: 401 });
    expect(await authenticateQa(`Bearer ${DB_KEY2}`)).toEqual({ ok: false, status: 401 });
    verifyAnswer = () => new Response("{}", { status: 500 });
    expect(await authenticateQa(`Bearer ${DB_KEY}`)).toEqual({ ok: false, status: 502 });
  });
});

describe("last used (§7.10.4)", () => {
  it("is touched at most once a minute per key, after authentication, whatever the outcome", async () => {
    await call(batchesGET, "/api/qa/v1/batches", DB_KEY);
    await call(batchGET, "/api/qa/v1/batches/bad id", DB_KEY);   // a 400 still authenticated
    await call(batchesGET, "/api/qa/v1/batches", DB_KEY);
    await flush();
    expect(touches).toEqual(["7"]);
    clock.now += 61_000;
    await call(batchesGET, "/api/qa/v1/batches", DB_KEY);
    await flush();
    expect(touches).toEqual(["7", "7"]);
  });

  it("is never sent for an env key or a refused DB key", async () => {
    await call(batchesGET, "/api/qa/v1/batches", ENV_KEY);
    await call(batchesGET, "/api/qa/v1/batches", DB_KEY2);
    vi.stubEnv("REVIEWERS", "");
    await call(batchesGET, "/api/qa/v1/batches", DB_KEY);
    await flush();
    expect(touches).toEqual([]);
  });

  it("is never awaited: a hanging or failing touch does not hold or change the answer", async () => {
    touchAnswer = () => new Promise<Response>(() => {});
    const res = await call(batchesGET, "/api/qa/v1/batches", DB_KEY);
    expect(res.status).toBe(200);
    clock.now += 61_000;
    touchAnswer = async () => { throw new TypeError("fetch failed"); };
    expect((await call(batchesGET, "/api/qa/v1/batches", DB_KEY)).status).toBe(200);
    await flush();
    expect(touches).toEqual(["7", "7"]);
  });
});

describe("privacy (§7.10.8)", () => {
  it("no log line, audit row or answer carries a key, its hash or the owner's email", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bodies: string[] = [];
    for (const [, handler, path] of ROUTES) {
      bodies.push(await (await call(handler, path, DB_KEY)).text());
      bodies.push(await (await call(handler, path, DB_KEY2)).text());
    }
    vi.stubEnv("REVIEWERS", "");
    bodies.push(await (await call(batchesGET, "/api/qa/v1/batches", DB_KEY)).text());
    verifyAnswer = () => new Response("{}", { status: 500 });
    bodies.push(await (await call(batchesGET, "/api/qa/v1/batches", DB_KEY)).text());
    const sinks = JSON.stringify([bodies, audits, error.mock.calls, log.mock.calls, warn.mock.calls]);
    for (const secret of [DB_KEY, DB_KEY2, sha(DB_KEY), sha(DB_KEY2), OWNER, ENV_KEY]) expect(sinks).not.toContain(secret);
  });
});
