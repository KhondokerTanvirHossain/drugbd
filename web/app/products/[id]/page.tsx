import { notFound } from "next/navigation";
import ProductStub from "@/components/public/ProductStub";
import ProductView from "@/components/public/ProductView";
import { getClinicalDrug, getProductInteractions, getPublicProduct, isStub } from "@/lib/api";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import type { ProductInteractions, ProductStub as Stub, PublicProduct } from "@/lib/public-types";
import { isPathId, parseIndex } from "@/lib/public-params";
import { getSession } from "@/lib/session";
import { turnstileSiteKey } from "@/lib/turnstile";
export const dynamic = "force-dynamic";

/**
 * §6.4, §6.5. Public scope for every session (§2.2): a reviewer sees the stub too. The stub is status 200 (the record
 * exists); an unknown id is not-found.tsx; any other failure of the product read is the error page, never a stub.
 */
export default async function ProductPage({ params, searchParams }: {
    params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  let decoded: string;
  try { decoded = decodeURIComponent(id); } catch { notFound(); }
  if (!isPathId(decoded)) notFound();   // over ID_MAX or a control character: never sent to the API (final review finding 2)
  const r = await getPublicProduct(decoded);
  if (!r.ok && r.status === 404) notFound();
  if (!r.ok) throw new Error(`product read failed (${r.status})`);
  if (isStub(r.data)) return <ProductStub stub={r.data as Stub} />;
  const product = r.data as PublicProduct;
  const ix = parseIndex(sp.ix);
  const [pairs, drug, session, nonce] = await Promise.all([
    getProductInteractions(product.conceptId, ix).catch(() => null),
    product.otherBrandsCount > 0 && product.clinicalDrug ? getClinicalDrug(product.clinicalDrug.bdcId).catch(() => null) : Promise.resolve(null),
    getSession(),
    cspNonce(),
  ]);
  const interactions = pairs?.ok && !isStub(pairs.data) ? (pairs.data as ProductInteractions) : null;
  return (
    <ProductView product={product} interactions={interactions} ix={ix} brands={drug?.ok ? drug.data.products : null}
      session={session} flag={firstParam(sp.flag) || undefined} siteKey={turnstileSiteKey()} nonce={nonce} />
  );
}
