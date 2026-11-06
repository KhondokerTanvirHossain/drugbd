import HeroCard from "@/components/public/HeroCard";
import { loadHero } from "@/components/public/hero";
import Landing from "@/components/public/Landing";
import { PARTNER_SAMPLE } from "@/content/check-scenarios";
import { checkPublic, getStats } from "@/lib/api";
import { rendersUnreviewed } from "@/lib/public-mode";
import { getPublicMode } from "@/lib/public-mode-read";
export const dynamic = "force-dynamic";

/**
 * §6.1. Every read is public scope; each one that fails only leaves its own part out (Review Focus 4). The mode (§6.10)
 * comes from /v1/stats, or from GET /v1/public-mode when stats did not load; when neither answers the page fails (error.tsx)
 * rather than guess a mode's copy.
 */
export default async function Home() {
  const [stats, hero, check] = await Promise.all([
    getStats().catch(() => null),
    loadHero(),
    checkPublic(PARTNER_SAMPLE.ids).catch(() => null),
  ]);
  const mode = stats?.publicMode ?? await getPublicMode();
  const heroLabel = hero && !("hidden" in hero) ? hero.review ?? "approved" : null;
  return (
    <Landing stats={stats} hero={hero ? <HeroCard hero={hero} mode={mode} /> : null} mode={mode}
      caution={rendersUnreviewed(mode, [heroLabel])}
      sample={{ ids: PARTNER_SAMPLE.ids, result: check?.ok ? check.data : null }} />
  );
}
