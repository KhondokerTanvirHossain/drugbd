// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/review/0001-pilot" }));

import ReviewError from "@/app/review/error";

beforeEach(() => { vi.useFakeTimers(); });
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
});
