// @vitest-environment jsdom
import { act, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnstileFieldProps } from "@/components/TurnstileField";
import { logSeniorOpen, pairDecide, router, turnstile } from "./senior-harness";

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/senior-actions", () => ({ pairDecide: (i: unknown) => pairDecide(i), logSeniorOpen: (...a: unknown[]) => logSeniorOpen(...a) }));
vi.mock("@/components/TurnstileField", () => ({ default: (p: TurnstileFieldProps) => { turnstile.props = p; return null; } }));

import { HASH, hint, key, mount } from "./senior-harness";

beforeEach(() => { pairDecide.mockReset(); logSeniorOpen.mockClear(); router.refresh.mockClear(); sessionStorage.clear(); });
afterEach(() => cleanup());
const live = () => document.querySelector('[data-senior="live"]')!.textContent;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const state = (id: string) => document.getElementById(id)!.querySelector(".pair-review")!.textContent;
const ROW1 = "pair-DDInter14-DDInter1951";
const OUT = (over = {}) => ({ ddinterA: "DDInter14", ddinterB: "DDInter1951",
  review: { state: "reviewed", at: "2026-10-15T03:00:00Z", mine: true, note: null }, version: { contentHash: HASH, lastPairReviewId: 9 },
  replayed: false, ...over });

describe("pair decisions on the senior pages (§5.17.2)", () => {
  it("logs senior_open once, with the page's target", async () => {
    await mount();
    expect(logSeniorOpen).toHaveBeenCalledWith("pair_queue", "todo");
    expect(logSeniorOpen).toHaveBeenCalledTimes(1);
  });

  it("Mark reviewed: the state line becomes PAIR_REVIEWED in place, it is announced, and the page is not refreshed", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: true, outcome: OUT() });
    await act(async () => { fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!); });
    expect(state(ROW1)).toBe("Pair reviewed by a senior pharmacist on 15/10/2026 (you)");
    expect(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!.getAttribute("aria-disabled")).toBe("true");
    expect(router.refresh).not.toHaveBeenCalled();
    await settle();
    expect(live()).toBe("Pair Acetaminophen + Warfarin marked reviewed.");
  });

  it("a reviewed pair: M says so and sends nothing", async () => {
    await mount();
    key("j"); key("j");
    key("m");
    expect(pairDecide).not.toHaveBeenCalled();
    expect(hint()).toBe("This pair is already reviewed.");
  });

  it("Report pair issue: under 5 characters the error; sent: the issue line with the note, the panel closed, the draft cleared", async () => {
    await mount();
    fireEvent.click(document.querySelector('[data-sk="report-DDInter14-DDInter1951"]')!);
    const field = document.getElementById("pair-note-DDInter14-DDInter1951") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "abcd" } });
    key("Enter", field, { ctrlKey: true });
    expect(document.querySelector(`#${ROW1} .field-error`)?.textContent).toBe("Add at least 5 characters so the team knows what to check.");
    expect(pairDecide).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "text contradicts the severity" } });
    pairDecide.mockResolvedValue({ ok: true, outcome: OUT({ review: { state: "issue", at: "2026-10-15T03:00:00Z", mine: true,
      note: "text contradicts the severity" } }) });
    await act(async () => { key("Enter", field, { metaKey: true }); });
    expect(pairDecide.mock.calls[0][0]).toMatchObject({ decision: "issue", note: "text contradicts the severity" });
    expect(state(ROW1)).toBe("Pair issue reported by a senior pharmacist on 15/10/2026 (you). Note: text contradicts the severity");
    expect(document.getElementById("pair-note-DDInter14-DDInter1951")).toBeNull();
    expect(sessionStorage.getItem("intellidrugs-pair-draft:DDInter14:DDInter1951")).toBeNull();
    await settle();
    expect(live()).toBe("Pair issue reported for Acetaminophen + Warfarin.");
  });

  it("the next decision on a row sends the version its last save returned", async () => {
    await mount();
    pairDecide.mockResolvedValueOnce({ ok: true, outcome: OUT() });
    await act(async () => { fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!); });
    fireEvent.click(document.querySelector('[data-sk="report-DDInter14-DDInter1951"]')!);
    const field = document.getElementById("pair-note-DDInter14-DDInter1951") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "second thoughts on this pair" } });
    act(() => turnstile.props!.onToken!("tok-2"));
    pairDecide.mockResolvedValueOnce({ ok: false, code: "already_reviewed" });
    await act(async () => { key("Enter", field, { ctrlKey: true }); });
    expect(pairDecide.mock.calls[1][0]).toMatchObject({ expectedContentHash: HASH, expectedLastPairReviewId: 9 });
  });

  it("409 contentHash: the row's warn banner with Reload; the row pauses; Reload refreshes and clears it; the draft stays", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: false, code: "content_changed" });
    await act(async () => { fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!); });
    const row = document.getElementById(ROW1)!;
    expect(within(row).getByText("This pair changed in DDInter after you opened the page.")).toBeTruthy();
    expect(within(row).getByText("Nothing was saved. Reload to review the latest text.")).toBeTruthy();
    fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!);
    expect(pairDecide).toHaveBeenCalledTimes(1);
    expect(hint()).toBe("This pair changed in DDInter after you opened the page.");
    fireEvent.click(within(row).getByRole("button", { name: "Reload" }));
    expect(router.refresh).toHaveBeenCalled();
    expect(within(row).queryByText("This pair changed in DDInter after you opened the page.")).toBeNull();
  });

  it("409 lastPairReviewId: the other-senior banner", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: false, code: "other_senior" });
    await act(async () => { fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!); });
    expect(within(document.getElementById(ROW1)!).getByText("Another senior pharmacist decided on this pair after you opened the page.")).toBeTruthy();
  });

  it("a lost answer: the unconfirmed banner; Try again resends the same requestId and version with a fresh token", async () => {
    await mount();
    pairDecide.mockRejectedValueOnce(new Error("network"));
    await act(async () => { fireEvent.click(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!); });
    const row = document.getElementById(ROW1)!;
    expect(within(row).getByText("Couldn't confirm your pair review.")).toBeTruthy();
    expect(within(row).getByText("Try again to find out; it will not be saved twice.")).toBeTruthy();
    act(() => turnstile.props!.onToken!("tok-2"));
    pairDecide.mockResolvedValueOnce({ ok: true, outcome: OUT({ replayed: true }) });
    await act(async () => { fireEvent.click(within(row).getByRole("button", { name: "Try again" })); });
    const [first, second] = pairDecide.mock.calls.map((c) => c[0]);
    expect(second).toMatchObject({ requestId: first.requestId, expectedContentHash: first.expectedContentHash,
      expectedLastPairReviewId: first.expectedLastPairReviewId, turnstileToken: "tok-2" });
    expect(state(ROW1)).toBe("Pair reviewed by a senior pharmacist on 15/10/2026 (you)");
  });
});

describe("focus never falls to <body> after an outcome (§5.17.5)", () => {
  const MARK = '[data-sk="mark-DDInter14-DDInter1951"]';
  const press = async (el: HTMLElement) => { el.focus(); await act(async () => { fireEvent.click(el); }); };
  const notBody = () => {
    expect(document.activeElement).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  };

  it("Try again: focus moves to the row's Mark reviewed, which stays mounted", async () => {
    await mount();
    pairDecide.mockRejectedValueOnce(new Error("network"));
    await press(document.querySelector<HTMLElement>(MARK)!);
    act(() => turnstile.props!.onToken!("tok-2"));
    pairDecide.mockResolvedValueOnce({ ok: true, outcome: OUT({ replayed: true }) });
    await press(within(document.getElementById(ROW1)!).getByRole("button", { name: "Try again" }));
    notBody();
    expect(document.activeElement).toBe(document.querySelector(MARK));
  });

  it("Try again on an issue whose panel is open: focus moves to the note field", async () => {
    await mount();
    fireEvent.click(document.querySelector('[data-sk="report-DDInter14-DDInter1951"]')!);
    const field = document.getElementById("pair-note-DDInter14-DDInter1951") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "text contradicts the severity" } });
    pairDecide.mockRejectedValueOnce(new Error("network"));
    await act(async () => { key("Enter", field, { ctrlKey: true }); });
    act(() => turnstile.props!.onToken!("tok-2"));
    pairDecide.mockReturnValueOnce(new Promise(() => {}));
    await press(within(document.getElementById(ROW1)!).getByRole("button", { name: "Try again" }));
    notBody();
    expect(document.activeElement).toBe(document.getElementById("pair-note-DDInter14-DDInter1951"));
  });

  it("Reload: focus moves to the row's Mark reviewed", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: false, code: "content_changed" });
    await press(document.querySelector<HTMLElement>(MARK)!);
    await press(within(document.getElementById(ROW1)!).getByRole("button", { name: "Reload" }));
    notBody();
    expect(document.activeElement).toBe(document.querySelector(MARK));
  });

  it("a passed Retry check: the held decision is sent and focus moves to the held row's Mark reviewed, not <body>", async () => {
    await mount();
    act(() => turnstile.props!.onError!());
    await press(document.querySelector<HTMLElement>(MARK)!);
    expect(pairDecide).not.toHaveBeenCalled();
    const retry = within(document.getElementById("senior")!).getByRole("button", { name: "Retry check" });
    await press(retry);
    expect(document.activeElement).toBe(retry);
    pairDecide.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => { turnstile.props!.onToken!("tok-3"); });
    expect(within(document.getElementById("senior")!).queryByRole("button", { name: "Retry check" })).toBeNull();
    expect(pairDecide).toHaveBeenCalledTimes(1);
    notBody();
    expect(document.activeElement).toBe(document.querySelector(MARK));
  });

  it("forbidden: the buttons go and focus moves to the senior region", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: false, code: "forbidden" });
    await press(document.querySelector<HTMLElement>(MARK)!);
    expect(document.querySelector(MARK)).toBeNull();
    notBody();
    expect(document.activeElement).toBe(document.getElementById("senior"));
  });

  it("signed out: the buttons go and focus moves to the sign-in link", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: false, code: "unauthenticated" });
    await press(document.querySelector<HTMLElement>(MARK)!);
    expect(document.querySelector(MARK)).toBeNull();
    notBody();
    expect(document.activeElement?.textContent).toBe("Sign in again");
  });
});
