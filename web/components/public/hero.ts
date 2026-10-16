import "server-only";
import { getPublicProduct, isStub } from "@/lib/api";
import type { ProductStub, PublicProduct } from "@/lib/public-types";

/**
 * The landing hero product (§6.1, D26): HERO_CONCEPT_ID, read with public scope. Null when the variable is unset or
 * blank, the id is unknown, the read fails, or the answer names another product (Review Focus 4): the landing then
 * renders without the card, never with a 500.
 */
export async function loadHero(): Promise<PublicProduct | ProductStub | null> {
  const id = (process.env.HERO_CONCEPT_ID ?? "").trim();
  if (!id) return null;
  try {
    const r = await getPublicProduct(id);
    if (!r.ok || r.data.conceptId !== id) return null;
    return isStub(r.data) ? (r.data as ProductStub) : (r.data as PublicProduct);
  } catch {
    return null;
  }
}
