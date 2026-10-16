import { notFound } from "next/navigation";
import { SubstanceStubView } from "@/components/public/ProductStub";
import SubstanceView from "@/components/public/SubstanceView";
import { getPublicSubstance, getSubstanceInteractions, isStub } from "@/lib/api";
import type { PublicSubstance, SubstanceInteractions, SubstanceStub } from "@/lib/public-types";
import { parseIndex, parseSeverity } from "@/lib/public-params";
export const dynamic = "force-dynamic";

/** §6.6. Public scope for every session (§2.2). A bad severity or page reads as All or the first page (Review Focus 5). */
export default async function SubstancePage({ params, searchParams }: {
    params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  let decoded: string;
  try { decoded = decodeURIComponent(id); } catch { notFound(); }
  const r = await getPublicSubstance(decoded);
  if (!r.ok && r.status === 404) notFound();
  if (!r.ok) throw new Error(`substance read failed (${r.status})`);
  if (isStub(r.data)) return <SubstanceStubView stub={r.data as SubstanceStub} />;
  const s = r.data as PublicSubstance;
  const severity = parseSeverity(sp.severity), page = parseIndex(sp.page);
  const list = s.coverage.coverage === "full" ? await getSubstanceInteractions(s.bdsId, severity, page).catch(() => null) : null;
  return <SubstanceView s={s} list={list?.ok && !isStub(list.data) ? (list.data as SubstanceInteractions) : null} severity={severity} page={page} />;
}
