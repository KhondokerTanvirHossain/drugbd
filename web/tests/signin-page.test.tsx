import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "n1" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/app/signin/SignInButton", () => ({
  default: (props: Record<string, unknown>) => <pre data-testid="island">{JSON.stringify(props)}</pre> }));

import SignInPage from "@/app/signin/page";

const configure = () => {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "AIza-public-key");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "drugdb.eliooo.org");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
  vi.stubEnv("FIREBASE_PROJECT_ID", "intellidrugs-kb");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAA-site");
};
const render = async (returnTo?: string | string[]) =>
  renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve(returnTo === undefined ? {} : { returnTo }) }));
const islandProps = (html: string) =>
  JSON.parse(html.match(/<pre data-testid="island">(.*?)<\/pre>/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

beforeEach(() => { getSession.mockReset(); getSession.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());

describe("/signin (§6.2)", () => {
  it("offers Continue with Google with the bot check, the site origin and the nonce", async () => {
    configure();
    const html = await render();
    expect(html).toContain("<h1");
    expect(html).toContain("Sign in to IntelliDrugs");
    expect(html).toContain("New here? The same button creates your account.");
    expect(islandProps(html)).toEqual({
      config: { apiKey: "AIza-public-key", authDomain: "drugdb.eliooo.org", projectId: "intellidrugs-kb", appId: "1:123:web:abc" },
      siteKey: "0x4AAAAAAA-site", returnTo: null, siteOrigin: "http://localhost:3000", nonce: "n1",
    });
    expect(html).toContain("<noscript><p>Sign-in needs JavaScript for Google and the bot check.</p></noscript>");
  });

  it("passes only a safe returnTo to the island", async () => {
    configure();
    expect(islandProps(await render("/review/0001-pilot?show=needs")).returnTo).toBe("/review/0001-pilot?show=needs");
    expect(islandProps(await render("/\\evil.com")).returnTo).toBeNull();
    expect(islandProps(await render("https://drugdb.eliooo.org.evil.com")).returnTo).toBeNull();
    expect(islandProps(await render(["/a", "/b"])).returnTo).toBe("/a");
  });

  it("says sign-in is not available when Firebase or Turnstile is not configured", async () => {
    for (const missing of ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_APP_ID",
      "FIREBASE_PROJECT_ID", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]) {
      configure();
      vi.stubEnv(missing, "");
      const html = await render();
      expect(html).toContain('<p class="banner-title">Sign-in is not available right now.</p>');
      expect(html).toContain("Searching and checking interactions don&#x27;t need an account.");
      expect(html).not.toContain('data-testid="island"');
    }
  });

  it("when already signed in shows the role and a sign-out form, never the email", async () => {
    configure();
    getSession.mockResolvedValue({ email: "eng@example.org", name: "Eng", role: "engineer" });
    const html = await render();
    expect(html).toContain("Signed in as Engineer.");
    expect(html).toContain('<form action="/signout" method="post">');
    expect(html).not.toContain("eng@example.org");
    expect(html).not.toContain('data-testid="island"');
  });
});
