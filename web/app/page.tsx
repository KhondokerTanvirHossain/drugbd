import HeroCard from "@/components/public/HeroCard";
import { loadHero } from "@/components/public/hero";
import Landing from "@/components/public/Landing";
import { PARTNER_SAMPLE } from "@/content/check-scenarios";
import { checkPublic, getStats } from "@/lib/api";
export const dynamic = "force-dynamic";

/** §6.1. Every read is public scope; each one that fails only leaves its own part out (Review Focus 4). */
export default async function Home() {
  const [stats, hero, check] = await Promise.all([
    getStats().catch(() => null),
    loadHero(),
    checkPublic(PARTNER_SAMPLE.ids).catch(() => null),
  ]);
  return (
    <Landing stats={stats} hero={hero ? <HeroCard hero={hero} /> : null}
      sample={{ ids: PARTNER_SAMPLE.ids, result: check?.ok ? check.data : null }} />
  );
}
