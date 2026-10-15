"use client";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { announce } from "@/lib/live-region";
import { COUNT_DELAY_MS, GLOSSARY_LIST_ID, LEARN_LIVE_ATTR, countText, haystack, matches } from "./glossary-filter";
import styles from "./learn.module.css";

type Item = { el: HTMLElement; hay: string };

/**
 * Island (§4.2 GlossaryFilter): filters the server-rendered glossary in the DOM. Renders nothing until hydrated, so
 * without JavaScript there is no input and every term shows (§6.8). 350 ms after typing stops, the visible count line
 * updates and the same words go to the page's one polite, sr-only live region (§10.2, rendered by LearnShell) through
 * announce() (clear, then write after 60 ms). The visible line is plain text, so it never blanks while announcing.
 */
export default function GlossaryFilter() {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(0);
  const [countLine, setCountLine] = useState("");
  const items = useRef<Item[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelAnnounce = useRef<() => void>(() => {});

  useEffect(() => {
    items.current = [...document.querySelectorAll<HTMLElement>(`#${GLOSSARY_LIST_ID} [data-gl-item]`)]
      .map((el) => ({ el, hay: haystack(el.textContent ?? "") }));
    setShown(items.current.length);
    setCountLine(countText(items.current.length, items.current.length, ""));
    setReady(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      cancelAnnounce.current();
    };
  }, []);

  function apply(q: string) {
    let n = 0;
    for (const { el, hay } of items.current) {
      const hit = matches(hay, q);
      el.hidden = !hit;
      if (hit) n += 1;
    }
    setQuery(q);
    setShown(n);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const text = countText(n, items.current.length, q);
      setCountLine(text);
      cancelAnnounce.current();
      cancelAnnounce.current = announce(document.querySelector<HTMLElement>(`[${LEARN_LIVE_ATTR}]`), text);
    }, COUNT_DELAY_MS);
  }

  if (!ready) return null;
  return (
    <>
      <label className="search" htmlFor="gl-q">
        <span className="sr-only">Filter the glossary</span>
        <input id="gl-q" ref={input} type="search" placeholder="Filter terms, for example salt or DAR" autoComplete="off"
          spellCheck={false} value={query} onChange={(e) => apply(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && query !== "") { e.preventDefault(); apply(""); } }} />
      </label>
      <p className={styles.glCount} data-gl-count="">{countLine}</p>
      <p className={styles.glEmpty} hidden={shown > 0}>
        No terms match. <button type="button" className={buttonClass("plain", "sm")} onClick={() => { apply(""); input.current?.focus(); }}>Clear the filter</button>
      </p>
    </>
  );
}
