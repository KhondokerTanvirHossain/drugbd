// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlossaryFilter from "@/components/learn/GlossaryFilter";
import { countText, haystack, matches } from "@/components/learn/glossary-filter";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const Fixture = () => (
  <>
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-learn-live="" />
    <div><GlossaryFilter /></div>
    <dl id="gl-list">
      <div data-gl-item=""><dt>Salt</dt><dd><p>The salt form a product is registered as.</p><p>Pilot: Metformin Hydrochloride Salt removed Metformin</p></dd></div>
      <div data-gl-item=""><dt>DAR number</dt><dd><p>The DGDA registration number of a product.</p><p>Pilot: Napa 186-0030-006</p></dd></div>
      <div data-gl-item=""><dt>Drug–food</dt><dd><p>A DDInter record about a substance taken with a food.</p><p>Pilot: Warfarin, 2 records</p></dd></div>
    </dl>
  </>
);
const items = () => [...document.querySelectorAll<HTMLElement>("[data-gl-item]")];
const visible = () => items().filter((i) => !i.hidden).map((i) => i.querySelector("dt")!.textContent);
/** The visible count line (plain text) and the page's one live region (§10.2), read separately. */
const count = () => document.querySelector("[data-gl-count]")!.textContent;
const announced = () => document.querySelector("[data-learn-live]")!.textContent;
const type = (value: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Filter the glossary" }), { target: { value } });
const settle = () => act(() => { vi.advanceTimersByTime(350 + 60); });

describe("glossary filter, pure parts (§6.8)", () => {
  it("treats the query as literal text: case, spaces and metacharacters (Review Focus 3)", () => {
    const hay = haystack("Drug–food  A DDInter record (100%) about a.b food");
    for (const q of ["DRUG–FOOD", "  drug–food  ", "(100%)", "a.b", "record   (100%)"]) expect(matches(hay, q)).toBe(true);
    for (const q of [".*", "a.c", "drug-food", "[", "%%", "\\"]) expect(matches(hay, q)).toBe(false);
    expect(matches(hay, "   ")).toBe(true);
  });

  it("words the count", () => {
    expect(countText(55, 55, "")).toBe("Showing all 55 terms");
    expect(countText(3, 55, "salt")).toBe("Showing 3 of 55 terms");
    expect(countText(55, 55, "  ")).toBe("Showing all 55 terms");
  });
});

describe("GlossaryFilter island (§4.2, §6.8)", () => {
  it("renders nothing on the server, so without JavaScript every term shows and there is no input", () => {
    expect(renderToStaticMarkup(<GlossaryFilter />)).toBe("");
  });

  it("once hydrated: the labelled input, its placeholder and the count; the island adds no live region of its own", () => {
    render(<Fixture />);
    const box = screen.getByRole("searchbox", { name: "Filter the glossary" });
    expect(box.getAttribute("placeholder")).toBe("Filter terms, for example salt or DAR");
    expect(count()).toBe("Showing all 3 terms");
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
  });

  it("matches term, definition and example; the count and the announcement follow 350 ms after typing stops", () => {
    render(<Fixture />);
    type("DAR");
    expect(visible()).toEqual(["DAR number"]);
    act(() => { vi.advanceTimersByTime(300); });
    expect(count()).toBe("Showing all 3 terms");
    expect(announced()).toBe("");
    settle();
    expect(count()).toBe("Showing 1 of 3 terms");
    expect(announced()).toBe("Showing 1 of 3 terms");
    type("hydrochloride");
    expect(visible()).toEqual(["Salt"]);
    type("taken with a food");
    expect(visible()).toEqual(["Drug–food"]);
  });

  it("no match: the empty state; Clear the filter empties the field, shows every term and focuses the input", () => {
    render(<Fixture />);
    type(".*");
    expect(visible()).toEqual([]);
    expect(screen.getByText("No terms match.", { exact: false }).hidden).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Clear the filter" }));
    const box = screen.getByRole("searchbox", { name: "Filter the glossary" }) as HTMLInputElement;
    expect(box.value).toBe("");
    expect(document.activeElement).toBe(box);
    expect(visible()).toHaveLength(3);
    settle();
    expect(count()).toBe("Showing all 3 terms");
  });

  it("Esc clears a filled field", () => {
    render(<Fixture />);
    type("salt");
    expect(visible()).toEqual(["Salt"]);
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Filter the glossary" }), { key: "Escape" });
    expect(visible()).toHaveLength(3);
  });
});
