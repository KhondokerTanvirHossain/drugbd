"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DESK } from "@/lib/review-copy";
import type { FilterKey } from "@/lib/review-types";
import { useDesk } from "./context";
import { recordHref } from "./hrefs";

/** §5.3 record filter: a GET form without JavaScript; with it, debounced (250 ms) router.replace keeping the filter in the URL. */
export default function ListSearch({ batchId, conceptId, show, q }: { batchId: string; conceptId: string; show: FilterKey; q: string }) {
  const router = useRouter();
  const desk = useDesk();
  const [value, setValue] = useState(q);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef(false);                 // a debounce timer is running
  const sent = useRef(q);                        // the last q this component put in the URL
  const awaiting = useRef(0);                    // when a send went out whose echo has not come back (0 = none)
  const qNow = useRef(q);
  qNow.current = q;
  const stopTimer = () => { window.clearTimeout(timer.current); pending.current = false; };
  const send = (v: string) => {
    sent.current = v;
    awaiting.current = v === qNow.current ? 0 : Date.now();
    router.replace(recordHref(batchId, conceptId, { show, q: v }), { scroll: false });
  };
  // Sync the field from the URL only for an external change (Show all, a filter link, back/forward). The echo of what was
  // sent, or a stale echo of an earlier keystroke while a send is in flight, must not overwrite what is being typed.
  useEffect(() => {
    if (q === sent.current) { awaiting.current = 0; return; }
    if (awaiting.current && Date.now() - awaiting.current < 3000) return;
    if (pending.current && document.activeElement === input.current) return;
    awaiting.current = 0;
    sent.current = q;
    setValue(q);
  }, [q]);
  useEffect(() => {
    // A new record or filter: whatever was typed for the old one must never replay, and the field follows the URL.
    sent.current = qNow.current;
    awaiting.current = 0;
    setValue(qNow.current);
    desk.registerSearchClear(() => { stopTimer(); setValue(""); send(""); });
    return () => { stopTimer(); desk.registerSearchClear(null); };
  }, [batchId, conceptId, show]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form method="get" action={recordHref(batchId, conceptId)} role="search" onSubmit={(e) => e.preventDefault()}>
      {show !== "all" && <input type="hidden" name="show" value={show} />}
      <label className="search">
        <span className="sr-only">{DESK.searchLabel}</span>
        <input ref={input} type="search" name="q" value={value} placeholder={DESK.searchPlaceholder} autoComplete="off" maxLength={100}
          data-desk="search" data-fk="q"
          onChange={(e) => {
            const v = e.target.value;
            setValue(v);
            stopTimer();
            pending.current = true;
            timer.current = window.setTimeout(() => { pending.current = false; send(v); }, 250);
          }} />
      </label>
    </form>
  );
}
