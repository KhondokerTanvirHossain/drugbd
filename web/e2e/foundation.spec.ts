import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { BASE_URL, signInAs } from "./session";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const scriptSrc = (csp: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src ")) ?? "";

test.describe("liveness and headers (§9.4)", () => {
  test("/healthz answers ok and is never rate-limited", async ({ request }) => {
    const answers = await Promise.all(Array.from({ length: 60 }, () => request.get("/healthz")));
    expect(answers.map((a) => a.status())).toEqual(Array(60).fill(200));
    expect(await answers[0].text()).toBe("ok");
  });

  test("robots.txt disallows everything during the pilot", async ({ request }) => {
    expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
  });

  test("each page gets its own nonce CSP without 'unsafe-inline' scripts, and every script tag carries the nonce", async ({ request }) => {
    const first = await request.get("/signin");
    const second = await request.get("/signin");
    const csp = first.headers()["content-security-policy"];
    const nonce = /'nonce-([^']+)'/.exec(scriptSrc(csp))?.[1];
    expect(nonce).toBeTruthy();
    expect(scriptSrc(csp)).toContain("'strict-dynamic'");
    expect(scriptSrc(csp)).not.toContain("'unsafe-inline'");
    expect(second.headers()["content-security-policy"]).not.toBe(csp);
    const scripts = (await first.text()).match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
    expect(first.headers()["x-frame-options"]).toBe("DENY");
    expect(first.headers()["cache-control"]).toMatch(/private/);
    expect(first.headers()["cache-control"]).toMatch(/no-store/);
  });

  test("the browser loads the sign-in page with no CSP violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
    await page.goto("/signin");
    await expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });
    expect(violations).toEqual([]);
  });
});

test.describe("self-hosted fonts (§3.2)", () => {
  // Every /fonts/*.woff2 a page preloads in its HTML or references from its stylesheets must ship in the web image.
  const fontUrls = async (request: APIRequestContext, path: string) => {
    const html = await (await request.get(path)).text();
    const sheets = (html.match(/<link\b[^>]*>/g) ?? []).filter((t) => /\brel="stylesheet"/.test(t))
      .map((t) => /\bhref="([^"]+)"/.exec(t)?.[1]).filter((h): h is string => !!h);
    expect(sheets.length).toBeGreaterThan(0);
    const css = await Promise.all(sheets.map(async (s) => (await request.get(s)).text()));
    const urls = [html, ...css].flatMap((t) => [...t.matchAll(/\/fonts\/[\w.-]+\.woff2/g)].map((m) => m[0]));
    return [...new Set(urls)];
  };

  for (const path of ["/learn/start", "/signin"]) {
    test(`every font ${path} preloads or references answers 200 as a font`, async ({ request }) => {
      const urls = await fontUrls(request, path);
      expect(urls).toEqual(expect.arrayContaining(["/fonts/onest-latin-wght-normal.woff2",
        "/fonts/ibm-plex-mono-latin-400-normal.woff2", "/fonts/ibm-plex-mono-latin-500-normal.woff2"]));
      for (const url of urls) {
        const res = await request.get(url);
        expect(`${url} ${res.status()}`).toBe(`${url} 200`);
        expect(res.headers()["content-type"]).toMatch(/^font\/woff2/);
      }
    });

    // font-display: optional (§3.2, PO 16/10/2026): a first view may keep the fallback if Onest misses the ~100 ms block
    // period, so the first view only proves Onest loads; the reload, with Onest cached, must render the heading in it.
    test(`${path} loads Onest and a reload renders in Onest, not a fallback font`, async ({ page }) => {
      const onestState = () => page.evaluate(async () => {
        await document.fonts.ready;
        const onest = [...document.fonts].filter((f) => f.family.replace(/"/g, "") === "Onest").map((f) => f.status);
        return { onest, check: document.fonts.check("16px Onest") };
      });
      await page.goto(path);
      expect(await onestState()).toEqual({ onest: ["loaded"], check: true });

      await page.reload();
      expect(await onestState()).toEqual({ onest: ["loaded"], check: true });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("DOM.enable");
      await cdp.send("CSS.enable");
      const { root } = await cdp.send("DOM.getDocument");
      const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: "h1" });
      expect(nodeId).toBeGreaterThan(0);
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      // The font that drew most of the heading's glyphs (a glyph outside the latin subset may fall back).
      const main = fonts.reduce((a, b) => (b.glyphCount > a.glyphCount ? b : a));
      expect(`${main.familyName} custom=${main.isCustomFont}`).toMatch(/^Onest\b.* custom=true$/);
    });
  }
});

test.describe("theme (§3.3)", () => {
  test("the server renders data-theme from the cookie, so the first paint is right", async ({ context, page }) => {
    await context.addCookies([{ name: "intellidrugs-theme", value: "dark", url: BASE_URL }]);
    expect(await (await page.request.get("/signin")).text()).toMatch(/<html lang="en" data-theme="dark"/);
  });

  test("with JavaScript a click switches at once and persists", async ({ page }) => {
    await page.goto("/signin");
    await page.locator("footer").getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect((await page.context().cookies()).find((c) => c.name === "intellidrugs-theme")?.value).toBe("dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("without JavaScript the form posts and the page comes back in the new theme", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto("/signin");
    await page.locator("footer").getByRole("button", { name: "Light" }).click();
    await page.waitForLoadState();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await context.close();
  });
});

test.describe("sign-in function (§6.2)", () => {
  test("Continue with Google waits for the bot check (Cloudflare test key), then becomes usable", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in to IntelliDrugs" })).toBeVisible();
    await expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Continue with Google" })).not.toHaveAttribute("aria-disabled", "true");
  });

  test("without JavaScript the page says why sign-in cannot work", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto("/signin");
    // Playwright's text matching skips <noscript>, so the rendered paragraph is located by CSS (it is visible here).
    const note = page.locator("noscript p");
    await expect(note).toBeVisible();
    await expect(note).toHaveText("Sign-in needs JavaScript for Google and the bot check.");
    await context.close();
  });

  test("return path (§11.4): /signin?returnTo=/\\evil.com reaches the island as null, so sign-in lands on /signin?welcome=1", async ({ request }) => {
    // There is no Google in e2e, so the case stops at the island's server-rendered props, serialised in the RSC payload
    // (quotes may be escaped there). The payload also carries the raw query in its router state, so the match is anchored
    // on the island's own prop order: config, siteKey, returnTo, siteOrigin, nonce. The island's step from a null
    // returnTo to /signin?welcome=1 is pinned by signin-button.test.tsx ("never follows an unsafe return path").
    const evil = await (await request.get("/signin?returnTo=%2F%5Cevil.com")).text();
    expect(evil).toMatch(/\\?"returnTo\\?":null,\\?"siteOrigin\\?"/);
    const safe = await (await request.get("/signin?returnTo=%2Freview%2F0001-pilot")).text();
    expect(safe).toMatch(/\\?"returnTo\\?":\\?"\/review\/0001-pilot\\?",\\?"siteOrigin\\?"/);
  });

  const themes = [
    { label: "light", cookie: "light", forced: false },
    { label: "dark", cookie: "dark", forced: false },
    { label: "forced colours", cookie: "system", forced: true },
  ] as const;
  for (const t of themes) {
    test(`axe: /signin has no WCAG 2.2 AA violations (${t.label})`, async ({ context, page }) => {
      await context.addCookies([{ name: "intellidrugs-theme", value: t.cookie, url: BASE_URL }]);
      if (t.forced) await page.emulateMedia({ forcedColors: "active" });
      await page.goto("/signin");
      await expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });
      const result = await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
});

test.describe("sign-out (§9.6)", () => {
  test("clears the session cookie and sessionStorage drafts (Clear-Site-Data) and lands on /", async ({ context, page }) => {
    await signInAs(context, "pharmacist", "Farhana Islam");
    await page.goto("/signin");
    // The minted cookie is read by the server (Ruling C.3): the page and the header both show the signed-in state.
    await expect(page.getByText("Signed in as Pharmacist.")).toBeVisible();
    await expect(page.locator("header summary")).toContainText("Account menu for Farhana Islam");
    await page.evaluate(() => sessionStorage.setItem("intellidrugs-note-draft", "draft text"));
    await page.locator("header summary").click();
    const [response] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === "/signout"),
      page.locator("header").getByRole("button", { name: "Sign out" }).click(),
    ]);
    expect(response.status()).toBe(303);
    // headers() leaves out security-related headers such as Clear-Site-Data; allHeaders() has them.
    expect((await response.allHeaders())["clear-site-data"]).toBe('"storage"');
    await page.waitForURL(`${BASE_URL}/`);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    expect((await context.cookies()).some((c) => c.name === "__Host-intellidrugs_session")).toBe(false);
  });

  test("refuses a sign-out without our Origin", async ({ request }) => {
    expect((await request.post("/signout")).status()).toBe(403);
    expect((await request.post("/signout", { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
  });

  test("DELETE /api/session is gone", async ({ request }) => {
    expect((await request.delete("/api/session")).status()).toBe(405);
  });
});
