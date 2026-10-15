import { createContext, useContext } from "react";
import type { PairReview, PairReviewStateName } from "@/lib/review-types";
import type { RowStatus } from "./pair-machine";

/** One row as the island sees it: its decision status, the senior's own outcome (if any) and its note panel. */
export type RowView = {
  status: RowStatus; review: PairReview | null; state: PairReviewStateName; panelOpen: boolean; note: string; noteError: boolean;
};
export type SeniorApi = {
  ready: boolean; singleKeys: boolean; auth: "ok" | "forbidden" | "signedOut"; sendKeys: string;
  row(key: string): RowView;
  mark(key: string): void; clickReport(key: string): void; closeNote(key: string, focusBack: boolean, discard: boolean): void;
  setNote(key: string, v: string): void; sendNote(key: string): void; tryAgain(key: string): void; reload(key: string): void;
};

export const SeniorCtx = createContext<SeniorApi | null>(null);
/** Null outside SeniorDesk (and before it renders): the row parts then render the server's state and no actions. */
export const useSenior = () => useContext(SeniorCtx);
