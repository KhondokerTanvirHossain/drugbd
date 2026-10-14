import { afterEach, describe, expect, it, vi } from "vitest";

const cookieStore = { set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { PROMISE_PHARMACIST } from "@/lib/copy";
import { KEYS_COOKIE, UNDO_COOKIE, UNDO_SECONDS, deskCookieOptions, deskCookieString, parseKeys, parseUndo } from "@/lib/desk-settings";
import { setDeskSettingAction } from "@/lib/desk-settings-actions";
import { SHEET_ROWS, toastSub } from "@/lib/review-copy";

afterEach(() => { cookieStore.set.mockReset(); vi.unstubAllEnvs(); });

describe("desk settings cookies (§5.8.1, §5.14)", () => {
  it("names", () => {
    expect(UNDO_COOKIE).toBe("intellidrugs-undo");
    expect(KEYS_COOKIE).toBe("intellidrugs-keys");
    expect(UNDO_SECONDS).toEqual([8, 20, 60]);
  });

  it("the undo window is 8, 20 or 60; anything else reads as 8", () => {
    expect(parseUndo("8")).toBe(8);
    expect(parseUndo("20")).toBe(20);
    expect(parseUndo("60")).toBe(60);
    for (const v of ["", "10", "8.0", " 20", "60s", "-8", undefined, null, 20, ["60"]]) expect(parseUndo(v)).toBe(8);
  });

  it("single-key shortcuts are on or off; anything else reads as on", () => {
    expect(parseKeys("on")).toBe("on");
    expect(parseKeys("off")).toBe("off");
    for (const v of ["", "OFF", "false", "0", undefined, null]) expect(parseKeys(v)).toBe("on");
  });

  it("cookie attributes: a year, Lax, Path=/, readable by script, Secure only in production", () => {
    expect(deskCookieOptions(false)).toEqual({ maxAge: 31536000, sameSite: "lax", path: "/", secure: false, httpOnly: false });
    expect(deskCookieOptions(true).secure).toBe(true);
    expect(deskCookieString("intellidrugs-undo", "20", true)).toBe("intellidrugs-undo=20; Max-Age=31536000; Path=/; SameSite=Lax; Secure");
    expect(deskCookieString("intellidrugs-keys", "off", false)).toBe("intellidrugs-keys=off; Max-Age=31536000; Path=/; SameSite=Lax");
  });

  it("the promise, the toast and the sheet use the reviewer's window", () => {
    expect(UNDO_SECONDS.map((n) => PROMISE_PHARMACIST.body(n))).toEqual([
      '"Looks correct" publishes this record after an 8-second undo window.',
      '"Looks correct" publishes this record after an 20-second undo window.',
      '"Looks correct" publishes this record after an 60-second undo window.',
    ]);
    expect(UNDO_SECONDS.map((n) => toastSub("pharmacist", n))).toEqual(
      ["Publishes in 8 seconds.", "Publishes in 20 seconds.", "Publishes in 60 seconds."]);
    expect(UNDO_SECONDS.map((n) => toastSub("engineer", n))).toEqual([
      "Your check saves in 8 seconds. It does not publish.", "Your check saves in 20 seconds. It does not publish.",
      "Your check saves in 60 seconds. It does not publish."]);
    expect(SHEET_ROWS(60)[0]).toEqual(["A", "Looks correct, then an 60-second undo window"]);
  });
});

describe("setDeskSettingAction (no-JavaScript form POST)", () => {
  it("stores the submitted undo window or shortcuts setting, and nothing it cannot parse", async () => {
    const undo = new FormData(); undo.set("undo", "60");
    await setDeskSettingAction(undo);
    expect(cookieStore.set).toHaveBeenCalledWith("intellidrugs-undo", "60",
      { maxAge: 31536000, sameSite: "lax", path: "/", secure: false, httpOnly: false });
    const keys = new FormData(); keys.set("keys", "off");
    await setDeskSettingAction(keys);
    expect(cookieStore.set).toHaveBeenLastCalledWith("intellidrugs-keys", "off", expect.objectContaining({ path: "/" }));
    const bogus = new FormData(); bogus.set("undo", "5");
    await setDeskSettingAction(bogus);
    expect(cookieStore.set).toHaveBeenLastCalledWith("intellidrugs-undo", "8", expect.anything());
  });
});
