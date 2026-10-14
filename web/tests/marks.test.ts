import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB = fileURLToPath(new URL("..", import.meta.url));
function* files(dir: string, ext: RegExp): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p, ext);
    else if (ext.test(name)) yield relative(WEB, p).split("\\").join("/");
  }
}
const all = (ext: RegExp) => [...files(join(WEB, "app"), ext), ...files(join(WEB, "components"), ext)];
const read = (f: string) => readFileSync(join(WEB, f), "utf8");
/** Strings that look like class lists: className="…", className={`…`}, class names inside quotes. */
const classStrings = (src: string) => [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]);

/** P1B adds the reviewer toolbar, sidebar and decision bar files here. */
export const MATERIAL_ALLOWED: string[] = [
  "components/review/ReviewToolbar.tsx",
  "components/review/ReviewDesk.tsx",
  "components/review/desk/DeskRecordContext.tsx",
  "components/review/desk/DecisionBar.tsx",
  "components/review/desk/LoadingPanes.tsx",
];

describe("§3.4 mark exclusivity", () => {
  it("green approval (.rv--approved) is printed only by ReviewStatus", () => {
    expect(all(/\.tsx$/).filter((f) => f !== "components/ui/ReviewStatus.tsx" && /rv--approved/.test(read(f)))).toEqual([]);
  });
  it("the hatch is printed only by NoDataBlock and NoDataChip", () => {
    const allowed = ["components/ui/NoDataBlock.tsx", "components/ui/NoDataChip.tsx"];
    expect(all(/\.tsx$/).filter((f) => !allowed.includes(f) && classStrings(read(f)).some((c) => /\b(hatch|sev--nodata|nodata-block)\b/.test(c))))
      .toEqual([]);
  });
  it("translucent material is used only on the toolbar, the sidebar and the decision bar", () => {
    expect(all(/\.tsx$/).filter((f) => !MATERIAL_ALLOWED.includes(f) && classStrings(read(f)).some((c) => /\b(material|decision-bar)\b/.test(c))))
      .toEqual([]);
  });
  it("no CSS Module reaches for the green, hatch or material tokens", () => {
    const banned = /var\(--(ok|ok-soft|ok-line|hatch|nodata-hatch|nodata-soft|material|material-solid|material-edge)\)/;
    expect(all(/\.module\.css$/).filter((f) => banned.test(read(f)))).toEqual([]);
  });
});
