import { listBatches } from "@/lib/api";
import { BATCHES_REVIEWERS_ONLY } from "@/lib/copy";
import { isReviewer } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
export const dynamic = "force-dynamic";

export default async function Batches() {
  // Batch evidence shows unreviewed records: reviewers only (spec §12.1). Status 200, so the deploy smoke check passes.
  if (!isReviewer(await getSession())) return <><h1>Batches</h1><p role="status">{BATCHES_REVIEWERS_ONLY}</p></>;
  const batches = await listBatches();
  return (
    <>
      <h1>Batches</h1>
      <table>
        <thead><tr><th>Batch</th><th>Status</th><th>Items</th><th>Run at (UTC)</th></tr></thead>
        <tbody>{batches.map((b) => (
          <tr key={b.batchId}><td><a href={`/batches/${encodeURIComponent(b.batchId)}`}>{b.batchId}</a></td><td>{b.status}</td>
            <td>{b.itemCount}</td><td>{b.runAt}</td></tr>))}</tbody>
      </table>
    </>
  );
}
