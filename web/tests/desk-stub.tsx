import type { ReactNode } from "react";
import { vi } from "vitest";
import { initialMachine } from "@/components/review/desk/commit-machine";
import { DeskCtx, barFromRegistration, type DeskApi, type RecordRegistration } from "@/components/review/desk/context";

/** A DeskApi with every action a mock, for rendering one desk part without ReviewDesk (Tasks 17a and 17b). */
export function stubDesk(reg: RecordRegistration, over: Partial<DeskApi> = {}): DeskApi {
  const machine = over.machine ?? initialMachine(8);
  return {
    ready: true, batchId: reg.batchId, role: "pharmacist", total: reg.total, singleKeys: true, undoSeconds: 8,
    machine, bar: { ...barFromRegistration(reg, "pharmacist", 8), machine }, complete: false, hint: null, botState: "passed",
    retryBusy: false, drawerOpen: false, sheetOpen: false, reportOpen: false, note: "", noteError: false, diff: null, diffOpen: false,
    slots: { batchesNav: null, batchCard: null },
    staleFor: () => null, netErrFor: () => null, statusFor: (_id, fallback) => fallback,
    register: vi.fn(), subtree: (_id, _v, node) => node, reloadOpen: vi.fn(), pressApprove: vi.fn(), clickReport: vi.fn(),
    closeReport: vi.fn(), setNote: vi.fn(), sendReport: vi.fn(), undo: vi.fn(), tryAgain: vi.fn(), retryCheck: vi.fn(),
    toggleDrawer: vi.fn(), toggleDiff: vi.fn(), navigate: vi.fn(), move: vi.fn(), openSource: vi.fn(), openFirst: vi.fn(),
    registerSearchClear: vi.fn(), announce: vi.fn(), ...over,
  };
}

export function WithDesk({ desk, children }: { desk: DeskApi; children: ReactNode }) {
  return <DeskCtx.Provider value={desk}>{children}</DeskCtx.Provider>;
}
