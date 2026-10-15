import type { IngredientSummary } from "./review-types";

/*
 * Spec §5.5.2 relation rules, computed on the server from the API's ReviewItem. Copied from Board R's nameRel, strRel
 * and hasStrength. Pure and client-safe.
 */
export type Relation = { kind: "same" | "norm" | "salt" | "added" | "differs"; sub?: string };
type Strength = Pick<IngredientSummary, "strengthValue" | "strengthUnit" | "perValue" | "perUnit">;
type Named = Pick<IngredientSummary, "raw" | "name" | "names">;

export const NAME_TYPE_LABEL: Record<string, string> = { icd11: "ICD-11", rxnorm: "RxNorm", dgda_content: "DGDA", ddinter: "DDInter" };

const plain = (n: number) => String(n);
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "{value} {unit}[ per {perValue} {perUnit}]"; "" when the pipeline parsed no strength. */
export function strengthText(g: Strength): string {
  if (g.strengthValue === null) return "";
  const base = `${plain(g.strengthValue)} ${g.strengthUnit ?? ""}`.trim();
  return g.perValue !== null ? `${base} per ${plain(g.perValue)} ${g.perUnit ?? ""}`.trim() : base;
}

/** The DGDA raw ingredient text with its trailing strength removed. */
export function rawName(g: Pick<IngredientSummary, "raw">): string {
  return g.raw.replace(/\s+\d.*$/, "").trim();
}

/** Board R hasStrength: "{v} {unit}" plus "/{per} {perUnit}" (no "1 " for a per of 1), not inside a longer number. */
export function hasStrength(src: string, g: Strength): boolean {
  if (g.strengthValue === null || !g.strengthUnit) return false;
  let base = `${plain(g.strengthValue)} ${g.strengthUnit}`;
  if (g.perValue !== null) base += "/" + (g.perValue === 1 ? "" : `${plain(g.perValue)} `) + (g.perUnit ?? "");
  return new RegExp(`(^|[^\\d.])${escapeRegExp(base)}(?![\\d])`, "i").test(src);
}

export function nameRelation(g: Named): Relation {
  const r = rawName(g), a = r.toLowerCase(), b = g.name.toLowerCase();
  if (r === g.name) return { kind: "same" };
  if (a === b) return { kind: "same", sub: "Capitalisation only" };
  if (a.startsWith(`${b} `)) return { kind: "salt", sub: `Removed: ${r.slice(g.name.length).trim()}` };
  const dgda = g.names.filter((n) => n.type === "dgda_content").map((n) => n.name.toLowerCase());
  if (dgda.includes(a)) return { kind: "norm", sub: `${r} kept as the DGDA name` };
  return { kind: "differs" };
}

export function strengthRelation(g: Strength & Pick<IngredientSummary, "raw">): Relation {
  if (!hasStrength(g.raw, g)) return { kind: "differs" };
  if (g.perValue !== null) return { kind: "norm", sub: `Written as ${strengthText(g)}` };
  return { kind: "same" };
}

export function formRelation(source: string, extracted: string | null): Relation {
  if (extracted === null) return { kind: "differs" };
  if (source === extracted) return { kind: "same" };
  if (source.toLowerCase() === extracted.toLowerCase()) return { kind: "same", sub: "Capitalisation only" };
  return { kind: "differs" };
}

export function genericRelation(raw: string, ings: (Named & Strength)[]): Relation {
  const found = ings.length > 0
    && ings.every((g) => raw.toLowerCase().includes(rawName(g).toLowerCase()) && hasStrength(raw, g));
  if (!found) return { kind: "differs" };
  return { kind: "same", sub: ings.length > 1 ? "Both ingredients and strengths found" : "Ingredient and strength found" };
}

export function xmRelation(xmCode: string, ings: IngredientSummary[]): { relation: Relation; match: IngredientSummary | null } {
  const match = ings.find((g) => g.codes.some((c) => c.system === "ICD11_XM" && c.code === xmCode)) ?? null;
  return match ? { relation: { kind: "same" }, match } : { relation: { kind: "differs", sub: "No substance carries this code" }, match: null };
}
