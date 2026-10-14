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
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => setValue(q), [q]);
  useEffect(() => {
    desk.registerSearchClear(() => { setValue(""); router.replace(recordHref(batchId, conceptId, { show })); });
    return () => desk.registerSearchClear(null);
  }, [batchId, conceptId, show]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form method="get" action={recordHref(batchId, conceptId)} role="search" onSubmit={(e) => e.preventDefault()}>
      {show !== "all" && <input type="hidden" name="show" value={show} />}
      <label className="search">
        <span className="sr-only">{DESK.searchLabel}</span>
        <input type="search" name="q" value={value} placeholder={DESK.searchPlaceholder} autoComplete="off" maxLength={100}
          data-desk="search" data-fk="q"
          onChange={(e) => {
            const v = e.target.value;
            setValue(v);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => router.replace(recordHref(batchId, conceptId, { show, q: v }), { scroll: false }), 250);
          }} />
      </label>
    </form>
  );
}
