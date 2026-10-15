/**
 * What the LearnRail island does once the page has hydrated (§4.2, §6.8). Plain DOM, no React, so it is tested without
 * a page. Everything here enhances server-rendered HTML that already works without JavaScript.
 */

type Win = Pick<Window, "innerHeight" | "addEventListener" | "removeEventListener" | "requestAnimationFrame">;

/** Below 860 px the chapter nav is a horizontal row: scroll the current chapter's link into view (§6.8). */
export function revealCurrentChapter(doc: Document): void {
  const nav = doc.querySelector<HTMLElement>("[data-learn-nav]");
  const current = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
  if (!nav || !current || nav.scrollWidth <= nav.clientWidth + 4) return;
  nav.scrollLeft = Math.max(0, current.offsetLeft - 16);
}

/**
 * Chapter 8's "Public / Reviewer access" switches (§6.8): un-hide each `[data-switch]` group and show one panel at a
 * time, following `aria-pressed`. Without JavaScript the group stays hidden and both panels show. Returns a cleanup.
 */
export function wireExampleSwitches(doc: Document): () => void {
  const offs: (() => void)[] = [];
  for (const group of doc.querySelectorAll<HTMLElement>("[data-switch]")) {
    const buttons = [...group.querySelectorAll<HTMLButtonElement>("button[data-panel]")];
    const show = (panelId: string) => {
      for (const b of buttons) {
        const id = b.dataset.panel!;
        b.setAttribute("aria-pressed", String(id === panelId));
        const panel = doc.getElementById(id);
        if (panel) panel.hidden = id !== panelId;
      }
    };
    for (const b of buttons) {
      const onClick = () => show(b.dataset.panel!);
      b.addEventListener("click", onClick);
      offs.push(() => b.removeEventListener("click", onClick));
    }
    const pressed = buttons.find((b) => b.getAttribute("aria-pressed") === "true") ?? buttons[0];
    if (pressed) show(pressed.dataset.panel!);
    group.hidden = false;
  }
  return () => offs.forEach((off) => off());
}

/**
 * "On this page" scroll-spy (§4.2): the rail link of the last section whose top has passed a line 30% down the
 * viewport (at least 160 px) gets `aria-current="true"`. Returns a cleanup.
 */
export function startScrollSpy(doc: Document, win: Win): () => void {
  const links = [...doc.querySelectorAll<HTMLAnchorElement>('[data-learn-rail] a[href^="#"]')];
  const targets = links.map((a) => doc.getElementById(decodeURIComponent(a.getAttribute("href")!.slice(1))));
  const update = () => {
    const line = Math.max(160, Math.round(win.innerHeight * 0.3));
    let current = 0;
    targets.forEach((t, i) => { if (t && t.getBoundingClientRect().top - line <= 0) current = i; });
    links.forEach((a, i) => (i === current ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
  };
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    win.requestAnimationFrame(() => { ticking = false; update(); });
  };
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("resize", update);
  update();
  return () => {
    win.removeEventListener("scroll", onScroll);
    win.removeEventListener("resize", update);
  };
}

export function enhanceLearn(doc: Document, win: Win): () => void {
  revealCurrentChapter(doc);
  const offSwitches = wireExampleSwitches(doc);
  const offSpy = startScrollSpy(doc, win);
  return () => { offSwitches(); offSpy(); };
}
