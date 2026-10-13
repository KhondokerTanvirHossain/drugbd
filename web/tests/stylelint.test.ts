import { fileURLToPath } from "node:url";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import config from "../stylelint.config.mjs";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const lint = (code: string) => stylelint.lint({ code, config, codeFilename: `${WEB}components/x.module.css` });

describe("stylelint colour-literal ban (§3.1)", () => {
  it.each([".a{color:#fff}", ".a{color:#1F5BB8}", ".a{color:red}", ".a{background:rgb(0 0 0)}",
    ".a{background:rgba(0,0,0,.5)}", ".a{color:hsl(0 0% 0%)}"])("rejects %s", async (code) => {
    expect((await lint(code)).errored).toBe(true);
  });

  it("accepts token references", async () => {
    expect((await lint(".a{color:var(--fg-2);background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-ctl)}")).errored)
      .toBe(false);
  });

  it("every CSS file in web/ passes, and tokens.css is the only file allowed colour literals", async () => {
    const result = await stylelint.lint({ files: ["**/*.css"], cwd: WEB, configBasedir: WEB, config });
    const messages = result.results.flatMap((r) => r.warnings.map((w) => `${r.source}: ${w.text}`));
    expect(messages).toEqual([]);
  });
});
