import { act, fireEvent, render } from "@testing-library/react";
import { vi } from "vitest";
import PairActions from "@/components/review/senior/PairActions";
import PairStateLine from "@/components/review/senior/PairStateLine";
import SeniorDesk from "@/components/review/senior/SeniorDesk";
import type { TurnstileFieldProps } from "@/components/TurnstileField";
import type { PairReview } from "@/lib/review-types";
import type { PairRef } from "@/lib/senior-types";

export const router = { refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
export const pairDecide = vi.fn();
export const logSeniorOpen = vi.fn(async (..._a: unknown[]) => {});
export const turnstile: { props: TurnstileFieldProps | null } = { props: null };

export const HASH = "a".repeat(64);
export const REFS: PairRef[] = [
  { ddinterA: "DDInter14", ddinterB: "DDInter1951", nameA: "Acetaminophen", nameB: "Warfarin",
    version: { contentHash: HASH, lastPairReviewId: null }, state: "not_reviewed" },
  { ddinterA: "DDInter1951", ddinterB: "DDInter20", nameA: "Warfarin", nameB: "Acetylsalicylic acid",
    version: { contentHash: "b".repeat(64), lastPairReviewId: 4 }, state: "reviewed" },
];
const NOT: PairReview = { state: "not_reviewed", at: null, mine: false, note: null };
const DONE: PairReview = { state: "reviewed", at: "2026-10-14T03:00:00Z", mine: false, note: null };

/** A pair row as PairRow (Task 23) renders it, reduced to what the island reads: the article, its heading and the two parts. */
export function Row({ r, review }: { r: PairRef; review: PairReview }) {
  const id = `pair-${r.ddinterA}-${r.ddinterB}`;
  return (
    <article className="pair-row" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} tabIndex={-1}>{r.nameA} + {r.nameB}</h2>
      <PairStateLine ddinterA={r.ddinterA} ddinterB={r.ddinterB} review={review} />
      <PairActions ddinterA={r.ddinterA} ddinterB={r.ddinterB} />
    </article>
  );
}

/** The queue with the two rows; the bot check passes with "tok-1". */
export async function mount(singleKeys = true) {
  render(
    <SeniorDesk role="senior" kind="queue" target={{ type: "pair_queue", id: "todo" }} pairs={REFS} singleKeys={singleKeys}
      siteKey="1x00000000000000000000AA">
      <Row r={REFS[0]} review={NOT} /><Row r={REFS[1]} review={DONE} />
    </SeniorDesk>);
  await act(async () => {});
  act(() => turnstile.props!.onToken!("tok-1"));
}
export const region = () => document.getElementById("senior")!;
export const key = (k: string, target: Element = region(), mods = {}) => fireEvent.keyDown(target, { key: k, ...mods });
export const hint = () => document.querySelector('[data-senior="hint"]')?.textContent ?? "";
