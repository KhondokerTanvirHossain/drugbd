import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TURNSTILE_RESPONSE_FIELD, TURNSTILE_TEST_SECRET_KEY, TURNSTILE_TEST_SECRETS, TURNSTILE_TEST_SITE_KEY, turnstileSiteKey,
  verifyTurnstile,
} from "../lib/turnstile";
import Turnstile from "../components/Turnstile";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => vi.stubEnv("TURNSTILE_SECRET_KEY", "real-secret"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const REAL = { success: true, hostname: "drugdb.eliooo.org", action: "signin" };
/** The live test-secret answer: no `action` field at all (Step 1). */
const TEST_REPLY = { success: true, hostname: "example.com" };

describe("verifyTurnstile (§9.2)", () => {
  beforeEach(() => vi.stubEnv("SITE_HOST", "drugdb.eliooo.org"));

  it("posts the secret, the token and the remote IP with a 5 s timeout, and checks action and hostname", async () => {
    const f = vi.fn().mockResolvedValue(reply(REAL));
    vi.stubGlobal("fetch", f);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    expect(await verifyTurnstile("tok-1", "203.0.113.9", "signin")).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(SITEVERIFY);
    const body = new URLSearchParams(init.body);
    expect([body.get("secret"), body.get("response"), body.get("remoteip")]).toEqual(["real-secret", "tok-1", "203.0.113.9"]);
    expect(timeout).toHaveBeenCalledWith(5000);
    timeout.mockRestore();
  });

  it("refuses a token minted for another action or another hostname", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...REAL, action: "flag" })));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...REAL, hostname: "evil.example" })));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ success: true })));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
  });

  it("compares the hostname without the SITE_HOST port", async () => {
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org:443");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(REAL)));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(true);
  });

  it("omits remoteip when the client address is unknown", async () => {
    const f = vi.fn().mockResolvedValue(reply(REAL));
    vi.stubGlobal("fetch", f);
    await verifyTurnstile("tok", "unknown", "signin");
    await verifyTurnstile("tok", null, "signin");
    for (const call of f.mock.calls) expect(new URLSearchParams(call[1].body).has("remoteip")).toBe(false);
  });

  it("fails closed: Cloudflare says no, a non-2xx, non-JSON, a network error or a timeout", async () => {
    for (const r of [reply({ success: false }), reply(REAL, 500), new Response("<html>", { status: 200 }), reply({ ...REAL, success: "true" })]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));
      expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
  });

  it("returns false without calling Cloudflare for a bad token or a missing secret", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    for (const t of [undefined, null, "", 42, new Blob(["x"]), "x".repeat(2049)]) expect(await verifyTurnstile(t, null, "signin")).toBe(false);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses every test secret in production without calling Cloudflare", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const f = vi.fn().mockResolvedValue(reply(TEST_REPLY)); vi.stubGlobal("fetch", f);
    for (const s of TURNSTILE_TEST_SECRETS) {
      vi.stubEnv("TURNSTILE_SECRET_KEY", s);
      expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null, "signin")).toBe(false);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("outside e2e mode the test secret's reply fails the action and hostname checks", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET_KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(TEST_REPLY)));
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null, "signin")).toBe(false);
  });

  it("with INTELLIDRUGS_E2E=1 a test secret is accepted in production and the two comparisons are skipped", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET_KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(TEST_REPLY)));
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null, "decision")).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ success: false, "error-codes": ["invalid-input-response"] })));
    vi.stubEnv("TURNSTILE_SECRET_KEY", "2x0000000000000000000000000000000AA");          // always fails
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null, "decision")).toBe(false);
  });

  it("with INTELLIDRUGS_E2E=1 a real secret still needs both comparisons", async () => {
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(TEST_REPLY)));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
  });

  it("uses Cloudflare's documented test keys", () => {
    expect(TURNSTILE_TEST_SITE_KEY).toBe("1x00000000000000000000AA");
    expect(TURNSTILE_TEST_SECRET_KEY).toBe("1x0000000000000000000000000000000AA");
    expect([...TURNSTILE_TEST_SECRETS]).toEqual(["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA",
      "3x0000000000000000000000000000000AA"]);
    expect(TURNSTILE_RESPONSE_FIELD).toBe("cf-turnstile-response");
  });

  it("renders a test site key in production only in e2e mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", TURNSTILE_TEST_SITE_KEY);
    expect(turnstileSiteKey()).toBeNull();
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    expect(turnstileSiteKey()).toBe(TURNSTILE_TEST_SITE_KEY);
  });
});

describe("Turnstile widget", () => {
  it("renders the widget div with the site key and the Cloudflare script", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAA-site");
    const html = renderToStaticMarkup(<Turnstile action="decision" />);
    expect(html).toContain('<div class="cf-turnstile" data-sitekey="0x4AAAAAAA-site" data-action="decision"></div>');
    expect(html).toMatch(/<script[^>]*src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js"/);
  });

  it("passes the nonce to the Cloudflare script and the action to the widget", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAA-site");
    const html = renderToStaticMarkup(<Turnstile action="resolve" nonce="abc" />);
    expect(html).toContain('<div class="cf-turnstile" data-sitekey="0x4AAAAAAA-site" data-action="resolve"></div>');
    expect(html).toMatch(/<script[^>]*nonce="abc"/);
  });

  it("says verification is not configured when there is no site key", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const html = renderToStaticMarkup(<Turnstile action="decision" />);
    expect(html).not.toContain("cf-turnstile");
    expect(html).toContain("Verification is not configured");
  });

  it("renders the test site key outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", TURNSTILE_TEST_SITE_KEY);
    expect(renderToStaticMarkup(<Turnstile action="decision" />)).toContain(`data-sitekey="${TURNSTILE_TEST_SITE_KEY}"`);
  });

  it("refuses the test site key in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", TURNSTILE_TEST_SITE_KEY);
    const html = renderToStaticMarkup(<Turnstile action="decision" />);
    expect(html).not.toContain(TURNSTILE_TEST_SITE_KEY);
    expect(html).toContain("Verification is not configured");
  });
});
