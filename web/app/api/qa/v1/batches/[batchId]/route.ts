import { qaPath, qaUpstream } from "@/lib/api";
import { BATCH_ID, fromUpstream, invalid, pathIds, qaHandler, queryOf } from "@/lib/qa-api";
import { mapBatch } from "@/lib/qa-map";

export const dynamic = "force-dynamic";
const PATH = /^\/api\/qa\/v1\/batches\/([^/]+)$/;

/** §7.9.3: one batch's current items with each stage's status and stored note (GET /v1/qa/batches/{b}/items). */
export const GET = qaHandler("batch", "/api/qa/v1/batches/[batchId]", async (url) => {
  const p = pathIds(url, PATH, ["batchId"]);
  if (!p.ok) return p.outcome;
  const [batchId] = p.ids;
  if (!BATCH_ID.test(batchId)) return invalid("batchId");
  const q = queryOf(url, []);
  if (!q.ok) return invalid(q.field);
  return fromUpstream(await qaUpstream(qaPath.batch(batchId)), ["batchId"], mapBatch);
});
