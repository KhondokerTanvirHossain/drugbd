import { qaPath, qaUpstream } from "@/lib/api";
import { BATCH_ID, QA_FILTERS, QA_STAGES, fromUpstream, invalid, pageOf, qaHandler, queryOf } from "@/lib/qa-api";
import { mapRecords } from "@/lib/qa-map";

export const dynamic = "force-dynamic";

/**
 * §7.9.3, §7.9.4: current records matching a problem filter, 100 a page, from GET /v1/qa/records. Checked in the internal
 * API's order: unknown or repeated parameter, filter, stage (stage_warn only), batch, page.
 */
export const GET = qaHandler("records", "/api/qa/v1/records", async (url) => {
  const r = queryOf(url, ["filter", "stage", "batch", "page"]);
  if (!r.ok) return invalid(r.field);
  const filter = r.q.get("filter"), stage = r.q.get("stage"), batch = r.q.get("batch");
  if (filter === undefined || !(QA_FILTERS as readonly string[]).includes(filter)) return invalid("filter");
  if (stage !== undefined && (filter !== "stage_warn" || !(QA_STAGES as readonly string[]).includes(stage))) return invalid("stage");
  if (batch !== undefined && !BATCH_ID.test(batch)) return invalid("batch");
  const page = pageOf(r.q.get("page"));
  if (page === null) return invalid("page");
  const params = new URLSearchParams({ filter });
  if (stage !== undefined) params.set("stage", stage);
  if (batch !== undefined) params.set("batch", batch);
  params.set("page", String(page));
  return fromUpstream(await qaUpstream(qaPath.records(params)), ["batch"], mapRecords);
});
