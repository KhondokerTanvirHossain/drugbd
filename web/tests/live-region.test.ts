// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANNOUNCE_DELAY_MS, announce } from "@/lib/live-region";

afterEach(() => vi.useRealTimers());

describe("announce (§10.2)", () => {
  it("clears the region at once and writes the message after 60 ms", () => {
    vi.useFakeTimers();
    const region = document.createElement("p");
    region.textContent = "old";
    announce(region, "Sign-in cancelled.");
    expect(region.textContent).toBe("");
    vi.advanceTimersByTime(ANNOUNCE_DELAY_MS - 1);
    expect(region.textContent).toBe("");
    vi.advanceTimersByTime(1);
    expect(region.textContent).toBe("Sign-in cancelled.");
  });
  it("the returned cancel stops a pending write; a missing region is a no-op", () => {
    vi.useFakeTimers();
    const region = document.createElement("p");
    const cancel = announce(region, "x");
    cancel();
    vi.advanceTimersByTime(100);
    expect(region.textContent).toBe("");
    expect(() => announce(null, "x")()).not.toThrow();
  });
});
