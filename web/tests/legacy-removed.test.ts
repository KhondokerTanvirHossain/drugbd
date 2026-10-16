import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const WEB = join(__dirname, "..");
const GONE = ["components/FlagForm.tsx", "components/badges.tsx", "components/badges.module.css", "app/legacy.module.css",
  "tests/flag-form.test.tsx", "tests/api.test.ts"];
const OLD_EXPORTS = ["searchProducts", "SearchResult", "getProduct", "Product", "Ingredient", "ClinicalDrug", "HiddenProduct",
  "HiddenSubstance", "LoadedProduct", "listLoadedProducts", "Substance", "getSubstance", "AlertSide", "Alert", "CheckResult",
  "CheckOutcome", "checkInteractions"];

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx|css)$/.test(name)) yield relative(WEB, p);
  }
}

describe("the pre-P2 public code is gone (§11.2: each replaced, none deleted without a replacement)", () => {
  it("the old files no longer exist", () => {
    for (const f of GONE) expect(existsSync(join(WEB, f)), f).toBe(false);
  });

  it("lib/api.ts exports none of the old readers or types", () => {
    const api = readFileSync(join(WEB, "lib/api.ts"), "utf8");
    for (const name of OLD_EXPORTS)
      expect(api, name).not.toMatch(new RegExp(`export (async )?(function|type|const) ${name}\\b`));
  });

  it("no source file imports the removed modules", () => {
    const files = ["app", "components", "lib", "content", "tests", "e2e"].filter((d) => existsSync(join(WEB, d)))
      .flatMap((d) => [...sources(join(WEB, d))]).filter((f) => f !== "tests/legacy-removed.test.ts");
    for (const f of files) {
      const src = readFileSync(join(WEB, f), "utf8");
      expect(src, f).not.toMatch(/@\/components\/(FlagForm|badges)["']|legacy\.module\.css/);
    }
  });
});
