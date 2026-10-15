import { vi } from "vitest";
import ReviewDesk from "@/components/review/ReviewDesk";
import DeskRecordContext from "@/components/review/desk/DeskRecordContext";
import type { RecordRegistration } from "@/components/review/desk/context";
import type { TurnstileFieldProps } from "@/components/TurnstileField";

export { makeReg } from "./desk-reg";

export const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() };
export const actions = {
  decide: vi.fn(), logRecordOpen: vi.fn(async () => {}), logEvidence: vi.fn(async () => {}), loadDiff: vi.fn(async () => null),
};
export const turnstile: { props: TurnstileFieldProps | null } = { props: null };

export function Desk({ reg, children, singleKeys = true, role = "pharmacist", evidence = <p>evidence body</p> }:
    { reg: RecordRegistration; children: React.ReactNode; singleKeys?: boolean; role?: "pharmacist" | "engineer"; evidence?: React.ReactNode }) {
  return (
    <ReviewDesk batchId="0001-pilot" role={role} total={10} counts={{ approved: 0, issue: 0 }} undoSeconds={8} singleKeys={singleKeys}
      siteKey="1x00000000000000000000AA" account={<a href="/search">elsewhere</a>} batchesNav={null} batchCard={null}>
      <DeskRecordContext reg={reg} filters={null} evidence={evidence} fallbackWidget={null} confirm={null} emptyText={null} pane={null}>
        {children}
      </DeskRecordContext>
    </ReviewDesk>
  );
}

/** The versions route answers with these rows. */
export function versionsAnswer(rows: { conceptId: string; extractedAt: string | null; lastDecisionId: number | null; displayStatus: string }[]) {
  return vi.fn(async () => new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } }));
}
