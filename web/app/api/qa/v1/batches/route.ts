import { qaPath, qaUpstream } from "@/lib/api";
import { fromUpstream, invalid, qaHandler, queryOf } from "@/lib/qa-api";
import { mapBatches } from "@/lib/qa-map";

export const dynamic = "force-dynamic";

/** §7.9.3: every batch (GET /v1/review/batches) as id, status, item count, approved count and run time. No query parameter. */
export const GET = qaHandler("batches", "/api/qa/v1/batches", async (url) => {
  const q = queryOf(url, []);
  if (!q.ok) return invalid(q.field);
  return fromUpstream(await qaUpstream(qaPath.batches()), [], mapBatches);
});
