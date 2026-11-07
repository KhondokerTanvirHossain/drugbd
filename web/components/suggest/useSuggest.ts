import { useCallback, useEffect, useRef } from "react";

/** §6.7.1, §6.11.1: a suggestion request waits 200 ms after the last keystroke and needs 2 or more characters. */
export const SUGGEST_DEBOUNCE_MS = 200;
export const SUGGEST_MIN = 2;

/** Whether a field's value is long enough to ask for suggestions: 2 or more code points after trim. */
export const suggestable = (value: string) => [...value.trim()].length >= SUGGEST_MIN;

/**
 * The suggestion request the checker and the header search share (§6.11.1). `request(value)` cancels the pending request
 * and, when the trimmed value is suggestable, asks /check/suggest after the debounce, with `ids()` (read when it fires) as
 * repeated `ids`; it answers false when the value is too short. `cancel()` drops the pending request. A stale or cancelled
 * response never lands (the `seq` guard): only the latest request's rows reach `land`, with the query they answer. A failed
 * request lands as no rows.
 */
export function useSuggest<R>(land: (rows: R[], q: string) => void, ids?: () => readonly string[]) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);   // the latest suggestion request; an older or cancelled one never lands
  const onLand = useRef(land);
  const idsOf = useRef(ids);
  useEffect(() => { onLand.current = land; idsOf.current = ids; });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const cancel = useCallback((): number => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    return ++seq.current;
  }, []);

  const request = useCallback((value: string): boolean => {
    const mine = cancel();
    const q = value.trim();
    if (!suggestable(q)) return false;
    timer.current = setTimeout(async () => {
      let rows: R[] = [];
      try {
        const params = new URLSearchParams([["q", q], ...(idsOf.current?.() ?? []).map((id): [string, string] => ["ids", id])]);
        const res = await fetch(`/check/suggest?${params}`);
        const data: unknown = res.ok ? await res.json() : [];
        rows = Array.isArray(data) ? (data as R[]) : [];
      } catch {
        rows = [];
      }
      if (mine !== seq.current) return;
      onLand.current(rows, q);
    }, SUGGEST_DEBOUNCE_MS);
    return true;
  }, [cancel]);

  return { request, cancel };
}
