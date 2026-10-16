import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ISLANDS, ISLAND_DIRS, checkIslands, clientFiles, importsOf } from "../scripts/check-client-islands.mjs";

const WEB = fileURLToPath(new URL("..", import.meta.url));
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "islands-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("client-island allowlist (§4.2)", () => {
  it("lists exactly the §4.2 islands", () => {
    expect([...ISLANDS].sort()).toEqual([
      "app/error.tsx", "app/review/error.tsx", "app/signin/SignInButton.tsx", "components/AccountMenu.tsx",
      "components/Expander.tsx", "components/ThemeSwitch.tsx", "components/TurnstileField.tsx",
      "components/check/CheckerCombobox.tsx", "components/learn/GlossaryFilter.tsx", "components/learn/LearnRail.tsx",
      "components/review/ReviewDesk.tsx", "components/review/desk/DeskRecordContext.tsx",
    ]);
  });

  it("the real tree passes", () => {
    expect(checkIslands(WEB)).toEqual([]);
  });

  it("finds 'use client' after leading comments and reads every import form", () => {
    const root = fixture({ "components/A.tsx": '// note\n/* doc */\n"use client";\nimport x from "a";\nimport { y,\n z } from "@/b";\nimport "c";\nexport { q } from "./d";\nconst m = import("e");\n' });
    expect(clientFiles(root)).toEqual(["components/A.tsx"]);
    expect(importsOf('import x from "a";\nimport { y,\n z } from "@/b";\nimport "c";\nexport { q } from "./d";\nconst m = import("e");'))
      .toEqual(["a", "@/b", "c", "./d", "e"]);
  });

  it("fails a 'use client' file that is not on the list", () => {
    const root = fixture({ "components/Rogue.tsx": '"use client";\nexport default function R() { return null; }\n' });
    expect(checkIslands(root)).toEqual(['components/Rogue.tsx: "use client" file is not in the island allowlist (spec §4.2)']);
  });

  it("scans content/ too: a 'use client' Learn chapter is not on the list", () => {
    const root = fixture({ "content/learn/x.tsx": '"use client";\nexport default 1;\n' });
    expect(checkIslands(root)).toEqual(['content/learn/x.tsx: "use client" file is not in the island allowlist (spec §4.2)']);
  });

  it("allows any file under components/review/desk/", () => {
    expect(checkIslands(fixture({ "components/review/desk/commit-machine.ts": '"use client";\nexport const x = 1;\n' }))).toEqual([]);
  });

  it("P1C: SeniorDesk plus components/review/senior/* (§4.2)", () => {
    expect(ISLAND_DIRS).toEqual(["components/review/desk/", "components/review/senior/"]);
    expect(checkIslands(fixture({ "components/review/senior/SeniorDesk.tsx": '"use client";\nexport default 1;\n' }))).toEqual([]);
    expect(checkIslands(fixture({ "components/review/senior/X.tsx": '"use client";\nimport "@/lib/api";\n' })))
      .toEqual(["components/review/senior/X.tsx: imports @/lib/api"]);
  });

  it("fails an island that imports @/lib/api, @/lib/session, server-only or next/headers", () => {
    const root = fixture({ "components/Expander.tsx": '"use client";\nimport { getSession } from "@/lib/session";\nimport "@/lib/api";\nimport "server-only";\nimport { headers } from "next/headers";\n' });
    expect(checkIslands(root)).toEqual([
      "components/Expander.tsx: imports @/lib/session", "components/Expander.tsx: imports @/lib/api",
      "components/Expander.tsx: imports server-only", "components/Expander.tsx: imports next/headers",
    ]);
  });

  it("fails an island that imports any module marked server-only", () => {
    const root = fixture({
      "components/ThemeSwitch.tsx": '"use client";\nimport { secret } from "@/lib/secret";\nimport { ok } from "../lib/plain";\n',
      "lib/secret.ts": 'import "server-only";\nexport const secret = 1;\n',
      "lib/plain.ts": "export const ok = 1;\n",
    });
    expect(checkIslands(root)).toEqual(["components/ThemeSwitch.tsx: imports server-only module @/lib/secret"]);
  });
});
