"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { suggestionSub } from "@/lib/check-summary";
import { NOT_REVIEWED, PUBLIC_NEW, fill } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { CHECK } from "@/lib/public-copy";
import { checkHref } from "@/lib/public-params";
import type { SuggestRow } from "@/lib/public-types";
import styles from "./check.module.css";

type Row = Pick<SuggestRow, "conceptId" | "tradeName" | "status" | "clinicalDisplayName" | "matched">;
type Pending = { message: string | null; focusRemoveAt: number | null; focusInput: boolean };
const NONE: Pending = { message: null, focusRemoveAt: null, focusInput: false };
const DEBOUNCE_MS = 200;

/**
 * §10.2 "Banners added after load use the same live region": the page's banners carry no role (Task 30), so after a
 * navigation the island reads each banner's title and body (never its action) from the checker page around its form.
 */
function bannerTexts(from: HTMLElement | null): string[] {
  const page = from?.closest("form")?.parentElement;
  if (!page) return [];
  return [...page.querySelectorAll(".banner .banner-title, .banner .banner-body")].map((p) => p.textContent?.trim() ?? "");
}

/** Joins the parts with a space, ending each part but the last with a full stop when it has no closing punctuation. */
function sentences(parts: string[]): string {
  const xs = parts.map((s) => s.trim()).filter(Boolean);
  return xs.map((s, i) => (i < xs.length - 1 && !/[.!?]$/.test(s) ? `${s}.` : s)).join(" ");
}

/**
 * Island (§4.2): the checker's ARIA 1.2 combobox, and the side column's remove, Clear all and scenario actions. The URL is
 * the only store (§6.7.1): every change navigates, the server renders the result, and once that render lands the island
 * announces it with the new summary and restores focus (§10.1, §10.2). Without JavaScript the server render is the plain
 * field with "Find" (§4.4).
 */
export default function CheckerCombobox({ ids, max, q }: { ids: string[]; max: number; q: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState(-1);
  const [text, setText] = useState(q);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<Pending>(NONE);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);   // the latest suggestion request; an older or cancelled one never lands
  const atMax = ids.length >= max;

  useEffect(() => { setReady(true); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // The server's render with the new ids has landed: announce and put focus back.
  useEffect(() => {
    const p = pending.current;
    if (p.message === null) return;
    pending.current = NONE;
    const summary = document.querySelector("[data-check-summary]")?.textContent ?? "";
    announce(document.getElementById("check-live"), sentences([p.message.replace("{summary}", summary), ...bannerTexts(input.current)]));
    if (p.focusRemoveAt !== null) {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-remove]")];
      (buttons[Math.min(p.focusRemoveAt, buttons.length - 1)] ?? input.current)?.focus();
    } else if (p.focusInput) {
      input.current?.focus();
    }
  }, [ids]);

  // Remove, Clear all and scenarios live in the server-rendered form; the island takes them over once it runs. A click on a
  // submit button (mouse, Enter or Space) is cancelled before the form submits, so the GET round trip never happens.
  useEffect(() => {
    const form = input.current?.closest("form");
    if (!form) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const btn = target?.closest<HTMLButtonElement>('button[name="remove"], button[name="clear"]');
      if (btn) {
        e.preventDefault();
        if (btn.name === "remove") {
          const brand = btn.closest("li")?.querySelector("b")?.textContent ?? btn.value;
          pending.current = { message: fill(CHECK.removedAnnounce, { brand }), focusRemoveAt: ids.indexOf(btn.value), focusInput: false };
          router.replace(checkHref(ids.filter((id) => id !== btn.value)), { scroll: false });
        } else if (btn.getAttribute("aria-disabled") !== "true") {
          pending.current = { message: CHECK.cleared, focusRemoveAt: null, focusInput: true };
          router.replace("/check", { scroll: false });
        }
        return;
      }
      const a = target?.closest<HTMLAnchorElement>("a[data-scenario]");
      if (!a) return;
      e.preventDefault();
      pending.current = { message: fill(CHECK.scenarioLoaded, { scenario: a.dataset.scenario ?? "" }), focusRemoveAt: null, focusInput: false };
      router.push(a.getAttribute("href") ?? "/check");
    };
    form.addEventListener("click", onClick);
    return () => form.removeEventListener("click", onClick);
  }, [ids, router]);

  function cancelSuggest(): number {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return ++seq.current;
  }

  function suggest(value: string) {
    const mine = cancelSuggest();
    const v = value.trim();
    if (atMax || [...v].length < 2) { setRows([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      let data: Row[] = [];
      try {
        const params = new URLSearchParams([["q", v], ...ids.map((id): [string, string] => ["ids", id])]);
        const res = await fetch(`/check/suggest?${params}`);
        data = res.ok ? ((await res.json()) as Row[]) : [];
      } catch {
        data = [];
      }
      if (mine !== seq.current) return;
      setRows(data);
      setActive(data.length ? 0 : -1);
      setOpen(true);
    }, DEBOUNCE_MS);
  }

  function add(r: Row) {
    pending.current = { message: fill(CHECK.added, { brand: r.tradeName }), focusRemoveAt: null, focusInput: true };
    cancelSuggest();
    setText("");
    setRows([]);
    setOpen(false);
    router.replace(checkHref([...ids, r.conceptId]), { scroll: false });
    input.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!rows.length) return;
      if (!open) { setOpen(true); setActive(0); } else setActive(Math.min(active + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      if (!open) { setOpen(true); setActive(rows.length - 1); } else setActive(Math.max(active - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && rows[active]) add(rows[active]);
    } else if (e.key === "Escape") {
      if (open) { e.preventDefault(); setOpen(false); } else if (text) { e.preventDefault(); cancelSuggest(); setText(""); setRows([]); }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="field">
      <label className="field-label" htmlFor="cx-input" id="cx-label">{CHECK.fieldLabel}</label>
      <div className={styles["s-cbx"]}>
        <div className="search">
          <input ref={input} type="text" id="cx-input" name="q" value={text} placeholder={CHECK.placeholder} autoComplete="off"
            aria-describedby="cx-help" role={ready ? "combobox" : undefined} aria-autocomplete={ready ? "list" : undefined}
            aria-expanded={ready ? open : undefined} aria-controls={ready ? "cx-list" : undefined}
            aria-activedescendant={ready && open && active >= 0 ? `cx-opt-${active}` : undefined}
            aria-disabled={atMax ? "true" : undefined} readOnly={atMax || undefined}
            onChange={(e) => { if (atMax) return; setText(e.target.value); suggest(e.target.value); }} onKeyDown={onKeyDown} />
        </div>
        {ready && (
          <ul className={styles["s-cbx-list"]} id="cx-list" role="listbox" aria-labelledby="cx-label" hidden={!open}>
            {rows.length === 0 ? <li className={styles["s-opt-empty"]} role="presentation">{fill(PUBLIC_NEW.checker.noMatch, { q: text.trim() })}</li>
              : rows.map((r, i) => (
                <li key={r.conceptId} id={`cx-opt-${i}`} role="option" aria-selected={i === active} className={styles["s-opt"]}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => add(r)}>
                  <span className={styles["s-opt-name"]}>{r.tradeName}</span>
                  <span className={styles["s-opt-sub"]}>{r.status === "approved" ? suggestionSub(r) : NOT_REVIEWED}</span>
                </li>
              ))}
          </ul>
        )}
      </div>
      <div className="field-meta"><span id="cx-help">{atMax ? PUBLIC_NEW.checkerMax.help : CHECK.help}</span></div>
      {!ready && <button type="submit" name="find" value="1" className="btn btn--tonal btn--sm">{PUBLIC_NEW.checker.find}</button>}
    </div>
  );
}
