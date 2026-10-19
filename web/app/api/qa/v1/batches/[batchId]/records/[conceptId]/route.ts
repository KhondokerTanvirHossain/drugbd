import { isPathId } from "@/lib/public-params";
import { BATCH_ID, invalid, pathIds, qaHandler, queryOf } from "@/lib/qa-api";

export const dynamic = "force-dynamic";
const PATH = /^\/api\/qa\/v1\/batches\/([^/]+)\/records\/([^/]+)$/;

/**
 * §7.9.3 QaRecord: one record in full, from the reviewer item read (GET /v1/review/batches/{b}/items/{c}) sent without
 * X-Viewer-Email, through the allowlist (no email, no note, no `mine`).
 */
export const GET = qaHandler("record", "/api/qa/v1/batches/[batchId]/records/[conceptId]", (url) => {
  const p = pathIds(url, PATH, ["batchId", "conceptId"]);
  if (!p.ok) return p.outcome;
  const [batchId, conceptId] = p.ids;
  if (!BATCH_ID.test(batchId)) return invalid("batchId");
  if (!isPathId(conceptId)) return invalid("conceptId");
  const q = queryOf(url, []);
  if (!q.ok) return invalid(q.field);
  return { ok: true, input: { route: "record", batchId, conceptId } };
});
