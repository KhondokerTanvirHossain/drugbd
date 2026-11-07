"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import SuggestOptionBody, { hasClinicalData, type SuggestOption } from "@/components/suggest/SuggestOptionBody";
import { suggestable, useSuggest } from "@/components/suggest/useSuggest";
import { HEADER_SEARCH, fill } from "@/lib/copy";
import { NAV } from "@/lib/public-copy";
import styles from "./Header.module.css";

type Push = (href: string) => void;
const MAX_OPTIONS = 10;

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
  const input = useRef<HTMLInputElement>(null);
  const push = useRef<Push | null>(null);
  // Only rows with clinical data: an approved-only-mode row without data would open a stub (§6.11.1). A response that lands
  // after focus left the field (Tab, a click elsewhere) is dropped, so the list never opens under another control.
  const { request, cancel } = useSuggest<SuggestOption>((data) => {
    if (document.activeElement !== input.current) return;
    setRows(data.filter(hasClinicalData).slice(0, MAX_OPTIONS));
    setActive(-1);
    setOpen(true);
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
      if (!input.current?.form?.contains(e.target as Node | null)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function close() {
    cancel();
    setOpen(false);
  }

  function onChange(value: string) {
    setText(value);
    if (!request(value)) { setRows([]); setActive(-1); setOpen(false); }
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
      if (!open) { setOpen(true); setActive(down ? 0 : count - 1); }
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
        <span className="sr-only">{NAV.searchLabel}</span>
        <input ref={input} type="search" name="q" defaultValue={q} placeholder={NAV.searchPlaceholder} minLength={2} maxLength={100}
          id={ready ? "hs-input" : undefined} autoComplete={ready ? "off" : undefined} role={ready ? "combobox" : undefined}
          aria-autocomplete={ready ? "list" : undefined} aria-expanded={ready ? open : undefined}
          aria-controls={ready ? "hs-list" : undefined} aria-activedescendant={ready && open && active >= 0 ? `hs-opt-${active}` : undefined}
          aria-describedby={ready ? "hs-help" : undefined}
          onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
          onBlur={() => { setTimeout(() => { if (document.activeElement !== input.current) close(); }, 0); }} />
      </label>
      {ready && (
        <>
          <RouterBridge to={push} />
          <span id="hs-help" className="sr-only">{HEADER_SEARCH.help}</span>
          {/* mousedown keeps focus in the field, so a click on an option or the list's scrollbar never blurs it */}
          <ul className={styles.hsList} id="hs-list" role="listbox" aria-label={NAV.searchLabel} hidden={!open}
            onMouseDown={(e) => e.preventDefault()}>
            {rows.map((r, i) => (
              <li key={r.conceptId} id={`hs-opt-${i}`} role="option" aria-selected={i === active} className={`s-opt ${styles.hsOpt}`}
                onClick={() => choose(i)}>
                <SuggestOptionBody r={r} nameClass={styles.hsOptName} subClass={styles.hsOptSub} />
              </li>
            ))}
            <li id={`hs-opt-${all}`} role="option" aria-selected={active === all} className={`s-opt ${styles.hsOpt} ${styles.hsAll}`}
              onClick={() => choose(all)}>{fill(HEADER_SEARCH.allResults, { q: text.trim() })}</li>
          </ul>
        </>
      )}
    </>
  );
}
