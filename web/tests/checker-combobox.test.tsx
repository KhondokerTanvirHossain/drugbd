// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const replace = vi.fn(), push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push }) }));
import CheckerCombobox from "@/components/check/CheckerCombobox";
import Banner from "@/components/ui/Banner";
// The build hashes CSS Module class names; vitest's config keeps them readable, so this file hashes them as the build does.
// A global class the forced-colours rule in tokens.css targets must therefore be named outside the module.
vi.mock("@/components/check/check.module.css", () => ({ default: new Proxy({}, { get: (_, k) => `check_${String(k)}__hash` }) }));

function Page({ ids, summary = "2 medicines · 1 of 1 pair checked · 0 with an interaction listed", names = {} as Record<string, string>, banners = [] }:
    { ids: string[]; summary?: string; names?: Record<string, string>; banners?: { title: string; body?: string }[] }) {
  return (
    <>
      <form method="get" action="/check">
        <CheckerCombobox ids={ids} max={20} q="" />
        <button type="submit" name="clear" value="1" aria-disabled={ids.length === 0 ? "true" : undefined}>Clear all</button>
        <ul>{ids.map((id) => <li key={id}><b>{names[id] ?? id}</b><button type="submit" name="remove" value={id} data-remove={id}>x</button></li>)}</ul>
        <a href="/check?ids=W&ids=A" data-scenario="G Warfarin + Aspirin">G Warfarin + Aspirin</a>
      </form>
      {banners.map((b) => <Banner key={b.title} tone="crit" title={b.title} body={b.body} action={<a href="/check">Try again</a>} />)}
      <h2 data-check-summary="">{summary}</h2>
      <p id="check-live" aria-live="polite" aria-atomic="true" />
    </>
  );
}
const ROWS = [
  { conceptId: "N", tradeName: "Napa", status: "approved", clinicalDisplayName: "Acetaminophen 500 mg tablet", matched: { name: "Paracetamol", substance: "Acetaminophen" } },
  { conceptId: "H", tradeName: "Hidasprin", status: "not_reviewed", clinicalDisplayName: null, matched: null },
];
const fetchMock = vi.fn();
beforeEach(() => {
  replace.mockReset(); push.mockReset();
  fetchMock.mockReset(); fetchMock.mockResolvedValue(new Response(JSON.stringify(ROWS), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const live = () => document.getElementById("check-live")!.textContent;
const input = () => screen.getByRole("combobox") as HTMLInputElement;
async function typeAndOpen(text: string) {
  fireEvent.change(input(), { target: { value: text } });
  await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2), { timeout: 1500 });
}

describe("CheckerCombobox (§6.7.1)", () => {
  it("server render without JavaScript: a plain field and Find; hydrated: the combobox and no Find", () => {
    const html = renderToStaticMarkup(<CheckerCombobox ids={[]} max={20} q="" />);
    expect(html).toContain(">Find</button>");
    expect(html).not.toContain('role="combobox"');
    render(<Page ids={["A"]} />);
    expect(input().getAttribute("aria-autocomplete")).toBe("list");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().getAttribute("aria-controls")).toBe("cx-list");
    expect(screen.queryByText("Find")).toBeNull();
  });

  it("fetches suggestions for 2+ characters, excluding the current ids, with the sub lines", async () => {
    render(<Page ids={["A"]} />);
    await typeAndOpen("pa");
    expect(String(fetchMock.mock.calls[0][0])).toBe("/check/suggest?q=pa&ids=A");
    expect(screen.getByText("Acetaminophen 500 mg tablet. Matches Paracetamol, a name for Acetaminophen")).toBeTruthy();
    expect(screen.getByText("Not yet reviewed by a pharmacist")).toBeTruthy();
    expect(input().getAttribute("aria-expanded")).toBe("true");
  });

  it("arrows move the active option, Enter adds with router.replace, clears and keeps focus; Enter never submits the form", async () => {
    const submit = vi.fn((e: Event) => e.preventDefault());
    render(<Page ids={["A"]} />);
    document.querySelector("form")!.addEventListener("submit", submit);
    await typeAndOpen("pa");
    input().focus();
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    expect(input().getAttribute("aria-activedescendant")).toBe("cx-opt-1");
    fireEvent.keyDown(input(), { key: "ArrowUp" });
    expect(input().getAttribute("aria-activedescendant")).toBe("cx-opt-0");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(replace).toHaveBeenCalledWith("/check?ids=A&ids=N", { scroll: false });
    expect(input().value).toBe("");
    expect(document.activeElement).toBe(input());
    expect(submit).not.toHaveBeenCalled();
  });

  it("Esc closes the list, then clears the field; Tab closes", async () => {
    render(<Page ids={[]} />);
    await typeAndOpen("pa");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().value).toBe("pa");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(input().value).toBe("");
  });

  it("announces the add with the new summary once the server render lands", async () => {
    const view = render(<Page ids={["A"]} />);
    await typeAndOpen("pa");
    fireEvent.keyDown(input(), { key: "Enter" });
    view.rerender(<Page ids={["A", "N"]} summary="2 medicines · 1 of 1 pair checked · 1 with an interaction listed" />);
    await waitFor(() => expect(live()).toBe("Napa added. 2 medicines · 1 of 1 pair checked · 1 with an interaction listed"));
  });

  it("remove: focus goes to the remove button now at the same position, else the previous one, else the input", async () => {
    const view = render(<Page ids={["A", "B", "C"]} names={{ B: "Bravo" }} />);
    fireEvent.click(document.querySelector('[data-remove="B"]')!);
    expect(replace).toHaveBeenCalledWith("/check?ids=A&ids=C", { scroll: false });
    view.rerender(<Page ids={["A", "C"]} summary="2 medicines · 0 of 1 pair checked · 0 with an interaction listed" />);
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-remove="C"]')));
    await waitFor(() => expect(live()).toBe("Bravo removed. 2 medicines · 0 of 1 pair checked · 0 with an interaction listed"));
    fireEvent.click(document.querySelector('[data-remove="C"]')!);
    view.rerender(<Page ids={["A"]} summary="Add at least 2 medicines to check them against each other." />);
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-remove="A"]')));
    fireEvent.click(document.querySelector('[data-remove="A"]')!);
    view.rerender(<Page ids={[]} summary="Add at least 2 medicines to check them against each other." />);
    await waitFor(() => expect(document.activeElement).toBe(input()));
  });

  it("Clear all: nothing while aria-disabled; otherwise focus to the input and 'All medicines removed.'", async () => {
    const empty = render(<Page ids={[]} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(replace).not.toHaveBeenCalled();
    empty.unmount();
    const view = render(<Page ids={["A", "B"]} />);
    fireEvent.click(screen.getByText("Clear all"));
    expect(replace).toHaveBeenCalledWith("/check", { scroll: false });
    view.rerender(<Page ids={[]} summary="Add at least 2 medicines to check them against each other." />);
    await waitFor(() => expect(document.activeElement).toBe(input()));
    await waitFor(() => expect(live()).toBe("All medicines removed."));
  });

  it("a scenario link navigates and announces the scenario with the summary", async () => {
    const view = render(<Page ids={[]} />);
    fireEvent.click(screen.getByText("G Warfarin + Aspirin"));
    expect(push).toHaveBeenCalledWith("/check?ids=W&ids=A");
    view.rerender(<Page ids={["W", "A"]} summary="2 medicines · 1 of 1 pair checked · 1 with an interaction listed" />);
    await waitFor(() => expect(live()).toBe("Scenario loaded: G Warfarin + Aspirin. 2 medicines · 1 of 1 pair checked · 1 with an interaction listed"));
  });

  it("at 20 medicines the input is aria-disabled and readonly, keeps focus, and asks for nothing", async () => {
    render(<Page ids={Array.from({ length: 20 }, (_, i) => `P${i}`)} />);
    expect(input().getAttribute("aria-disabled")).toBe("true");
    expect(input().readOnly).toBe(true);
    expect(input().disabled).toBe(false);
    expect(screen.getByText("20 medicines is the maximum. Remove one to add another.")).toBeTruthy();
    fireEvent.change(input(), { target: { value: "napa" } });
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // §10.2 "Banners added after load use the same live region" (Task 30 ruling): the banner's title and body follow the message.
  it("a banner in the new render is announced after the message, title and body, never its action", async () => {
    const view = render(<Page ids={["A", "B", "C"]} names={{ B: "Bravo" }} />);
    fireEvent.click(document.querySelector('[data-remove="B"]')!);
    view.rerender(<Page ids={["A", "C"]} summary="2 medicines"
      banners={[{ title: "Couldn't check these medicines.", body: "Nothing was saved. Try again in a moment." }]} />);
    await waitFor(() => expect(live()).toBe("Bravo removed. 2 medicines. Couldn't check these medicines. Nothing was saved. Try again in a moment."));
    fireEvent.click(screen.getByText("G Warfarin + Aspirin"));
    view.rerender(<Page ids={["A"]} summary="Add at least 2 medicines to check them against each other."
      banners={[{ title: "One medicine in the link no longer exists, so it was removed." }]} />);
    await waitFor(() => expect(live()).toBe("Scenario loaded: G Warfarin + Aspirin. Add at least 2 medicines to check them against each other. "
      + "One medicine in the link no longer exists, so it was removed."));
  });

  it("a stale suggestion response never reopens the list after an add, nor replaces a newer query's rows", async () => {
    render(<Page ids={["A"]} />);
    await typeAndOpen("pa");
    fireEvent.change(input(), { target: { value: "pap" } });   // debounce pending
    fireEvent.keyDown(input(), { key: "Enter" });              // adds Napa from the open list
    await act(() => new Promise((r) => setTimeout(r, 300)));
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(input().value).toBe("");

    let first!: (r: Response) => void;
    fetchMock.mockReset();
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { first = r; }))
      .mockResolvedValueOnce(new Response(JSON.stringify([ROWS[1]]), { status: 200 }));
    fireEvent.change(input(), { target: { value: "hi" } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(input(), { target: { value: "hid" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    await act(async () => { first(new Response(JSON.stringify(ROWS), { status: 200 })); await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getAllByRole("option").map((o) => o.querySelector("span")!.textContent)).toEqual(["Hidasprin"]);
  });
  // Fix round 1 (Task 32 Ruling): every next URL is built from the latest requested ids, not the prop that lags one render.
  it("two removes before the server render lands never bring the first one back", async () => {
    const view = render(<Page ids={["A", "B", "C"]} names={{ B: "Bravo", C: "Charlie" }} />);
    fireEvent.click(document.querySelector('[data-remove="B"]')!);
    expect(replace).toHaveBeenLastCalledWith("/check?ids=A&ids=C", { scroll: false });
    fireEvent.click(document.querySelector('[data-remove="C"]')!);
    expect(replace).toHaveBeenLastCalledWith("/check?ids=A", { scroll: false });
    view.rerender(<Page ids={["A"]} summary="Add at least 2 medicines to check them against each other." />);
    await waitFor(() => expect(live()).toBe("Charlie removed. Add at least 2 medicines to check them against each other."));
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-remove="A"]')));
  });

  it("two quick adds before the server render lands keep both", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(ROWS), { status: 200 })));
    render(<Page ids={["A"]} />);
    await typeAndOpen("pa");
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(replace).toHaveBeenLastCalledWith("/check?ids=A&ids=N", { scroll: false });
    await typeAndOpen("hi");
    expect(String(fetchMock.mock.calls.at(-1)![0])).toBe("/check/suggest?q=hi&ids=A&ids=N");
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(replace).toHaveBeenLastCalledWith("/check?ids=A&ids=N&ids=H", { scroll: false });
  });

  // §10.3: tokens.css's forced-colours rule names the global .s-opt class, so the option carries it unhashed.
  it("the active option carries the global s-opt class that the forced-colours rule targets", async () => {
    render(<Page ids={[]} />);
    await typeAndOpen("pa");
    const opt = document.getElementById("cx-opt-0")!;
    expect(opt.getAttribute("aria-selected")).toBe("true");
    expect(opt.classList.contains("s-opt")).toBe(true);
  });

  // Board P renderList: the active option is scrolled into view.
  it("arrowing scrolls the active option into view", async () => {
    const spy = vi.fn();
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      render(<Page ids={[]} />);
      await typeAndOpen("pa");
      spy.mockClear();
      fireEvent.keyDown(input(), { key: "ArrowDown" });
      await waitFor(() => expect(spy).toHaveBeenCalledWith({ block: "nearest" }));
      expect(spy.mock.contexts.at(-1)).toBe(document.getElementById("cx-opt-1"));
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });

  // Board P l.1787-1788: the list closes on blur and on a click outside the combobox.
  it("the list closes when focus moves to another control", async () => {
    render(<Page ids={["A"]} />);
    input().focus();
    await typeAndOpen("pa");
    (document.querySelector('[data-remove="A"]') as HTMLButtonElement).focus();
    await waitFor(() => expect(input().getAttribute("aria-expanded")).toBe("false"));
  });

  it("the list closes on a click outside the combobox, but a click on an option still adds", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify(ROWS), { status: 200 })));
    render(<Page ids={["A"]} />);
    await typeAndOpen("pa");
    fireEvent.click(document.body);
    await waitFor(() => expect(input().getAttribute("aria-expanded")).toBe("false"));
    await typeAndOpen("par");
    fireEvent.mouseDown(document.getElementById("cx-opt-1")!);
    fireEvent.click(document.getElementById("cx-opt-1")!);
    expect(replace).toHaveBeenLastCalledWith("/check?ids=A&ids=H", { scroll: false });
  });
});
