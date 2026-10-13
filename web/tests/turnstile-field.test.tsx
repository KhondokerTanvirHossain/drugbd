// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TurnstileField from "@/components/TurnstileField";

type Opts = { sitekey: string; action: string; "response-field-name": string; callback: (t: string) => void;
  "error-callback": () => void; "expired-callback": () => void };
const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
beforeEach(() => {
  api.render.mockReset().mockReturnValue("w1"); api.reset.mockReset(); api.remove.mockReset();
  (window as unknown as { turnstile?: typeof api }).turnstile = api;
});
afterEach(cleanup);
const opts = () => api.render.mock.calls[0][1] as Opts;

describe("TurnstileField island (§4.2)", () => {
  it("renders the widget explicitly with the site key and action, inside its form, and shows Checking", async () => {
    render(<form><TurnstileField siteKey="1x00000000000000000000AA" action="signin" /></form>);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(opts()).toMatchObject({ sitekey: "1x00000000000000000000AA", action: "signin", "response-field-name": "cf-turnstile-response" });
    expect((api.render.mock.calls[0][0] as HTMLElement).closest("form")).not.toBeNull();
    expect(screen.getByText("Checking").className).toBe("botcheck");
  });

  it("reports the token and Bot check passed", async () => {
    const onToken = vi.fn();
    render(<TurnstileField siteKey="k" action="signin" onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => opts().callback("tok-1"));
    expect(onToken).toHaveBeenLastCalledWith("tok-1");
    expect(screen.getByText("Bot check passed")).toBeTruthy();
  });

  it("an error shows Bot check failed, clears the token and calls onError", async () => {
    const onToken = vi.fn(), onError = vi.fn();
    render(<TurnstileField siteKey="k" action="signin" onToken={onToken} onError={onError} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => opts()["error-callback"]());
    expect(screen.getByText("Bot check failed").className).toBe("botcheck is-failed failed");
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(onError).toHaveBeenCalled();
  });

  it("an expired token goes back to Checking", async () => {
    const onToken = vi.fn();
    render(<TurnstileField siteKey="k" action="signin" onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => opts().callback("tok-1"));
    act(() => opts()["expired-callback"]());
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("Checking")).toBeTruthy();
  });

  it("a new resetKey resets the widget for a fresh token", async () => {
    const onToken = vi.fn();
    const { rerender } = render(<TurnstileField siteKey="k" action="signin" onToken={onToken} resetKey={0} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => opts().callback("tok-1"));
    rerender(<TurnstileField siteKey="k" action="signin" onToken={onToken} resetKey={1} />);
    expect(api.reset).toHaveBeenCalledWith("w1");
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("Checking")).toBeTruthy();
  });

  it("loads Cloudflare's explicit-render script once, with the nonce, when Turnstile is not on the page", () => {
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    render(<><TurnstileField siteKey="k" action="flag" nonce="n1" /><TurnstileField siteKey="k" action="flag" nonce="n1" /></>);
    const scripts = document.head.querySelectorAll('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute("src")).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    expect(scripts[0].getAttribute("nonce")).toBe("n1");
  });
});
