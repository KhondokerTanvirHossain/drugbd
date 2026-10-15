"use server";
import { logSenior, runPairDecideLogged } from "./senior-core";
import type { PairDecideInput, PairDecideResult } from "./senior-types";

/*
 * Server actions of the senior pages. Every export of a "use server" module is a callable endpoint, so this file exports
 * only these two. The checks live in senior-core (server-only); this module has no "server-only" import, so the SeniorDesk
 * island may import it (scripts/check-client-islands.mjs).
 */
export async function pairDecide(input: PairDecideInput): Promise<PairDecideResult> {
  return runPairDecideLogged(input);
}

export async function logSeniorOpen(type: "pair_queue" | "substance", id: string): Promise<void> {
  await logSenior(type, id);
}
