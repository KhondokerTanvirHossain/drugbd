import type { ProductStub, PublicProduct } from "@/lib/public-types";
export default function HeroCard({ hero }: { hero: PublicProduct | ProductStub }) { return <div data-hero={hero.conceptId} />; }
