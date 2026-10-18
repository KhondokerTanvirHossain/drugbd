// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import PublicPairCard from "@/components/public/PublicPairCard";

/* §6.7.3 (QA, D64) in a DOM: two Expanders in one card, told apart, each swapping only its own label's wording.
   PairCard.module.css is loaded as written (CSS Modules are non-scoped in tests, :global() unwrapped), so the
   sibling rules are the real ones. */
beforeAll(() => {
  const css = readFileSync(join(__dirname, "..", "components/ui/PairCard.module.css"), "utf8").replace(/:global\(([^)]*)\)/g, "$1");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
});
afterEach(cleanup);

const MG = "M".repeat(240), DESC = "D".repeat(260);
const renderCard = () => render(<PublicPairCard id="chk-0" severity="major" names="G Warfarin + Aspirin" heading="h4" reviewFirst
  review={{ state: "not_reviewed", reviewedAt: null }} text={{ kind: "management", body: MG }} description={DESC} source="Source: DDInter 2.0" />);
const shown = (el: Element) => getComputedStyle(el).display !== "none";
const kind = (id: string) => {
  const label = document.getElementById(id)!;
  return { closed: label.querySelector(".whenClosed")!, open: label.querySelector(".whenOpen")! };
};

describe("checker card with management and an interaction description (§6.7.3)", () => {
  it("each long text has its own Expander, targeting its own text and described by its own kind label", async () => {
    renderCard();
    const [mg, desc] = await screen.findAllByRole("button", { name: "Show full text" });
    expect(mg.getAttribute("aria-controls")).toBe("chk-0-text");
    expect(mg.getAttribute("aria-describedby")).toBe("chk-0-text-kind");
    expect(desc.getAttribute("aria-controls")).toBe("chk-0-desc");
    expect(desc.getAttribute("aria-describedby")).toBe("chk-0-desc-kind");
    expect(document.getElementById("chk-0-text")!.textContent).toBe(MG);
    expect(document.getElementById("chk-0-desc")!.textContent).toBe(DESC);
    expect(document.getElementById("chk-0-text-kind")!.textContent).toContain("Management, truncated.");
    expect(document.getElementById("chk-0-desc-kind")!.textContent).toContain("Interaction description, truncated.");
  });

  it("once hydrated both start clamped, each label reading truncated", async () => {
    renderCard();
    await screen.findAllByRole("button", { name: "Show full text" });
    for (const id of ["chk-0-text", "chk-0-desc"]) expect(document.getElementById(id)!.classList.contains("open")).toBe(false);
    for (const id of ["chk-0-text-kind", "chk-0-desc-kind"]) {
      expect(shown(kind(id).closed)).toBe(true);
      expect(shown(kind(id).open)).toBe(false);
    }
  });

  it("with the management text clamped, opening the description shows the description's own full-text label", async () => {
    renderCard();
    const [, desc] = await screen.findAllByRole("button", { name: "Show full text" });
    fireEvent.click(desc);
    expect(desc.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("chk-0-text")!.classList.contains("open")).toBe(false);
    expect(shown(kind("chk-0-desc-kind").open)).toBe(true);
    expect(shown(kind("chk-0-desc-kind").closed)).toBe(false);
    expect(shown(kind("chk-0-text-kind").closed)).toBe(true);
    expect(shown(kind("chk-0-text-kind").open)).toBe(false);
  });

  it("opening the management text leaves the clamped description's label reading truncated", async () => {
    renderCard();
    const [mg] = await screen.findAllByRole("button", { name: "Show full text" });
    fireEvent.click(mg);
    expect(shown(kind("chk-0-text-kind").open)).toBe(true);
    expect(shown(kind("chk-0-text-kind").closed)).toBe(false);
    expect(shown(kind("chk-0-desc-kind").closed)).toBe(true);
    expect(shown(kind("chk-0-desc-kind").open)).toBe(false);
  });
});
