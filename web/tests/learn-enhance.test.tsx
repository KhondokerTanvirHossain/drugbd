// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LearnRail from "@/components/learn/LearnRail";
import { revealCurrentChapter, startScrollSpy, wireExampleSwitches } from "@/components/learn/enhance";

afterEach(() => { cleanup(); document.body.innerHTML = ""; });

const SWITCH = `
  <div class="seg" role="group" aria-label="Who is asking" data-switch="prod" hidden>
    <button type="button" aria-pressed="true" data-panel="prod-public">Public</button>
    <button type="button" aria-pressed="false" data-panel="prod-all">Reviewer access</button>
  </div>
  <div id="prod-public">public body</div><div id="prod-all">reviewer body</div>`;

/** A window the scroll-spy can drive: a fixed height, recorded listeners and a synchronous animation frame. */
function fakeWindow(innerHeight = 800) {
  const listeners = new Map<string, () => void>();
  return {
    innerHeight,
    addEventListener: vi.fn((type: string, fn: () => void) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    requestAnimationFrame: vi.fn((cb: FrameRequestCallback) => { cb(0); return 0; }),
    fire: (type: string) => listeners.get(type)?.(),
    listeners,
  };
}

describe("example switches (§6.8 chapter 8)", () => {
  it("shows one panel at a time once enhanced, following aria-pressed", () => {
    document.body.innerHTML = SWITCH;
    const off = wireExampleSwitches(document);
    const group = document.querySelector<HTMLElement>("[data-switch]")!;
    const [pub, all] = [document.getElementById("prod-public")!, document.getElementById("prod-all")!];
    expect(group.hidden).toBe(false);
    expect([pub.hidden, all.hidden]).toEqual([false, true]);
    document.querySelector<HTMLButtonElement>('[data-panel="prod-all"]')!.click();
    expect([pub.hidden, all.hidden]).toEqual([true, false]);
    expect(document.querySelector('[data-panel="prod-all"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-panel="prod-public"]')!.getAttribute("aria-pressed")).toBe("false");
    off();
    document.querySelector<HTMLButtonElement>('[data-panel="prod-public"]')!.click();
    expect(pub.hidden).toBe(true);
  });
});

describe("the narrow chapter row (§6.8)", () => {
  it("scrolls the current chapter's link into view when the row overflows, and leaves a row that fits alone", () => {
    document.body.innerHTML = '<nav data-learn-nav><ol><li><a href="/learn/start">1</a></li><li><a href="/learn/faq" aria-current="page">10</a></li></ol></nav>';
    const nav = document.querySelector<HTMLElement>("[data-learn-nav]")!;
    const current = document.querySelector<HTMLElement>('[aria-current="page"]')!;
    Object.defineProperty(current, "offsetLeft", { value: 900 });
    Object.defineProperty(nav, "clientWidth", { value: 320 });
    Object.defineProperty(nav, "scrollWidth", { value: 1100, configurable: true });
    revealCurrentChapter(document);
    expect(nav.scrollLeft).toBe(884);
    nav.scrollLeft = 0;
    Object.defineProperty(nav, "scrollWidth", { value: 322 });
    revealCurrentChapter(document);
    expect(nav.scrollLeft).toBe(0);
  });
});

describe("'On this page' scroll-spy (§4.2 LearnRail)", () => {
  it("marks the last section whose top passed the line, and only that one", () => {
    document.body.innerHTML = `
      <aside data-learn-rail><ol><li><a href="#a" aria-current="true">A</a></li><li><a href="#b">B</a></li><li><a href="#c">C</a></li></ol></aside>
      <div id="a"></div><div id="b"></div><div id="c"></div>`;
    const tops: Record<string, number> = { a: -500, b: 100, c: 900 };
    for (const id of ["a", "b", "c"]) document.getElementById(id)!.getBoundingClientRect = () => ({ top: tops[id] } as DOMRect);
    const win = fakeWindow(800);   // the line is max(160, 240) = 240
    const off = startScrollSpy(document, win as unknown as Window);
    const current = () => [...document.querySelectorAll("[data-learn-rail] a")].filter((a) => a.getAttribute("aria-current") === "true").map((a) => a.textContent);
    expect(current()).toEqual(["B"]);
    tops.b = 400; tops.c = 200;
    win.fire("scroll");
    expect(current()).toEqual(["C"]);
    tops.a = 500; tops.b = 600; tops.c = 700;
    win.fire("scroll");
    expect(current()).toEqual(["A"]);
    off();
    expect(win.listeners.size).toBe(0);
  });
});

describe("LearnRail island", () => {
  it("runs the enhancements after hydration and renders nothing", () => {
    document.body.innerHTML = SWITCH;
    const { container } = render(<LearnRail />);
    expect(container.innerHTML).toBe("");
    expect(document.querySelector<HTMLElement>("[data-switch]")!.hidden).toBe(false);
    expect(document.getElementById("prod-all")!.hidden).toBe(true);
  });
});
