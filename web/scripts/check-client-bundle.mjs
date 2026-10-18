// Fails the build when a server secret could reach the browser: scans every file under .next/static (the only
// files served to clients) for the secret env names, their current values and the test token values.
// Runs as `postbuild`, so `npm run build` (and the Docker build) fail on a leak.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** Server-only secrets: their names must never appear in a client chunk (that would mean code reading them shipped). */
export const SECRET_ENV_NAMES = ["INTERNAL_API_TOKEN", "SESSION_SECRET", "TURNSTILE_SECRET_KEY", "QA_API_KEYS"];
/** Token values used by the tests; a client chunk holding one means test or server code leaked into the bundle. */
export const TEST_TOKEN_VALUES = ["test-internal-token-0123456789abcdef"];
const MIN_VALUE_LENGTH = 16;   // shorter values are not secrets worth matching and would match by chance

export function needlesFrom(env) {
  const values = SECRET_ENV_NAMES.map((n) => env[n] ?? "").filter((v) => v.length >= MIN_VALUE_LENGTH);
  return [...new Set([...SECRET_ENV_NAMES, ...values, ...TEST_TOKEN_VALUES])];
}

function* files(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

/** Every (file, needle) hit under dir, file paths relative to dir. Throws when dir does not exist. */
export function findLeaks(dir, needles) {
  if (!existsSync(dir)) throw new Error(`${dir} not found: run next build first`);
  const leaks = [];
  for (const path of files(dir)) {
    const text = readFileSync(path, "latin1");
    for (const needle of needles) if (text.includes(needle)) leaks.push({ file: relative(dir, path), needle });
  }
  return leaks;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = join(process.cwd(), ".next", "static");
  const needles = needlesFrom(process.env);
  const leaks = findLeaks(dir, needles);
  if (leaks.length > 0) {
    // Name the files and which env name leaked; never print a secret value.
    for (const { file, needle } of leaks)
      console.error(`client bundle leak: ${file} contains ${SECRET_ENV_NAMES.includes(needle) ? needle : "a secret value"}`);
    process.exit(1);
  }
  console.log(`client bundle check: no server secrets in .next/static (${needles.length} patterns)`);
}
