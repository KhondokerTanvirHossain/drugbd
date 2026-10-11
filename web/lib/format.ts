import type { ClinicalIngredient } from "@/lib/api";

const amount = (v: number | null, u: string | null) =>
  v === null ? (u ?? "") : u === "%" ? `${v}%` : u ? `${v} ${u}` : String(v);

/** "500 mg", "0.5%", "125 mg per 5 mL"; empty when no strength is known. */
export function formatStrength(i: Pick<ClinicalIngredient, "strengthValue" | "strengthUnit" | "perValue" | "perUnit">): string {
  const s = amount(i.strengthValue, i.strengthUnit);
  if (!s || !i.perUnit) return s;
  return `${s} per ${amount(i.perValue, i.perUnit)}`;
}

/** "2026-10-12 10:05 UTC" from an ISO instant; the raw value when it does not parse. */
export function formatUtc(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
