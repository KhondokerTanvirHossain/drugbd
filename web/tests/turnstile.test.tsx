import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TURNSTILE_RESPONSE_FIELD, TURNSTILE_TEST_SECRET_KEY, TURNSTILE_TEST_SITE_KEY, verifyTurnstile,
} from "../lib/turnstile";
import Turnstile from "../components/Turnstile";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => vi.stubEnv("TURNSTILE_SECRET_KEY", "real-secret"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("verifyTurnstile", () => {
  it("posts the secret, the response token and the remote IP to siteverify with a 5 s timeout", async () => {
    const f = vi.fn().mockResolvedValue(reply({ success: true }));
    vi.stubGlobal("fetch", f);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    expect(await verifyTurnstile("tok-1", "203.0.113.9")).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(SITEVERIFY);
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(init.body);
    expect(body.get("secret")).toBe("real-secret");
    expect(body.get("response")).toBe("tok-1");
    expect(body.get("remoteip")).toBe("203.0.113.9");
    expect(timeout).toHaveBeenCalledWith(5000);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    timeout.mockRestore();
  });

  it("omits remoteip when the client address is unknown", async () => {
    const f = vi.fn().mockResolvedValue(reply({ success: true }));
    vi.stubGlobal("fetch", f);
    await verifyTurnstile("tok", "unknown");
    await verifyTurnstile("tok", null);
    for (const call of f.mock.calls) expect(new URLSearchParams(call[1].body).has("remoteip")).toBe(false);
  });

  it("returns false when Cloudflare says the token is not valid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ success: false, "error-codes": ["invalid-input-response"] })));
    expect(await verifyTurnstile("tok", "203.0.113.9")).toBe(false);
  });

  it("returns false for a non-2xx reply or a body that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ success: true }, 500)));
    expect(await verifyTurnstile("tok", null)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    expect(await verifyTurnstile("tok", null)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ success: "true" })));
    expect(await verifyTurnstile("tok", null)).toBe(false);
  });

  it("fails closed on a network error or timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await verifyTurnstile("tok", null)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    expect(await verifyTurnstile("tok", null)).toBe(false);
  });

  it("returns false without calling Cloudflare for a missing, non-string or oversized token", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    for (const t of [undefined, null, "", 42, new Blob(["x"]), "x".repeat(2049)]) expect(await verifyTurnstile(t, null)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("returns false without calling Cloudflare when no secret is configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    expect(await verifyTurnstile("tok", null)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("allows Cloudflare's always-pass test secret outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET_KEY);
    const f = vi.fn().mockResolvedValue(reply({ success: true })); vi.stubGlobal("fetch", f);
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null)).toBe(true);
    expect(new URLSearchParams(f.mock.calls[0][1].body).get("secret")).toBe(TURNSTILE_TEST_SECRET_KEY);
  });

  it("refuses the always-pass test secret in production without calling Cloudflare", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET_KEY);
    const f = vi.fn().mockResolvedValue(reply({ success: true })); vi.stubGlobal("fetch", f);
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("uses Cloudflare's documented test keys", () => {
    expect(TURNSTILE_TEST_SITE_KEY).toBe("1x00000000000000000000AA");
    expect(TURNSTILE_TEST_SECRET_KEY).toBe("1x0000000000000000000000000000000AA");
    expect(TURNSTILE_RESPONSE_FIELD).toBe("cf-turnstile-response");
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
