import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlagForm from "@/components/FlagForm";

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA"));
afterEach(() => vi.unstubAllEnvs());

describe("FlagForm", () => {
  it("renders nothing for anonymous visitors", () => {
    expect(renderToStaticMarkup(<FlagForm session={null} targetType="product" targetId="P-1" />)).toBe("");
  });

  it("renders a server-action form with the target, a 5-2000 character message and the Turnstile widget", () => {
    const html = renderToStaticMarkup(
      <FlagForm session={{ email: "someone@gmail.com", role: "user" }} targetType="substance" targetId="BDS-1" />);
    expect(html).toContain("Flag a problem");
    expect(html).toContain('name="targetType" value="substance"');
    expect(html).toContain('name="targetId" value="BDS-1"');
    const textarea = html.match(/<textarea[^>]*>/)?.[0] ?? "";
    expect(textarea).toContain('name="message"');
    expect(textarea).toContain('required=""');
    expect(textarea).toContain('minLength="5"');
    expect(textarea).toContain('maxLength="2000"');
    expect(html).toContain('class="cf-turnstile"');
    expect(html).not.toContain("someone@gmail.com");
  });

  it("shows the outcome message for a known code only", () => {
    const s = { email: "u@x.org", role: "user" as const };
    expect(renderToStaticMarkup(<FlagForm session={s} targetType="product" targetId="P" outcome="invalid" />))
      .toContain("A flag needs a message of 5 to 2000 characters.");
    expect(renderToStaticMarkup(<FlagForm session={s} targetType="product" targetId="P" outcome="<b>x</b>" />))
      .not.toContain("<b>x");
    expect(renderToStaticMarkup(<FlagForm session={null} targetType="product" targetId="P" outcome="forbidden" />))
      .toContain("Sign in to flag a problem.");
  });

  it("the flag form's Turnstile script carries the CSP nonce and the widget names action=flag (§9.4)", () => {
    const html = renderToStaticMarkup(
      <FlagForm session={{ email: "u@x.org", role: "user" }} targetType="product" targetId="P-1" nonce="n0nce123" />);
    expect(html).toMatch(/<script[^>]*src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js"[^>]*nonce="n0nce123"/);
    expect(html).toContain('data-action="flag"');
  });
});
