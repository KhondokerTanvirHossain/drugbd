// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/review/0001-pilot";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import ReviewError from "@/app/review/error";

beforeEach(() => { pathname = "/review/0001-pilot"; vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("review error boundary (§5.12, §10.2 one polite region, no assertive regions)", () => {
  it("has no alert role and announces the banner title through the page's one polite region", () => {
    const { container } = render(<ReviewError error={new Error("boom")} reset={() => {}} />);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[aria-live="assertive"]')).toBeNull();
    const regions = container.querySelectorAll('[aria-live="polite"]');
    expect(regions).toHaveLength(1);
    expect(regions[0].className).toBe("sr-only");
    expect(regions[0].getAttribute("aria-atomic")).toBe("true");
    expect(regions[0].textContent).toBe("");
    act(() => { vi.advanceTimersByTime(60); });
    expect(regions[0].textContent).toBe("Couldn't load batch 0001-pilot.");
    // The visible banner and its copy are unchanged.
    expect(container.querySelector(".banner-title")?.textContent).toBe("Couldn't load batch 0001-pilot.");
    expect(container.querySelector(".banner-body")?.textContent).toBe("Nothing was changed. Check your connection and try again.");
  });

  it("Try again calls reset", () => {
    const reset = vi.fn();
    const { getByRole } = render(<ReviewError error={new Error("boom")} reset={reset} />);
    act(() => { getByRole("button").click(); });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("on /review/flags there is no batch id to name: the title is the sentence, no body, one polite region", () => {
    pathname = "/review/flags";
    const { container } = render(<ReviewError error={new Error("boom")} reset={() => {}} />);
    const expected = "Nothing was changed. Check your connection and try again.";
    expect(container.querySelector(".banner-title")?.textContent).toBe(expected);
    expect(container.querySelector(".banner-body")).toBeNull();
    const regions = container.querySelectorAll('[aria-live="polite"]');
    expect(regions).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(60); });
    expect(regions[0].textContent).toBe(expected);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it.each(["/review/pairs", "/review/substances", "/review/substances/BDS-000003"])("on %s: Couldn't load senior review. (§5.17.5)", (p) => {
    pathname = p;
    const { container } = render(<ReviewError error={new Error("boom")} reset={() => {}} />);
    expect(container.querySelector(".banner-title")?.textContent).toBe("Couldn't load senior review.");
    expect(container.querySelector(".banner-body")?.textContent).toBe("Nothing was changed. Check your connection and try again.");
  });
});
