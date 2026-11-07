// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn(), replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
import HeaderSearch from "@/components/HeaderSearch";
import CheckerCombobox from "@/components/check/CheckerCombobox";
import SuggestOptionBody from "@/components/suggest/SuggestOptionBody";
import Header from "@/components/Header";
import { NOT_REVIEWED, PROBLEM_REPORTED } from "@/lib/copy";

/** §6.1 / §6.11.1: the field as it was before D75, which the island's server render must still be, byte for byte. React 19's
 *  server renderer writes an input's name and value after its other attributes. */
const PLAIN = '<label class="search"><span class="sr-only">Search medicines</span><input type="search" '
  + 'placeholder="Brand, substance or DAR number" minLength="2" maxLength="100" name="q" value="napa"/></label>';
/** The header's field before D75, as Header.tsx wrote it. */
const BEFORE = (
  <label className="search">
    <span className="sr-only">Search medicines</span>
    <input type="search" name="q" defaultValue="napa" placeholder="Brand, substance or DAR number" minLength={2} maxLength={100} />
  </label>
);

const ROWS = [
  { conceptId: "186-0030-006--napa", tradeName: "Napa", status: "approved", review: null, clinicalDisplayName: "Acetaminophen 500 mg tablet",
    matched: { name: "Paracetamol", substance: "Acetaminophen" } },
  { conceptId: "H", tradeName: "Hidasprin", status: "not_reviewed", review: null, clinicalDisplayName: null, matched: null },
  { conceptId: "N/2", tradeName: "Napa Extend", status: "not_reviewed", review: "not_reviewed", clinicalDisplayName: "Acetaminophen 665 mg tablet", matched: null },
  { conceptId: "C", tradeName: "Napadol", status: "not_reviewed", review: "problem", clinicalDisplayName: "Acetaminophen 1000 mg tablet", matched: null },
];
const fetchMock = vi.fn();
const submit = vi.fn((e: Event) => e.preventDefault());
beforeEach(() => {
  push.mockReset(); replace.mockReset(); submit.mockClear();
  fetchMock.mockReset(); fetchMock.mockImplementation(async () => new Response(JSON.stringify(ROWS), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Bar({ q = "" }: { q?: string }) {
  return (
    <>
      <form role="search" method="get" action="/search" onSubmit={(e) => submit(e.nativeEvent)}><HeaderSearch q={q} /></form>
      <button type="button">Elsewhere</button>
    </>
  );
}
const input = () => screen.getByRole("combobox", { name: "Search medicines" }) as HTMLInputElement;
const options = () => [...document.querySelectorAll<HTMLElement>("#hs-list > li")];
async function typeAndOpen(value: string, n = 4) {
  input().focus();
  fireEvent.change(input(), { target: { value } });
  await waitFor(() => expect(options()).toHaveLength(n), { timeout: 1500 });
  await waitFor(() => expect(input().getAttribute("aria-expanded")).toBe("true"));
}

describe("HeaderSearch without JavaScript (§6.11.1)", () => {
  it("the server render is exactly the §6.1 field: no combobox, no list, no help", () => {
    expect(renderToStaticMarkup(BEFORE)).toBe(PLAIN);
    expect(renderToStaticMarkup(<HeaderSearch q="napa" />)).toBe(PLAIN);
    expect(renderToStaticMarkup(<HeaderSearch q="" />)).toBe(PLAIN.replace(' value="napa"', ' value=""'));
  });

  it("the header's GET form holds the same field, on every page with the search bar", () => {
    for (const path of ["/search", "/products/x", "/substances/BDS-1", "/check"]) {
      const html = renderToStaticMarkup(<Header session={null} theme="system" path={path} q="napa" />);
      expect(html, path).toContain(`action="/search" method="get">${PLAIN}</form>`);
      expect(html, path).not.toMatch(/role="combobox"|hs-list|hs-help/);
    }
  });
});

describe("HeaderSearch once it runs (§6.11.1)", () => {
  it("is an ARIA 1.2 combobox with the hs-* ids and the sr-only help", () => {
    render(<Bar q="napa" />);
    const el = input();
    expect(el.id).toBe("hs-input");
    expect(el.getAttribute("aria-autocomplete")).toBe("list");
    expect(el.getAttribute("aria-expanded")).toBe("false");
    expect(el.getAttribute("aria-controls")).toBe("hs-list");
    expect(el.getAttribute("aria-activedescendant")).toBeNull();
    expect(el.getAttribute("aria-describedby")).toBe("hs-help");
    expect(el.getAttribute("autocomplete")).toBe("off");
    expect(el.name).toBe("q");
    expect(el.type).toBe("search");
    expect(el.value).toBe("napa");
    const help = document.getElementById("hs-help")!;
    expect(help.textContent).toBe("Suggestions appear as you type. Up and down arrows to move, Enter to open, Esc to close.");
    expect(help.className).toBe("sr-only");
    const list = document.getElementById("hs-list")!;
    expect(list.getAttribute("role")).toBe("listbox");
    expect(list.hidden).toBe(true);
    expect(document.querySelector('[id^="cx-"]')).toBeNull();
  });

  it("asks /check/suggest after 2 characters (code points, after trim) and never sends ids", async () => {
    render(<Bar />);
    input().focus();
    fireEvent.change(input(), { target: { value: " n " } });
    fireEvent.change(input(), { target: { value: "প" } });
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(fetchMock).not.toHaveBeenCalled();
    await typeAndOpen("na", 4);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("/check/suggest?q=na");
  });

  it("keeps only rows with clinical data, then 'All results for “{q}”'; no option is active", async () => {
    render(<Bar />);
    await typeAndOpen(" nap ", 4);
    const opts = options();
    expect(opts.map((o) => o.id)).toEqual(["hs-opt-0", "hs-opt-1", "hs-opt-2", "hs-opt-3"]);
    expect(opts.map((o) => o.querySelector("span")?.textContent ?? o.textContent)).toEqual(["Napa", "Napa Extend", "Napadol", "All results for “nap”"]);
    expect(document.getElementById("hs-list")!.textContent).not.toContain("Hidasprin");
    expect(opts.every((o) => o.getAttribute("role") === "option" && o.getAttribute("aria-selected") === "false")).toBe(true);
    expect(opts.every((o) => o.classList.contains("s-opt"))).toBe(true);
    expect(input().getAttribute("aria-activedescendant")).toBeNull();
    expect(opts[0].textContent).toBe("NapaAcetaminophen 500 mg tablet. Matches Paracetamol, a name for Acetaminophen");
    expect(opts[1].textContent).toBe(`Napa ExtendAcetaminophen 665 mg tablet${NOT_REVIEWED}`);
    expect(opts[2].textContent).toBe(`NapadolAcetaminophen 1000 mg tablet${NOT_REVIEWED}${PROBLEM_REPORTED}`);
  });

  it("at most 10 medicine options, in the API's order", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...ROWS[0], conceptId: `P${i}`, tradeName: `Napa ${i}` }));
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(many), { status: 200 }));
    render(<Bar />);
    await typeAndOpen("napa", 11);
    expect(options().slice(0, 10).map((o) => o.querySelector("span")!.textContent)).toEqual(many.slice(0, 10).map((r) => r.tradeName));
  });

  it("Enter without arrowing lets the form submit natively", async () => {
    render(<Bar />);
    await typeAndOpen("nap");
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(true);   // not prevented: the browser submits the GET form
    expect(push).not.toHaveBeenCalled();
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("ArrowDown and Enter on a medicine opens its product page with router.push", async () => {
    render(<Bar />);
    await typeAndOpen("nap");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe("hs-opt-0");
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe("hs-opt-1");
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(false);
    expect(push).toHaveBeenCalledWith("/products/N%2F2");
    expect(submit).not.toHaveBeenCalled();
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("the arrows reach 'All results', and Enter on it submits the form", async () => {
    render(<Bar />);
    await typeAndOpen("nap");
    for (let i = 0; i < 6; i++) fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe("hs-opt-3");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().getAttribute("aria-activedescendant")).toBe("hs-opt-2");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("on a closed list ArrowDown opens it at the first option and ArrowUp at the last", async () => {
    render(<Bar />);
    await typeAndOpen("nap");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(input().getAttribute("aria-activedescendant")).toBe("hs-opt-3");
    fireEvent.keyDown(input(), { key: "Escape" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe("hs-opt-0");
  });

  it("a click on an option is the same as Enter on it", async () => {
    render(<Bar />);
    await typeAndOpen("nap");
    expect(fireEvent.mouseDown(options()[2])).toBe(false);   // focus stays in the field
    fireEvent.click(options()[2]);
    expect(push).toHaveBeenCalledWith("/products/C");
    await typeAndOpen("napa");
    fireEvent.click(options()[3]);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("Esc closes an open list without clearing; on a closed list it is left to the search input", async () => {
    render(<Bar />);
    await typeAndOpen("nap");
    expect(fireEvent.keyDown(input(), { key: "Escape" })).toBe(false);
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().value).toBe("nap");
    expect(fireEvent.keyDown(input(), { key: "Escape" })).toBe(true);
    fireEvent.change(input(), { target: { value: "" } });   // what the browser's own clear fires
    expect(input().getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("Tab, blur and a click outside close the list", async () => {
    render(<Bar />);
    await typeAndOpen("nap");
    fireEvent.keyDown(input(), { key: "Tab" });
    expect(input().getAttribute("aria-expanded")).toBe("false");
    await typeAndOpen("napa");
    fireEvent.click(document.body);
    await waitFor(() => expect(input().getAttribute("aria-expanded")).toBe("false"));
    await typeAndOpen("nap");
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    await waitFor(() => expect(input().getAttribute("aria-expanded")).toBe("false"));
  });

  it("a stale response never lands, and one that lands after focus left never opens the list", async () => {
    let first!: (r: Response) => void;
    fetchMock.mockReset();
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { first = r; }))
      .mockResolvedValueOnce(new Response(JSON.stringify([ROWS[3]]), { status: 200 }));
    render(<Bar />);
    input().focus();
    fireEvent.change(input(), { target: { value: "na" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(input(), { target: { value: "napad" } });
    await waitFor(() => expect(options()).toHaveLength(2));
    await act(async () => { first(new Response(JSON.stringify(ROWS), { status: 200 })); await new Promise((r) => setTimeout(r, 20)); });
    expect(options().map((o) => o.querySelector("span")?.textContent ?? o.textContent)).toEqual(["Napadol", "All results for “napad”"]);

    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(ROWS), { status: 200 }));
    fireEvent.keyDown(input(), { key: "Escape" });
    fireEvent.change(input(), { target: { value: "napa" } });
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("typing clears the highlight and the old rows at once, so Enter then searches for the new text", async () => {
    render(<Bar />);
    await typeAndOpen("nap");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe("hs-opt-1");
    fireEvent.change(input(), { target: { value: "napr" } });
    expect(input().getAttribute("aria-activedescendant")).toBeNull();
    expect(options().map((o) => o.textContent)).toEqual(["All results for “napr”"]);
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(true);   // not prevented: the browser submits "napr"
    expect(push).not.toHaveBeenCalled();
  });

  it("after Esc and more typing, ArrowDown never reopens the earlier query's rows", async () => {
    render(<Bar />);
    await typeAndOpen("nap");
    fireEvent.keyDown(input(), { key: "Escape" });
    fireEvent.change(input(), { target: { value: "napx" } });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(options().map((o) => o.textContent)).toEqual(["All results for “napx”"]);
    expect(fireEvent.keyDown(input(), { key: "Enter" })).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it("ArrowDown on a prefilled field asks for its rows; 'All results', once moved onto, stays active when they land", async () => {
    render(<Bar q="nap" />);
    input().focus();
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe("hs-opt-0");
    expect(options().map((o) => o.textContent)).toEqual(["All results for “nap”"]);
    await waitFor(() => expect(options()).toHaveLength(4), { timeout: 1500 });
    expect(String(fetchMock.mock.calls[0][0])).toBe("/check/suggest?q=nap");
    expect(input().getAttribute("aria-activedescendant")).toBe("hs-opt-3");
    expect(options()[3].getAttribute("aria-selected")).toBe("true");
  });

  it("text that trims to the same query keeps its rows and asks nothing more", async () => {
    render(<Bar />);
    await typeAndOpen("nap");
    fireEvent.change(input(), { target: { value: "nap " } });
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(options()).toHaveLength(4);
    expect(input().getAttribute("aria-expanded")).toBe("true");
  });

  it("a failed request opens only 'All results'", async () => {
    fetchMock.mockImplementation(async () => new Response("[]", { status: 502 }));
    render(<Bar />);
    await typeAndOpen("nap", 1);
    expect(options()[0].textContent).toBe("All results for “nap”");
  });
});

describe("the island stays light (§10.6): it loads with every page's root layout", () => {
  it("never imports lib/copy or lib/public-copy, and loads the option body only on use", () => {
    const src = readFileSync(join(process.cwd(), "components/HeaderSearch.tsx"), "utf8");
    expect(src).toMatch(/^"use client";/);
    expect(src).not.toMatch(/from "@\/lib\/(copy|public-copy|check-summary)"/);
    expect(src).not.toMatch(/^import (?!type )[^;]*from "@\/components\/(suggest\/SuggestOptionBody|ui\/)/m);
    expect(src).toMatch(/import\("@\/components\/suggest\/SuggestOptionBody"\)/);
    const leaf = readFileSync(join(process.cwd(), "lib/header-search-copy.ts"), "utf8");
    expect(leaf).not.toMatch(/^import /m);
  });
});

describe("the shared option body (§6.11.1)", () => {
  it("the checker and the header render the same body for a row", async () => {
    const body = (r: (typeof ROWS)[number]) => renderToStaticMarkup(<SuggestOptionBody r={r as never} nameClass="n" subClass="s" />);
    expect(body(ROWS[0])).toBe('<span class="n">Napa</span><span class="s">Acetaminophen 500 mg tablet. Matches Paracetamol, a name for Acetaminophen</span>');
    expect(body(ROWS[1])).toBe(`<span class="n">Hidasprin</span><span class="s">${NOT_REVIEWED}</span>`);
    expect(body(ROWS[3])).toBe(`<span class="n">Napadol</span><span class="s">Acetaminophen 1000 mg tablet</span><span class="s"><span class="rv rv--pending">${NOT_REVIEWED}</span></span><span class="problem-line">${PROBLEM_REPORTED}</span>`);

    render(<><form><CheckerCombobox ids={[]} max={20} q="" /></form><Bar /></>);
    const cx = screen.getByRole("combobox", { name: "Add a medicine" });
    cx.focus();
    fireEvent.change(cx, { target: { value: "nap" } });
    await waitFor(() => expect(document.querySelectorAll("#cx-list > li")).toHaveLength(4), { timeout: 1500 });
    await typeAndOpen("nap");
    const strip = (el: Element) => el.innerHTML.replace(/ class="[^"]*"/g, "");
    expect(strip(document.getElementById("cx-opt-3")!)).toBe(strip(document.getElementById("hs-opt-2")!));
    expect(strip(document.getElementById("cx-opt-0")!)).toBe(strip(document.getElementById("hs-opt-0")!));
  });
});
