// Fails the build when client code grows past the §4.2 island allowlist, or when an island imports server code.
// Runs as `postbuild` next to check-client-bundle.mjs.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Spec §4.2, the complete allowlist (paths relative to web/). */
export const ISLANDS = [
  "components/ThemeSwitch.tsx",
  "app/signin/SignInButton.tsx",
  "components/TurnstileField.tsx",
  "components/review/ReviewDesk.tsx",
  "components/review/desk/DeskRecordContext.tsx",
  "components/check/CheckerCombobox.tsx",
  "components/Expander.tsx",
  "components/AccountMenu.tsx",
  "components/learn/GlossaryFilter.tsx",
  "components/learn/LearnRail.tsx",
  "app/error.tsx",
  "app/review/error.tsx",
];
/** "ReviewDesk.tsx plus components/review/desk/*" (§4.2). */
export const ISLAND_DIRS = ["components/review/desk/"];
export const FORBIDDEN_IMPORTS = ["@/lib/api", "@/lib/session", "server-only", "next/headers"];

/** P3: Learn chapters live in content/ (§6.8); none may be an island. */
const SCAN = ["app", "components", "lib", "content"];
const SOURCE = /\.(tsx?|jsx?|mjs)$/;
const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;
const IMPORT = /\bimport\s+(?:type\s+)?(?:[^'"()]*?\sfrom\s+)?["']([^"']+)["']|\bexport\s+[^'";]*?\sfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
const SERVER_ONLY = /^\s*import\s+["']server-only["']/m;

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SOURCE.test(name)) yield path;
  }
}
const rel = (root, path) => relative(root, path).split("\\").join("/");

export function clientFiles(root) {
  return SCAN.flatMap((d) => [...walk(join(root, d))])
    .filter((p) => USE_CLIENT.test(readFileSync(p, "utf8")))
    .map((p) => rel(root, p));
}

export function importsOf(text) {
  return [...text.matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? m[3]);
}

function resolveImport(root, fromRel, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(root, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(root, dirname(fromRel), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, "index.ts"), join(base, "index.tsx")])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

export function checkIslands(root) {
  const errors = [];
  for (const file of clientFiles(root)) {
    if (!ISLANDS.includes(file) && !ISLAND_DIRS.some((d) => file.startsWith(d))) {
      errors.push(`${file}: "use client" file is not in the island allowlist (spec §4.2)`);
      continue;
    }
    for (const spec of importsOf(readFileSync(join(root, file), "utf8"))) {
      if (FORBIDDEN_IMPORTS.includes(spec)) { errors.push(`${file}: imports ${spec}`); continue; }
      const target = resolveImport(root, file, spec);
      if (target && SERVER_ONLY.test(readFileSync(target, "utf8"))) errors.push(`${file}: imports server-only module ${spec}`);
    }
  }
  return errors;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const errors = checkIslands(process.cwd());
  if (errors.length > 0) {
    for (const e of errors) console.error(`client island check: ${e}`);
    process.exit(1);
  }
  console.log(`client island check: ${clientFiles(process.cwd()).length} client files, all on the §4.2 allowlist`);
}
