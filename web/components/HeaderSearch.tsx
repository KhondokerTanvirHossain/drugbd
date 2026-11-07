"use client";
import { useEffect, useRef, useState, type ComponentType, type KeyboardEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { hasClinicalData } from "@/components/suggest/clinical-data";
import type { SuggestOption } from "@/components/suggest/SuggestOptionBody";
import { suggestable, useSuggest } from "@/components/suggest/useSuggest";
import { HEADER_SEARCH, SEARCH_FIELD } from "@/lib/header-search-copy";
import styles from "./Header.module.css";

type Push = (href: string) => void;
type Body = ComponentType<{ r: SuggestOption; nameClass: string; subClass: string }>;
const MAX_OPTIONS = 10;

let body: Promise<Body> | null = null;
/**
 * The shared option body, with the copy it reads (ReviewStatus, suggestionSub, lib/copy), loads on first use. The island
 * ships with every page's root layout, so a page whose field is never used never fetches that code (§10.6). A failed load
 * is retried on the next use.
 */
function loadBody(): Promise<Body> {
  body ??= import("@/components/suggest/SuggestOptionBody").then((m) => m.default, (e: unknown) => { body = null; throw e; });
  return body;
}

/** "All results for “{q}”", filled as lib/copy's fill fills it. */
const allResultsFor = (q: string) => HEADER_SEARCH.allResults.replace("{q}", () => q);

/**
 * useRouter() needs the app router, which a server render outside the app (the header's static tests) does not mount. The
 * bridge renders only once the island runs and hands the router's push to the island.
 */
function RouterBridge({ to }: { to: RefObject<Push | null> }) {
  const router = useRouter();
  useEffect(() => {
    to.current = (href) => router.push(href);
    return () => { to.current = null; };
  }, [router, to]);
  return null;
}

/**
 * Island (§6.11.1): the top bar's search field. Without JavaScript it is exactly the §6.1 field of the GET form to /search.
 * Once it runs it is an ARIA 1.2 combobox over /check/suggest: medicine options that carry clinical data, then "All results
 * for “{q}”". No option is active when the list opens, so Enter on its own still submits the search. Enter or a click on a
 * medicine opens its product page; on "All results" it submits the form. The ids (hs-*) never clash with the checker's cx-*.
 */
export default function HeaderSearch({ q }: { q: string }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SuggestOption[]>([]);
  const [active, setActive] = useState(-1);
  const [text, setText] = useState(q);
  const [Body, setBody] = useState<Body | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const push = useRef<Push | null>(null);
  // The trimmed query `rows` answer (null: none). Rows only ever answer the field's current text: typing anything else
  // clears them, so a medicine from an earlier query can never be highlighted or opened.
  const answered = useRef<string | null>(null);
  // The latest landing; typing or closing drops one that is still waiting for the option body.
  const landing = useRef(0);
  // Only rows with clinical data: an approved-only-mode row without data would open a stub (§6.11.1). A response that lands
  // after focus left the field (Tab, a click elsewhere) is dropped, so the list never opens under another control.
  const { request, cancel } = useSuggest<SuggestOption>((data, asked) => {
    const mine = ++landing.current;
    const allBefore = rows.length;
    loadBody().then((B) => {
      if (mine !== landing.current || document.activeElement !== input.current) return;
      const next = data.filter(hasClinicalData).slice(0, MAX_OPTIONS);
      setBody(() => B);
      answered.current = asked;
      setRows(next);
      // No option becomes active when the list opens; "All results", when the reader has already moved onto it, stays so.
      setActive((a) => (a >= 0 && a === allBefore ? next.length : -1));
      setOpen(true);
    }, () => {});
  });
  const all = rows.length;   // the index of "All results", always the last option
  const count = rows.length + 1;

  useEffect(() => { setReady(true); }, []);

  useEffect(() => {
    if (open && active >= 0) document.getElementById(`hs-opt-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  // A click outside the search form closes the list.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!input.current?.form?.contains(e.target as Node | null)) { setOpen(false); setActive(-1); }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function close() {
    cancel();
    landing.current++;
    setOpen(false);
    setActive(-1);
  }

  /**
   * Typing clears the highlight (ARIA APG), so Enter then searches for what the field holds. Rows that answer another query
   * are dropped at once: until the new answer lands, an open list offers only "All results".
   */
  function onChange(value: string) {
    setText(value);
    setActive(-1);
    landing.current++;
    const asked = value.trim();
    if (suggestable(asked) && asked === answered.current) { cancel(); return; }   // the rows already answer it
    answered.current = null;
    setRows([]);
    if (!request(value)) setOpen(false);
  }

  /** Enter or a click on option i: a medicine opens its product page; "All results" submits the form. */
  function choose(i: number) {
    close();
    const r = rows[i];
    if (i < all && r) {
      const href = `/products/${encodeURIComponent(r.conceptId)}`;
      if (push.current) push.current(href);
      else window.location.assign(href);
    } else {
      input.current?.form?.requestSubmit();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;   // an IME's Enter or arrows belong to the composition
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!suggestable(text)) return;
      e.preventDefault();
      const down = e.key === "ArrowDown";
      if (!open) {
        // Rows that answer the field open at once; otherwise (the prefilled q, an answer that never landed) they are asked for.
        if (text.trim() !== answered.current) request(text);
        setOpen(true);
        setActive(down ? 0 : count - 1);
      }
      else if (down) setActive(Math.min(active + 1, count - 1));
      else setActive(active < 0 ? count - 1 : Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      // With no active option the native submit runs: Enter searches, as before.
      if (open && active >= 0 && active < count) { e.preventDefault(); choose(active); }
      else close();
    } else if (e.key === "Escape") {
      // An open list closes; a closed one lets the search input clear itself (its input event then resets the list).
      if (open) e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  }

  return (
    <>
      <label className="search">
        <span className="sr-only">{SEARCH_FIELD.label}</span>
        <input ref={input} type="search" name="q" defaultValue={q} placeholder={SEARCH_FIELD.placeholder} minLength={2} maxLength={100}
          id={ready ? "hs-input" : undefined} autoComplete={ready ? "off" : undefined} role={ready ? "combobox" : undefined}
          aria-autocomplete={ready ? "list" : undefined} aria-expanded={ready ? open : undefined}
          aria-controls={ready ? "hs-list" : undefined} aria-activedescendant={ready && open && active >= 0 ? `hs-opt-${active}` : undefined}
          aria-describedby={ready ? "hs-help" : undefined}
          onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} onFocus={() => { loadBody().catch(() => {}); }}
          onBlur={() => { setTimeout(() => { if (document.activeElement !== input.current) close(); }, 0); }} />
      </label>
      {ready && (
        <>
          <RouterBridge to={push} />
          <span id="hs-help" className="sr-only">{HEADER_SEARCH.help}</span>
          {/* mousedown keeps focus in the field, so a click on an option or the list's scrollbar never blurs it */}
          <ul className={styles.hsList} id="hs-list" role="listbox" aria-label={SEARCH_FIELD.label} hidden={!open}
            onMouseDown={(e) => e.preventDefault()}>
            {Body && rows.map((r, i) => (
              <li key={r.conceptId} id={`hs-opt-${i}`} role="option" aria-selected={i === active} className={`s-opt ${styles.hsOpt}`}
                onClick={() => choose(i)}>
                <Body r={r} nameClass={styles.hsOptName} subClass={styles.hsOptSub} />
              </li>
            ))}
            <li id={`hs-opt-${all}`} role="option" aria-selected={active === all} className={`s-opt ${styles.hsOpt} ${styles.hsAll}`}
              onClick={() => choose(all)}>{allResultsFor(text.trim())}</li>
          </ul>
        </>
      )}
    </>
  );
}
