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

type Zone = "UTC" | "Asia/Dhaka";
/** DD/MM/YYYY and HH:mm (24-hour) in the zone, assembled by hand from Intl parts (§3.5). Null when unparseable. */
function zoned(iso: string, timeZone: Zone): { date: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.day}/${p.month}/${p.year}`, time: `${p.hour}:${p.minute}` };
}

/** "11/10/2026 21:27 UTC" */
export function fmtUtc(iso: string): string {
  const z = zoned(iso, "UTC");
  return z ? `${z.date} ${z.time} UTC` : iso;
}
/** "12/10/2026 03:27 Dhaka" (reviewer surfaces) */
export function fmtDhaka(iso: string): string {
  const z = zoned(iso, "Asia/Dhaka");
  return z ? `${z.date} ${z.time} Dhaka` : iso;
}
/** "12/10/2026 03:27": the Dhaka date and time without the zone word, for sentences that name it ("… in Dhaka"). */
export function fmtDhakaClock(iso: string): string {
  const z = zoned(iso, "Asia/Dhaka");
  return z ? `${z.date} ${z.time}` : iso;
}
/** "12/10/2026 03:28 Dhaka time" (public surfaces) */
export function fmtDhakaTime(iso: string): string {
  const z = zoned(iso, "Asia/Dhaka");
  return z ? `${z.date} ${z.time} Dhaka time` : iso;
}
/** "on 14/10/2026, 11:20 Dhaka time" */
export function fmtDhakaOn(iso: string): string {
  const z = zoned(iso, "Asia/Dhaka");
  return z ? `on ${z.date}, ${z.time} Dhaka time` : iso;
}
