import { afterEach, describe, expect, it, vi } from "vitest";

const cookieStore = { set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { THEME_COOKIE, htmlThemeAttr, parseTheme, themeCookieOptions, themeCookieString } from "@/lib/theme";
import { setThemeAction } from "@/lib/theme-actions";

afterEach(() => { vi.unstubAllEnvs(); cookieStore.set.mockReset(); });

describe("theme cookie (§3.3)", () => {
  it("is called intellidrugs-theme", () => expect(THEME_COOKIE).toBe("intellidrugs-theme"));

  it("accepts system, light and dark", () => {
    for (const t of ["system", "light", "dark"]) expect(parseTheme(t)).toBe(t);
  });

  it("falls back to system for any other value (Review Focus 3)", () => {
    for (const v of ["blue", "", "DARK", '"><script>alert(1)</script>', undefined, null, 42, ["dark"]]) expect(parseTheme(v)).toBe("system");
  });

  it("maps to the html attribute; system leaves it off", () => {
    expect(htmlThemeAttr("light")).toBe("light");
    expect(htmlThemeAttr("dark")).toBe("dark");
    expect(htmlThemeAttr("system")).toBeUndefined();
  });

  it("lasts a year, SameSite=Lax, Path=/, readable by script, Secure only in production", () => {
    expect(themeCookieOptions(false)).toEqual({ maxAge: 31536000, sameSite: "lax", path: "/", secure: false, httpOnly: false });
    expect(themeCookieOptions(true).secure).toBe(true);
    expect(themeCookieString("dark", true)).toBe("intellidrugs-theme=dark; Max-Age=31536000; Path=/; SameSite=Lax; Secure");
    expect(themeCookieString("light", false)).toBe("intellidrugs-theme=light; Max-Age=31536000; Path=/; SameSite=Lax");
  });
});

describe("setThemeAction (no-JavaScript form POST)", () => {
  it("stores the submitted theme", async () => {
    const fd = new FormData(); fd.set("theme", "dark");
    await setThemeAction(fd);
    expect(cookieStore.set).toHaveBeenCalledWith("intellidrugs-theme", "dark",
      { maxAge: 31536000, sameSite: "lax", path: "/", secure: false, httpOnly: false });
  });
  it("stores system for anything else", async () => {
    const fd = new FormData(); fd.set("theme", "purple");
    await setThemeAction(fd);
    expect(cookieStore.set.mock.calls[0][1]).toBe("system");
  });
});
