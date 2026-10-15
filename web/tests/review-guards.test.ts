import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB = fileURLToPath(new URL("..", import.meta.url));
function* files(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx)$/.test(name)) yield relative(WEB, p).split("\\").join("/");
  }
}
const read = (f: string) => readFileSync(join(WEB, f), "utf8");
const source = () => [...files(join(WEB, "app")), ...files(join(WEB, "components")), ...files(join(WEB, "lib"))];

describe("review surface guards (§2.3, Task 14)", () => {
  it("app/review and components/review never import next/link: crossing the surface is a document navigation", () => {
    const offenders = [...files(join(WEB, "app/review")), ...files(join(WEB, "components/review"))]
      .filter((f) => /from\s+["']next\/link["']/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("the legacy pages are gone", () => {
    expect(existsSync(join(WEB, "app/batches"))).toBe(false);
    expect(existsSync(join(WEB, "app/flags"))).toBe(false);
  });

  it("no app code links to /batches or /flags; only the redirect rules name them", () => {
    // lib/copy.ts holds P1A's §1.7 row label "Phase-0 `/batches` gate for non-reviewers" verbatim (pinned by copy.test):
    // a copy key, never a link or a redirect.
    // lib/request-log.ts: P1A's route templates for the legacy paths, which the middleware's 308 log lines still use
    // (STATIC_ROUTES "/batches", "/flags"; DYNAMIC_ROUTES "/batches/[id]", pinned by Task 14's middleware-review.test.ts).
    const allowed = new Set(["lib/surface.ts", "lib/copy.ts", "lib/request-log.ts"]);
    const offenders = source().filter((f) => !allowed.has(f) && /["'`]\/(batches|flags)\b/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no review page or desk file reads the public batch endpoints", () => {
    const offenders = source().filter((f) => /\b(getBatchReport|listBatches|getBatch|listFlags)\s*\(/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("the legacy decision path is gone with its audit helper; the desk's decide is the only decision writer", () => {
    const offenders = source().filter((f) => /\b(submitReview|reviewAction|denyDecision|DeniedOutcome)\b/.test(read(f)));
    expect(offenders).toEqual([]);
    expect(read("lib/review-actions.ts")).toContain('logged("action:resolve", () => submitResolve(formData))');
  });
});
