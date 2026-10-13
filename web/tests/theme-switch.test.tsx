// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
import ThemeSwitch from "@/components/ThemeSwitch";

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.cookie = "intellidrugs-theme=; Max-Age=0; Path=/";
});
afterEach(cleanup);

describe("ThemeSwitch island", () => {
  it("is a labelled .seg group of System, Light and Dark with the current value pressed", () => {
    render(<ThemeSwitch value="system" />);
    const group = screen.getByRole("group", { name: "Colour theme" });
    expect(group.className).toBe("seg");
    expect(within(group).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")]))
      .toEqual([["System", "true"], ["Light", "false"], ["Dark", "false"]]);
  });

  it("changes the theme at once and writes the cookie, without a round trip", () => {
    render(<ThemeSwitch value="system" />);
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.cookie).toContain("intellidrugs-theme=dark");
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.cookie).toContain("intellidrugs-theme=system");
  });

  it("keeps a second switch on the page (footer and account menu) in step", () => {
    render(<><ThemeSwitch value="light" /><ThemeSwitch value="light" /></>);
    fireEvent.click(screen.getAllByRole("button", { name: "Dark" })[0]);
    expect(screen.getAllByRole("button", { name: "Dark" }).map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
  });

  it("is a real form whose buttons submit theme=value without JavaScript", () => {
    const { container } = render(<ThemeSwitch value="system" />);
    expect(container.querySelector("form")).not.toBeNull();
    expect([...container.querySelectorAll("button")].map((b) => [b.type, b.name, b.value]))
      .toEqual([["submit", "theme", "system"], ["submit", "theme", "light"], ["submit", "theme", "dark"]]);
  });
});
