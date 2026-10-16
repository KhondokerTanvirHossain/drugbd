import "server-only";
import { SCENARIOS, type Scenario } from "@/content/check-scenarios";
import { checkPublic } from "@/lib/api";

/** A scenario renders only when all of its products exist (§6.7.1): one check of every scenario id, dropping each unknown one. */
export async function availableScenarios(): Promise<Scenario[]> {
  let ids = [...new Set(SCENARIOS.flatMap((s) => s.ids))];
  const gone = new Set<string>();
  for (let i = 0; i < 5 && ids.length >= 2; i++) {
    const r = await checkPublic(ids).catch(() => null);
    if (!r || r.ok || !r.unknownId) break;
    const unknown = r.unknownId;
    gone.add(unknown);
    ids = ids.filter((id) => id !== unknown);
  }
  return SCENARIOS.filter((s) => s.ids.every((id) => !gone.has(id)));
}
