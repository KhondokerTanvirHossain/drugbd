// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairView, pairsPage, substanceDetail } from "./fixtures/senior";

/*
 * §5.15 senior_open: "A senior page is shown". The SeniorDesk island logs it on mount, so every senior pair page mounts
 * SeniorDesk, also when it shows no pair row (an empty filter, a substance with no pair, a substance with coverage none).
 * These pages are rendered in the browser here so that the island's mount effect runs.
 */
const getSession = vi.fn();
const getPairQueue = vi.fn();
const getSeniorSubstance = vi.fn();
const logSeniorOpen = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", () => ({ getPairQueue: (...a: unknown[]) => getPairQueue(...a), listSeniorSubstances: vi.fn(),
  getSeniorSubstance: (...a: unknown[]) => getSeniorSubstance(...a) }));
vi.mock("@/lib/senior-actions", () => ({ pairDecide: vi.fn(), logSeniorOpen: (...a: unknown[]) => logSeniorOpen(...a) }));
vi.mock("@/lib/nonce", () => ({ cspNonce: async () => "n0nce" }));
vi.mock("@/lib/turnstile", () => ({ turnstileSiteKey: () => "1x00000000000000000000AA" }));
vi.mock("@/components/TurnstileField", () => ({ default: () => <div data-test="turnstile" /> }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
vi.mock("@/lib/desk-settings-actions", () => ({ setDeskSettingAction: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));

import PairQueuePage from "@/app/review/pairs/page";
import SubstancePage from "@/app/review/substances/[bdsId]/page";

const SENIOR = { email: "senior@e2e.test", name: "S", role: "senior" as const };
const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const NO_COUNTS = { counts: { todo: 0, changed: 0, issue: 0, reviewed: 0, all: 0 } };

beforeEach(() => {
  for (const f of [getSession, getPairQueue, getSeniorSubstance, logSeniorOpen]) f.mockClear();
  getSession.mockResolvedValue(SENIOR);
  getPairQueue.mockResolvedValue(pairsPage([pairView()]));
  getSeniorSubstance.mockResolvedValue(substanceDetail());
});
afterEach(() => cleanup());

describe("senior_open on a senior page with no pair row (§5.15)", () => {
  it("an empty queue filter logs senior_open with its show value, with no row region, bot check or Turnstile widget", async () => {
    getPairQueue.mockResolvedValue(pairsPage([], NO_COUNTS));
    render(await PairQueuePage({ searchParams: sp({ show: "issue" }) }));
    expect(document.body.textContent).toContain("No pair issues reported.");
    expect(logSeniorOpen).toHaveBeenCalledTimes(1);
    expect(logSeniorOpen).toHaveBeenCalledWith("pair_queue", "issue");
    expect(document.getElementById("senior")).toBeNull();
    expect(document.querySelector('[data-test="turnstile"]')).toBeNull();
  });

  it("a page past the end logs senior_open too", async () => {
    getPairQueue.mockResolvedValue(pairsPage([], { total: 31, counts: { todo: 31, changed: 0, issue: 0, reviewed: 0, all: 31 } }));
    render(await PairQueuePage({ searchParams: sp({ page: "40" }) }));
    expect(logSeniorOpen).toHaveBeenCalledWith("pair_queue", "todo");
  });

  it("a substance with no pair logs senior_open with its BDS id", async () => {
    getSeniorSubstance.mockResolvedValue(substanceDetail({ pairs: { total: 0, items: [] } }));
    render(await SubstancePage({ params: Promise.resolve({ bdsId: "BDS-000003" }), searchParams: sp() }));
    expect(document.body.textContent).toContain("No stored DDInter pair links Warfarin with another substance we hold.");
    expect(logSeniorOpen).toHaveBeenCalledTimes(1);
    expect(logSeniorOpen).toHaveBeenCalledWith("substance", "BDS-000003");
    expect(document.getElementById("senior")).toBeNull();
  });

  it("a substance with coverage none logs senior_open with its BDS id", async () => {
    getSeniorSubstance.mockResolvedValue(substanceDetail({ coverage: "none", entries: [], pairs: { total: 0, items: [] } }));
    render(await SubstancePage({ params: Promise.resolve({ bdsId: "BDS-000003" }), searchParams: sp() }));
    expect(document.body.textContent).toContain("Pairs with Warfarin are not checked.");
    expect(logSeniorOpen).toHaveBeenCalledTimes(1);
    expect(logSeniorOpen).toHaveBeenCalledWith("substance", "BDS-000003");
    expect(document.querySelector('[data-test="turnstile"]')).toBeNull();
  });

  it("a substance with coverage not_run logs senior_open with its BDS id, and never claims no pair", async () => {
    getSeniorSubstance.mockResolvedValue(substanceDetail({ coverage: "not_run", entries: [], pairs: { total: 0, items: [] } }));
    render(await SubstancePage({ params: Promise.resolve({ bdsId: "BDS-000003" }), searchParams: sp() }));
    expect(document.body.textContent).not.toContain("No stored DDInter pair links");
    expect(logSeniorOpen).toHaveBeenCalledTimes(1);
    expect(logSeniorOpen).toHaveBeenCalledWith("substance", "BDS-000003");
    expect(document.querySelector('[data-test="turnstile"]')).toBeNull();
  });

  it("a page with rows still logs it once and keeps the region and the widget", async () => {
    render(await PairQueuePage({ searchParams: sp() }));
    expect(logSeniorOpen).toHaveBeenCalledTimes(1);
    expect(logSeniorOpen).toHaveBeenCalledWith("pair_queue", "todo");
    expect(document.getElementById("senior")).not.toBeNull();
    expect(document.querySelector('[data-test="turnstile"]')).not.toBeNull();
  });

  it("a pharmacist's banner page logs nothing", async () => {
    getSession.mockResolvedValue({ ...SENIOR, role: "pharmacist" });
    render(await PairQueuePage({ searchParams: sp() }));
    render(await SubstancePage({ params: Promise.resolve({ bdsId: "BDS-000003" }), searchParams: sp() }));
    expect(logSeniorOpen).not.toHaveBeenCalled();
  });
});
