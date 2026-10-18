// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnstileFieldProps } from "@/components/TurnstileField";
import type { QaKeyView } from "@/lib/qa-key-types";

/* §5.18, §11.1 "QA keys island": the QaKeys island on /review/qa. */

const createQaKeyAction = vi.fn();
const revokeQaKeyAction = vi.fn();
const turnstile: { props: TurnstileFieldProps | null } = { props: null };
vi.mock("@/lib/qa-key-actions", () => ({
  createQaKeyAction: (fd: FormData) => createQaKeyAction(fd), revokeQaKeyAction: (fd: FormData) => revokeQaKeyAction(fd),
}));
vi.mock("@/components/TurnstileField", () => ({ default: (p: TurnstileFieldProps) => { turnstile.props = p; return <div data-turnstile={p.action} />; } }));

import QaKeys from "@/components/qa/QaKeys";
import { QA_LIVE_ID } from "@/components/qa/live";

const KEY = `idqa_${"A".repeat(20)}-${"b".repeat(22)}`;
const row = (id: number, over: Partial<QaKeyView> = {}): QaKeyView => ({ id, name: `Key ${id}`, createdAt: "2026-10-18T03:00:00Z",
  expiresAt: "2027-01-16T03:00:00Z", lastUsedAt: null, status: "active", ...over });
const ROWS: QaKeyView[] = [
  row(3, { name: "CI laptop" }),
  row(2, { name: "Old script", status: "expired", lastUsedAt: "2026-10-01T06:30:00Z" }),
  row(1, { name: "Cursor", status: "revoked" }),
];
const NEW_ROW = row(9, { name: "New laptop" });

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 80)); });
const live = () => document.getElementById(QA_LIVE_ID)!.textContent;
const nameInput = () => screen.getByLabelText("Key name") as HTMLInputElement;
const createButton = () => document.getElementById("qa-key-create") as HTMLButtonElement;

async function mount(keys: QaKeyView[] = ROWS, siteKey: string | null = "1x00000000000000000000AA") {
  const r = render(<>
    <div id={QA_LIVE_ID} role="status" className="sr-only" />
    <h2 id="keys" tabIndex={-1}>Your keys</h2>
    <QaKeys keys={keys} siteKey={siteKey} nonce="n0nce" />
    <a href="/search">Elsewhere</a>
  </>);
  await act(async () => {});
  if (siteKey) act(() => turnstile.props!.onToken!("tok-1"));
  return r;
}
async function createNamed(name: string) {
  fireEvent.change(nameInput(), { target: { value: name } });
  await act(async () => { fireEvent.submit(nameInput().form!); });
  await settle();
}
const bodyRow = (name: string) => screen.getByText(name, { selector: "td" }).closest("tr")!;

beforeEach(() => {
  createQaKeyAction.mockReset();
  revokeQaKeyAction.mockReset();
  turnstile.props = null;
  createQaKeyAction.mockResolvedValue({ code: "created", key: KEY, row: NEW_ROW });
  revokeQaKeyAction.mockResolvedValue({ code: "revoked", row: { ...ROWS[0], status: "revoked" } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("the key list (§5.18)", () => {
  it("each status in plain text, Dhaka dates, Never, and Revoke on active rows only", async () => {
    await mount();
    const region = screen.getByRole("region", { name: "Your QA keys" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(within(region).getByText("Your QA keys", { selector: "caption" }).className).toBe("sr-only");
    const heads = within(region).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["Name", "Created", "Expires", "Last used", "Status", "Actions"]);
    expect(within(bodyRow("CI laptop")).getAllByRole("cell").map((c) => c.textContent)).toEqual(
      ["CI laptop", "18/10/2026 09:00 Dhaka", "16/01/2027 09:00 Dhaka", "Never", "Active", "Revoke key CI laptop"]);
    expect(within(bodyRow("Old script")).getAllByRole("cell").map((c) => c.textContent)).toEqual(
      ["Old script", "18/10/2026 09:00 Dhaka", "16/01/2027 09:00 Dhaka", "01/10/2026 12:30 Dhaka", "Expired", ""]);
    expect(within(bodyRow("Cursor")).getAllByRole("cell")[4].textContent).toBe("Revoked");
    expect(screen.getAllByRole("button", { name: /^Revoke/ })).toHaveLength(1);
    expect(document.querySelector(".rv, .pill")).toBeNull();
  });

  it("empty: You have no keys yet.", async () => {
    await mount([]);
    expect(screen.getByText("You have no keys yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("the server HTML: the create and revoke buttons wait for JavaScript, the noscript line and the list read without it", () => {
    const html = renderToStaticMarkup(<QaKeys keys={ROWS} siteKey="1x00000000000000000000AA" />);
    expect(html).toMatch(/<button[^>]*id="qa-key-create"[^>]*hidden=""|<button[^>]*hidden=""[^>]*id="qa-key-create"/);
    expect(html).toContain("<noscript><p>Creating and revoking keys needs JavaScript for the bot check.</p></noscript>");
    expect(html).toContain("CI laptop");
    expect(html).toContain('data-turnstile="qakey"');
    expect(html).not.toContain("idqa_");
  });
});

describe("create (§5.18, §7.10.5)", () => {
  it("sends the trimmed name and the bot-check token; the one-time panel takes focus and the key shows once", async () => {
    await mount();
    await createNamed("  New laptop  ");
    expect(createQaKeyAction).toHaveBeenCalledTimes(1);
    const fd = createQaKeyAction.mock.calls[0][0] as FormData;
    expect([...fd.keys()].sort()).toEqual(["cf-turnstile-response", "name"]);
    expect(fd.get("name")).toBe("New laptop");
    expect(fd.get("cf-turnstile-response")).toBe("tok-1");
    const heading = screen.getByRole("heading", { level: 3, name: "Copy your new key now" });
    expect(document.activeElement).toBe(heading);
    expect(heading.closest("section")!.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(screen.getByText("This is the only time it is shown. IntelliDrugs keeps only a fingerprint of it and can't show it again.")).toBeTruthy();
    expect(screen.getByText("Key New laptop")).toBeTruthy();
    expect(document.getElementById("qa-new-key")!.textContent).toBe(KEY);
    expect(document.body.innerHTML.split(KEY)).toHaveLength(2);   // exactly once
    expect(screen.getByRole("button", { name: "Copy key" })).toBeTruthy();
    expect(bodyRow("New laptop")).toBeTruthy();
    expect(nameInput().value).toBe("");
    expect(turnstile.props!.resetKey).toBeGreaterThan(0);   // the token was single-use
    expect(live()).toBe("Key New laptop created. Copy it now; it is shown only once.");
  });

  it("the key is never written to storage, a cookie or the URL", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    await mount();
    await createNamed("New laptop");
    expect(setItem).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain("idqa_");
    expect(window.location.href).not.toContain("idqa_");
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).not.toContain("idqa_");
  });

  it("I've saved it removes the key from the DOM and focuses Your keys; beforeunload is armed only while the panel is open", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    await mount();
    const unloadNow = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(unloadNow()).toBe(false);
    await createNamed("New laptop");
    expect(add.mock.calls.filter(([t]) => t === "beforeunload")).toHaveLength(1);
    expect(unloadNow()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "I've saved it" }));
    await settle();
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(screen.queryByRole("heading", { name: "Copy your new key now" })).toBeNull();
    expect(document.activeElement).toBe(document.getElementById("keys"));
    expect(remove.mock.calls.filter(([t]) => t === "beforeunload")).toHaveLength(1);
    expect(unloadNow()).toBe(false);
  });

  it.each([["empty", ""], ["blank", "   "], ["41 characters", "x".repeat(41)], ["a control character", "a\u0007b"]])(
    "a bad name (%s): the field error, aria-invalid, focus on the field, nothing sent", async (_n, name) => {
      await mount();
      await createNamed(name);
      expect(createQaKeyAction).not.toHaveBeenCalled();
      expect(nameInput().getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByText("Name the key with 1–40 characters.", { selector: ".field-error" })).toBeTruthy();
      expect(document.getElementById("qa-key-name-meta")!.contains(document.querySelector(".field-error"))).toBe(true);
      expect(document.activeElement).toBe(nameInput());
    });

  it("the counter counts code points; the field keeps maxlength 40 and autocomplete off", async () => {
    await mount();
    expect(screen.getByText("0 of 40")).toBeTruthy();
    fireEvent.change(nameInput(), { target: { value: "ল্যাপ" } });
    expect(screen.getByText(`${[..."ল্যাপ"].length} of 40`)).toBeTruthy();
    expect(nameInput().maxLength).toBe(40);
    expect(nameInput().getAttribute("autocomplete")).toBe("off");
  });

  it("at 5 active keys Create key is aria-disabled with the hint, and a press sends nothing", async () => {
    await mount([1, 2, 3, 4, 5].map((i) => row(i)));
    expect(createButton().getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById("qa-key-name-meta")!.textContent).toContain("You have 5 active keys. Revoke one to create another.");
    await createNamed("Sixth");
    expect(createQaKeyAction).not.toHaveBeenCalled();
    expect(live()).toBe("You have 5 active keys. Revoke one to create another.");
  });

  it.each([
    ["active_limit", "banner--warn", "You already have 5 active keys.", "No key was created. Revoke one, then create another.", null],
    ["daily_limit", "banner--warn", "You've created 10 keys in the last 24 hours.", "No key was created. Try again tomorrow.", null],
    ["captcha", "banner--crit", "We couldn't confirm you're a person.", "No key was created. Retry the check, then try again.", "Retry check"],
    ["forbidden", "banner--info", "Your account no longer has QA access.", "No key was created. Ask the IntelliDrugs team if you need QA access.", null],
    ["unauthenticated", "banner--warn", "Your sign-in expired.", "No key was created. Sign in again to continue.", "Sign in"],
    ["failed", "banner--crit", "Couldn't create the key.", "If a new key appears in your list, revoke it: it can't be shown again. Check your connection and try again.", "Try again"],
  ])("%s: the §5.18 banner, announced; the typed name stays, and no key shows", async (code, tone, title, body, actionLabel) => {
    createQaKeyAction.mockResolvedValueOnce({ code });
    await mount();
    await createNamed("New laptop");
    const banner = screen.getByText(title).closest(".banner")!;
    expect(banner.classList.contains(tone)).toBe(true);
    expect(within(banner as HTMLElement).getByText(body)).toBeTruthy();
    if (actionLabel) expect(within(banner as HTMLElement).getByText(actionLabel)).toBeTruthy();
    if (code === "unauthenticated") expect(within(banner as HTMLElement).getByText("Sign in").getAttribute("href")).toBe("/signin?returnTo=%2Freview%2Fqa");
    expect(live()).toBe(`${title} ${body}`);
    expect(nameInput().value).toBe("New laptop");
    expect(document.body.innerHTML).not.toContain("idqa_");
  });

  it("a thrown action is failed; Try again submits the form again", async () => {
    createQaKeyAction.mockRejectedValueOnce(new Error("network"));
    await mount();
    await createNamed("New laptop");
    expect(screen.getByText("Couldn't create the key.")).toBeTruthy();
    act(() => turnstile.props!.onToken!("tok-2"));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Try again" })); });
    await settle();
    expect(createQaKeyAction).toHaveBeenCalledTimes(2);
    expect((createQaKeyAction.mock.calls[1][0] as FormData).get("cf-turnstile-response")).toBe("tok-2");
    expect(screen.getByRole("heading", { name: "Copy your new key now" })).toBeTruthy();
  });

  it("no bot check configured or a failed widget: captcha without a call; Retry check resets the widget and focuses Create key", async () => {
    await mount(ROWS, null);
    await createNamed("New laptop");
    expect(createQaKeyAction).not.toHaveBeenCalled();
    expect(screen.getByText("We couldn't confirm you're a person.")).toBeTruthy();
    cleanup();
    await mount();
    act(() => turnstile.props!.onError!());
    const before = turnstile.props!.resetKey ?? 0;
    vi.useFakeTimers();
    fireEvent.change(nameInput(), { target: { value: "New laptop" } });
    await act(async () => { fireEvent.submit(nameInput().form!); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    vi.useRealTimers();
    await settle();
    expect(createQaKeyAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    await settle();
    expect(turnstile.props!.resetKey).toBeGreaterThan(before);
    expect(screen.queryByText("We couldn't confirm you're a person.")).toBeNull();
    expect(document.activeElement).toBe(createButton());
  });
});

describe("revoke (§5.18)", () => {
  const revokeButton = () => screen.getByRole("button", { name: "Revoke key CI laptop" });
  const confirmButton = () => screen.getByRole("button", { name: "Revoke key" });

  it("Revoke opens the inline confirmation with focus on Revoke key; Esc and Cancel return focus to Revoke", async () => {
    await mount();
    fireEvent.click(revokeButton());
    await settle();
    expect(screen.getByText("Revoke CI laptop? Clients using it stop working at once.")).toBeTruthy();
    expect(document.activeElement).toBe(confirmButton());
    expect(confirmButton().className).toContain("btn--destructive");
    fireEvent.keyDown(confirmButton(), { key: "Escape" });
    await settle();
    expect(screen.queryByText("Revoke CI laptop? Clients using it stop working at once.")).toBeNull();
    expect(document.activeElement).toBe(revokeButton());
    fireEvent.click(revokeButton());
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await settle();
    expect(document.activeElement).toBe(revokeButton());
    expect(revokeQaKeyAction).not.toHaveBeenCalled();
  });

  it("Enter on Revoke only opens the confirmation; a held Enter does not press Revoke key", async () => {
    await mount();
    revokeButton().focus();
    fireEvent.keyDown(revokeButton(), { key: "Enter" });
    fireEvent.click(revokeButton());
    await settle();
    const repeat = fireEvent.keyDown(confirmButton(), { key: "Enter", repeat: true });
    expect(repeat).toBe(false);   // default prevented: no activation
    expect(revokeQaKeyAction).not.toHaveBeenCalled();
  });

  it("revoked: the row reads Revoked, its action cell empties, it is announced and focus moves to Your keys", async () => {
    await mount();
    fireEvent.click(revokeButton());
    await settle();
    await act(async () => { fireEvent.click(confirmButton()); });
    await settle();
    const fd = revokeQaKeyAction.mock.calls[0][0] as FormData;
    expect([...fd.entries()]).toEqual([["keyId", "3"], ["cf-turnstile-response", "tok-1"]]);
    const cells = within(bodyRow("CI laptop")).getAllByRole("cell");
    expect(cells[4].textContent).toBe("Revoked");
    expect(cells[5].textContent).toBe("");
    expect(live()).toBe("Key CI laptop revoked.");
    expect(document.activeElement).toBe(document.getElementById("keys"));
    expect(createButton().getAttribute("aria-disabled")).toBeNull();
  });

  it("already_revoked: the row reads Revoked, with the status line and the announcement", async () => {
    revokeQaKeyAction.mockResolvedValueOnce({ code: "already_revoked" });
    await mount();
    fireEvent.click(revokeButton());
    await settle();
    await act(async () => { fireEvent.click(confirmButton()); });
    await settle();
    expect(within(bodyRow("CI laptop")).getAllByRole("cell")[4].textContent).toBe("Revoked");
    expect(screen.getByText("Key CI laptop was already revoked.", { selector: "p:not([role])" })).toBeTruthy();
    expect(live()).toBe("Key CI laptop was already revoked.");
  });

  it.each([
    ["not_found", "banner--warn", "That key isn't in your list any more.", "Nothing was changed. Reload the page.", "Reload"],
    ["invalid", "banner--warn", "That key isn't in your list any more.", "Nothing was changed. Reload the page.", "Reload"],
    ["rate_limited", "banner--warn", "Too many changes to your keys.", "Nothing was changed. Wait a few minutes and try again.", null],
    ["captcha", "banner--crit", "We couldn't confirm you're a person.", "No key was revoked. Retry the check, then try again.", "Retry check"],
    ["forbidden", "banner--info", "Your account no longer has QA access.", "No key was revoked. Ask the IntelliDrugs team if you need QA access.", null],
    ["unauthenticated", "banner--warn", "Your sign-in expired.", "No key was revoked. Sign in again to continue.", "Sign in"],
    ["failed", "banner--crit", "Couldn't revoke the key.", "It still works. Check your connection and try again.", "Try again"],
  ])("%s: the banner, announced; the row stays Active and focus stays on Revoke key", async (code, tone, title, body, actionLabel) => {
    revokeQaKeyAction.mockResolvedValueOnce({ code });
    await mount();
    fireEvent.click(revokeButton());
    await settle();
    confirmButton().focus();
    await act(async () => { fireEvent.click(confirmButton()); });
    await settle();
    const banner = screen.getByText(title).closest(".banner") as HTMLElement;
    expect(banner.classList.contains(tone)).toBe(true);
    expect(within(banner).getByText(body)).toBeTruthy();
    if (actionLabel) expect(within(banner).getByText(actionLabel)).toBeTruthy();
    if (code === "not_found") expect(within(banner).getByText("Reload").getAttribute("href")).toBe("/review/qa");
    expect(live()).toBe(`${title} ${body}`);
    expect(within(bodyRow("CI laptop")).getAllByRole("cell")[4].textContent).toBe("Active");
    expect(document.activeElement).toBe(confirmButton());
  });
});
