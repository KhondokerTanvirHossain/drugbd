import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * §7.10.6 "Client setup": the README's hosted-server snippets are the ones the QA tools page shows (web/lib/qa-snippets.ts,
 * dependency-free, loaded by URL so this package's typecheck never reads it), for the production host, and they never carry
 * a key.
 */
type Snippets = { mcp: string; claudeCode: string; cursor: string };
const SNIPPETS_URL = new URL("../../../web/lib/qa-snippets.ts", import.meta.url).href;
const snippets = async () => ((await import(/* @vite-ignore */ SNIPPETS_URL)) as { qaSnippets: (host: string) => Snippets })
  .qaSnippets("drugdb.eliooo.org");
const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

describe("README: the hosted server (§7.10.6)", () => {
  it("shows the page's Claude Code command and Cursor entry for drugdb.eliooo.org", async () => {
    const s = await snippets();
    expect(s.mcp).toBe("https://drugdb.eliooo.org/api/qa/mcp");
    expect(README).toContain(s.claudeCode);
    expect(README).toContain(s.cursor);
    expect(s.claudeCode).toBe("claude mcp add --transport http intellidrugs-qa https://drugdb.eliooo.org/api/qa/mcp "
      + "--header \"Authorization: Bearer $INTELLIDRUGS_QA_KEY\"");
  });

  it("says plainly that OAuth connectors (claude.ai, ChatGPT) cannot connect, and never suggests a project-scoped config", () => {
    expect(README).toMatch(/claude\.ai and ChatGPT connectors[^.]*OAuth/);
    expect(README).toContain("never `--scope project`");
    expect(README).not.toMatch(/idqa_[A-Za-z0-9_-]{43}/);
  });

  it("says a self-service key from /review/qa works here unchanged", () => {
    expect(README).toContain("/review/qa");
    expect(README).toMatch(/works here unchanged/);
  });
});
