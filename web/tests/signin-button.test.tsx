// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fb = vi.hoisted(() => ({
  initializeAuth: vi.fn(() => ({ name: "auth" })),
  inMemoryPersistence: {},
  browserPopupRedirectResolver: {},
  GoogleAuthProvider: class { setCustomParameters = vi.fn(); },
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  signOut: vi.fn(),
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("firebase/app", () => ({ getApps: () => [], initializeApp: () => ({ name: "app" }) }));
vi.mock("firebase/auth", () => fb);
vi.mock("@/app/signin/navigate", () => ({ navigate }));
vi.mock("@/components/TurnstileField", () => ({
  default: ({ onToken, onError, resetKey = 0, action }:
      { onToken?: (t: string | null) => void; onError?: () => void; resetKey?: number; action: string }) => (
    <div data-testid="turnstile" data-reset={resetKey} data-action={action}>
      <button type="button" onClick={() => onToken?.(`ts-${resetKey}`)}>pass bot check</button>
      <button type="button" onClick={() => { onToken?.(null); onError?.(); }}>fail bot check</button>
    </div>),
}));

import SignInButton, { REDIRECT_FLAG } from "@/app/signin/SignInButton";

const CONFIG = { apiKey: "k", authDomain: "drugdb.eliooo.org", projectId: "p", appId: "a" };
const ORIGIN = "https://drugdb.eliooo.org";
const user = (id: string) => ({ user: { getIdToken: async () => id } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;

const renderButton = (returnTo: string | null = "/review/0001-pilot") =>
  render(<SignInButton config={CONFIG} siteKey="1x00000000000000000000AA" returnTo={returnTo} siteOrigin={ORIGIN} />);
const google = () => screen.getByRole("button", { name: "Continue with Google" });
const passBotCheck = () => fireEvent.click(screen.getByRole("button", { name: "pass bot check" }));
/** Banner titles also reach the live region (§10.2), so tests look for the visible title by its class. */
const bannerTitle = (text: string) => screen.findByText(text, { selector: ".banner-title" });
const liveRegion = () => document.querySelector<HTMLElement>('[aria-live="polite"]')!;

beforeEach(() => {
  for (const f of [fb.signInWithPopup, fb.signInWithRedirect, fb.getRedirectResult, fb.signOut, navigate]) f.mockReset();
  fb.signInWithPopup.mockResolvedValue(user("id-1"));
  fetchMock = vi.fn().mockResolvedValue(json(200, { success: true, data: { role: "pharmacist", redirectTo: "/review/0001-pilot" } }));
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SignInButton island (§6.2)", () => {
  it("waits for the bot check (action signin) before Continue with Google can be used", () => {
    renderButton();
    expect(screen.getByTestId("turnstile").dataset.action).toBe("signin");
    expect(google().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(google());
    expect(fb.signInWithPopup).not.toHaveBeenCalled();
    passBotCheck();
    expect(google().getAttribute("aria-disabled")).toBeNull();
  });

  it("signs in with the popup, posts idToken, turnstileToken and returnTo, signs Firebase out, then goes to returnTo", async () => {
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/review/0001-pilot"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/session");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ idToken: "id-1", turnstileToken: "ts-0", returnTo: "/review/0001-pilot" });
    expect(fb.signOut).toHaveBeenCalled();
  });

  it("never follows an unsafe return path: it lands on /signin?welcome=1", async () => {
    renderButton("/\\evil.com");
    passBotCheck();
    fireEvent.click(google());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/signin?welcome=1"));
  });

  it("shows Opening Google, keeping its size, while the Google window is open", async () => {
    let finish!: (v: unknown) => void;
    fb.signInWithPopup.mockReturnValue(new Promise((r) => { finish = r; }));
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await screen.findByText("Finish signing in in the Google window. This page updates when you're done.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Opening Google" }).getAttribute("aria-busy")).toBe("true");
    await act(async () => finish(user("id-1")));
  });

  it("Board P's Google button: .gbtn with Google's glyph, the spinner while loading, and the Cloudflare Turnstile row", async () => {
    let finish!: (v: unknown) => void;
    fb.signInWithPopup.mockReturnValue(new Promise((r) => { finish = r; }));
    renderButton();
    expect(google().className).toBe("gbtn");
    expect(google().querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    expect(screen.getByText("Cloudflare Turnstile").className).toBe("turnBy");
    expect(screen.getByTestId("turnstile").parentElement!.className).toBe("turn");
    passBotCheck();
    fireEvent.click(google());
    const busy = await screen.findByRole("button", { name: "Opening Google" });
    expect(busy.className).toBe("gbtn");
    expect(busy.querySelector(".btn-spinner")).toBeTruthy();
    expect(busy.querySelector("svg")).toBeNull();
    await act(async () => finish(user("id-1")));
  });

  it("bot check failed: the crit banner and Retry check, which asks for a fresh token", async () => {
    fetchMock.mockResolvedValue(json(403, { success: false, errors: [{ code: "CAPTCHA" }] }));
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("We couldn't confirm you're a person.")).toBeTruthy();
    expect(screen.getByText("You weren't signed in. Retry the check. If it fails again, turn off extensions that block scripts on this page.")).toBeTruthy();
    const before = Number(screen.getByTestId("turnstile").dataset.reset);
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    expect(Number(screen.getByTestId("turnstile").dataset.reset)).toBe(before + 1);
  });

  it("a widget that fails in the browser shows the same banner, and Retry check asks for a fresh token", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "fail bot check" }));
    expect(await bannerTitle("We couldn't confirm you're a person.")).toBeTruthy();
    expect(google().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    expect(screen.getByTestId("turnstile").dataset.reset).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["a failed exchange", () => { fetchMock.mockResolvedValue(json(403, { success: false, errors: [{ code: "CAPTCHA" }] }));
      passBotCheck(); fireEvent.click(google()); }],
    ["a widget failure", () => fireEvent.click(screen.getByRole("button", { name: "fail bot check" }))],
  ])("after %s, Retry check moves focus to Continue with Google, never to <body> (§10.1)", async (_label, arrange) => {
    renderButton();
    arrange();
    expect(await bannerTitle("We couldn't confirm you're a person.")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Retry check" });
    retry.focus();
    expect(document.activeElement).toBe(retry);
    fireEvent.click(retry);
    expect(screen.queryByRole("button", { name: "Retry check" })).toBeNull();
    expect(document.activeElement).toBe(google());
    expect(google().getAttribute("aria-disabled")).toBe("true");
  });

  it("resets the bot check after a failed exchange and never re-sends a spent token (Review Focus 4)", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { success: false, message: "Sign-in is too old. Please sign in again.",
      errors: [{ code: "STALE_SIGN_IN", message: "Sign-in is too old. Please sign in again." }] }));
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("Couldn't sign you in.")).toBeTruthy();
    expect(screen.getByText("Sign-in is too old. Please sign in again.")).toBeTruthy();
    expect(screen.getByTestId("turnstile").dataset.reset).toBe("1");
    expect(google().getAttribute("aria-disabled")).toBe("true");
    passBotCheck();
    fireEvent.click(google());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).turnstileToken).toBe("ts-1");
  });

  it.each([["UNVERIFIED_EMAIL", "Your Google account email is not verified."],
    ["INVALID_ID_TOKEN", "Sign-in could not be verified. Please try again."]])(
    "a 401 %s shows its own copy under Couldn't sign you in.", async (code, body) => {
      fetchMock.mockResolvedValue(json(401, { success: false, errors: [{ code }] }));
      renderButton();
      passBotCheck();
      fireEvent.click(google());
      expect(await bannerTitle("Couldn't sign you in.")).toBeTruthy();
      expect(screen.getByText(body)).toBeTruthy();
    });

  it("never echoes the server's message: an unknown 401 shows the request-failed body", async () => {
    fetchMock.mockResolvedValue(json(401, { success: false, message: "<b>pharm@example.org</b>", errors: [{ code: "WHATEVER" }] }));
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("Couldn't sign you in.")).toBeTruthy();
    expect(screen.getByText("Nothing changed. Check your connection and try again.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("pharm@example.org");
  });

  it("429 shows the sign-in rate-limit banner", async () => {
    fetchMock.mockResolvedValue(json(429, { success: false, errors: [{ code: "RATE_LIMITED" }] }));
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("Too many sign-in attempts. Wait a few minutes and try again.")).toBeTruthy();
  });

  it("announces each banner through the page's one polite sr-only live region (§10.2)", async () => {
    fetchMock.mockResolvedValue(json(403, { success: false, errors: [{ code: "CAPTCHA" }] }));
    renderButton();
    const region = liveRegion();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(region.className).toBe("sr-only");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.textContent).toBe("");
    passBotCheck();
    fireEvent.click(google());
    await waitFor(() => expect(region.textContent).toBe("We couldn't confirm you're a person."));
    expect(document.querySelector(".banner")!.closest("[aria-live]")).toBeNull();
  });

  it.each([["a 5xx", () => fetchMock.mockResolvedValue(json(502, {}))], ["a network failure", () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))]])(
    "%s shows Couldn't sign you in. / Nothing changed.", async (_label, arrange) => {
      arrange();
      renderButton();
      passBotCheck();
      fireEvent.click(google());
      expect(await bannerTitle("Couldn't sign you in.")).toBeTruthy();
      expect(screen.getByText("Nothing changed. Check your connection and try again.")).toBeTruthy();
    });

  it("closing the Google window shows Sign-in cancelled. and keeps the unspent token", async () => {
    fb.signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("Sign-in cancelled.")).toBeTruthy();
    expect(google().getAttribute("aria-disabled")).toBeNull();
  });

  it("a blocked pop-up offers Continue in this tab, which uses signInWithRedirect", async () => {
    fb.signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("Your browser blocked the Google window.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue in this tab" }));
    await waitFor(() => expect(fb.signInWithRedirect).toHaveBeenCalled());
    expect(sessionStorage.getItem(REDIRECT_FLAG)).toBe("1");
  });

  it("back from the redirect: reads the Google result, waits for the bot check, then exchanges it", async () => {
    sessionStorage.setItem(REDIRECT_FLAG, "1");
    fb.getRedirectResult.mockResolvedValue(user("id-r"));
    renderButton();
    await waitFor(() => expect(fb.getRedirectResult).toHaveBeenCalled());
    expect(sessionStorage.getItem(REDIRECT_FLAG)).toBeNull();
    passBotCheck();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/review/0001-pilot"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ idToken: "id-r", turnstileToken: "ts-0" });
  });

  it("does not touch Firebase on a plain visit (the SDK loads only when Google sign-in is used)", () => {
    renderButton();
    expect(fb.getRedirectResult).not.toHaveBeenCalled();
    expect(fb.signInWithPopup).not.toHaveBeenCalled();
    expect(fb.signInWithRedirect).not.toHaveBeenCalled();
  });
});
