import type { ClinicalIngredient } from "@/lib/api";

const amount = (v: number | null, u: string | null) =>
  v === null ? (u ?? "") : u === "%" ? `${v}%` : u ? `${v} ${u}` : String(v);

/** "500 mg", "0.5%", "125 mg per 5 mL"; empty when no strength is known. */
export function formatStrength(i: Pick<ClinicalIngredient, "strengthValue" | "strengthUnit" | "perValue" | "perUnit">): string {
  const s = amount(i.strengthValue, i.strengthUnit);
  if (!s || !i.perUnit) return s;
  return `${s} per ${amount(i.perValue, i.perUnit)}`;
}
