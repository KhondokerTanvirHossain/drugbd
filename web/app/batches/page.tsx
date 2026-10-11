import { listBatches } from "@/lib/api";
export const dynamic = "force-dynamic";
export default async function Batches() {
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
