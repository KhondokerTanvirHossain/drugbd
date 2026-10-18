import { vi } from "vitest";
import type { QaConfig } from "../src/config.js";

/** A key of the QA API's Bearer token set (§7.9.1); it must never appear in a result or a stderr line. */
export const KEY = "qa-key-checker-0123456789abcdefghijklmnop";
export const ORIGIN = "https://drugdb.eliooo.org";
export const CONFIG: QaConfig = { key: KEY, origin: ORIGIN };

export const PREAMBLE_TEXT = [
  "IntelliDrugs QA data. This is UNREVIEWED data for quality assurance only; a pharmacist may not have approved it.",
  "Every finding must cite the exact field path and the source link it was checked against.",
  "\"No interaction data\" never means a combination is safe.",
  "Report findings; never claim that something was fixed.",
  "Nothing here is clinical advice.",
].join("\n");

/** The QA API's success envelope (§7.9.1), as the web route handlers send it. */
export const envelope = (data: unknown) => ({ success: true, data, message: "OK", errors: [],
  metadata: { timestamp: "2026-10-18T09:30:00.000Z", requestId: "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f" } });

const MESSAGES: Record<string, string> = { INVALID_QUERY: "Invalid query", UNAUTHORIZED: "Unauthorized", NOT_FOUND: "Not found",
  RATE_LIMITED: "Too many requests", UNAVAILABLE: "Unavailable" };
/** The QA API's error envelope (§7.9.1). */
export const errorEnvelope = (code: string, field: string | null = null) => ({ success: false, data: null, message: MESSAGES[code],
  errors: [{ field, code, message: MESSAGES[code] }],
  metadata: { timestamp: "2026-10-18T09:30:00.000Z", requestId: "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f" } });

export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export type Call = { url: string; init: RequestInit };

/** A mocked fetch that records every call and answers with `answer` (default: the success envelope of `{}`). */
export function mockFetch(answer: (url: string, init: RequestInit) => Response | Promise<Response> = () => jsonResponse(envelope({}))) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return answer(url, init);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

/** Real-shaped bodies, as the web route handlers map them (web/lib/qa-map.ts, web/tests/qa-routes.test.ts). */
export const BATCHES = { batches: [{ batchId: "0001-pilot", status: "in_review", itemCount: 10, approvedCount: 4,
  runAt: "2026-10-11T21:27:17.629Z" }] };
export const BATCH = { batchId: "0001-pilot", status: "in_review", runAt: "2026-10-11T21:27:17.629Z", itemCount: 1,
  items: [{ conceptId: "186-0030-006--napa", tradeName: "Napa", displayStatus: "pending",
    stages: [{ stage: "dgda", status: "ok", note: "" }, { stage: "ddinter", status: "warn",
      note: "DDInter route assumed: DDInter1350 (systemic) used for oral" }] }] };
export const RECORDS = { filter: "stage_warn", stage: "ddinter", batch: null, page: 0, size: 100, total: 1,
  items: [{ batchId: "0001-pilot", conceptId: "186-0030-006--napa", tradeName: "Napa", displayStatus: "pending",
    stages: { dgda: "ok", substances: "ok", clinical: "ok", ddinter: "warn" } }] };
export const PAIRS = { bdsId: "BDS-000003", name: "Paracetamol", page: 0, size: 50, total: 1,
  pairs: [{ ddinterA: "DDInter1350", ddinterB: "DDInter1949", entry: { name: "Paracetamol", routeScope: "systemic" },
    partner: { bdsId: "BDS-000021", name: "Warfarin", entry: { name: "Warfarin", routeScope: "systemic" } },
    severity: "moderate", actions: ["monitor"], interaction: "Paracetamol may increase the anticoagulant effect of warfarin.",
    management: "Monitor INR.", link: { url: "https://ddinter2.scbdd.com/server/interact/IA-9/", label: "Full record in DDInter 2.0", fetchedAt: "2026-10-11T21:20:00Z" },
    applies: true, review: { state: "not_reviewed", at: null }, changes: [] }] };
