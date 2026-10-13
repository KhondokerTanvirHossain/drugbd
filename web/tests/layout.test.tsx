import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
const cookieStore = { get: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => new Headers() }));

import RootLayout from "@/app/layout";
import { ONEST_URL } from "@/lib/fonts";

const render = async (children: React.ReactNode = <p>page</p>) => renderToStaticMarkup(await RootLayout({ children }));
beforeEach(() => { getSession.mockReset(); getSession.mockResolvedValue(null); cookieStore.get.mockReset(); });

describe("RootLayout (§3.1, §3.2)", () => {
  it("renders <html lang=en> and a <body> with no inline style", async () => {
    const html = await render();
    expect(html).toMatch(/^<html lang="en"/);
    expect(html).toMatch(/<body[^>]*>/);
    expect(html.match(/<body[^>]*>/)![0]).not.toContain("style=");
  });

  it("preloads Onest only, as a crossorigin WOFF2 font", async () => {
    const html = await render();
    const preloads = html.match(/<link[^>]*rel="preload"[^>]*>/g) ?? [];
    expect(preloads).toHaveLength(1);
    expect(preloads[0]).toContain(`href="${ONEST_URL}"`);
    expect(preloads[0]).toContain('as="font"');
    expect(preloads[0]).toContain('type="font/woff2"');
    expect(preloads[0]).toContain('crossorigin=""');
  });

  it("renders the page inside <main id=content> after a Skip to content link", async () => {
    const html = await render();
    expect(html).toContain('<a class="skipLink" href="#content">Skip to content</a>');
    expect(html).toMatch(/<main id="content"[^>]*><p>page<\/p><\/main>/);
  });

  it("imports tokens.css before fonts.css", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    expect(src.indexOf('import "@/styles/tokens.css"')).toBeGreaterThanOrEqual(0);
    expect(src.indexOf('import "@/styles/tokens.css"')).toBeLessThan(src.indexOf('import "@/styles/fonts.css"'));
  });

  it("exports nothing but the component and metadata (Next.js refuses other layout exports at build time)", async () => {
    const layout = await import("@/app/layout");
    expect(Object.keys(layout).sort()).toEqual(["default", "metadata"]);
  });
});
