import { createContext, useContext, type ReactNode } from "react";
import type { DiffRow, DisplayStatus, FilterKey, ItemHint, OpenIssue, ReviewerRole, Version } from "@/lib/review-types";
import { initialMachine, type MachineState } from "./commit-machine";
import type { BarCtx } from "./bar-state";

/** One row of the record list, as the record page renders it (§5.4). `href` keeps the current filter and search. */
export type RowRef = {
  index: number; conceptId: string; tradeName: string; clinicalDisplayName: string | null; displayStatus: DisplayStatus;
  hint: ItemHint; version: Version; href: string;
};

/** What the record page registers with the desk on mount and on every new render (§4.2 DeskRecordContext). */
export type RecordRegistration = {
  batchId: string; conceptId: string; tradeName: string; index: number; total: number; displayStatus: DisplayStatus;
  version: Version; stagesBlocked: boolean; sourceUrl: string; show: FilterKey; q: string;
  /** The visible order (filter and search applied) and every current record by index. */
  rows: RowRef[]; all: RowRef[];
  /** For the no-JavaScript form only (§5.8.6); the desk makes its own per decision. */
  requestId: string;
  prevHref: string | null; nextHref: string | null;
  /**
   * §5.12 "Batch complete" on arrival: true only when /review/[batchId] found every current record approved and sent the
   * reviewer here with `?view=done`. Opening any record from the list or with J/K reads it (§5.7 "Open any record to read it").
   */
  complete: boolean;
  /** §5.10a: the counted issues the dismiss panel quotes, oldest first (roles only, never an email). */
  openIssues: OpenIssue[];
};

/**
 * The record's detail and its evidence, held together for one version (§5.11): while the open record is stale the desk
 * keeps rendering the pair it received for viewedVersion, so the evidence drawer never shows content the detail does not.
 */
export type HeldRecord = { detail: ReactNode; evidence: ReactNode };

export type DeskApi = {
  ready: boolean; batchId: string; role: ReviewerRole; total: number; singleKeys: boolean; undoSeconds: number;
  machine: MachineState; bar: BarCtx; complete: boolean; hint: string | null; botState: "checking" | "passed" | "failed";
  retryBusy: boolean; drawerOpen: boolean; sheetOpen: boolean; reportOpen: boolean; note: string; noteError: boolean;
  dismissOpen: boolean; dismissNote: string; dismissError: boolean;
  diff: DiffRow[] | null; diffOpen: boolean; slots: { batchesNav: ReactNode; batchCard: ReactNode };
  staleFor(conceptId: string): "rerun" | "other" | null;
  netErrFor(conceptId: string): "no" | "unknown" | null;
  statusFor(conceptId: string, fallback: DisplayStatus): DisplayStatus;
  register(reg: RecordRegistration, held: HeldRecord): void;
  subtree(conceptId: string, version: Version, held: HeldRecord): HeldRecord;
  reloadOpen(): void;
  pressApprove(): void; clickReport(): void; closeReport(focusBack: boolean, discard: boolean): void;
  setNote(v: string): void; sendReport(): void; undo(): void; tryAgain(): void; retryCheck(): void;
  toggleDrawer(on?: boolean): void; toggleDiff(): void; navigate(href: string, focusKey?: string): void;
  move(delta: 1 | -1 | "first" | "last"): void;
  openSource(): void; openFirst(): void; registerSearchClear(fn: (() => void) | null): void;
  /** §5.10a, seniors only: the dismiss panel shares the report channel (§5.8.2). */
  clickDismiss(): void; closeDismiss(focusBack: boolean, discard: boolean): void; setDismissNote(v: string): void; sendDismiss(): void;
  /** Writes to the page's one polite live region (§10.2) through `announce` from `@/lib/live-region` (P1A). */
  announce(text: string): void;
};

export const DeskCtx = createContext<DeskApi | null>(null);

export function useDesk(): DeskApi {
  const desk = useContext(DeskCtx);
  if (!desk) throw new Error("useDesk must be used inside ReviewDesk");
  return desk;
}

/** The bar as the server renders it, before the desk takes over (and for the no-JavaScript form). */
export function barFromRegistration(reg: RecordRegistration, role: ReviewerRole, undoSeconds: number): BarCtx {
  return { loading: false, complete: false, role, batchId: reg.batchId,
    record: { conceptId: reg.conceptId, name: reg.tradeName, status: reg.displayStatus, stagesBlocked: reg.stagesBlocked },
    stale: false, drawerOpen: false, reportOpen: false, dismissOpen: false, machine: initialMachine(undoSeconds), undoSeconds, advanceGuard: null, now: 0 };
}
