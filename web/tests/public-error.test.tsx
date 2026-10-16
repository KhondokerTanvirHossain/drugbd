// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/search";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import PublicError from "@/app/error";
import { NEW_COPY, NEW_COPY_ROWS } from "@/lib/copy";

const T = NEW_COPY[NEW_COPY_ROWS.pageError];
beforeEach(() => { pathname = "/search"; vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

/*
 * Final review finding 3: /search, /products/[id] and /substances/[id] throw on an API 5xx or timeout. The root error
 * boundary renders inside the root layout's skip link, header and <main> (§10.1), as a crit Banner that says nothing was
 * changed (§3.5), with Try again (reset()).
 */
describe("public error boundary (§4.2 ErrorBoundary, §3.5, §10.1, §10.2, §10.5)", () => {
  it("a crit banner whose title is the page's one h1, the nothing-was-changed body, and Try again calling reset", () => {
    const reset = vi.fn();
    const { container, getByRole } = render(<PublicError error={new Error("search failed (503)")} reset={reset} />);
    const banner = container.querySelector(".banner.banner--crit");
    expect(banner).not.toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1.banner-title")?.textContent).toBe("Couldn't load this page.");
    expect(container.querySelector(".banner-body")?.textContent).toBe("Nothing was changed. Check your connection and try again.");
    expect(container.textContent).not.toMatch(/Something went wrong|search failed/);
    act(() => { getByRole("button", { name: T.tryAgain }).click(); });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("owns the page's one polite sr-only region, announces the title after 60 ms, and has no alert or assertive region", () => {
    const { container } = render(<PublicError error={new Error("boom")} reset={() => {}} />);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[aria-live="assertive"]')).toBeNull();
    const regions = container.querySelectorAll('[aria-live="polite"]');
    expect(regions).toHaveLength(1);
    expect(regions[0].className).toBe("sr-only");
    expect(regions[0].getAttribute("aria-atomic")).toBe("true");
    expect(regions[0].textContent).toBe("");
    act(() => { vi.advanceTimersByTime(60); });
    expect(regions[0].textContent).toBe(T.title);
  });

  it("inside the site chrome it adds no <main> (the root layout's); on a Learn chapter it brings the skip link and <main>", () => {
    expect(render(<PublicError error={new Error("boom")} reset={() => {}} />).container.querySelector("main")).toBeNull();
    cleanup();
    pathname = "/learn/start";
    const { container } = render(<PublicError error={new Error("boom")} reset={() => {}} />);
    expect(container.querySelector("main#content h1")?.textContent).toBe(T.title);
    expect(container.querySelector('a[href="#content"]')?.textContent).toBe("Skip to content");
  });

  it("stays light: the root boundary loads on every page, so it never imports lib/copy (§10.6)", () => {
    const src = readFileSync(join(process.cwd(), "app/error.tsx"), "utf8")   // jsdom: import.meta.url is not a file URL;
    expect(src).toMatch(/^"use client";/);
    expect(src).not.toMatch(/from "@\/lib\/copy"/);
    expect(src).toMatch(/from "@\/lib\/page-error-copy"/);
  });
});
