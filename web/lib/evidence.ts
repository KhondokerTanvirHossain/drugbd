export type SourceSummary = {
  extras: Record<string, unknown>;
  ingredients: { code: string; name: string; retired: boolean }[];
  oclUrl: string;
};

type Mapping = { map_type?: string; to_concept_code?: string; to_concept_name?: string; retired?: boolean };

export function summariseSource(sourceJson: string | null): SourceSummary | null {
  if (!sourceJson) return null;
  let c: { id: string; extras?: Record<string, unknown>; mappings?: Mapping[] };
  try {
    c = JSON.parse(sourceJson);
  } catch {
    return null;
  }
  if (c === null || typeof c !== "object") return null;
  return {
    extras: c.extras ?? {},
    ingredients: (c.mappings ?? [])
      .filter((m) => m.map_type === "Has-active-ingredient")
      .map((m) => ({ code: m.to_concept_code ?? "", name: m.to_concept_name ?? "", retired: Boolean(m.retired) })),
    oclUrl: `https://tr.ocl.dghs.gov.bd/#/orgs/MoHFW/sources/DGDA-Drugs/concepts/${encodeURIComponent(c.id)}/`,
  };
}
