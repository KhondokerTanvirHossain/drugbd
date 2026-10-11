import "server-only";

export type Ingredient = { xmCode: string; name: string };
export type Product = {
  conceptId: string; darNumber: string; tradeName: string; company: string; dosageForm: string;
  genericContentRaw: string; qualityFlag: string | null; ingredients: Ingredient[];
};
export type SearchResult = { items: Product[]; error: string | null };

const base = () => process.env.API_URL ?? "http://api:8080";

export async function searchProducts(q: string, page: number): Promise<SearchResult> {
  const term = q.trim();
  if (term.length < 2) return { items: [], error: null };
  const params = new URLSearchParams({ q: term, page: String(page) });
  const res = await fetch(`${base()}/v1/products?${params}`, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { items: [], error: body?.errors?.[0]?.message ?? "Search failed" };
  return { items: body.data ?? [], error: null };
}

export async function getProduct(id: string): Promise<Product | null> {
  const res = await fetch(`${base()}/v1/products/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return (await res.json()).data as Product;
}
