import type { RecordRegistration, RowRef } from "@/components/review/desk/context";
import { recordHref } from "@/components/review/desk/hrefs";
import type { Version } from "@/lib/review-types";
import { pilotRows } from "./fixtures/pilot";

/** The pilot list as the record page registers it (no filter, not the complete view). */
export function makeReg(key: string, over: Partial<RecordRegistration> = {}, version?: Version): RecordRegistration {
  const all: RowRef[] = pilotRows().map((r) => ({ ...r, href: recordHref("0001-pilot", r.conceptId) }));
  const i = all.findIndex((r) => r.conceptId.includes(key));
  const row = all[i];
  return {
    batchId: "0001-pilot", conceptId: row.conceptId, tradeName: row.tradeName, index: row.index, total: all.length,
    displayStatus: row.displayStatus, version: version ?? row.version, stagesBlocked: false,
    sourceUrl: `https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/${row.conceptId}/`,
    show: "all", q: "", rows: all, all, requestId: "11111111-2222-4333-8444-555555555555",
    prevHref: i > 0 ? all[i - 1].href : null, nextHref: i < all.length - 1 ? all[i + 1].href : null, complete: false, ...over,
  };
}
