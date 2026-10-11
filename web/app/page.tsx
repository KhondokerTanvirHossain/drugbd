import { searchProducts } from "@/lib/api";
import { firstParam } from "@/lib/params";
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> }) {
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const page = firstParam(sp.page) || "0";
  const pageNum = Math.max(0, Number.parseInt(page, 10) || 0);
  const { items, error } = await searchProducts(q, pageNum);
  return (
    <>
      <form method="get" role="search">
        <input name="q" defaultValue={q} placeholder="Brand or ingredient, e.g. napa, amphotericin" minLength={2} maxLength={100} />
        <button type="submit">Search</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {q.trim().length >= 2 && !error && items.length === 0 && <p>No products found.</p>}
      <ul>
        {items.map((p) => (
          <li key={p.conceptId}>
            <a href={`/products/${encodeURIComponent(p.conceptId)}`}>{p.tradeName}</a>{" "}
            {p.dosageForm}: {p.genericContentRaw} <small>({p.company})</small>
          </li>
        ))}
      </ul>
      {items.length === 20 && <a href={`/?q=${encodeURIComponent(q)}&page=${pageNum + 1}`}>Next page</a>}
    </>
  );
}
