// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnstileFieldProps } from "@/components/TurnstileField";
import { logSeniorOpen, pairDecide, router, turnstile } from "./senior-harness";

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/senior-actions", () => ({ pairDecide: (i: unknown) => pairDecide(i), logSeniorOpen: (...a: unknown[]) => logSeniorOpen(...a) }));
vi.mock("@/components/TurnstileField", () => ({ default: (p: TurnstileFieldProps) => { turnstile.props = p; return null; } }));

import { HASH, hint, key, mount, region } from "./senior-harness";

beforeEach(() => { pairDecide.mockReset(); logSeniorOpen.mockClear(); router.refresh.mockClear(); sessionStorage.clear(); });
afterEach(() => cleanup());

describe("senior keyboard model (§5.17.5, §11.1 senior-keys)", () => {
  it("J and K move between rows: the heading takes focus and the row is aria-current; the ends say so", async () => {
    await mount();
    key("j");
    expect(document.activeElement?.id).toBe("pair-DDInter14-DDInter1951-h");
    expect(document.getElementById("pair-DDInter14-DDInter1951")!.getAttribute("aria-current")).toBe("true");
    key("J");
    expect(document.activeElement?.id).toBe("pair-DDInter1951-DDInter20-h");
    expect(document.getElementById("pair-DDInter14-DDInter1951")!.hasAttribute("aria-current")).toBe(false);
    key("j");
    expect(hint()).toBe("This is the last pair on this page.");
    key("k");
    key("k");
    expect(hint()).toBe("This is the first pair on this page.");
  });

  it("M marks the current row, with its version, a requestId and the token", async () => {
    await mount();
    pairDecide.mockResolvedValue({ ok: false, code: "already_reviewed" });
    key("j");
    await act(async () => { key("m"); });
    expect(pairDecide).toHaveBeenCalledTimes(1);
    expect(pairDecide.mock.calls[0][0]).toMatchObject({ ddinterA: "DDInter14", ddinterB: "DDInter1951", decision: "reviewed", note: "",
      expectedContentHash: HASH, expectedLastPairReviewId: null, turnstileToken: "tok-1" });
    expect(pairDecide.mock.calls[0][0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("Enter on Mark reviewed is blocked with its hint", async () => {
    await mount();
    const mark = document.querySelector<HTMLButtonElement>('[data-sk="mark-DDInter14-DDInter1951"]')!;
    for (const mods of [{}, { ctrlKey: true }]) key("Enter", mark, mods);
    expect(pairDecide).not.toHaveBeenCalled();
    expect(hint()).toBe("Enter does not mark a pair reviewed. Press M, or Space on this button.");
  });

  it("R opens the current row's panel and focuses its field; Esc closes it and keeps the draft", async () => {
    await mount();
    key("j");
    key("r");
    const field = document.getElementById("pair-note-DDInter14-DDInter1951") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(field);
    expect(document.querySelector('[data-sk="report-DDInter14-DDInter1951"]')!.getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(field, { target: { value: "text contradicts the severity" } });
    key("Escape", field);
    expect(document.getElementById("pair-note-DDInter14-DDInter1951")).toBeNull();
    expect(document.activeElement?.getAttribute("data-sk")).toBe("report-DDInter14-DDInter1951");
    expect(sessionStorage.getItem("intellidrugs-pair-draft:DDInter14:DDInter1951")).toBe("text contradicts the severity");
    key("r");
    expect((document.getElementById("pair-note-DDInter14-DDInter1951") as HTMLTextAreaElement).value).toBe("text contradicts the severity");
  });

  it("? opens the sheet with the senior rows; Esc closes it", async () => {
    await mount();
    key("?");
    const sheet = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect([...sheet.querySelectorAll("dd")].map((d) => d.textContent)).toEqual(["Next and previous pair", "Mark the pair reviewed",
      "Report a pair issue", "This sheet", "Close the sheet or the note", "Send the report, inside the note field", "Never marks a pair reviewed"]);
    key("Escape", within(sheet).getByRole("button"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("single-key shortcuts Off: J, K, M, R and ? do nothing; no aria-keyshortcuts; the plain region label", async () => {
    await mount(false);
    for (const k of ["j", "k", "m", "r", "?"]) key(k);
    expect(pairDecide).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('[id^="pair-note-"]')).toBeNull();
    expect(region().getAttribute("aria-label")).toBe("IntelliDrugs senior review.");
    expect(document.querySelector('[data-sk="mark-DDInter14-DDInter1951"]')!.hasAttribute("aria-keyshortcuts")).toBe(false);
  });
});
