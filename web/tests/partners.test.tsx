import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn(), requestPartnerAccess = vi.fn(), verifyTurnstile = vi.fn();
vi.mock("@/lib/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()),
  requestPartnerAccess: (...a: unknown[]) => requestPartnerAccess(...a) }));
vi.mock("@/lib/turnstile", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  verifyTurnstile: (...a: unknown[]) => verifyTurnstile(...a) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "n1", "x-request-id": "11111111-1111-4111-8111-111111111111" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const turnstileProps: Record<string, unknown>[] = [];
vi.mock("@/components/TurnstileField", async (importOriginal) => {
  const Real = (await importOriginal<typeof import("@/components/TurnstileField")>()).default;
  return { default: (p: Parameters<typeof Real>[0]) => { turnstileProps.push(p); return <Real {...p} />; } };
});
import PartnersPage from "@/app/partners/page";
import { createLimits } from "@/lib/limits";
import { submitPartnerRequest } from "@/lib/actions-core";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); f.set("cf-turnstile-response", "tok"); return f; };
const GOOD = { organisation: "Acme Health", kind: "EMR", use: "Check a patient's medicines at the prescribing step.", volume: "Under 1,000" };
const render = async (sp: Record<string, string> = {}) => renderToStaticMarkup(await PartnersPage({ searchParams: Promise.resolve(sp) }));

beforeEach(() => {
  getSession.mockReset(); getSession.mockResolvedValue({ email: "me@example.org", name: "Me", role: "user" });
  requestPartnerAccess.mockReset(); requestPartnerAccess.mockResolvedValue({ ok: true, data: { id: 1 } });
  verifyTurnstile.mockReset(); verifyTurnstile.mockResolvedValue(true);
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
});
afterEach(() => vi.unstubAllEnvs());

describe("/partners (§6.9)", () => {
  it("the band and the API status, then the form with its four fields, the no-PHI help and the bot check", async () => {
    const html = await render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("For partners: the same records, by API");
    expect(html).toContain('href="/learn/partners"');
    for (const label of ["Organisation", "Kind of system", "What you will build", "Expected checks per day"]) expect(html).toContain(label);
    for (const opt of ["EMR", "Pharmacy", "Pharma company", "Other", "Under 1,000", "1,000–10,000", "Over 10,000"]) expect(html).toContain(`>${opt}</option>`);
    expect(html).toContain("Don&#x27;t include patient names or other personal health details.");
    expect(html).toContain(">Request partner access</button>");
    // A native POST: the 303 to ?partner=<code>#request keeps its fragment with JavaScript too (form-post-routes.test.ts).
    expect(html).toContain('<form class="form" action="/partners/request" method="post">');
  });

  it("the bot check asks for the compact widget on narrow screens (size auto, §10.4 reflow at 320 px; final review finding 4)", async () => {
    turnstileProps.length = 0;
    await render();
    expect(turnstileProps).toHaveLength(1);
    expect(turnstileProps[0]).toMatchObject({ action: "partner", size: "auto" });
  });

  it("signed out: the sign-in line and link, no form", async () => {
    getSession.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Sign in first. Access is granted by the IntelliDrugs team.");
    expect(html).toContain('href="/signin?returnTo=%2Fpartners"');
    expect(html).not.toContain("<form");
  });

  it("sent: the success line names the requester's own email; errors use the flag outcome map", async () => {
    expect(await render({ partner: "sent" })).toContain("Request sent. The IntelliDrugs team replies to me@example.org.");
    expect(await render({ partner: "captcha" })).toContain("The verification check failed. Please try again.");
    const odd = await render({ partner: "<script>" });   // an unknown outcome code shows nothing, never the code itself
    expect(odd).not.toContain("&lt;script&gt;");
    expect(odd).not.toContain('role="alert"');
  });

  it("outcomes are plain text with no live role (§10.2, Task 26 ruling); prototype keys show nothing", async () => {
    for (const code of ["sent", "captcha", "invalid", "failed", "forbidden"]) {
      const html = await render({ partner: code });
      expect(html, code).not.toContain('role="alert"');
      expect(html, code).not.toContain('role="status"');
    }
    expect(await render({ partner: "failed" })).toContain("<p>The flag could not be sent. Please try again.</p>");
    for (const code of ["constructor", "toString", "__proto__"]) expect(await render({ partner: code }), code).toContain("Request partner access</h2><form");
  });

  it("signed in without a Turnstile site key: the disabled-verification notice in place of the bot check", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    const html = await render();
    expect(html).toContain("<p>Verification is not configured, so this action is disabled.</p>");
    expect(html).not.toContain('role="alert"');
  });
});

describe("submitPartnerRequest (§6.9, §9.3)", () => {
  it("stores one flag on other/partner-access with the four lines and the session email", async () => {
    expect(await submitPartnerRequest(fd(GOOD), createLimits())).toEqual({ status: 200, code: "sent" });
    const [message, email, rid] = requestPartnerAccess.mock.calls[0];
    expect(message).toBe("Organisation: Acme Health\nKind: EMR\nVolume: Under 1,000\nUse: Check a patient's medicines at the prescribing step.");
    expect(email).toBe("me@example.org");
    expect(rid).toBe("11111111-1111-4111-8111-111111111111");
    expect(verifyTurnstile.mock.calls[0][2]).toBe("partner");
  });

  it("refuses a missing session, each bad field, and a failed bot check, without calling the API", async () => {
    getSession.mockResolvedValueOnce(null);
    expect((await submitPartnerRequest(fd(GOOD), createLimits())).code).toBe("forbidden");
    for (const bad of [{ organisation: "A" }, { organisation: "x".repeat(201) }, { kind: "Hospital" }, { use: "too short" },
      { use: "x".repeat(1501) }, { volume: "Lots" }])
      expect((await submitPartnerRequest(fd({ ...GOOD, ...bad }), createLimits())).code, JSON.stringify(bad)).toBe("invalid");
    verifyTurnstile.mockResolvedValueOnce(false);
    expect((await submitPartnerRequest(fd(GOOD), createLimits())).code).toBe("captcha");
    expect(requestPartnerAccess).not.toHaveBeenCalled();
  });

  it("counts Bengali and emoji in characters, not UTF-16 units", async () => {
    expect((await submitPartnerRequest(fd({ ...GOOD, use: "প্রেসক্রিপশনের সময় ওষুধ মিলিয়ে দেখা" }), createLimits())).code).toBe("sent");
    expect((await submitPartnerRequest(fd({ ...GOOD, use: "\u{1F600}".repeat(19) }), createLimits())).code).toBe("invalid");
  });

  it("three requests a day per account, then failed", async () => {
    const limits = createLimits();
    for (let i = 0; i < 3; i++) expect((await submitPartnerRequest(fd(GOOD), limits)).code).toBe("sent");
    expect((await submitPartnerRequest(fd(GOOD), limits)).code).toBe("failed");
  });
});
