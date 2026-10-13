# IntelliDrugs P1A Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the IntelliDrugs design-system foundation and the security plumbing under the existing web app so P1B (reviewer workspace) and P2 (public surfaces) can build on it, and ship a working sign-in with the bot check and a return path, without changing any other surface's behaviour.

**Architecture:** The Next.js 15 app (`web/`) stays server-rendered. Global CSS is exactly `tokens.css` (byte-identical to the docs copy) and `fonts.css` (self-hosted Onest and IBM Plex Mono). Layout lives in CSS Modules that use tokens only, enforced by Stylelint. `components/ui/` holds typed server components that print the class names from `tokens.css`; client code is limited to an allowlist of islands checked at build time. The middleware builds a per-request nonce CSP, a request id, the theme-independent security headers and every rate limit; the session cookie becomes an encrypted JWT (JWE). Sign-out moves to a `POST /signout` route handler; `/api/session` gains the Turnstile check (`action=signin`) and a validated `returnTo`. The Java API gains `POST /v1/audit-events` (hexagonal: controller → service → port → R2DBC adapter) that the web uses for sign-in and sign-out events. Responses that app code ends itself (middleware 429s, the two route handlers, the legacy server actions) write one JSON log line with the route template, status, duration and request id. A CI-only compose override (its own project, `bddrug-ci`) and a Playwright harness run the production build end to end.

**Tech Stack:** Next.js 15.5 (app router, Node.js middleware), React 19, TypeScript 5.7, vitest 2.1 (+ jsdom 26, Testing Library 16), Stylelint 16, Playwright 1.64 with `@axe-core/playwright` 4.13, Lighthouse CI 0.15; `jose` 5.9 (JWE `dir` + `A256GCM`); Java 21 / Spring Boot 3.4 WebFlux + R2DBC, JUnit 5 + Testcontainers; Docker Compose; GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-12-intellidrugs-ux-design.md` (P1A row of §12.2: §3, §4, §9, §5.15 and §7.5 audit plumbing, `safeReturnTo()`, `/healthz`, §12.4, §11.4 environment, and the sign-in function of §6.2). Visual and string source: `docs/artifacts/2026-10-12-intellidrugs-design-system.html` (Board DS), `-public.html` (Board P), `-reviewer.html` (Board R), `-learn.html` (Board L), and `docs/design/intellidrugs/tokens.css`.

**Depends on:** P0 merged to `main` (V6 migration with `ops.audit_event`, the phase-0 `/batches` gate, public pages without `scope=all`). Where a step quotes current code, it quotes `main` before P0; if P0 already changed that line, apply the same change to P0's version of the line. Steps that touch a file P0 rewrites (`lib/copy.ts`, `lib/actions-core.ts`, `components/badges.tsx`) are written against P0's post-merge version: P0 Task 11 exports `BATCHES_REVIEWERS_ONLY` from `lib/copy.ts` and widens `ReviewCode`; P0 Task 10 deletes `UnreviewedBadge`; P0 adds no `AuditPort`.

**Note for executors:** `next build` type-checks every file `web/tsconfig.json` includes (`**/*.ts`, `**/*.tsx`), `tests/` and `e2e/` too (Playwright specs and `playwright.config.ts` included), so test code must type-check as strictly as app code: a type error there fails the Docker image build. `web/tsconfig.json` targets `es2016`, so for example a regular expression must not use the `s` flag (use `[\s\S]` instead).

**Branch:** `feature/intellidrugs-p1a-foundation` from `main`. P1A may merge to `main` on its own (§12.2, §12.3); merging deploys.

## Global Constraints

Copied from the spec. Every task's requirements include this section.

- `$WEB/styles/tokens.css` is a byte-identical copy of `docs/design/intellidrugs/tokens.css`. A unit test compares SHA-256 hashes. To change a token, change the docs copy first, then copy it. (§3.1)
- Page and component layout lives in CSS Modules (`*.module.css`). Modules use tokens only, never raw colour values. A Stylelint rule (`color-no-hex`, `color-named: never`, and `function-disallowed-list: rgb, rgba, hsl`) fails the build on any colour literal outside `tokens.css`. (§3.1)
- Remove every inline `style={{…}}` object in `$WEB`. The only allowed inline styles are CSS custom properties: a measured value (for example `--w: 40%` on progress meters), and `--dur-commit` on the desk toast, set to the reviewer's undo window (§5.8.4). (§3.1)
- Root layout: `<html lang="en">`, `<body>` with no inline style. Global imports, in order: `tokens.css`, `fonts.css`. (§3.1)
- Self-host the fonts. Do not load from Google Fonts at runtime. `fonts.css` declares `font-family: "Onest"` and `font-family: "IBM Plex Mono"`. Use `font-display: swap`. The root layout preloads Onest only. (§3.2)
- Cookie: `intellidrugs-theme` = `system` | `light` | `dark`. Max-Age 1 year, `SameSite=Lax`, `Path=/`, `Secure` in production, not httpOnly. No inline script, so the first paint is never in the wrong theme. (§3.3)
- Each component is a React server component in `$WEB/components/ui/`. It renders the exact class names from `tokens.css`. Props are typed unions. No component accepts free text where the vocabulary fixes the wording. (§3.4)
- Green (`--ok`, `.rv--approved`) means "approved by a pharmacist" and nothing else. The hatch (`NoDataBlock`, `NoDataChip`) means "no interaction data" (coverage `none`) and nothing else. Square chips mean severity. Rounded pills mean review status. Translucent material (`.material`, `.decision-bar`) is used only on the toolbar, the sidebar and the decision bar. (§3.4)
- Never write a bare "Something went wrong". No hedging and no apology. The only em dash in the product is in the stale-page title. Ranges and "drug–drug" use an en dash. (§3.5)
- The safety sentences `NO_DATA_SENTENCE`, `NOT_REVIEWED`, `SEVERITY_NOT_CLASSIFIED`, `UNKNOWN_PAIR_LINE` (with its plural `UNKNOWN_PAIRS_LINE`) and `NOT_RUN`: "Each is rendered from its constant, never retyped." DDInter placeholder text ("None", "-", "n/a", and so on) is never printed. `$WEB/lib/ddinter-text.ts` stays. (§3.6)
- New copy (§1.7) lives in `$WEB/lib/copy.ts` as `NEW_COPY: Record<NewCopyState, Record<string, string>>`; page modules import those strings rather than retyping them. (§11.1)
- One polite, `sr-only` live region per page (`aria-live="polite"`, `aria-atomic="true"`). Messages are set by clearing the region and writing after 60 ms. Banners added after load use the same live region. (§10.2)
- A build check, `scripts/check-client-islands.mjs` (run in `postbuild` next to the bundle scan), lists every file with `"use client"`. It fails if a file is missing from the §4.2 table, or if a file in the table imports `@/lib/api`, `@/lib/session` or any other `server-only` module. (§4.2)
- `INTERNAL_API_TOKEN`, `SESSION_SECRET` and `TURNSTILE_SECRET_KEY` stay server-only. The existing `check-client-bundle.mjs` scan stays. (§4.3)
- `verifyTurnstile` checks that the siteverify `action` equals the expected action and that `hostname` equals `SITE_HOST`. It still fails closed. (§9.2)
- "Per account" rate-limit keys use the session's email (lower-cased, hashed with SHA-256 in memory, never logged), not the session id. The IP is the first `X-Forwarded-For` entry. (§9.3)
- `'unsafe-inline'` is removed from `script-src`. `style-src 'unsafe-inline'` stays. (§9.4)
- The session cookie is an encrypted JWT (JWE, `dir` + `A256GCM`, key from HKDF-SHA256 of `SESSION_SECRET`, info `intellidrugs-session-v1`). Payload `{email, name, role, iat, exp}`, valid 8 h. Cookie `__Host-intellidrugs_session` in production (HttpOnly, Secure, SameSite=Lax, Path=/, no Domain), `intellidrugs_session` in development. The old `bddrug_session` cookie is ignored and deleted on the first response. The role is re-checked against `REVIEWERS` on every read; it can be lowered, never raised. (§9.6)
- "The web container's stdout logs never contain emails, notes, flag messages, or the query strings of `/search` and `/check`. Logs record the route template, status, duration and request id." Audit rows hold no IP addresses and no free text from forms. (§5.15, §9.7)
- The middleware sets `x-request-id = crypto.randomUUID()` on the request headers. Server code reads it with `headers()`, logs it, and sends it as `requestId` in `POST /v1/audit-events`. (§9.4)
- These names stay unchanged: the compose project `bddrug`, image names, the volume `dbdata`, the Caddy alias `bddrug-web`, the database name, the Java package and the ETL package. The package name in `web/package.json` becomes `intellidrugs-web`, and the Firebase app name becomes `intellidrugs-session`. (§9.8)
- Schema `db-schema-v1.1` is locked (V1–V5 plus P0's V6). P1A adds no migration.
- New env vars reach the web container only through `web.environment`. `INTELLIDRUGS_E2E` is never added to `deploy/docker-compose.yml`. The `medscribe`, `baymax`, `medioo` and `n8n` containers and the Caddy container are never restarted. (§12.4)
- No runtime feature flags. (§12.3)
- Dates: `DD/MM/YYYY`, 24-hour clock, zone always named. Dhaka is UTC+6 with no daylight saving. (§1)

**Plan conventions** (not from the spec; they apply to every task):

- Commits: `type(scope): description` with scope `etl`, `api`, `web`, `db` or `deploy`, and the last line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Test-first in every task: write the failing test, watch it fail, then write the code.
- Bengali text is counted in code points, never UTF-16 units.
- The CI compose stack runs as project `bddrug-ci` and never on the EC2 host.

## Review Focus

The five inputs the spec implies but does not test, most likely to bite first. Each is pinned by a test in the task named.

1. **Unreadable session cookies at the edge.** A request that carries a tampered JWE, an old HS256 `bddrug_session` token, or a cookie encrypted under a rotated `SESSION_SECRET` must be treated as anonymous (page renders, no 500, anonymous rate-limit bucket), and the legacy cookie must be deleted. Pinned in Task 14 (`middleware.test.ts`, "treats unreadable session cookies as anonymous").
2. **One clinic NAT, many people.** A signed-in pharmacist behind an IP that has spent its anonymous daily allowance must still get pages (per-account bucket), and the daily counters must reset at 00:00 Dhaka, which is 18:00 UTC, not at UTC midnight. Pinned in Task 12 (`rate-limit.test.ts`, "resets daily counters at 18:00 UTC") and Task 14 (`middleware.test.ts`, "a signed-in reviewer is not blocked by the anonymous cap on the same IP").
3. **A bogus theme cookie.** `intellidrugs-theme=blue`, an empty value or markup such as `"><script>` must render as `system` with no `data-theme` attribute and never reach the HTML. Pinned in Task 7 (`theme.test.ts`, "falls back to system for any other value").
4. **A spent Turnstile token on the second attempt.** Cloudflare tokens are single-use. After a failed `/api/session` (401, 429 or 5xx) the island must reset the widget and wait for a fresh token instead of re-sending the spent one. Pinned in Task 21 (`signin-button.test.tsx`, "resets the bot check after a failed exchange").
5. **The audit API is down.** Sign-in and sign-out must still succeed when `POST /v1/audit-events` fails or times out, and the failure log line carries the event and request id, never the email. Pinned in Task 19 (`session-route.test.ts`, "still signs in when the audit write fails") and Task 20 (`signout-route.test.ts`, "still signs out when the audit write fails").

---

## File Structure

```
web/
  package.json                         MODIFY name intellidrugs-web, scripts, devDependencies
  vitest.config.ts                     MODIFY tests/** only; CSS Modules with stable class names
  stylelint.config.mjs                 CREATE colour-literal ban
  playwright.config.ts                 CREATE e2e harness
  lighthouserc.json                    CREATE Lighthouse CI
  middleware.ts                        MODIFY nonce CSP, request id, rate limits, legacy cookie
  next.config.ts                       MODIFY header rules, /__/auth header set and rewrite
  instrumentation.ts                   MODIFY SITE_HOST and e2e guards
  Dockerfile                           MODIFY HEALTHCHECK
  styles/tokens.css                    CREATE byte copy of docs/design/intellidrugs/tokens.css
  styles/fonts.css                     CREATE @font-face only
  public/fonts/*.woff2, OFL-*.txt      CREATE self-hosted fonts and licences
  app/layout.tsx                       MODIFY globals, preload, theme attribute, chrome
  app/layout.module.css                CREATE shell layout
  app/icon.svg                         CREATE favicon (16 px master)
  app/legacy.module.css                CREATE styles moved out of legacy pages (P1B/P2 delete them)
  app/robots.ts                        CREATE Disallow: /
  app/healthz/route.ts                 CREATE liveness
  app/signout/route.ts                 CREATE sign-out
  app/api/session/route.ts             MODIFY Turnstile, returnTo, JWE cookie, audit; DELETE removed
  app/signin/page.tsx                  MODIFY states, returnTo, siteOrigin
  app/signin/SignInButton.tsx          MODIFY island: Turnstile, states, redirect flow
  app/signin/SignInButton.module.css   CREATE
  app/signin/page.module.css           CREATE
  app/signin/navigate.ts               CREATE window.location seam for tests
  components/ui/*.tsx, *.module.css    CREATE §3.4 component library + index.ts
  components/Expander.tsx              CREATE island
  components/ThemeSwitch.tsx           CREATE island
  components/TurnstileField.tsx        CREATE island
  components/TurnstileField.module.css CREATE
  components/AccountMenu.tsx           CREATE island
  components/AccountMenu.module.css    CREATE
  components/Header.tsx                MODIFY IntelliDrugs chrome
  components/Header.module.css         CREATE
  components/Footer.tsx                CREATE
  components/Footer.module.css         CREATE
  components/Turnstile.tsx             MODIFY nonce + data-action
  components/FlagForm.tsx              MODIFY nonce prop
  components/badges.tsx                MODIFY no inline styles
  components/badges.module.css         CREATE
  lib/copy.ts                          MODIFY §3.6 constants, NEW_COPY, sign-in copy (keeps P0's BATCHES_REVIEWERS_ONLY)
  lib/fonts.ts                         CREATE ONEST_URL (a layout file may not export it)
  lib/live-region.ts                   CREATE announce(): §10.2 clear-then-write-after-60-ms
  lib/request-log.ts                   CREATE routeTemplate(), logRequest(), withRequestLog() (§5.15, §9.7 log line)
  lib/review-actions.ts                MODIFY request log line for the three legacy server actions
  lib/theme.ts, lib/theme-actions.ts   CREATE theme cookie
  lib/csp.ts                           MODIFY nonce policy
  lib/security-headers.ts              CREATE nextWithSecurityHeaders(), AUTH_PROXY_PREFIX
  lib/nonce.ts                         CREATE cspNonce()
  lib/request-id.ts                    CREATE requestId()
  lib/site.ts                          CREATE SITE_HOST, siteOrigin(), e2e guard
  lib/return-to.ts                     CREATE safeReturnTo()
  lib/session-crypto.ts                CREATE JWE encrypt/decrypt (no server-only: middleware, e2e)
  lib/session.ts                       MODIFY JWE cookie
  lib/session-actions.ts               DELETE (signOutAction removed)
  lib/rate-limit.ts                    MODIFY window limiter, daily counter, Dhaka midnight, accountKey
  lib/limits.ts                        CREATE every limit of §9.3
  lib/turnstile.ts                     MODIFY action/hostname/e2e branch
  lib/turnstile-actions.ts             CREATE TurnstileAction type (client-safe)
  lib/audit.ts                         CREATE recordAudit()
  lib/api.ts                           MODIFY postAuditEvent()
  lib/actions-core.ts                  MODIFY Turnstile actions, per-account action limits, decision_denied audit
  scripts/check-client-islands.mjs     CREATE island allowlist check
  tests/*.test.ts(x)                   CREATE/MODIFY unit and component tests
  e2e/session.ts                       CREATE session minting for e2e
  e2e/foundation.spec.ts               CREATE liveness, headers, theme, sign-in, return path, axe, sign-out
  e2e/zz-rate-limit.spec.ts            CREATE sign-in rate limit (runs last)
  e2e/seed/00-check-schema.sql         CREATE seed hook (P1B adds pilot rows)
api/src/main/java/com/niramoy/bddrug/
  domain/AuditEvent.java               CREATE
  application/AuditService.java        CREATE
  application/port/AuditPort.java      CREATE
  adapter/persistence/R2dbcAuditAdapter.java CREATE
  presentation/AuditController.java    CREATE
api/src/test/java/com/niramoy/bddrug/AuditApiIntegrationTest.java CREATE
deploy/docker-compose.yml              MODIFY web.environment SITE_HOST, HERO_CONCEPT_ID
deploy/docker-compose.ci.yml           CREATE CI-only override
deploy/.env.example                    MODIFY SITE_HOST, HERO_CONCEPT_ID
.github/workflows/ci.yml               MODIFY lint:css, e2e job
.github/workflows/deploy.yml           MODIFY SITE_HOST pre-flight, /healthz smoke check
README.md                              MODIFY Firebase auth-domain steps, local test keys
.gitignore                             MODIFY Playwright and LHCI output
```

---

### Task 1: Toolchain, `tokens.css` and the colour-literal lint

**Files:**
- Modify: `web/package.json`, `web/package-lock.json`, `web/vitest.config.ts`, `.gitignore`
- Create: `web/styles/tokens.css`, `web/stylelint.config.mjs`
- Test: `web/tests/tokens.test.ts`, `web/tests/stylelint.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `web/styles/tokens.css` (global classes for every later task); `web/stylelint.config.mjs` default export `{ rules, ignoreFiles }`; `npm run lint:css`, run by `prebuild`, so a colour literal fails `npm run build`, CI and the Docker image build; vitest runs `tests/**/*.test.{ts,tsx}` only, and CSS Modules resolve to their local names in tests (`styles.open === "open"`).

- [ ] **Step 1: Install the devDependencies and rename the package**

Edit `web/package.json` so `name` and `scripts` read:

```json
  "name": "intellidrugs-web",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "prebuild": "npm run lint:css",
    "build": "next build",
    "postbuild": "node scripts/check-client-bundle.mjs",
    "start": "next start -p 3000",
    "test": "vitest run",
    "lint:css": "stylelint \"**/*.css\"",
    "test:e2e": "playwright test"
  },
```

Then run:

```bash
cd web && npm install --save-dev --save-exact \
  @axe-core/playwright@4.13.0 @lhci/cli@0.15.1 @playwright/test@1.64.0 \
  @testing-library/dom@10.4.2 @testing-library/react@16.3.3 @types/react-dom@19.0.6 \
  jsdom@26.1.0 stylelint@16.26.1
```

Expected: `added … packages`, and `devDependencies` in `web/package.json` now lists exactly `@axe-core/playwright`, `@lhci/cli`, `@playwright/test`, `@testing-library/dom`, `@testing-library/react`, `@types/node`, `@types/react`, `@types/react-dom`, `jsdom`, `stylelint`, `typescript`, `vitest`, all with exact versions.

- [ ] **Step 2: Point vitest at `tests/` and give CSS Modules stable names**

Replace `web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
const p = (f: string) => fileURLToPath(new URL(f, import.meta.url));
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    // e2e/*.spec.ts belong to Playwright, never to vitest.
    include: ["tests/**/*.test.{ts,tsx}"],
    // CSS Modules resolve to their local class names, so tests can assert `class="… open"`.
    css: { include: [/\.module\.css$/], modules: { classNameStrategy: "non-scoped" } },
  },
  resolve: { alias: { "server-only": p("./tests/stubs/server-only.ts"), "@": p("./") } },
});
```

- [ ] **Step 3: Write the failing tokens test**

Create `web/tests/tokens.test.ts`:

```ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

type Rgb = [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
const channel = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The body of the first rule that starts with `opener` (no nested braces in these rules). */
function block(css: string, opener: string): string {
  const start = css.indexOf(opener);
  if (start < 0) throw new Error(`${opener} not found`);
  const open = css.indexOf("{", start + opener.length - 1);
  return css.slice(open + 1, css.indexOf("}", open));
}
function tokens(body: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6}|rgba\([^)]*\))/g)) m.set(name, value);
  return m;
}
/** Material (rgba) composited over an opaque ground, rounded per channel as Board DS does. */
function composite(rgba: string, under: Rgb): Rgb {
  const [r, g, b, a] = rgba.slice(5, -1).split(",").map(Number);
  return [r, g, b].map((c, i) => Math.round(c * a + under[i] * (1 - a))) as Rgb;
}

// Board DS "Colour tokens and contrast": 9 text tokens on 14 grounds = 126 pairs per theme.
const TEXT = ["fg", "fg-2", "fg-3", "accent", "crit", "warn", "ok", "info", "nodata"];
const GROUNDS = ["bg", "canvas", "surface", "surface-2", "surface-3", "accent-soft", "crit-soft", "warn-soft", "ok-soft",
  "info-soft", "nodata-soft", "nodata-hatch"];

function contrast(t: Map<string, string>) {
  const c = (n: string) => {
    const v = t.get(n);
    if (!v) throw new Error(`--${n} missing`);
    return hex(v);
  };
  const grounds = [...GROUNDS.map(c), composite(t.get("material")!, c("canvas")), composite(t.get("material")!, c("surface-3"))];
  const pairs = TEXT.flatMap((n) => grounds.map((g) => ratio(c(n), g)));
  const boundary = Math.min(...grounds.map((g) => ratio(c("line-ctl"), g)));
  return { pairs, boundary };
}

const web = read("../styles/tokens.css");
const docs = read("../../docs/design/intellidrugs/tokens.css");

describe("tokens.css", () => {
  it("is a byte-identical copy of docs/design/intellidrugs/tokens.css (SHA-256)", () => {
    expect(sha(web)).toBe(sha(docs));
  });

  it("light theme: 126 of 126 text pairs pass 4.5:1, lowest 4.69; lowest control boundary 3.33", () => {
    const light = tokens(block(web, ":root{"));
    const { pairs, boundary } = contrast(light);
    expect(pairs).toHaveLength(126);
    expect(pairs.filter((r) => r >= 4.5)).toHaveLength(126);
    expect(round2(Math.min(...pairs))).toBe(4.69);
    expect(round2(boundary)).toBe(3.33);
  });

  it("dark theme: 126 of 126 text pairs pass 4.5:1, lowest 5.18; lowest control boundary 3.20", () => {
    const light = tokens(block(web, ":root{"));
    const dark = new Map([...light, ...tokens(block(web, ':root[data-theme="dark"]{'))]);
    const { pairs, boundary } = contrast(dark);
    expect(pairs).toHaveLength(126);
    expect(pairs.filter((r) => r >= 4.5)).toHaveLength(126);
    expect(round2(Math.min(...pairs))).toBe(5.18);
    expect(round2(boundary)).toBe(3.2);
  });

  it("the system-dark block and the data-theme=dark block hold the same values", () => {
    expect(tokens(block(web, ':root:not([data-theme="light"]){'))).toEqual(tokens(block(web, ':root[data-theme="dark"]{')));
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd web && npx vitest run tests/tokens.test.ts`
Expected: FAIL with `ENOENT: no such file or directory, open '…/web/styles/tokens.css'`.

- [ ] **Step 5: Copy the stylesheet byte for byte**

```bash
mkdir -p web/styles && cp docs/design/intellidrugs/tokens.css web/styles/tokens.css
```

- [ ] **Step 6: Run it to verify it passes**

Run: `cd web && npx vitest run tests/tokens.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Write the failing Stylelint test**

Create `web/tests/stylelint.test.ts`:

```ts
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
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd web && npx vitest run tests/stylelint.test.ts`
Expected: FAIL with `Failed to resolve import "../stylelint.config.mjs"`.

- [ ] **Step 9: Add the Stylelint config and the ignores**

Create `web/stylelint.config.mjs`:

```js
/** §3.1: colour literals live only in styles/tokens.css. Modules use var(--token). */
export default {
  rules: {
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": ["rgb", "rgba", "hsl"],
  },
  ignoreFiles: ["styles/tokens.css", "node_modules/**", ".next/**", "public/**", "playwright-report/**", "test-results/**"],
};
```

Append to `.gitignore`:

```
web/test-results/
web/playwright-report/
web/.lighthouseci/
```

- [ ] **Step 10: Run the tests and the lint**

Run: `cd web && npx vitest run tests/tokens.test.ts tests/stylelint.test.ts && npm run lint:css`
Expected: PASS (12 tests: 4 in tokens, 8 in stylelint); `lint:css` prints nothing and exits 0.

- [ ] **Step 11: Run the whole web suite**

Run: `cd web && npm test`
Expected: PASS, every existing test still green (the include pattern still finds all of `tests/`).

- [ ] **Step 12: Commit**

```bash
git add web/package.json web/package-lock.json web/vitest.config.ts web/styles/tokens.css web/stylelint.config.mjs \
  web/tests/tokens.test.ts web/tests/stylelint.test.ts .gitignore
git commit -m "feat(web): adopt tokens.css byte for byte, contrast test, colour-literal lint" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Self-hosted fonts and the root layout's global stylesheets

**Files:**
- Create: `web/public/fonts/onest-latin-wght-normal.woff2`, `web/public/fonts/ibm-plex-mono-latin-400-normal.woff2`, `web/public/fonts/ibm-plex-mono-latin-500-normal.woff2`, `web/public/fonts/OFL-Onest.txt`, `web/public/fonts/OFL-IBM-Plex-Mono.txt`, `web/styles/fonts.css`, `web/lib/fonts.ts`, `web/app/layout.module.css`
- Modify: `web/app/layout.tsx`
- Test: `web/tests/fonts.test.ts`, `web/tests/layout.test.tsx`

**Interfaces:**
- Consumes: `web/styles/tokens.css` (Task 1).
- Produces: `ONEST_URL = "/fonts/onest-latin-wght-normal.woff2"` exported from `web/lib/fonts.ts` (not from the layout: Next.js 15 refuses any export from `app/layout.tsx` other than the default component and the route segment config, so `next build` fails with `"ONEST_URL" is not a valid Layout export field`); the root layout imports `@/styles/tokens.css` then `@/styles/fonts.css`, renders `<main id="content">`.

- [ ] **Step 1: Write the failing font test**

Create `web/tests/fonts.test.ts`:

```ts
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const path = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const FILES = ["public/fonts/onest-latin-wght-normal.woff2", "public/fonts/ibm-plex-mono-latin-400-normal.woff2",
  "public/fonts/ibm-plex-mono-latin-500-normal.woff2"];
const css = () => readFileSync(path("styles/fonts.css"), "utf8");
const faces = () => [...css().matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
const prop = (face: string, name: string) => face.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))?.[1].trim();

describe("self-hosted fonts (§3.2)", () => {
  it("ships WOFF2 files and both OFL licence texts", () => {
    for (const f of FILES) expect(readFileSync(path(f)).subarray(0, 4).toString("latin1")).toBe("wOF2");
    for (const f of ["public/fonts/OFL-Onest.txt", "public/fonts/OFL-IBM-Plex-Mono.txt"])
      expect(readFileSync(path(f), "utf8")).toContain("SIL Open Font License, Version 1.1");
  });

  it("keeps Onest variable plus Plex Mono 400 within the 90 KB font budget (§10.6)", () => {
    expect(statSync(path(FILES[0])).size + statSync(path(FILES[1])).size).toBeLessThanOrEqual(90 * 1024);
  });

  it("fonts.css holds only @font-face rules with the exact family names and font-display: swap", () => {
    expect(css().replace(/\/\*[\s\S]*?\*\//g, "").replace(/@font-face\s*\{[^}]*\}/g, "").trim()).toBe("");
    const all = faces().map((f) => [prop(f, "font-family"), prop(f, "font-weight"), prop(f, "font-display"), prop(f, "src")]);
    expect(all).toEqual([
      ['"Onest"', "400 700", "swap", 'url("/fonts/onest-latin-wght-normal.woff2") format("woff2")'],
      ['"IBM Plex Mono"', "400", "swap", 'url("/fonts/ibm-plex-mono-latin-400-normal.woff2") format("woff2")'],
      ['"IBM Plex Mono"', "500", "swap", 'url("/fonts/ibm-plex-mono-latin-500-normal.woff2") format("woff2")'],
    ]);
  });

  it("never loads Google Fonts", () => {
    expect(css()).not.toContain("fonts.googleapis.com");
    expect(readFileSync(path("app/layout.tsx"), "utf8")).not.toContain("fonts.googleapis.com");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/fonts.test.ts`
Expected: FAIL with `ENOENT … public/fonts/onest-latin-wght-normal.woff2`.

- [ ] **Step 3: Fetch the font files and licences from the Fontsource packages**

```bash
T="$(mktemp -d)" && mkdir -p web/public/fonts \
 && (cd "$T" && npm pack @fontsource-variable/onest@5.3.1 @fontsource/ibm-plex-mono@5.3.0 >/dev/null 2>&1 \
   && mkdir onest plex && tar xzf fontsource-variable-onest-5.3.1.tgz -C onest && tar xzf fontsource-ibm-plex-mono-5.3.0.tgz -C plex) \
 && cp "$T/onest/package/files/onest-latin-wght-normal.woff2" web/public/fonts/ \
 && cp "$T/plex/package/files/ibm-plex-mono-latin-400-normal.woff2" "$T/plex/package/files/ibm-plex-mono-latin-500-normal.woff2" web/public/fonts/ \
 && cp "$T/onest/package/LICENSE" web/public/fonts/OFL-Onest.txt \
 && cp "$T/plex/package/LICENSE" web/public/fonts/OFL-IBM-Plex-Mono.txt \
 && ls -l web/public/fonts
```

Expected: five files; `onest-latin-wght-normal.woff2` about 33 KB, each Plex Mono file about 15 KB.

- [ ] **Step 4: Write `fonts.css`**

Create `web/styles/fonts.css`:

```css
/* Self-hosted fonts (spec §3.2). The family names match --font-ui and --font-mono in tokens.css. */
@font-face {
  font-family: "Onest";
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url("/fonts/onest-latin-wght-normal.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Mono";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/ibm-plex-mono-latin-400-normal.woff2") format("woff2");
}
@font-face {
  font-family: "IBM Plex Mono";
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("/fonts/ibm-plex-mono-latin-500-normal.woff2") format("woff2");
}
```

- [ ] **Step 5: Run the font test**

Run: `cd web && npx vitest run tests/fonts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Write the failing layout test**

Create `web/tests/layout.test.tsx` (Tasks 7 and 21 extend it):

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
const cookieStore = { get: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => new Headers() }));

import RootLayout from "@/app/layout";
import { ONEST_URL } from "@/lib/fonts";

const render = async (children: React.ReactNode = <p>page</p>) => renderToStaticMarkup(await RootLayout({ children }));
beforeEach(() => { getSession.mockReset(); getSession.mockResolvedValue(null); cookieStore.get.mockReset(); });

describe("RootLayout (§3.1, §3.2)", () => {
  it("renders <html lang=en> and a <body> with no inline style", async () => {
    const html = await render();
    expect(html).toMatch(/^<html lang="en"/);
    expect(html).toMatch(/<body[^>]*>/);
    expect(html.match(/<body[^>]*>/)![0]).not.toContain("style=");
  });

  it("preloads Onest only, as a crossorigin WOFF2 font", async () => {
    const html = await render();
    const preloads = html.match(/<link[^>]*rel="preload"[^>]*>/g) ?? [];
    expect(preloads).toHaveLength(1);
    expect(preloads[0]).toContain(`href="${ONEST_URL}"`);
    expect(preloads[0]).toContain('as="font"');
    expect(preloads[0]).toContain('type="font/woff2"');
    expect(preloads[0]).toContain('crossorigin=""');
  });

  it("renders the page inside <main id=content> after a Skip to content link", async () => {
    const html = await render();
    expect(html).toContain('<a class="skipLink" href="#content">Skip to content</a>');
    expect(html).toMatch(/<main id="content"[^>]*><p>page<\/p><\/main>/);
  });

  it("imports tokens.css before fonts.css", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
    expect(src.indexOf('import "@/styles/tokens.css"')).toBeGreaterThanOrEqual(0);
    expect(src.indexOf('import "@/styles/tokens.css"')).toBeLessThan(src.indexOf('import "@/styles/fonts.css"'));
  });

  it("exports nothing but the component and metadata (Next.js refuses other layout exports at build time)", async () => {
    const layout = await import("@/app/layout");
    expect(Object.keys(layout).sort()).toEqual(["default", "metadata"]);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd web && npx vitest run tests/layout.test.tsx`
Expected: FAIL: `@/lib/fonts` does not resolve, and the body carries `style="font-family:…"`.

- [ ] **Step 8: Rewrite the root layout**

Create `web/lib/fonts.ts`:

```ts
/** The one font the root layout preloads (§3.2). Lives here because a Next.js layout file may not export it. */
export const ONEST_URL = "/fonts/onest-latin-wght-normal.woff2";
```

Create `web/app/layout.module.css`:

```css
.skipLink {
  position: absolute;
  left: var(--s4);
  top: -48px;
  z-index: 10;
  padding: var(--s2) var(--s3);
  border-radius: var(--r-ctl-sm);
  background: var(--surface);
  color: var(--accent);
  box-shadow: var(--shadow-2);
}
.skipLink:focus-visible { top: var(--s2); }
.main {
  max-width: 1040px;
  margin: 0 auto;
  padding: var(--s5) var(--s4) var(--s7);
}
```

Replace `web/app/layout.tsx`:

```tsx
import "@/styles/tokens.css";
import "@/styles/fonts.css";
import Header from "@/components/Header";
import { ONEST_URL } from "@/lib/fonts";
import { getSession } from "@/lib/session";
import styles from "./layout.module.css";

export const metadata = { title: "IntelliDrugs", robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <head>
        <link rel="preload" href={ONEST_URL} as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <a className={styles.skipLink} href="#content">Skip to content</a>
        <Header session={session} />
        <main id="content" className={styles.main}>{children}</main>
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Run the layout, font and header tests**

Run: `cd web && npx vitest run tests/layout.test.tsx tests/fonts.test.ts tests/header.test.tsx`
Expected: `layout.test.tsx` and `fonts.test.ts` PASS. In `header.test.tsx`, the two `RootLayout` cases still pass (the header still prints "Signed in as" and "Reviewer sign-in"; Task 21 rewrites them).

- [ ] **Step 10: Lint and commit**

Run: `cd web && npm run lint:css`
Expected: exit 0.

```bash
git add web/public/fonts web/styles/fonts.css web/lib/fonts.ts web/app/layout.tsx web/app/layout.module.css web/tests/fonts.test.ts web/tests/layout.test.tsx
git commit -m "feat(web): self-host Onest and IBM Plex Mono; root layout loads tokens.css then fonts.css" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Copy constants (§3.6), the §1.7 new-copy table and the §3.5 date formatters

**Files:**
- Modify: `web/lib/copy.ts`, `web/lib/format.ts`, `web/app/check/page.tsx`, `web/app/substances/[id]/page.tsx`, `web/tests/check-page.test.tsx`, `web/tests/substance-page.test.tsx`
- Test: `web/tests/copy.test.ts`, `web/tests/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all from `@/lib/copy`:
  - string constants `NO_DATA_SENTENCE`, `NOT_REVIEWED`, `APPROVED`, `BACK_IN_REVIEW`, `ENGINEER_CHECKED`, `ISSUE_REPORTED`, `SEVERITY_NOT_CLASSIFIED`, `STALE_TITLE`, `FULL_TEXT`, `UNKNOWN_PAIR_LINE`, `UNKNOWN_PAIRS_LINE`, `NO_MANAGEMENT`, `NO_TEXT`, `DECISION_SUPPORT`, `NO_PHI_HELP`, `NOT_RUN`;
  - `PROMISE_PHARMACIST: { lead: string; body: (n: number) => string }`, `PROMISE_ENGINEER: { lead: string; body: string }`, `PROMISE_PAUSED: { lead: string; body: string }` (`lead` is the `<b>` sentence);
  - `NEW_COPY_ROWS` (28 keys → the verbatim §1.7 row text), `type NewCopyState`, `NEW_COPY: Record<NewCopyState, Record<string, string>>` (P1A fills the sign-in, NO_PHI_HELP and phase-0 rows; P1B, P2 and P3 add their rows' keys to the empty records);
  - `SIGN_IN` (Board P sign-in strings), `SIGN_IN_STATES` (the sign-in `NEW_COPY` row, typed: `notConfiguredTitle`, `notConfiguredBody`, `requestFailedTitle`, `requestFailedBody`, `rateLimited`, `noScript`, `unverifiedBody`, `staleAuthBody`, `invalidBody`), `FOOTER_LINE`, `TOO_MANY_REQUESTS`;
  - P0's `BATCHES_REVIEWERS_ONLY` stays exported unchanged (both `/batches` pages import it);
  - legacy `NO_INTERACTION_TEXT` stays until P2 rewrites the checker and substance pages; `NO_MANAGEMENT_TEXT` is removed;
  - from `@/lib/format` (§3.5): `fmtUtc(iso)` → `"11/10/2026 21:27 UTC"`, `fmtDhaka(iso)` → `"12/10/2026 03:27 Dhaka"`, `fmtDhakaTime(iso)` → `"12/10/2026 03:28 Dhaka time"`, `fmtDhakaOn(iso)` → `"on 14/10/2026, 11:20 Dhaka time"` (each returns the input unchanged when it does not parse; the existing `formatUtc` and `formatStrength` stay).

- [ ] **Step 1: Write the failing copy test**

Create `web/tests/copy.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as copy from "@/lib/copy";

const WEB = fileURLToPath(new URL("..", import.meta.url));

/** The §1.7 table, copied from the spec row by row. */
const SPEC_ROWS = [
  "Decision sent but not confirmed (timeout, lost response, 5xx)",
  "Session expired during an undo window or at commit",
  "U pressed while the decision is saving",
  "Approval refused because a check failed or did not run",
  "A or R pressed while the evidence drawer is open",
  "Desk settings: undo window length and single-key shortcuts",
  "\"Don't include patient names or other personal health details.\" help on free-text fields",
  "DDInter mapping not run (product page, desk, checker)",
  "Product page: ingredient with no data or no entry for its route",
  "Record removed from the DGDA batch file (public stub)",
  "Maximum of 20 medicines reached in the checker",
  "Landing hero card while the hero product is not approved; its `aria-label` in both states",
  "Learn: snapshot-value date suffix \"as stored on {date}\"",
  "Decision saving (`committing`): promise and toast",
  "Desk: narrow-screen \"Back to list\", the no-JavaScript notices, loading and loaded announcements",
  "Desk: batch load error, batch not found",
  "History: role variants, the \"No longer counts\" suffix, shared-change entries",
  "Account menu item \"Keyboard shortcuts and settings\"",
  "Batch list and problem-report and partner-request lists (`/review`, `/review/flags`)",
  "Phase-0 `/batches` gate for non-reviewers",
  "Sign-in: not configured, session request failed, sign-in rate limit, engineer welcome step, \"Invite sent to another Google account\" placement",
  "Search: validation, page cap, substance hit with no data or not run",
  "Desk and product page: route-aware data line, chosen-entry statement, other not-checked reasons in the batch block",
  "Product not found",
  "Product page: \"Report a problem\" field label, \"No other approved brand\" line",
  "Checker: summary segments, \"Other not checked\" count, unknown id (404), check failed (5xx), scenario announcement",
  "Partner request sent",
  "Route assumed because the product has no route",
];

describe("§3.6 fixed safety strings", () => {
  it.each([
    ["NO_DATA_SENTENCE", "No interaction data in DDInter for this substance. This does not mean it is safe to combine."],
    ["NOT_REVIEWED", "Not yet reviewed by a pharmacist"],
    ["APPROVED", "Approved by a pharmacist"],
    ["BACK_IN_REVIEW", "Back in review"],
    ["ENGINEER_CHECKED", "Engineer checked"],
    ["ISSUE_REPORTED", "Issue reported"],
    ["SEVERITY_NOT_CLASSIFIED", "Severity not classified by DDInter"],
    ["STALE_TITLE", "This record changed \u2014 reload to review the latest data"],
    ["FULL_TEXT", "Full text from DDInter 2.0"],
    ["UNKNOWN_PAIR_LINE", 'DDInter 2.0 lists this pair with action "unknown" and no text. It is not treated as low risk.'],
    ["UNKNOWN_PAIRS_LINE", 'DDInter 2.0 lists these pairs with action "unknown" and no text. They are not treated as low risk.'],
    ["NO_MANAGEMENT", "DDInter 2.0 gives no management text for this pair."],
    ["NO_TEXT", "DDInter 2.0 has no interaction or management text for this pair."],
    ["DECISION_SUPPORT", "IntelliDrugs is decision support. It is not a substitute for clinical judgement. Severity levels and management text come from DDInter 2.0 and are shown truncated, never rewritten."],
    ["NO_PHI_HELP", "Don't include patient names or other personal health details."],
    ["NOT_RUN", "Not checked yet: DDInter mapping has not run"],
  ])("%s is exactly its literal", (name, literal) => {
    expect((copy as unknown as Record<string, unknown>)[name]).toBe(literal);
  });

  it("the decision-bar promises keep the bold lead and the body apart", () => {
    expect(copy.PROMISE_PHARMACIST.lead).toBe("You're reviewing as a pharmacist.");
    expect(copy.PROMISE_PHARMACIST.body(8)).toBe('"Looks correct" publishes this record after an 8-second undo window.');
    expect(copy.PROMISE_ENGINEER).toEqual({ lead: "You're reviewing as an engineer.",
      body: '"Looks correct" records your check. It does not publish; a pharmacist still needs to approve.' });
    expect(copy.PROMISE_PAUSED).toEqual({ lead: "Decisions are paused.",
      body: "This record changed after you opened it. Reload it to review the latest data." });
  });

  it("the em dash appears only in STALE_TITLE", () => {
    const src = readFileSync(join(WEB, "lib/copy.ts"), "utf8");
    expect(src.match(/\u2014/g)).toHaveLength(1);
  });
});

describe("§1.7 new copy", () => {
  it("NEW_COPY has exactly one entry per §1.7 row, keyed by the row text", () => {
    expect(Object.values(copy.NEW_COPY_ROWS).sort()).toEqual([...SPEC_ROWS].sort());
    expect(Object.keys(copy.NEW_COPY).sort()).toEqual([...SPEC_ROWS].sort());
  });

  it("pins the sign-in strings P1A ships (§6.2, §4.4, §9.3)", () => {
    expect(copy.NEW_COPY[copy.NEW_COPY_ROWS.signIn]).toEqual({
      notConfiguredTitle: "Sign-in is not available right now.",
      notConfiguredBody: "Searching and checking interactions don't need an account.",
      requestFailedTitle: "Couldn't sign you in.",
      requestFailedBody: "Nothing changed. Check your connection and try again.",
      rateLimited: "Too many sign-in attempts. Wait a few minutes and try again.",
      noScript: "Sign-in needs JavaScript for Google and the bot check.",
      unverifiedBody: "Your Google account email is not verified.",
      staleAuthBody: "Sign-in is too old. Please sign in again.",
      invalidBody: "Sign-in could not be verified. Please try again.",
    });
    expect(copy.NEW_COPY[copy.NEW_COPY_ROWS.noPhiHelp]).toEqual({ help: copy.NO_PHI_HELP });
    expect(copy.NEW_COPY[copy.NEW_COPY_ROWS.phase0Gate]).toEqual({ notReviewer: "Only pharmacists and engineers can see batches." });
  });

  it("keeps P0's BATCHES_REVIEWERS_ONLY export, which both /batches pages import", () => {
    expect(copy.BATCHES_REVIEWERS_ONLY).toBe("Only pharmacists and engineers can see batches.");
    expect(copy.NEW_COPY[copy.NEW_COPY_ROWS.phase0Gate].notReviewer).toBe(copy.BATCHES_REVIEWERS_ONLY);
  });

  it("pins the Board P sign-in strings", () => {
    expect(copy.SIGN_IN).toEqual({
      heading: "Sign in to IntelliDrugs",
      sub: "New here? The same button creates your account.",
      button: "Continue with Google",
      loading: "Opening Google",
      loadingHint: "Finish signing in in the Google window. This page updates when you're done.",
      captchaTitle: "We couldn't confirm you're a person.",
      captchaBody: "You weren't signed in. Retry the check. If it fails again, turn off extensions that block scripts on this page.",
      retry: "Retry check",
      cancelledTitle: "Sign-in cancelled.",
      cancelledBody: "You closed the Google window before finishing. Nothing changed. Continue with Google to try again.",
      blockedTitle: "Your browser blocked the Google window.",
      blockedBody: "Allow pop-ups for drugdb.eliooo.org, or continue in this tab instead.",
      continueInTab: "Continue in this tab",
    });
  });
});

// ---- Paraphrase guard (§3.6, §11.1) ----
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx)$/.test(name)) yield relative(WEB, p).split("\\").join("/");
  }
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** The legacy checker page is rewritten in P2 (§12.2); P2 empties this list. */
const LEGACY_EXEMPT = ["app/check/page.tsx"];
/** Files that may hold the compact pill's short form (§3.4). */
const SHORT_FORM_ALLOWED = ["components/ui/ReviewStatus.tsx"];
const scanned = () => ["app", "components", "lib"].flatMap((d) => [...sources(join(WEB, d))])
  .filter((f) => f !== "lib/copy.ts" && !LEGACY_EXEMPT.includes(f));
const text = (f: string) => stripComments(readFileSync(join(WEB, f), "utf8"));

describe("no paraphrase or retyping of the safety sentences", () => {
  it("no source file retypes a safety sentence instead of importing it", () => {
    const safety = [copy.NO_DATA_SENTENCE, copy.NOT_REVIEWED, copy.SEVERITY_NOT_CLASSIFIED, copy.UNKNOWN_PAIR_LINE,
      copy.UNKNOWN_PAIRS_LINE, copy.NOT_RUN];
    const hits = scanned().flatMap((f) => safety.filter((s) => text(f).includes(s)).map((s) => `${f}: ${s}`));
    expect(hits).toEqual([]);
  });

  it("no source file retypes a NEW_COPY string (§11.1: page modules import them)", () => {
    const strings = Object.values(copy.NEW_COPY).flatMap((r) => Object.values(r)).filter((s) => s.length > 0);
    const hits = scanned().flatMap((f) => strings.filter((s) => text(f).includes(s)).map((s) => `${f}: ${s}`));
    expect(hits).toEqual([]);
  });

  it.each([
    [/\bno interactions\b/i, "no interactions"],
    [/No interaction data in DDInter/, "a NO_DATA_SENTENCE paraphrase"],
    [/low risk/i, "low risk outside the UNKNOWN_PAIR lines"],
    [/rv--approved[^>]*>[^<]*no data/i, "no data in green markup"],
  ])("no source file contains %s (%s)", (pattern) => {
    expect(scanned().filter((f) => pattern.test(text(f)))).toEqual([]);
  });

  it("the short form 'Not yet reviewed' appears only in the compact pill", () => {
    const short = /Not yet reviewed(?! by a pharmacist)/;
    expect(scanned().filter((f) => !SHORT_FORM_ALLOWED.includes(f) && short.test(text(f)))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/copy.test.ts`
Expected: FAIL: `APPROVED` is undefined, `NEW_COPY_ROWS` is undefined.

- [ ] **Step 3: Replace `web/lib/copy.ts`**

```ts
/*
 * Product copy. The §3.6 safety strings are rendered from these constants and never retyped (copy.test.ts pins
 * each one and greps the tree for paraphrases). New copy for the states the boards do not draw (§1.7) lives in
 * NEW_COPY, keyed by the verbatim §1.7 row; each plan adds the keys for the states it builds.
 */

// ---- §3.6 fixed safety strings ----
export const NO_DATA_SENTENCE = "No interaction data in DDInter for this substance. This does not mean it is safe to combine.";
export const NOT_REVIEWED = "Not yet reviewed by a pharmacist";
export const APPROVED = "Approved by a pharmacist";
export const BACK_IN_REVIEW = "Back in review";
export const ENGINEER_CHECKED = "Engineer checked";
export const ISSUE_REPORTED = "Issue reported";
export const SEVERITY_NOT_CLASSIFIED = "Severity not classified by DDInter";
/** The only em dash in the product (§3.5). Keep the literal character: copy.test.ts counts it. */
export const STALE_TITLE = "This record changed — reload to review the latest data";
export const FULL_TEXT = "Full text from DDInter 2.0";
export const UNKNOWN_PAIR_LINE = 'DDInter 2.0 lists this pair with action "unknown" and no text. It is not treated as low risk.';
export const UNKNOWN_PAIRS_LINE = 'DDInter 2.0 lists these pairs with action "unknown" and no text. They are not treated as low risk.';
export const NO_MANAGEMENT = "DDInter 2.0 gives no management text for this pair.";
export const NO_TEXT = "DDInter 2.0 has no interaction or management text for this pair.";
export const DECISION_SUPPORT = "IntelliDrugs is decision support. It is not a substitute for clinical judgement. Severity levels and management text come from DDInter 2.0 and are shown truncated, never rewritten.";
/** Decision bar. `lead` renders in <b>; `{n}` is the reviewer's undo window in seconds (8 by default). */
export const PROMISE_PHARMACIST = {
  lead: "You're reviewing as a pharmacist.",
  body: (n: number) => `"Looks correct" publishes this record after an ${n}-second undo window.`,
} as const;
export const PROMISE_ENGINEER = {
  lead: "You're reviewing as an engineer.",
  body: '"Looks correct" records your check. It does not publish; a pharmacist still needs to approve.',
} as const;
export const PROMISE_PAUSED = {
  lead: "Decisions are paused.",
  body: "This record changed after you opened it. Reload it to review the latest data.",
} as const;
export const NO_PHI_HELP = "Don't include patient names or other personal health details.";
export const NOT_RUN = "Not checked yet: DDInter mapping has not run";

/** P0 (spec §12.1): what anonymous and `user` sessions see on /batches and /batches/[id]. Both pages import it. */
export const BATCHES_REVIEWERS_ONLY = "Only pharmacists and engineers can see batches.";

/**
 * Legacy: the pre-IntelliDrugs checker and substance pages still print this for a pair whose interaction text is
 * missing while management text exists. P2 rewrites both pages with NO_TEXT / NO_MANAGEMENT and deletes it.
 */
export const NO_INTERACTION_TEXT = "Interaction text not available from DDInter.";

// ---- Board copy used by P1A ----
export const SIGN_IN = {
  heading: "Sign in to IntelliDrugs",
  sub: "New here? The same button creates your account.",
  button: "Continue with Google",
  loading: "Opening Google",
  loadingHint: "Finish signing in in the Google window. This page updates when you're done.",
  captchaTitle: "We couldn't confirm you're a person.",
  captchaBody: "You weren't signed in. Retry the check. If it fails again, turn off extensions that block scripts on this page.",
  retry: "Retry check",
  cancelledTitle: "Sign-in cancelled.",
  cancelledBody: "You closed the Google window before finishing. Nothing changed. Continue with Google to try again.",
  blockedTitle: "Your browser blocked the Google window.",
  blockedBody: "Allow pop-ups for drugdb.eliooo.org, or continue in this tab instead.",
  continueInTab: "Continue in this tab",
} as const;
/** Board P footer line. */
export const FOOTER_LINE = "A drug knowledge base for Bangladesh. Decision support, not a substitute for clinical judgement.";
/** §9.3: every 429 from the middleware. */
export const TOO_MANY_REQUESTS = "Too many requests. Please slow down.";

// ---- §1.7 new copy ----
export const NEW_COPY_ROWS = {
  decisionUnconfirmed: "Decision sent but not confirmed (timeout, lost response, 5xx)",
  sessionExpired: "Session expired during an undo window or at commit",
  undoWhileSaving: "U pressed while the decision is saving",
  approvalRefused: "Approval refused because a check failed or did not run",
  drawerOpen: "A or R pressed while the evidence drawer is open",
  deskSettings: "Desk settings: undo window length and single-key shortcuts",
  noPhiHelp: "\"Don't include patient names or other personal health details.\" help on free-text fields",
  notRun: "DDInter mapping not run (product page, desk, checker)",
  productIngredientNoData: "Product page: ingredient with no data or no entry for its route",
  removedStub: "Record removed from the DGDA batch file (public stub)",
  checkerMax: "Maximum of 20 medicines reached in the checker",
  heroCard: "Landing hero card while the hero product is not approved; its `aria-label` in both states",
  learnSnapshotDate: "Learn: snapshot-value date suffix \"as stored on {date}\"",
  committing: "Decision saving (`committing`): promise and toast",
  deskMisc: "Desk: narrow-screen \"Back to list\", the no-JavaScript notices, loading and loaded announcements",
  deskLoad: "Desk: batch load error, batch not found",
  history: "History: role variants, the \"No longer counts\" suffix, shared-change entries",
  shortcutsMenuItem: "Account menu item \"Keyboard shortcuts and settings\"",
  reviewLists: "Batch list and problem-report and partner-request lists (`/review`, `/review/flags`)",
  phase0Gate: "Phase-0 `/batches` gate for non-reviewers",
  signIn: "Sign-in: not configured, session request failed, sign-in rate limit, engineer welcome step, \"Invite sent to another Google account\" placement",
  search: "Search: validation, page cap, substance hit with no data or not run",
  routeAware: "Desk and product page: route-aware data line, chosen-entry statement, other not-checked reasons in the batch block",
  productNotFound: "Product not found",
  productPage: "Product page: \"Report a problem\" field label, \"No other approved brand\" line",
  checker: "Checker: summary segments, \"Other not checked\" count, unknown id (404), check failed (5xx), scenario announcement",
  partnerSent: "Partner request sent",
  routeAssumed: "Route assumed because the product has no route",
} as const;
export type NewCopyState = (typeof NEW_COPY_ROWS)[keyof typeof NEW_COPY_ROWS];

/** Strings per §1.7 state. Empty records are filled by the plan that builds that state (P1B, P2, P3). */
export const NEW_COPY: Record<NewCopyState, Record<string, string>> = {
  [NEW_COPY_ROWS.decisionUnconfirmed]: {},
  [NEW_COPY_ROWS.sessionExpired]: {},
  [NEW_COPY_ROWS.undoWhileSaving]: {},
  [NEW_COPY_ROWS.approvalRefused]: {},
  [NEW_COPY_ROWS.drawerOpen]: {},
  [NEW_COPY_ROWS.deskSettings]: {},
  [NEW_COPY_ROWS.noPhiHelp]: { help: NO_PHI_HELP },
  [NEW_COPY_ROWS.notRun]: {},
  [NEW_COPY_ROWS.productIngredientNoData]: {},
  [NEW_COPY_ROWS.removedStub]: {},
  [NEW_COPY_ROWS.checkerMax]: {},
  [NEW_COPY_ROWS.heroCard]: {},
  [NEW_COPY_ROWS.learnSnapshotDate]: {},
  [NEW_COPY_ROWS.committing]: {},
  [NEW_COPY_ROWS.deskMisc]: {},
  [NEW_COPY_ROWS.deskLoad]: {},
  [NEW_COPY_ROWS.history]: {},
  [NEW_COPY_ROWS.shortcutsMenuItem]: {},
  [NEW_COPY_ROWS.reviewLists]: {},
  [NEW_COPY_ROWS.phase0Gate]: { notReviewer: BATCHES_REVIEWERS_ONLY },
  [NEW_COPY_ROWS.signIn]: {
    notConfiguredTitle: "Sign-in is not available right now.",
    notConfiguredBody: "Searching and checking interactions don't need an account.",
    requestFailedTitle: "Couldn't sign you in.",
    requestFailedBody: "Nothing changed. Check your connection and try again.",
    rateLimited: "Too many sign-in attempts. Wait a few minutes and try again.",
    noScript: "Sign-in needs JavaScript for Google and the bot check.",
    // The three 401 answers of POST /api/session (Task 19), shown under requestFailedTitle by the island.
    unverifiedBody: "Your Google account email is not verified.",
    staleAuthBody: "Sign-in is too old. Please sign in again.",
    invalidBody: "Sign-in could not be verified. Please try again.",
  },
  [NEW_COPY_ROWS.search]: {},
  [NEW_COPY_ROWS.routeAware]: {},
  [NEW_COPY_ROWS.productNotFound]: {},
  [NEW_COPY_ROWS.productPage]: {},
  [NEW_COPY_ROWS.checker]: {},
  [NEW_COPY_ROWS.partnerSent]: {},
  [NEW_COPY_ROWS.routeAssumed]: {},
};
/** Typed shortcut for the sign-in row. */
export const SIGN_IN_STATES = NEW_COPY[NEW_COPY_ROWS.signIn] as {
  notConfiguredTitle: string; notConfiguredBody: string; requestFailedTitle: string; requestFailedBody: string;
  rateLimited: string; noScript: string; unverifiedBody: string; staleAuthBody: string; invalidBody: string;
};
```

P0 Task 11 exports `BATCHES_REVIEWERS_ONLY` from `lib/copy.ts`, and both `app/batches/page.tsx` and `app/batches/[id]/page.tsx` import it. The replacement above keeps that export (and the phase-0 `NEW_COPY` row reuses it), so neither page changes.

- [ ] **Step 4: Replace `NO_MANAGEMENT_TEXT` on the two legacy pages**

P0 Task 10 has already edited both pages (it deleted `const scope = scopeFor(session);` and merged the substance page's `UnreviewedBadge` line), so line numbers from `main` before P0 no longer match. Find each target by its content.

In `web/app/check/page.tsx`:
- in the `@/lib/copy` import, change `NO_MANAGEMENT_TEXT` to `NO_MANAGEMENT` (the import becomes `import { NO_INTERACTION_TEXT, NO_MANAGEMENT } from "@/lib/copy";`);
- replace

```tsx
<p>{management ? `Management: ${management}` : NO_MANAGEMENT_TEXT}</p>
```

with

```tsx
<p>{management ? `Management: ${management}` : NO_MANAGEMENT}</p>
```

In `web/app/substances/[id]/page.tsx`:
- in the `@/lib/copy` import, change `NO_MANAGEMENT_TEXT` to `NO_MANAGEMENT`;
- replace

```tsx
<td>{ddinterText(f.management) || NO_MANAGEMENT_TEXT}</td>
```

with

```tsx
<td>{ddinterText(f.management) || NO_MANAGEMENT}</td>
```

Keep the surrounding indentation and the rest of each line (the substance row still ends `</tr>))}</tbody>`). Then confirm no reference is left:

```bash
grep -rn NO_MANAGEMENT_TEXT web/app web/lib
```

Expected: no output.

In `web/tests/check-page.test.tsx` and `web/tests/substance-page.test.tsx` replace every `Management advice not available from DDInter\.` regex with `DDInter 2\.0 gives no management text for this pair\.`:

```bash
sed -i.bak 's/Management advice not available from DDInter\\\./DDInter 2\\.0 gives no management text for this pair\\./g' \
  web/tests/check-page.test.tsx web/tests/substance-page.test.tsx && rm web/tests/*.bak
```

- [ ] **Step 5: Run the copy, checker and substance tests**

Run: `cd web && npx vitest run tests/copy.test.ts tests/check-page.test.tsx tests/substance-page.test.tsx tests/batch-page.test.tsx`
Expected: PASS (the batch-page test proves P0's `/batches` gate still finds `BATCHES_REVIEWERS_ONLY`).

- [ ] **Step 6: Write the failing formatter test**

Create `web/tests/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fmtDhaka, fmtDhakaOn, fmtDhakaTime, fmtUtc } from "@/lib/format";

describe("§3.5 date formatters (DD/MM/YYYY, 24-hour, zone named)", () => {
  it("formats the Board DS examples", () => {
    expect(fmtUtc("2026-10-11T21:27:00Z")).toBe("11/10/2026 21:27 UTC");
    expect(fmtDhaka("2026-10-11T21:27:00Z")).toBe("12/10/2026 03:27 Dhaka");
    expect(fmtDhakaTime("2026-10-11T21:28:00Z")).toBe("12/10/2026 03:28 Dhaka time");
    expect(fmtDhakaOn("2026-10-14T05:20:00Z")).toBe("on 14/10/2026, 11:20 Dhaka time");
  });
  it("crosses the date line correctly around midnight UTC and midnight Dhaka", () => {
    expect(fmtUtc("2026-10-12T00:00:00Z")).toBe("12/10/2026 00:00 UTC");
    expect(fmtDhaka("2026-10-12T00:00:00Z")).toBe("12/10/2026 06:00 Dhaka");
    expect(fmtDhaka("2026-10-12T17:59:00Z")).toBe("12/10/2026 23:59 Dhaka");
    expect(fmtDhaka("2026-10-12T18:00:00Z")).toBe("13/10/2026 00:00 Dhaka");
    expect(fmtUtc("2026-12-31T23:59:00Z")).toBe("31/12/2026 23:59 UTC");
    expect(fmtDhaka("2026-12-31T23:59:00Z")).toBe("01/01/2027 05:59 Dhaka");
  });
  it("accepts an offset timestamp and returns an unparseable value unchanged", () => {
    expect(fmtUtc("2026-10-12T03:27:00+06:00")).toBe("11/10/2026 21:27 UTC");
    expect(fmtDhaka("not a date")).toBe("not a date");
  });
});
```

Run: `cd web && npx vitest run tests/format.test.ts`
Expected: FAIL: `fmtUtc` is not exported from `@/lib/format`.

- [ ] **Step 7: Add the formatters**

Append to `web/lib/format.ts`:

```ts
type Zone = "UTC" | "Asia/Dhaka";
/** DD/MM/YYYY and HH:mm (24-hour) in the zone, assembled by hand from Intl parts (§3.5). Null when unparseable. */
function zoned(iso: string, timeZone: Zone): { date: string; time: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.day}/${p.month}/${p.year}`, time: `${p.hour}:${p.minute}` };
}

/** "11/10/2026 21:27 UTC" */
export function fmtUtc(iso: string): string {
  const z = zoned(iso, "UTC");
  return z ? `${z.date} ${z.time} UTC` : iso;
}
/** "12/10/2026 03:27 Dhaka" (reviewer surfaces) */
export function fmtDhaka(iso: string): string {
  const z = zoned(iso, "Asia/Dhaka");
  return z ? `${z.date} ${z.time} Dhaka` : iso;
}
/** "12/10/2026 03:28 Dhaka time" (public surfaces) */
export function fmtDhakaTime(iso: string): string {
  const z = zoned(iso, "Asia/Dhaka");
  return z ? `${z.date} ${z.time} Dhaka time` : iso;
}
/** "on 14/10/2026, 11:20 Dhaka time" */
export function fmtDhakaOn(iso: string): string {
  const z = zoned(iso, "Asia/Dhaka");
  return z ? `on ${z.date}, ${z.time} Dhaka time` : iso;
}
```

Run: `cd web && npx vitest run tests/format.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Run the whole suite and commit**

Run: `cd web && npm test`
Expected: PASS.

```bash
git add web/lib/copy.ts web/lib/format.ts web/app/check/page.tsx "web/app/substances/[id]/page.tsx" web/tests/copy.test.ts \
  web/tests/format.test.ts web/tests/check-page.test.tsx web/tests/substance-page.test.tsx
git commit -m "feat(web): §3.6 safety constants, §1.7 new-copy table, §3.5 date formatters, paraphrase guard" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `ui/` controls: Button, Kbd, Banner, Field, Segmented, ProgressMeter, BotCheck, ExampleMarker

**Files:**
- Create: `web/components/ui/Button.tsx`, `Button.module.css`, `Kbd.tsx`, `Banner.tsx`, `Field.tsx`, `Segmented.tsx`, `ProgressMeter.tsx`, `ProgressMeter.module.css`, `BotCheck.tsx`, `BotCheck.module.css`, `ExampleMarker.tsx`, `index.ts` (all under `web/components/ui/`)
- Test: `web/tests/ui-controls.test.tsx`

**Interfaces:**
- Consumes: `tokens.css` classes.
- Produces (default exports, re-exported by name from `@/components/ui`):
  - `Button(props: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & { variant: ButtonVariant; size?: ButtonSize; busy?: boolean; busyLabel?: string; children: ReactNode })`, `type ButtonVariant = "primary" | "tonal" | "plain" | "destructive"`, `type ButtonSize = "sm" | "lg"`, `buttonClass(variant, size?): string` (for `<a>` styled as a button);
  - `Kbd({ keys: string })`;
  - `Banner({ tone: "info" | "warn" | "crit"; title: ReactNode; body?: ReactNode; action?: ReactNode; role?: "status" | "alert" | "note" })`;
  - `Field({ id: string; label: ReactNode; control: ReactElement; help?: ReactNode; error?: ReactNode; counter?: string })`;
  - `Segmented<V extends string>({ ariaLabel: string; options: { value: V; label: string }[]; value: V; name?: string; onSelect?: (e: MouseEvent<HTMLButtonElement>, value: V) => void })` (with `name`, buttons are `type="submit"` carrying `name=value`);
  - `ProgressMeter({ approved: number; issue: number; total: number })`;
  - `BotCheck({ state: "passed" | "checking" | "failed" })`, `type BotCheckState`;
  - `ExampleMarker()`.

- [ ] **Step 1: Write the failing component test**

Create `web/tests/ui-controls.test.tsx`:

```tsx
import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Banner, BotCheck, Button, ExampleMarker, Field, Kbd, ProgressMeter, Segmented, buttonClass } from "@/components/ui";

describe("Button", () => {
  it("prints the token classes for each variant and size", () => {
    expect(r(<Button variant="primary">Looks correct <Kbd keys="A" /></Button>))
      .toBe('<button type="button" class="btn btn--primary">Looks correct <span class="kbd">A</span></button>');
    expect(r(<Button variant="tonal" size="sm" type="submit">Report issue</Button>))
      .toBe('<button type="submit" class="btn btn--tonal btn--sm">Report issue</button>');
    expect(buttonClass("plain", "lg")).toBe("btn btn--plain btn--lg");
    expect(buttonClass("destructive")).toBe("btn btn--destructive");
  });

  it("keeps its width while busy: the label stays (hidden) and the busy label overlays it", () => {
    const html = r(<Button variant="primary" busy busyLabel="Saving">Looks correct</Button>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('<span class="hold" aria-hidden="true">Looks correct</span>');
    expect(html).toContain('<span class="busy"><span class="btn-spinner" aria-hidden="true"></span>Saving</span>');
    expect(html).not.toContain("aria-disabled");
  });
});

describe("Banner", () => {
  it("renders title, body and one action with the tone class", () => {
    expect(r(<Banner tone="crit" role="note" title="Couldn't sign you in." body="Nothing changed."
      action={<Button variant="tonal" size="sm">Retry check</Button>} />)).toBe(
      '<div class="banner banner--crit" role="note"><p class="banner-title">Couldn&#x27;t sign you in.</p>' +
      '<p class="banner-body">Nothing changed.</p><span class="banner-action"><button type="button" class="btn btn--tonal btn--sm">Retry check</button></span></div>');
  });
  it("omits the body when there is none", () => {
    expect(r(<Banner tone="warn" title="Too many sign-in attempts." />))
      .toBe('<div class="banner banner--warn"><p class="banner-title">Too many sign-in attempts.</p></div>');
  });
});

describe("Field", () => {
  it("links the error to the control with aria-invalid and aria-describedby", () => {
    const html = r(<Field id="note" label="Note" control={<textarea className="textarea" />} error="Add at least 5 characters." counter="4 / 1000" />);
    expect(html).toContain('<label class="field-label" for="note">Note</label>');
    expect(html).toContain('<textarea class="textarea" id="note" aria-invalid="true" aria-describedby="note-meta"></textarea>');
    expect(html).toContain('<div class="field-meta" id="note-meta"><span class="field-error">Add at least 5 characters.</span><span class="field-count">4 / 1000</span></div>');
  });
  it("has no meta block and no aria-describedby without help, error or counter", () => {
    const html = r(<Field id="q" label="Search" control={<input className="input" />} />);
    expect(html).not.toContain("field-meta");
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("aria-invalid");
  });
});

describe("Segmented", () => {
  it("is a labelled group of aria-pressed buttons; with a name they submit their value", () => {
    const html = r(<Segmented ariaLabel="Colour theme" name="theme" value="dark"
      options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />);
    expect(html).toBe('<div class="seg" role="group" aria-label="Colour theme">' +
      '<button type="submit" value="system" aria-pressed="false" name="theme">System</button>' +
      '<button type="submit" value="light" aria-pressed="false" name="theme">Light</button>' +
      '<button type="submit" value="dark" aria-pressed="true" name="theme">Dark</button></div>');
  });
});

describe("ProgressMeter", () => {
  it("is role=img with the worded label and custom-property widths only", () => {
    const html = r(<ProgressMeter approved={4} issue={1} total={10} />);
    expect(html).toContain('class="prog" role="img" aria-label="4 of 10 approved by a pharmacist, 1 with an issue reported"');
    expect(html).toContain('<i class="p-ok bar" style="--w:40%"></i><i class="p-issue bar" style="--w:10%"></i>');
  });
  it("shows 0% for an empty batch", () => {
    expect(r(<ProgressMeter approved={0} issue={0} total={0} />)).toContain('style="--w:0%"');
  });
});

describe("BotCheck and ExampleMarker", () => {
  it.each([["passed", "Bot check passed", 'class="botcheck"'], ["checking", "Checking", 'class="botcheck"'],
    ["failed", "Bot check failed", 'class="botcheck is-failed failed"']] as const)("%s", (state, word, cls) => {
    expect(r(<BotCheck state={state} />)).toBe(`<span ${cls}>${word}</span>`);
  });
  it("ExampleMarker says Example", () => {
    expect(r(<ExampleMarker />)).toBe('<span class="example">Example</span>');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/ui-controls.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/ui"`.

- [ ] **Step 3: Write the components**

`web/components/ui/Button.module.css`:

```css
/* Busy state keeps the button's width: the label stays in flow, hidden, and the busy label overlays it. */
.hold { display: inline-flex; align-items: center; gap: inherit; visibility: hidden; }
.busy { position: absolute; inset: 0; display: inline-flex; align-items: center; justify-content: center; gap: inherit; }
```

`web/components/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "tonal" | "plain" | "destructive";
export type ButtonSize = "sm" | "lg";

/** The class list for a button, also used for links that look like buttons. */
export function buttonClass(variant: ButtonVariant, size?: ButtonSize): string {
  return ["btn", `btn--${variant}`, size ? `btn--${size}` : ""].filter(Boolean).join(" ");
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  variant: ButtonVariant; size?: ButtonSize; busy?: boolean; busyLabel?: string; children: ReactNode;
};

/** §3.4 Button. "Report issue" is tonal, never destructive. While busy it keeps its width and shows busyLabel. */
export default function Button({ variant, size, busy = false, busyLabel, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} className={buttonClass(variant, size)} aria-busy={busy ? "true" : undefined}>
      {busy ? (
        <>
          <span className={styles.hold} aria-hidden="true">{children}</span>
          <span className={styles.busy}><span className="btn-spinner" aria-hidden="true" />{busyLabel}</span>
        </>
      ) : children}
    </button>
  );
}
```

`web/components/ui/Kbd.tsx`:

```tsx
/** §3.4 Kbd: the key printed on the control it triggers. */
export default function Kbd({ keys }: { keys: string }) {
  return <span className="kbd">{keys}</span>;
}
```

`web/components/ui/Banner.tsx`:

```tsx
import type { ReactNode } from "react";

export type BannerTone = "info" | "warn" | "crit";
/** §3.4 Banner: a bold first sentence, what was or was not saved, then one action. */
export default function Banner({ tone, title, body, action, role }:
    { tone: BannerTone; title: ReactNode; body?: ReactNode; action?: ReactNode; role?: "status" | "alert" | "note" }) {
  return (
    <div className={`banner banner--${tone}`} role={role}>
      <p className="banner-title">{title}</p>
      {body !== undefined && <p className="banner-body">{body}</p>}
      {action !== undefined && <span className="banner-action">{action}</span>}
    </div>
  );
}
```

`web/components/ui/Field.tsx`:

```tsx
import { cloneElement, type ReactElement, type ReactNode } from "react";

/** §3.4 Field. Errors use aria-invalid="true" plus .field-error text linked through aria-describedby. */
export default function Field({ id, label, control, help, error, counter }:
    { id: string; label: ReactNode; control: ReactElement<Record<string, unknown>>; help?: ReactNode; error?: ReactNode; counter?: string }) {
  const hasMeta = help !== undefined || error !== undefined || counter !== undefined;
  const metaId = `${id}-meta`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {cloneElement(control, {
        id,
        "aria-invalid": error !== undefined ? "true" : undefined,
        "aria-describedby": hasMeta ? metaId : undefined,
      })}
      {hasMeta && (
        <div className="field-meta" id={metaId}>
          {help !== undefined && <span>{help}</span>}
          {error !== undefined && <span className="field-error">{error}</span>}
          {counter !== undefined && <span className="field-count">{counter}</span>}
        </div>
      )}
    </div>
  );
}
```

`web/components/ui/Segmented.tsx`:

```tsx
import type { MouseEvent } from "react";

/** §3.4 Segmented (.seg): one choice at a time, aria-pressed. With `name`, each button submits its value. */
export default function Segmented<V extends string>({ ariaLabel, options, value, name, onSelect }: {
  ariaLabel: string; options: { value: V; label: string }[]; value: V; name?: string;
  onSelect?: (e: MouseEvent<HTMLButtonElement>, value: V) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type={name ? "submit" : "button"} name={name} value={name ? o.value : undefined}
          aria-pressed={o.value === value} onClick={onSelect ? (e) => onSelect(e, o.value) : undefined}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`web/components/ui/ProgressMeter.module.css`:

```css
.bar { width: var(--w); }
```

`web/components/ui/ProgressMeter.tsx`:

```tsx
import type { CSSProperties } from "react";
import styles from "./ProgressMeter.module.css";

const pct = (n: number, total: number) => `${total > 0 ? Math.round((n / total) * 100) : 0}%`;
/** §3.4 ProgressMeter (.prog, role="img"). Widths are the only inline style: the --w custom property. */
export default function ProgressMeter({ approved, issue, total }: { approved: number; issue: number; total: number }) {
  return (
    <span className="prog" role="img"
      aria-label={`${approved} of ${total} approved by a pharmacist, ${issue} with an issue reported`}>
      <i className={`p-ok ${styles.bar}`} style={{ "--w": pct(approved, total) } as CSSProperties} />
      <i className={`p-issue ${styles.bar}`} style={{ "--w": pct(issue, total) } as CSSProperties} />
    </span>
  );
}
```

`web/components/ui/BotCheck.module.css` (ported from Board R's `.botcheck.is-failed`):

```css
.failed { color: var(--crit); font-weight: 600; }
```

`web/components/ui/BotCheck.tsx`:

```tsx
import styles from "./BotCheck.module.css";

export type BotCheckState = "passed" | "checking" | "failed";
const WORD: Record<BotCheckState, string> = { passed: "Bot check passed", checking: "Checking", failed: "Bot check failed" };
/** §3.4 BotCheck: inline text only. */
export default function BotCheck({ state }: { state: BotCheckState }) {
  return <span className={state === "failed" ? `botcheck is-failed ${styles.failed}` : "botcheck"}>{WORD[state]}</span>;
}
```

`web/components/ui/ExampleMarker.tsx`:

```tsx
/** §3.4 ExampleMarker. Only in Learn and on the landing page's partner code sample; never on a record's data. */
export default function ExampleMarker() {
  return <span className="example">Example</span>;
}
```

`web/components/ui/index.ts`:

```ts
export { default as Banner } from "./Banner";
export { default as BotCheck, type BotCheckState } from "./BotCheck";
export { default as Button, buttonClass, type ButtonSize, type ButtonVariant } from "./Button";
export { default as ExampleMarker } from "./ExampleMarker";
export { default as Field } from "./Field";
export { default as Kbd } from "./Kbd";
export { default as ProgressMeter } from "./ProgressMeter";
export { default as Segmented } from "./Segmented";
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/ui-controls.test.tsx && npm run lint:css`
Expected: PASS (13 tests); lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/components/ui web/tests/ui-controls.test.tsx
git commit -m "feat(web): ui controls (Button, Kbd, Banner, Field, Segmented, ProgressMeter, BotCheck, ExampleMarker)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `ui/` marks: Wordmark, BrandIcon, Severity, NoDataChip, NoDataBlock, ReviewStatus, StageCheck, MatchRelation, CodeChip

**Files:**
- Create: `web/components/ui/Wordmark.tsx`, `Wordmark.module.css`, `BrandIcon.tsx`, `Severity.tsx`, `NoDataChip.tsx`, `NoDataBlock.tsx`, `NoDataBlock.module.css`, `ReviewStatus.tsx`, `StageCheck.tsx`, `MatchRelation.tsx`, `CodeChip.tsx` (under `web/components/ui/`), `web/app/icon.svg`
- Modify: `web/components/ui/index.ts`
- Test: `web/tests/ui-marks.test.tsx`

**Interfaces:**
- Consumes: `@/lib/copy` constants (Task 3); `severityOf`, `type Severity` from `@/lib/severity` (existing).
- Produces (named from `@/components/ui`):
  - `Wordmark({ size: WordmarkSize; sub?: "Review" | "Learn" })`, `type WordmarkSize = 13 | 16 | 17 | 19 | 20 | 28` (the sizes the boards draw; each maps to a `Wordmark.module.css` class, so no inline style);
  - `BrandIcon({ size: 16 | 24 | 32 | 64 })` (decorative, `aria-hidden`);
  - `Severity({ level: Severity | (string & {}); count?: number })`;
  - `NoDataChip({ label: string })`;
  - `NoDataBlock({ title: ReactNode; bdsId?: string; pairs?: string[]; extra?: ReactNode })`;
  - `ReviewStatus({ status: ReviewDisplayStatus; compact?: boolean })`, `type ReviewDisplayStatus = "pending" | "approved" | "engineer_checked" | "issue" | "back_in_review"`, `type PublicReviewStatus = "pending" | "approved"`;
  - `StageCheck({ name: string; status: "ok" | "warn" | "fail"; children?: ReactNode })`;
  - `MatchRelation({ kind: "same" | "norm" | "salt" | "added" | "differs"; sub?: string })`;
  - `CodeChip({ system: string; code: string; meta?: CodeMeta })`, `type CodeMeta = { method: string; confidence: number; route?: string }`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/ui-marks.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandIcon, CodeChip, MatchRelation, NoDataBlock, NoDataChip, ReviewStatus, Severity, StageCheck, Wordmark } from "@/components/ui";
import { NO_DATA_SENTENCE } from "@/lib/copy";

describe("Wordmark", () => {
  it("is IntelliDrugs with an aria-hidden cobalt stop, sized by a module class (no inline style)", () => {
    expect(r(<Wordmark size={20} />)).toBe('<span class="wordmark s20">IntelliDrugs' +
      '<span class="wordmark-dot" aria-hidden="true">.</span></span>');
    for (const size of [13, 16, 17, 19, 20, 28] as const) expect(r(<Wordmark size={size} />)).toContain(`class="wordmark s${size}"`);
    expect(r(<Wordmark size={28} />)).not.toContain("style=");
  });
  it("adds the sub-brand after an sr-only space", () => {
    expect(r(<Wordmark size={16} sub="Review" />)).toContain(
      '<span class="wordmark-dot" aria-hidden="true">.</span><span class="sr-only"> </span><span class="wordmark-sub">Review</span>');
  });
});

describe("BrandIcon", () => {
  it("uses the thickened 16 px master and the regular paths above it", () => {
    expect(r(<BrandIcon size={16} />)).toContain('d="M13 25h8v24h-8zM13 14h8v8h-8zM25 14h10a17.5 17.5 0 0 1 0 35H25zM33 22h2a9.5 9.5 0 0 1 0 19h-2z"');
    const big = r(<BrandIcon size={32} />);
    expect(big).toContain('width="32" height="32" viewBox="0 0 64 64" aria-hidden="true"');
    expect(big).toContain('d="M14 26h7v23h-7zM14 15h7v7h-7zM26 15h9a17 17 0 0 1 0 34h-9zM33 22h2a10 10 0 0 1 0 20h-2z"');
    expect(big).toContain('fill="var(--brand-mark)"');
    expect(big).toContain('fill="var(--on-brand-mark)"');
  });
  it("app/icon.svg is the 16 px master with the fixed brand colours", () => {
    const svg = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
    expect(svg).toContain("M13 25h8v24h-8z");
    expect(svg).toContain('fill="#1F5BB8"');
    expect(svg).toContain('fill="#FFFFFF"');
  });
});

describe("Severity", () => {
  it.each([["major", "sev--major", "Major"], ["moderate", "sev--moderate", "Moderate"], ["minor", "sev--minor", "Minor"],
    ["unknown", "sev--unclassified", "Severity not classified by DDInter"],
    ["low", "sev--unclassified", "Severity not classified by DDInter"],
    ["", "sev--unclassified", "Severity not classified by DDInter"]])("%j renders %s", (level, cls, word) => {
    expect(r(<Severity level={level} />)).toBe(`<span class="sev ${cls}">${word}</span>`);
  });
  it("prints an optional count", () => {
    expect(r(<Severity level="major" count={138} />)).toBe('<span class="sev sev--major">Major <b class="sev-n">138</b></span>');
  });
});

describe("no-data marks (hatch = coverage none only)", () => {
  it("NoDataChip is a hatched severity-shaped chip with the given label", () => {
    expect(r(<NoDataChip label="No data" />)).toBe('<span class="sev sev--nodata">No data</span>');
  });
  it("NoDataBlock is always expanded, role=note, with the fixed sentence and no green", () => {
    const html = r(<NoDataBlock title="Domperidone" bdsId="BDS-000010" pairs={["Domperidone + Warfarin"]} />);
    expect(html).toMatch(/^<div class="nodata-block hatch" role="note"><span class="nodata-glyph" aria-hidden="true"><\/span>/);
    expect(html).toContain('<p class="nodata-title">Domperidone <span class="mono id">BDS-000010</span></p>');
    expect(html).toContain(`<p class="nodata-text">${NO_DATA_SENTENCE}</p>`);
    expect(html).toContain('<p class="nodata-pairs">Not checked: <span class="sev sev--nodata">Domperidone + Warfarin</span></p>');
    expect(html).not.toMatch(/<details|rv--approved|--ok/);
  });
});

describe("ReviewStatus", () => {
  it.each([["pending", "rv--pending", "Not yet reviewed by a pharmacist"], ["approved", "rv--approved", "Approved by a pharmacist"],
    ["engineer_checked", "rv--engineer", "Engineer checked"], ["issue", "rv--issue", "Issue reported"],
    ["back_in_review", "rv--back", "Back in review"]] as const)("%s", (status, cls, word) => {
    expect(r(<ReviewStatus status={status} />)).toBe(`<span class="rv ${cls}">${word}</span>`);
  });
  it("compact keeps the rest of the wording as sr-only text, never aria-label", () => {
    expect(r(<ReviewStatus status="pending" compact />))
      .toBe('<span class="rv rv--pending rv--compact">Not yet reviewed<span class="sr-only"> by a pharmacist</span></span>');
    expect(r(<ReviewStatus status="approved" compact />))
      .toBe('<span class="rv rv--approved rv--compact">Approved<span class="sr-only"> by a pharmacist</span></span>');
    expect(r(<ReviewStatus status="engineer_checked" compact />))
      .toBe('<span class="rv rv--engineer rv--compact">Engineer checked<span class="sr-only">. Not yet reviewed by a pharmacist</span></span>');
    expect(r(<ReviewStatus status="pending" compact />)).not.toContain("aria-label");
  });
});

describe("StageCheck, MatchRelation, CodeChip", () => {
  it("StageCheck shows the icon word and the pipeline's own note", () => {
    expect(r(<StageCheck name="DGDA load" status="ok"><p className="stage-note">No pipeline note.</p></StageCheck>))
      .toBe('<div class="stage stage--ok"><p class="stage-head"><span class="stage-name">DGDA load</span>' +
        '<span class="stage-status">OK</span></p><p class="stage-note">No pipeline note.</p></div>');
    expect(r(<StageCheck name="DDInter" status="warn" />)).toContain('<span class="stage-status">Warning</span>');
    expect(r(<StageCheck name="Clinical" status="fail" />)).toContain('<span class="stage-status">Failed</span>');
  });
  it.each([["same", "Matches"], ["norm", "Normalised"], ["salt", "Salt removed"], ["added", "Added"], ["differs", "Differs"]] as const)(
    "MatchRelation %s", (kind, word) => {
      expect(r(<MatchRelation kind={kind} />)).toBe(`<span class="match match--${kind}">${word}</span>`);
    });
  it("MatchRelation prints an optional sub line", () => {
    expect(r(<MatchRelation kind="salt" sub="Removed: Sodium" />))
      .toBe('<span class="match match--salt">Salt removed</span><span class="cmp-sub">Removed: Sodium</span>');
  });
  it("CodeChip names the system and prints the reviewer meta", () => {
    expect(r(<CodeChip system="ICD11_XM" code="XM86W0" meta={{ method: "xm", confidence: 1 }} />))
      .toBe('<span class="code"><span class="code-sys">ICD-11</span>XM86W0<span class="code-meta">xm, 1.0</span></span>');
    expect(r(<CodeChip system="DDINTER" code="DDInter352" meta={{ method: "drugbank", confidence: 1, route: "ophthalmic" }} />))
      .toContain('<span class="code-meta">drugbank, 1.0, ophthalmic</span>');
    expect(r(<CodeChip system="DDINTER" code="DDInter20" meta={{ method: "name", confidence: 0.7 }} />)).toContain("name, 0.7");
    for (const [sys, label] of [["RXCUI", "RxCUI"], ["ATC", "ATC"], ["DRUGBANK", "DrugBank"], ["SNOMEDCT", "SNOMED CT"]])
      expect(r(<CodeChip system={sys} code="1" />)).toBe(`<span class="code"><span class="code-sys">${label}</span>1</span>`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/ui-marks.test.tsx`
Expected: FAIL: `Wordmark` is not exported from `@/components/ui`.

- [ ] **Step 3: Write the components**

`web/components/ui/Wordmark.module.css` (one class per size the boards draw; §3.1 allows no other inline custom property):

```css
.s13 { font-size: 13px; }
.s16 { font-size: 16px; }
.s17 { font-size: 17px; }
.s19 { font-size: 19px; }
.s20 { font-size: 20px; }
.s28 { font-size: 28px; }
```

`web/components/ui/Wordmark.tsx`:

```tsx
import styles from "./Wordmark.module.css";

/** The wordmark sizes Boards DS, P and R draw. */
export type WordmarkSize = 13 | 16 | 17 | 19 | 20 | 28;
const SIZE: Record<WordmarkSize, string> = { 13: styles.s13, 16: styles.s16, 17: styles.s17, 19: styles.s19, 20: styles.s20, 28: styles.s28 };

/** §3.4 Wordmark: "IntelliDrugs" + cobalt stop (aria-hidden). Size is set with font-size only, through a class. */
export default function Wordmark({ size, sub }: { size: WordmarkSize; sub?: "Review" | "Learn" }) {
  return (
    <span className={`wordmark ${SIZE[size]}`}>
      IntelliDrugs<span className="wordmark-dot" aria-hidden="true">.</span>
      {sub && <><span className="sr-only"> </span><span className="wordmark-sub">{sub}</span></>}
    </span>
  );
}
```

`web/components/ui/BrandIcon.tsx`:

```tsx
/** Board DS "iD" monogram. The 16 px master thickens strokes from 7 to 8 units so the D's counter stays open. */
const PATH_16 = "M13 25h8v24h-8zM13 14h8v8h-8zM25 14h10a17.5 17.5 0 0 1 0 35H25zM33 22h2a9.5 9.5 0 0 1 0 19h-2z";
const PATH = "M14 26h7v23h-7zM14 15h7v7h-7zM26 15h9a17 17 0 0 1 0 34h-9zM33 22h2a10 10 0 0 1 0 20h-2z";

export default function BrandIcon({ size }: { size: 16 | 24 | 32 | 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" fill="var(--brand-mark)" />
      <path fill="var(--on-brand-mark)" fillRule="evenodd" d={size === 16 ? PATH_16 : PATH} />
    </svg>
  );
}
```

`web/app/icon.svg` (favicon; a standalone file cannot read CSS variables, so the two brand colours are written out):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1F5BB8"/><path fill="#FFFFFF" fill-rule="evenodd" d="M13 25h8v24h-8zM13 14h8v8h-8zM25 14h10a17.5 17.5 0 0 1 0 35H25zM33 22h2a9.5 9.5 0 0 1 0 19h-2z"/></svg>
```

`web/components/ui/Severity.tsx`:

```tsx
import { SEVERITY_NOT_CLASSIFIED } from "@/lib/copy";
import { severityOf, type Severity as Level } from "@/lib/severity";

const LABEL: Record<Level, string> = { major: "Major", moderate: "Moderate", minor: "Minor", unknown: SEVERITY_NOT_CLASSIFIED };
const CLASS: Record<Level, string> = { major: "sev--major", moderate: "sev--moderate", minor: "sev--minor", unknown: "sev--unclassified" };

/** §3.4 Severity: square chip with words. Any value other than major/moderate/minor is "not classified". */
export default function Severity({ level, count }: { level: Level | (string & {}); count?: number }) {
  const s = severityOf(level);
  return (
    <span className={`sev ${CLASS[s]}`}>
      {LABEL[s]}{count !== undefined && <> <b className="sev-n">{count}</b></>}
    </span>
  );
}
```

`web/components/ui/NoDataChip.tsx`:

```tsx
/**
 * §3.4 NoDataChip: only for coverage `none` ("No data", "No interaction data", "Not checked" with the no_data count,
 * and "A + B" pairs not checked because one side has no data). Never for not_run, no_route, unmapped or same_product.
 */
export default function NoDataChip({ label }: { label: string }) {
  return <span className="sev sev--nodata">{label}</span>;
}
```

`web/components/ui/NoDataBlock.module.css`:

```css
.id { color: var(--fg-2); }
```

`web/components/ui/NoDataBlock.tsx`:

```tsx
import type { ReactNode } from "react";
import { NO_DATA_SENTENCE } from "@/lib/copy";
import NoDataChip from "./NoDataChip";
import styles from "./NoDataBlock.module.css";

/** §3.4 NoDataBlock: always expanded, never green, never inside <details>. The sentence is built in. */
export default function NoDataBlock({ title, bdsId, pairs, extra }:
    { title: ReactNode; bdsId?: string; pairs?: string[]; extra?: ReactNode }) {
  return (
    <div className="nodata-block hatch" role="note">
      <span className="nodata-glyph" aria-hidden="true" />
      <div className="nodata-plate">
        <p className="nodata-title">{title}{bdsId && <> <span className={`mono ${styles.id}`}>{bdsId}</span></>}</p>
        <p className="nodata-text">{NO_DATA_SENTENCE}</p>
        {pairs && pairs.length > 0 && (
          <p className="nodata-pairs">Not checked: {pairs.map((p) => <NoDataChip key={p} label={p} />)}</p>
        )}
        {extra}
      </div>
    </div>
  );
}
```

`web/components/ui/ReviewStatus.tsx`:

```tsx
import { APPROVED, BACK_IN_REVIEW, ENGINEER_CHECKED, ISSUE_REPORTED, NOT_REVIEWED } from "@/lib/copy";

export type ReviewDisplayStatus = "pending" | "approved" | "engineer_checked" | "issue" | "back_in_review";
/** The only statuses a public view may render (§3.4). */
export type PublicReviewStatus = "pending" | "approved";

const FULL: Record<ReviewDisplayStatus, string> = { pending: NOT_REVIEWED, approved: APPROVED,
  engineer_checked: ENGINEER_CHECKED, issue: ISSUE_REPORTED, back_in_review: BACK_IN_REVIEW };
const CLASS: Record<ReviewDisplayStatus, string> = { pending: "rv--pending", approved: "rv--approved",
  engineer_checked: "rv--engineer", issue: "rv--issue", back_in_review: "rv--back" };

const BY = " by a pharmacist";
/** Split a full sentence into the visible short form and the sr-only rest (§3.4 compact pills). */
const split = (full: string): [string, string] => [full.slice(0, full.length - BY.length), BY];
const COMPACT: Partial<Record<ReviewDisplayStatus, [string, string]>> = {
  pending: split(NOT_REVIEWED),
  approved: split(APPROVED),
  engineer_checked: [ENGINEER_CHECKED, `. ${NOT_REVIEWED}`],
};

/** §3.4 ReviewStatus pills. `compact` is allowed only in the reviewer record list. */
export default function ReviewStatus({ status, compact = false }: { status: ReviewDisplayStatus; compact?: boolean }) {
  const short = compact ? COMPACT[status] : undefined;
  return (
    <span className={`rv ${CLASS[status]}${compact ? " rv--compact" : ""}`}>
      {short ? <>{short[0]}<span className="sr-only">{short[1]}</span></> : FULL[status]}
    </span>
  );
}
```

`web/components/ui/StageCheck.tsx`:

```tsx
import type { ReactNode } from "react";

const WORD = { ok: "OK", warn: "Warning", fail: "Failed" } as const;
/** §3.4 StageCheck: the icon and the word always appear together. Notes are the pipeline's own. */
export default function StageCheck({ name, status, children }: { name: string; status: keyof typeof WORD; children?: ReactNode }) {
  return (
    <div className={`stage stage--${status}`}>
      <p className="stage-head"><span className="stage-name">{name}</span><span className="stage-status">{WORD[status]}</span></p>
      {children}
    </div>
  );
}
```

`web/components/ui/MatchRelation.tsx`:

```tsx
const WORD = { same: "Matches", norm: "Normalised", salt: "Salt removed", added: "Added", differs: "Differs" } as const;
/** §3.4 MatchRelation: comparison tables only. */
export default function MatchRelation({ kind, sub }: { kind: keyof typeof WORD; sub?: string }) {
  return <><span className={`match match--${kind}`}>{WORD[kind]}</span>{sub && <span className="cmp-sub">{sub}</span>}</>;
}
```

`web/components/ui/CodeChip.tsx`:

```tsx
const SYSTEM: Record<string, string> = { ICD11_XM: "ICD-11", RXCUI: "RxCUI", ATC: "ATC", DRUGBANK: "DrugBank",
  SNOMEDCT: "SNOMED CT", DDINTER: "DDInter" };
export type CodeMeta = { method: string; confidence: number; route?: string };
const conf = (c: number) => (Number.isInteger(c) ? c.toFixed(1) : String(c));

/** §3.4 CodeChip. Reviewer screens pass `meta`; public pages show the method in the codes table instead. */
export default function CodeChip({ system, code, meta }: { system: string; code: string; meta?: CodeMeta }) {
  return (
    <span className="code">
      <span className="code-sys">{SYSTEM[system] ?? system}</span>{code}
      {meta && <span className="code-meta">{[meta.method, conf(meta.confidence), meta.route].filter(Boolean).join(", ")}</span>}
    </span>
  );
}
```

Append to `web/components/ui/index.ts`:

```ts
export { default as BrandIcon } from "./BrandIcon";
export { default as CodeChip, type CodeMeta } from "./CodeChip";
export { default as MatchRelation } from "./MatchRelation";
export { default as NoDataBlock } from "./NoDataBlock";
export { default as NoDataChip } from "./NoDataChip";
export { default as ReviewStatus, type PublicReviewStatus, type ReviewDisplayStatus } from "./ReviewStatus";
export { default as Severity } from "./Severity";
export { default as StageCheck } from "./StageCheck";
export { default as Wordmark, type WordmarkSize } from "./Wordmark";
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/ui-marks.test.tsx tests/copy.test.ts && npm run lint:css`
Expected: PASS; the copy test still passes (ReviewStatus derives its short form from `NOT_REVIEWED`).

- [ ] **Step 5: Commit**

```bash
git add web/components/ui web/app/icon.svg web/tests/ui-marks.test.tsx
git commit -m "feat(web): ui marks (Wordmark, BrandIcon, Severity, no-data marks, ReviewStatus, StageCheck, MatchRelation, CodeChip)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: PairCard and the Expander island

**Files:**
- Create: `web/components/ui/PairCard.tsx`, `web/components/ui/PairCard.module.css`, `web/components/Expander.tsx`
- Modify: `web/components/ui/index.ts`
- Test: `web/tests/pair-card.test.tsx`, `web/tests/expander.test.tsx`

**Interfaces:**
- Consumes: `Severity` (Task 5), `FULL_TEXT` (Task 3).
- Produces: `PairCard({ id: string; severity: string; names: string; meta?: string; text?: { kind: "management" | "interaction"; body: string }; source: ReactNode; surface: "reviewer" | "public" })` (the text element id is `${id}-text`); island `Expander({ targetId: string; label: "reviewer" | "public" })` from `@/components/Expander`; module class `open` in `components/ui/PairCard.module.css` (unclamped text).

- [ ] **Step 1: Write the failing tests**

Create `web/tests/pair-card.test.tsx`:

```tsx
import { renderToStaticMarkup as r } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PairCard } from "@/components/ui";
import { UNKNOWN_PAIR_LINE } from "@/lib/copy";

describe("PairCard (§3.4)", () => {
  it("renders the DDInter text unclamped on the server, so it reads in full without JavaScript", () => {
    const html = r(<PairCard id="p1" severity="major" names="Warfarin + Acetylsalicylic acid" meta="Action: synergy"
      text={{ kind: "management", body: "This combination should generally be avoided." }}
      source="Management, truncated. Full text from DDInter 2.0." surface="public" />);
    expect(html).toBe('<article class="pair"><div class="pair-head"><span class="sev sev--major">Major</span>' +
      '<span class="pair-names">Warfarin + Acetylsalicylic acid</span></div><p class="pair-meta">Action: synergy</p>' +
      '<p class="pair-text open" id="p1-text">This combination should generally be avoided.</p>' +
      '<p class="pair-source">Management, truncated. Full text from DDInter 2.0. </p></article>');
  });

  it("an unknown pair with no text has no text block and no expander", () => {
    const html = r(<PairCard id="p2" severity="unknown" names="Warfarin + Amlodipine" source={UNKNOWN_PAIR_LINE} surface="reviewer" />);
    expect(html).toContain('<span class="sev sev--unclassified">Severity not classified by DDInter</span>');
    expect(html).not.toContain("pair-text");
    expect(html).toContain(`<p class="pair-source">${UNKNOWN_PAIR_LINE.replace(/"/g, "&quot;")}</p>`);
  });
});
```

Create `web/tests/expander.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import Expander from "@/components/Expander";

afterEach(cleanup);
const Fixture = ({ label }: { label: "reviewer" | "public" }) => (
  <><p id="t" className="pair-text open">Long DDInter text</p><Expander targetId="t" label={label} /></>);

describe("Expander island (§4.2)", () => {
  it("clamps the text once hydrated and toggles it (reviewer wording)", async () => {
    render(<Fixture label="reviewer" />);
    const button = await screen.findByRole("button", { name: "Full text from DDInter 2.0" });
    const text = document.getElementById("t")!;
    expect(text.classList.contains("open")).toBe(false);
    expect(button.getAttribute("aria-controls")).toBe("t");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(text.classList.contains("open")).toBe(true);
    expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("uses the public wording on public and Learn pages", async () => {
    render(<Fixture label="public" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show full text" }));
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();
  });

  it("renders nothing on the server", () => {
    expect(renderToStaticMarkup(<Expander targetId="t" label="public" />)).toBe("");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/pair-card.test.tsx tests/expander.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/Expander"` and `PairCard` not exported.

- [ ] **Step 3: Write PairCard and the Expander**

`web/components/ui/PairCard.module.css` (ported from Boards P and R `.pair-text.is-open`; doubled class to outrank `.pair-text`):

```css
.open.open { display: block; -webkit-line-clamp: unset; overflow: visible; }
```

`web/components/ui/PairCard.tsx`:

```tsx
import type { ReactNode } from "react";
import Expander from "@/components/Expander";
import Severity from "./Severity";
import styles from "./PairCard.module.css";

/**
 * §3.4 PairCard. DDInter text is passed through as given (truncated by CSS, never rewritten). The server renders it
 * unclamped; the Expander island clamps it once JavaScript runs and offers the toggle.
 */
export default function PairCard({ id, severity, names, meta, text, source, surface }: {
  id: string; severity: string; names: string; meta?: string;
  text?: { kind: "management" | "interaction"; body: string }; source: ReactNode; surface: "reviewer" | "public";
}) {
  const textId = `${id}-text`;
  return (
    <article className="pair">
      <div className="pair-head"><Severity level={severity} /><span className="pair-names">{names}</span></div>
      {meta && <p className="pair-meta">{meta}</p>}
      {text && <p className={`pair-text ${styles.open}`} id={textId}>{text.body}</p>}
      <p className="pair-source">{source}{text && <> <Expander targetId={textId} label={surface} /></>}</p>
    </article>
  );
}
```

`web/components/Expander.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { FULL_TEXT } from "@/lib/copy";
import styles from "./ui/PairCard.module.css";

const LABELS = {
  reviewer: { closed: FULL_TEXT, open: "Show less" },
  public: { closed: "Show full text", open: "Show less" },
} as const;

/** Island (§4.2): line-clamp toggle for server-rendered DDInter text. Renders nothing until hydrated. */
export default function Expander({ targetId, label }: { targetId: string; label: "reviewer" | "public" }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.classList.remove(styles.open);
    setReady(true);
  }, [targetId]);

  if (!ready) return null;
  const toggle = () => {
    const next = !open;
    document.getElementById(targetId)?.classList.toggle(styles.open, next);
    setOpen(next);
  };
  return (
    <button type="button" className="btn btn--plain btn--sm" aria-controls={targetId} aria-expanded={open} onClick={toggle}>
      {open ? LABELS[label].open : LABELS[label].closed}
    </button>
  );
}
```

Append to `web/components/ui/index.ts`:

```ts
export { default as PairCard } from "./PairCard";
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run tests/pair-card.test.tsx tests/expander.test.tsx && npm run lint:css`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/components/ui web/components/Expander.tsx web/tests/pair-card.test.tsx web/tests/expander.test.tsx
git commit -m "feat(web): PairCard with the Expander island (unclamped without JavaScript)" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Theme cookie, ThemeSwitch island, no-flash `data-theme`

**Files:**
- Create: `web/lib/theme.ts`, `web/lib/theme-actions.ts`, `web/components/ThemeSwitch.tsx`
- Modify: `web/app/layout.tsx`, `web/tests/layout.test.tsx`
- Test: `web/tests/theme.test.ts`, `web/tests/theme-switch.test.tsx`

**Interfaces:**
- Consumes: `Segmented` (Task 4).
- Produces: from `@/lib/theme` (client-safe, no `server-only`): `THEME_COOKIE = "intellidrugs-theme"`, `THEMES`, `type Theme = "system" | "light" | "dark"`, `parseTheme(v: unknown): Theme`, `htmlThemeAttr(t: Theme): "light" | "dark" | undefined`, `themeCookieOptions(production?: boolean)`, `themeCookieString(t: Theme, secure: boolean): string`, `applyTheme(el: HTMLElement, t: Theme): void`, `THEME_EVENT = "intellidrugs-theme"`; server action `setThemeAction(formData: FormData): Promise<void>` from `@/lib/theme-actions`; island `ThemeSwitch({ value: Theme })` from `@/components/ThemeSwitch`; `RootLayout` reads the cookie and renders `<html data-theme>`.

- [ ] **Step 1: Write the failing unit test**

Create `web/tests/theme.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const cookieStore = { set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { THEME_COOKIE, htmlThemeAttr, parseTheme, themeCookieOptions, themeCookieString } from "@/lib/theme";
import { setThemeAction } from "@/lib/theme-actions";

afterEach(() => { vi.unstubAllEnvs(); cookieStore.set.mockReset(); });

describe("theme cookie (§3.3)", () => {
  it("is called intellidrugs-theme", () => expect(THEME_COOKIE).toBe("intellidrugs-theme"));

  it("accepts system, light and dark", () => {
    for (const t of ["system", "light", "dark"]) expect(parseTheme(t)).toBe(t);
  });

  it("falls back to system for any other value (Review Focus 3)", () => {
    for (const v of ["blue", "", "DARK", '"><script>alert(1)</script>', undefined, null, 42, ["dark"]]) expect(parseTheme(v)).toBe("system");
  });

  it("maps to the html attribute; system leaves it off", () => {
    expect(htmlThemeAttr("light")).toBe("light");
    expect(htmlThemeAttr("dark")).toBe("dark");
    expect(htmlThemeAttr("system")).toBeUndefined();
  });

  it("lasts a year, SameSite=Lax, Path=/, readable by script, Secure only in production", () => {
    expect(themeCookieOptions(false)).toEqual({ maxAge: 31536000, sameSite: "lax", path: "/", secure: false, httpOnly: false });
    expect(themeCookieOptions(true).secure).toBe(true);
    expect(themeCookieString("dark", true)).toBe("intellidrugs-theme=dark; Max-Age=31536000; Path=/; SameSite=Lax; Secure");
    expect(themeCookieString("light", false)).toBe("intellidrugs-theme=light; Max-Age=31536000; Path=/; SameSite=Lax");
  });
});

describe("setThemeAction (no-JavaScript form POST)", () => {
  it("stores the submitted theme", async () => {
    const fd = new FormData(); fd.set("theme", "dark");
    await setThemeAction(fd);
    expect(cookieStore.set).toHaveBeenCalledWith("intellidrugs-theme", "dark",
      { maxAge: 31536000, sameSite: "lax", path: "/", secure: false, httpOnly: false });
  });
  it("stores system for anything else", async () => {
    const fd = new FormData(); fd.set("theme", "purple");
    await setThemeAction(fd);
    expect(cookieStore.set.mock.calls[0][1]).toBe("system");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/theme.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/theme"`.

- [ ] **Step 3: Write the theme module and the server action**

`web/lib/theme.ts`:

```ts
/** §3.3 theme. Client-safe (no server-only): the ThemeSwitch island imports it. */
export const THEME_COOKIE = "intellidrugs-theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_MAX_AGE = 31_536_000;
/** Window event that keeps every ThemeSwitch on the page in step. */
export const THEME_EVENT = "intellidrugs-theme";

export function parseTheme(v: unknown): Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v) ? (v as Theme) : "system";
}

/** `<html data-theme>`: light or dark; no attribute for system (tokens.css follows prefers-color-scheme). */
export function htmlThemeAttr(t: Theme): "light" | "dark" | undefined {
  return t === "system" ? undefined : t;
}

export function themeCookieOptions(production = process.env.NODE_ENV === "production") {
  return { maxAge: THEME_MAX_AGE, sameSite: "lax" as const, path: "/", secure: production, httpOnly: false };
}

export function themeCookieString(t: Theme, secure: boolean): string {
  return `${THEME_COOKIE}=${t}; Max-Age=${THEME_MAX_AGE}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function applyTheme(el: HTMLElement, t: Theme): void {
  const attr = htmlThemeAttr(t);
  if (attr) el.setAttribute("data-theme", attr);
  else el.removeAttribute("data-theme");
}
```

`web/lib/theme-actions.ts`:

```ts
"use server";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, themeCookieOptions } from "./theme";

/** The theme form's action. Without JavaScript the form posts here and the page re-renders in the new theme. */
export async function setThemeAction(formData: FormData): Promise<void> {
  (await cookies()).set(THEME_COOKIE, parseTheme(formData.get("theme")), themeCookieOptions());
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/theme.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing island test**

Create `web/tests/theme-switch.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));
import ThemeSwitch from "@/components/ThemeSwitch";

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  document.cookie = "intellidrugs-theme=; Max-Age=0; Path=/";
});
afterEach(cleanup);

describe("ThemeSwitch island", () => {
  it("is a labelled .seg group of System, Light and Dark with the current value pressed", () => {
    render(<ThemeSwitch value="system" />);
    const group = screen.getByRole("group", { name: "Colour theme" });
    expect(group.className).toBe("seg");
    expect(within(group).getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")]))
      .toEqual([["System", "true"], ["Light", "false"], ["Dark", "false"]]);
  });

  it("changes the theme at once and writes the cookie, without a round trip", () => {
    render(<ThemeSwitch value="system" />);
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.cookie).toContain("intellidrugs-theme=dark");
    expect(screen.getByRole("button", { name: "Dark" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "System" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.cookie).toContain("intellidrugs-theme=system");
  });

  it("keeps a second switch on the page (footer and account menu) in step", () => {
    render(<><ThemeSwitch value="light" /><ThemeSwitch value="light" /></>);
    fireEvent.click(screen.getAllByRole("button", { name: "Dark" })[0]);
    expect(screen.getAllByRole("button", { name: "Dark" }).map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
  });

  it("is a real form whose buttons submit theme=value without JavaScript", () => {
    const { container } = render(<ThemeSwitch value="system" />);
    expect(container.querySelector("form")).not.toBeNull();
    expect([...container.querySelectorAll("button")].map((b) => [b.type, b.name, b.value]))
      .toEqual([["submit", "theme", "system"], ["submit", "theme", "light"], ["submit", "theme", "dark"]]);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd web && npx vitest run tests/theme-switch.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/ThemeSwitch"`.

- [ ] **Step 7: Write the island**

`web/components/ThemeSwitch.tsx`:

```tsx
"use client";
import { useEffect, useState, type MouseEvent } from "react";
import Segmented from "@/components/ui/Segmented";
import { THEMES, THEME_EVENT, applyTheme, themeCookieString, type Theme } from "@/lib/theme";
import { setThemeAction } from "@/lib/theme-actions";

const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

/**
 * Island (§3.3, §4.2). A <form> with three submit buttons that works without JavaScript (setThemeAction). With
 * JavaScript a click sets data-theme at once, writes the cookie and skips the round trip.
 */
export default function ThemeSwitch({ value }: { value: Theme }) {
  const [theme, setTheme] = useState<Theme>(value);

  useEffect(() => {
    const sync = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  function choose(e: MouseEvent<HTMLButtonElement>, next: Theme) {
    e.preventDefault();
    applyTheme(document.documentElement, next);
    document.cookie = themeCookieString(next, window.location.protocol === "https:");
    window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: next }));
  }

  return (
    <form action={setThemeAction}>
      <Segmented ariaLabel="Colour theme" name="theme" value={theme} onSelect={choose}
        options={THEMES.map((t) => ({ value: t, label: LABEL[t] }))} />
    </form>
  );
}
```

- [ ] **Step 8: Extend the layout test, then render `data-theme` on the server**

Append to `web/tests/layout.test.tsx`:

```tsx
describe("RootLayout theme (§3.3)", () => {
  const withTheme = (v: string | undefined) =>
    cookieStore.get.mockImplementation((name: string) => (name === "intellidrugs-theme" && v !== undefined ? { name, value: v } : undefined));

  it("renders data-theme from the cookie, with no inline theme script", async () => {
    withTheme("dark");
    const html = await render();
    expect(html).toMatch(/^<html lang="en" data-theme="dark">/);
    expect(html).not.toMatch(/<script[^>]*>[^<]*(data-theme|intellidrugs-theme)/);
  });
  it("leaves the attribute off for system, a missing cookie or a bogus value", async () => {
    for (const v of ["system", undefined, "blue", '"><script>x</script>']) {
      withTheme(v);
      const html = await render();
      expect(html).toMatch(/^<html lang="en">/);
      expect(html).not.toContain("script>x");
    }
  });
});
```

Run: `cd web && npx vitest run tests/layout.test.tsx`
Expected: FAIL on the `data-theme="dark"` case.

In `web/app/layout.tsx` add the imports `import { cookies } from "next/headers";` and `import { THEME_COOKIE, htmlThemeAttr, parseTheme } from "@/lib/theme";`, and change the component body to:

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={htmlThemeAttr(theme)}>
      <head>
        <link rel="preload" href={ONEST_URL} as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <a className={styles.skipLink} href="#content">Skip to content</a>
        <Header session={session} />
        <main id="content" className={styles.main}>{children}</main>
      </body>
    </html>
  );
}
```

In `web/tests/header.test.tsx` change the cookie mock to `const cookieStore = { get: vi.fn(), delete: vi.fn() };` so the layout can read cookies there too.

- [ ] **Step 9: Run the theme, island, layout and header tests**

Run: `cd web && npx vitest run tests/theme.test.ts tests/theme-switch.test.tsx tests/layout.test.tsx tests/header.test.tsx`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add web/lib/theme.ts web/lib/theme-actions.ts web/components/ThemeSwitch.tsx web/app/layout.tsx \
  web/tests/theme.test.ts web/tests/theme-switch.test.tsx web/tests/layout.test.tsx web/tests/header.test.tsx
git commit -m "feat(web): theme cookie rendered on the server, ThemeSwitch island, no-JS theme form" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Style hygiene: no inline style objects, mark exclusivity

**Files:**
- Create: `web/app/legacy.module.css`, `web/components/badges.module.css`, `web/components/Header.module.css`
- Modify: `web/components/badges.tsx`, `web/components/Header.tsx`, `web/app/substances/[id]/page.tsx`, `web/app/check/page.tsx`, `web/app/flags/page.tsx`, `web/app/batches/[id]/page.tsx`, `web/tests/batch-page.test.tsx`, `web/tests/check-page.test.tsx`, `web/tests/product-page.test.tsx`, `web/tests/home-page.test.tsx`, `web/tests/substance-page.test.tsx`
- Test: `web/tests/inline-styles.test.ts`, `web/tests/marks.test.ts`

**Interfaces:**
- Consumes: `components/ui/*` (Tasks 4–6).
- Produces: `MATERIAL_ALLOWED` list in `web/tests/marks.test.ts` that P1B extends with the toolbar, sidebar and decision-bar files; `app/legacy.module.css` (deleted by P1B/P2 together with the pages that import it).

- [ ] **Step 1: Write the failing guards**

Create `web/tests/inline-styles.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB = fileURLToPath(new URL("..", import.meta.url));
function* tsx(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* tsx(p);
    else if (name.endsWith(".tsx")) yield relative(WEB, p).split("\\").join("/");
  }
}

describe("§3.1 inline styles", () => {
  /** The only two inline custom properties §3.1 allows: a measured value (--w on meters) and --dur-commit (desk toast). */
  const bad = /style=\{(?!\{\s*["']--(w|dur-commit)["']\s*:)/;

  it("only --w and --dur-commit are set inline (style={{ \"--w\": … }})", () => {
    const files = [...tsx(join(WEB, "app")), ...tsx(join(WEB, "components"))];
    expect(files.filter((f) => bad.test(readFileSync(join(WEB, f), "utf8")))).toEqual([]);
  });

  it("the guard refuses any other custom property and any style object", () => {
    for (const src of ['style={{ "--wm-size": "20px" }}', "style={{ color: \"red\" }}", "style={box}", 'style={{ "--width": "1px" }}'])
      expect(bad.test(src)).toBe(true);
    for (const src of ['style={{ "--w": pct(1, 2) } as CSSProperties}', 'style={{ "--dur-commit": `${n}ms` } as CSSProperties}'])
      expect(bad.test(src)).toBe(false);
  });
});
```

Create `web/tests/marks.test.ts`:

```ts
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
export const MATERIAL_ALLOWED: string[] = [];

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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/inline-styles.test.ts tests/marks.test.ts`
Expected: `inline-styles` FAILS listing `app/batches/[id]/page.tsx`, `app/check/page.tsx`, `app/flags/page.tsx`, `app/substances/[id]/page.tsx`, `components/Header.tsx`, `components/badges.tsx`; `marks` PASSES (it is a guard for later tasks).

- [ ] **Step 3: Move the legacy styles into modules**

Create `web/app/legacy.module.css`:

```css
/* Styles moved out of inline style objects on the pre-IntelliDrugs pages (§3.1).
   P1B deletes the /batches and /flags pages and P2 rewrites the others; the last one removes this file. */
.table { border-collapse: collapse; width: 100%; }
.collapse { border-collapse: collapse; }
.stageTable { border-collapse: collapse; width: 100%; margin-top: var(--s2); }
.cell { vertical-align: top; border: 1px solid var(--line-strong); padding: var(--s2); width: 50%; }
.stageCell { vertical-align: top; border: 1px solid var(--line-strong); padding: 6px; }
.pre { white-space: pre-wrap; }
.box { border: 1px solid var(--line-strong); border-radius: var(--r-card); padding: var(--s3); margin: var(--s2) 0; }
.bannerWarn { padding: var(--s3); border-radius: var(--r-card); background: var(--warn-soft); box-shadow: inset 0 0 0 1px var(--warn-line); }
.bannerInfo { padding: var(--s3); border-radius: var(--r-card); background: var(--info-soft); box-shadow: inset 0 0 0 1px var(--info-line); }
```

Apply the replacements (they match the expressions wherever P0 left them):

```bash
cd web
perl -0pi -e 's/^const table = \{[^\n]*\n//m; s/^const banner = \(bad: boolean\) => \(\{[^\n]*\n[^\n]*\n//m;
  s/style=\{banner\(none\)\}/className={none ? legacy.bannerWarn : legacy.bannerInfo}/g; s/style=\{table\}/className={legacy.table}/g;
  s/\A/import legacy from "\@\/app\/legacy.module.css";\n/' "app/substances/[id]/page.tsx"
perl -0pi -e 's/^const box = \{[^\n]*\n//m; s/style=\{box\}/className={legacy.box}/g;
  s/\A/import legacy from "\@\/app\/legacy.module.css";\n/' app/check/page.tsx
perl -0pi -e 's/style=\{\{ whiteSpace: "pre-wrap" \}\}/className={legacy.pre}/g;
  s/\A/import legacy from "\@\/app\/legacy.module.css";\n/' app/flags/page.tsx
perl -0pi -e 's/^const cell = \{[^\n]*\n//m; s/^const stageCell = \{[^\n]*\n//m;
  s/style=\{\{ borderCollapse: "collapse" \}\}/className={legacy.collapse}/g;
  s/style=\{\{ width: "100%", borderCollapse: "collapse", marginTop: 8 \}\}/className={legacy.stageTable}/g;
  s/style=\{\{ width: "100%", borderCollapse: "collapse" \}\}/className={legacy.table}/g;
  s/style=\{stageCell\}/className={legacy.stageCell}/g; s/style=\{cell\}/className={legacy.cell}/g;
  s/style=\{\{ whiteSpace: "pre-wrap" \}\}/className={legacy.pre}/g;
  s/\A/import legacy from "\@\/app\/legacy.module.css";\n/' "app/batches/[id]/page.tsx"
grep -n "style=" "app/substances/[id]/page.tsx" app/check/page.tsx app/flags/page.tsx "app/batches/[id]/page.tsx" || echo "no inline styles left"
```

Expected: `no inline styles left`. Each of the four files now starts with `import legacy from "@/app/legacy.module.css";` (inserted at the top so a multi-line import block is never split).

Create `web/components/badges.module.css` (stage status is not review status, so square corners; "OK" is never green):

```css
.badge { display: inline-block; padding: 0 6px; border-radius: var(--r-chip); box-shadow: inset 0 0 0 1px var(--line-ctl); font-size: .85em; background: var(--surface-2); }
.pill { display: inline-block; padding: 0 8px; border-radius: var(--r-chip); font-size: .85em; }
.ok { background: var(--surface-2); color: var(--fg); box-shadow: inset 0 0 0 1px var(--line-ctl); }
.warn { background: var(--warn-soft); color: var(--warn); }
.fail { background: var(--crit-soft); color: var(--crit); }
.none { background: var(--surface-3); color: var(--fg-2); }
```

Replace `web/components/badges.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./badges.module.css";

/** A small inline label, e.g. a route ("ophthalmic"). Legacy pages only; P2 replaces it with ui/ components. */
export function Badge({ children }: { children: ReactNode }) {
  return <span className={`badge ${styles.badge}`}>{children}</span>;
}

/** A stage status label: ok / warn / fail, or "not run" when the stage wrote no result. */
export function StatusPill({ status }: { status: string | null }) {
  const kind = status === "ok" || status === "warn" || status === "fail" ? status : "none";
  return <span className={`pill pill-${kind} ${styles.pill} ${styles[kind]}`}>{status ?? "not run"}</span>;
}
```

(P0 Task 10 deleted `UnreviewedBadge` and every use of it; this replacement keeps it deleted.)

Create `web/components/Header.module.css` (Task 22 replaces it):

```css
.inlineForm { display: inline; }
```

In `web/components/Header.tsx` add `import styles from "./Header.module.css";` and replace `style={{ display: "inline" }}` with `className={styles.inlineForm}`.

Update the legacy tests' exact class regexes (the elements now carry a module class too):

```bash
cd web && perl -pi -e 's/class="badge"/class="badge[^"]*"/g; s/class="pill pill-(ok|warn|fail|none)"/class="pill pill-${1}[^"]*"/g' \
  tests/batch-page.test.tsx tests/check-page.test.tsx tests/product-page.test.tsx tests/home-page.test.tsx tests/substance-page.test.tsx
```

- [ ] **Step 4: Run the guards and the whole suite**

Run: `cd web && npx vitest run tests/inline-styles.test.ts tests/marks.test.ts && npm test && npm run lint:css`
Expected: PASS everywhere; lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/app web/components web/tests
git commit -m "refactor(web): move inline style objects into CSS Modules; guard mark exclusivity" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Client-island allowlist check at build time

**Files:**
- Create: `web/scripts/check-client-islands.mjs`
- Modify: `web/package.json` (`postbuild`)
- Test: `web/tests/client-islands.test.ts`

**Interfaces:**
- Consumes: the island files created so far (`app/signin/SignInButton.tsx`, `components/Expander.tsx`, `components/ThemeSwitch.tsx`).
- Produces: `ISLANDS`, `ISLAND_DIRS`, `FORBIDDEN_IMPORTS`, `clientFiles(root): string[]`, `importsOf(text): string[]`, `checkIslands(root): string[]` (error lines; empty = pass) from `web/scripts/check-client-islands.mjs`. P1B, P2 and P3 add no entries: the table already lists every §4.2 island.

- [ ] **Step 1: Write the failing test**

Create `web/tests/client-islands.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ISLANDS, checkIslands, clientFiles, importsOf } from "../scripts/check-client-islands.mjs";

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

  it("allows any file under components/review/desk/", () => {
    expect(checkIslands(fixture({ "components/review/desk/commit-machine.ts": '"use client";\nexport const x = 1;\n' }))).toEqual([]);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/client-islands.test.ts`
Expected: FAIL with `Failed to resolve import "../scripts/check-client-islands.mjs"`.

- [ ] **Step 3: Write the check**

`web/scripts/check-client-islands.mjs`:

```js
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

const SCAN = ["app", "components", "lib"];
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
```

In `web/package.json` set:

```json
    "postbuild": "node scripts/check-client-bundle.mjs && node scripts/check-client-islands.mjs",
```

- [ ] **Step 4: Run the test and the script**

Run: `cd web && npx vitest run tests/client-islands.test.ts && node scripts/check-client-islands.mjs`
Expected: PASS (7 tests); the script prints `client island check: 3 client files, all on the §4.2 allowlist`.

- [ ] **Step 5: Commit**

```bash
git add web/scripts/check-client-islands.mjs web/package.json web/tests/client-islands.test.ts
git commit -m "feat(web): build-time client-island allowlist check" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `SITE_HOST`, `siteOrigin()`, `safeReturnTo()` and the startup guards

**Files:**
- Create: `web/lib/site.ts`, `web/lib/return-to.ts`
- Modify: `web/instrumentation.ts`
- Test: `web/tests/site.test.ts`, `web/tests/return-to.test.ts`, `web/tests/instrumentation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: from `@/lib/site` (client-safe): `PRODUCTION_HOST = "drugdb.eliooo.org"`, `isE2e(): boolean`, `assertSiteConfig(): void` (throws), `siteHost(): string` (lower-case host[:port]), `siteHostname(): string` (no port), `siteOrigin(): string`; from `@/lib/return-to` (client-safe): `safeReturnTo(value: unknown, origin: string): string | null` returning `pathname + search + hash`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/return-to.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { safeReturnTo } from "@/lib/return-to";

const ORIGIN = "https://drugdb.eliooo.org";

describe("safeReturnTo (§6.2 step 4)", () => {
  it.each(["/\\evil.com", "/%5Cevil.com", "/%5cevil.com", "//evil.com", "///evil.com", "https://drugdb.eliooo.org.evil.com",
    "https://drugdb.eliooo.org/review", "/review\nx", "/review\tx", "/a\u0000b", "/a\u007fb", "/a\rb", "", "review", "javascript:alert(1)"])(
    "refuses %j", (v) => expect(safeReturnTo(v, ORIGIN)).toBeNull());

  it("refuses non-strings", () => {
    for (const v of [null, undefined, 42, ["/review"], { href: "/review" }]) expect(safeReturnTo(v, ORIGIN)).toBeNull();
  });

  it("accepts a same-origin path and returns the parsed pathname, search and hash", () => {
    expect(safeReturnTo("/review/0001-pilot/x?show=needs", ORIGIN)).toBe("/review/0001-pilot/x?show=needs");
    expect(safeReturnTo("/products/186-0030-006--napa#flag", ORIGIN)).toBe("/products/186-0030-006--napa#flag");
  });

  it("returns the parsed URL, never the raw string", () => {
    expect(safeReturnTo("/review/../signin?x=1", ORIGIN)).toBe("/signin?x=1");
  });

  it("works with the e2e origin (http, with a port)", () => {
    expect(safeReturnTo("/review", "http://localhost:3000")).toBe("/review");
    expect(safeReturnTo("//localhost:3001/review", "http://localhost:3000")).toBeNull();
  });
});
```

Create `web/tests/site.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSiteConfig, siteHost, siteHostname, siteOrigin } from "@/lib/site";

afterEach(() => vi.unstubAllEnvs());

describe("SITE_HOST (§9.2, §12.4)", () => {
  it("is required in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_HOST", "");
    expect(() => assertSiteConfig()).toThrow("SITE_HOST must be set (for example SITE_HOST=drugdb.eliooo.org)");
  });
  it("must be a plain host name, optionally with a port", () => {
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org/x");
    expect(() => assertSiteConfig()).toThrow("SITE_HOST must be a host name, optionally with a port");
    vi.stubEnv("SITE_HOST", "https://drugdb.eliooo.org");
    expect(() => assertSiteConfig()).toThrow();
  });
  it("refuses INTELLIDRUGS_E2E=1 together with the production host (§11.4)", () => {
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org");
    expect(() => assertSiteConfig()).toThrow("INTELLIDRUGS_E2E=1 must never run with SITE_HOST=drugdb.eliooo.org");
  });
  it("passes for the production host and for the e2e host", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org");
    expect(() => assertSiteConfig()).not.toThrow();
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    vi.stubEnv("SITE_HOST", "localhost:3000");
    expect(() => assertSiteConfig()).not.toThrow();
  });

  it("siteOrigin is https for the real host and http only for localhost in development or e2e", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_HOST", "DrugDB.eliooo.org");
    expect(siteHost()).toBe("drugdb.eliooo.org");
    expect(siteOrigin()).toBe("https://drugdb.eliooo.org");
    vi.stubEnv("SITE_HOST", "localhost:3000");
    expect(siteOrigin()).toBe("https://localhost:3000");
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    expect(siteOrigin()).toBe("http://localhost:3000");
    expect(siteHostname()).toBe("localhost");
  });
  it("defaults to localhost:3000 outside production", () => {
    vi.stubEnv("SITE_HOST", "");
    expect(siteOrigin()).toBe("http://localhost:3000");
  });
});
```

Append to `web/tests/instrumentation.test.ts` inside the `describe` block:

```ts
  it("exits when SITE_HOST is unset in production", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "k".repeat(32));
    vi.stubEnv("SITE_HOST", "");
    await expect(register()).rejects.toThrow("process.exit(1)");
    expect(error.mock.calls.flat().map(String).join(" ")).toMatch(/SITE_HOST must be set/);
  });

  it("refuses to start in e2e mode with the production host", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("SESSION_SECRET", "k".repeat(32));
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org");
    await expect(register()).rejects.toThrow("process.exit(1)");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/return-to.test.ts tests/site.test.ts tests/instrumentation.test.ts`
Expected: FAIL: `@/lib/return-to` and `@/lib/site` do not resolve; the two new instrumentation cases resolve instead of exiting.

- [ ] **Step 3: Write the modules and extend the startup hook**

`web/lib/return-to.ts`:

```ts
/** Control characters U+0000–U+001F and U+007F. */
const CONTROL = /[\u0000-\u001F\u007F]/;

/**
 * §6.2 step 4. A return path is accepted only when it starts with "/", has no backslash (raw or %5C) and no control
 * characters, and resolves to the same origin. The result is the parsed URL's pathname + search + hash, never the
 * raw string. Shared by the server and the SignInButton island, so it must stay free of server-only imports.
 */
export function safeReturnTo(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.includes("\\") || /%5c/i.test(value) || CONTROL.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
```

`web/lib/site.ts`:

```ts
/** The public host and origin (§9.2, §12.4). Client-safe: holds no secret. */
export const PRODUCTION_HOST = "drugdb.eliooo.org";
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;
const LOCAL = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const isProduction = () => process.env.NODE_ENV === "production";

/** INTELLIDRUGS_E2E=1: the CI-only end-to-end mode (§11.4). Never set by deploy/docker-compose.yml. */
export const isE2e = () => process.env.INTELLIDRUGS_E2E === "1";

/** Throws when the site configuration would make the server unsafe to run. Messages never contain secrets. */
export function assertSiteConfig(): void {
  const host = (process.env.SITE_HOST ?? "").trim();
  if (isProduction() && !host) throw new Error("SITE_HOST must be set (for example SITE_HOST=drugdb.eliooo.org)");
  if (host && !HOST.test(host)) throw new Error("SITE_HOST must be a host name, optionally with a port");
  if (isE2e() && host.toLowerCase() === PRODUCTION_HOST)
    throw new Error("INTELLIDRUGS_E2E=1 must never run with SITE_HOST=drugdb.eliooo.org");
}

/** host[:port], lower-case; localhost:3000 when unset (instrumentation refuses that in production). */
export function siteHost(): string {
  const h = (process.env.SITE_HOST ?? "").trim().toLowerCase();
  return h && HOST.test(h) ? h : "localhost:3000";
}

export function siteHostname(): string {
  return siteHost().replace(/:\d+$/, "");
}

/** https://{SITE_HOST}; plain http only for localhost outside production or in e2e mode. */
export function siteOrigin(): string {
  const h = siteHost();
  const plain = LOCAL.test(h) && (!isProduction() || isE2e());
  return `${plain ? "http" : "https"}://${h}`;
}
```

Replace `web/instrumentation.ts`:

```ts
/**
 * Runs once when the Next.js server starts (Next skips it during `next build`). The app refuses to start without a
 * SESSION_SECRET of at least 32 characters, without SITE_HOST in production, or in e2e mode against the production
 * host. Next.js only logs an error thrown here and keeps serving, so the hook exits the process itself; messages
 * name the variable, never its value.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertSessionSecret } = await import("./lib/session");
  const { assertSiteConfig } = await import("./lib/site");
  try {
    assertSessionSecret();
    assertSiteConfig();
  } catch (e) {
    console.error(`Refusing to start: ${(e as Error).message}`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run tests/return-to.test.ts tests/site.test.ts tests/instrumentation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/site.ts web/lib/return-to.ts web/instrumentation.ts web/tests/site.test.ts web/tests/return-to.test.ts web/tests/instrumentation.test.ts
git commit -m "feat(web): SITE_HOST origin, safeReturnTo(), startup guards for SITE_HOST and e2e mode" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Encrypted session cookie (JWE)

**Files:**
- Create: `web/lib/session-crypto.ts`
- Modify: `web/lib/session.ts`, `web/lib/session-actions.ts`, `web/app/api/session/route.ts`, `web/tests/session-route.test.ts`, `web/tests/header.test.tsx`
- Test: `web/tests/session.test.ts` (rewritten)

**Interfaces:**
- Consumes: `roleFor`, `ROLES`, `type Role` from `@/lib/reviewers` (existing).
- Produces:
  - from `@/lib/session-crypto` (no `server-only`, because the middleware and the e2e fixture import it; never import it from a client file): `SESSION_TTL_SECONDS = 28800`, `LEGACY_SESSION_COOKIE = "bddrug_session"`, `sessionCookieName(production?: boolean): string`, `sessionKey(secret?: string): Uint8Array`, `type SessionClaims = { email: string; name: string; role: string }`, `encryptSession(c: SessionClaims, secret?: string, nowSeconds?: number): Promise<string>`, `decryptSession(token: string, secret?: string): Promise<SessionClaims | null>`;
  - from `@/lib/session` (server-only): `type Session = { email: string; role: Role; name?: string }`, `assertSessionSecret()`, `createSessionCookie(s: Session): Promise<string>`, `sessionCookieOptions()`, `verifySessionToken(token): Promise<Session | null>` (always sets `name`, `""` when unknown), `getSession(): Promise<Session | null>`, and re-exports `LEGACY_SESSION_COOKIE`, `SESSION_TTL_SECONDS`, `sessionCookieName`.

- [ ] **Step 1: Rewrite the session test**

Replace `web/tests/session.test.ts`:

```ts
import { hkdfSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptJWT, SignJWT } from "jose";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { LEGACY_SESSION_COOKIE, decryptSession, encryptSession, sessionCookieName, sessionKey } from "../lib/session-crypto";
import {
  SESSION_TTL_SECONDS, assertSessionSecret, createSessionCookie, getSession, sessionCookieOptions, verifySessionToken,
} from "../lib/session";

const SECRET = "s".repeat(32);
beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("REVIEWERS", "pharm@example.org:pharmacist,eng@example.org:engineer");
  cookieStore.get.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const b64 = (s: string) => Buffer.from(s, "base64url").toString("latin1");
const FARHANA = { email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" as const };

describe("session cookie (JWE, §9.6)", () => {
  it("is __Host-intellidrugs_session in production, intellidrugs_session in development, and lasts 8 hours", () => {
    expect(sessionCookieName(true)).toBe("__Host-intellidrugs_session");
    expect(sessionCookieName(false)).toBe("intellidrugs_session");
    expect(LEGACY_SESSION_COOKIE).toBe("bddrug_session");
    expect(SESSION_TTL_SECONDS).toBe(8 * 3600);
  });

  it("derives the key with HKDF-SHA256 of SESSION_SECRET, info intellidrugs-session-v1, 32 bytes", () => {
    expect(sessionKey(SECRET)).toEqual(new Uint8Array(hkdfSync("sha256", SECRET, new Uint8Array(0), "intellidrugs-session-v1", 32)));
  });

  it("is an encrypted JWT (dir + A256GCM): five parts, and the email cannot be read from it", async () => {
    const jwe = await createSessionCookie(FARHANA);
    const parts = jwe.split(".");
    expect(parts).toHaveLength(5);
    expect(JSON.parse(b64(parts[0]))).toEqual({ alg: "dir", enc: "A256GCM", typ: "JWT" });
    expect(parts.map(b64).join(" ")).not.toContain("pharm@");
    expect(parts.map(b64).join(" ")).not.toContain("Farhana");
  });

  it("round-trips {email, name, role} with an 8 h expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
    const jwe = await createSessionCookie(FARHANA);
    expect(await decryptSession(jwe)).toEqual({ email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" });
    expect(await verifySessionToken(jwe)).toEqual(FARHANA);
    vi.setSystemTime(new Date("2026-10-12T07:59:00Z"));
    expect(await verifySessionToken(jwe)).not.toBeNull();
    vi.setSystemTime(new Date("2026-10-12T08:00:01Z"));
    expect(await verifySessionToken(jwe)).toBeNull();
  });

  it("returns null for a tampered token", async () => {
    const jwe = await createSessionCookie(FARHANA);
    const parts = jwe.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(await verifySessionToken(parts.join("."))).toBeNull();
  });

  it("returns null for a token encrypted under another secret (a rotated SESSION_SECRET)", async () => {
    const other = await encryptSession({ email: "pharm@example.org", name: "", role: "pharmacist" }, "x".repeat(32));
    expect(await verifySessionToken(other)).toBeNull();
  });

  it("returns null for the old HS256 bddrug_session token", async () => {
    const old = await new SignJWT({ email: "pharm@example.org", role: "pharmacist" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(new TextEncoder().encode(SECRET));
    expect(await verifySessionToken(old)).toBeNull();
  });

  it("returns null for garbage, a missing expiry and a bad payload shape", async () => {
    expect(await verifySessionToken("not-a-jwe")).toBeNull();
    const key = sessionKey(SECRET);
    const noExp = await new EncryptJWT({ email: "pharm@example.org", role: "pharmacist" })
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().encrypt(key);
    expect(await verifySessionToken(noExp)).toBeNull();
    for (const payload of [{ email: 42, role: "pharmacist" }, { email: "pharm@example.org", role: "admin" }, { email: "no-at", role: "user" }]) {
      const bad = await new EncryptJWT(payload).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt()
        .setExpirationTime("8h").encrypt(key);
      expect(await verifySessionToken(bad)).toBeNull();
    }
  });

  it("drops a reviewer to user when REVIEWERS no longer gives them that role, and never raises a user", async () => {
    const jwe = await createSessionCookie(FARHANA);
    vi.stubEnv("REVIEWERS", "eng@example.org:engineer");
    expect((await verifySessionToken(jwe))?.role).toBe("user");
    vi.stubEnv("REVIEWERS", "pharm@example.org:engineer");
    expect((await verifySessionToken(jwe))?.role).toBe("user");
    vi.stubEnv("REVIEWERS", "pharm@example.org:pharmacist");
    const user = await createSessionCookie({ email: "pharm@example.org", role: "user" });
    expect(await verifySessionToken(user)).toEqual({ email: "pharm@example.org", name: "", role: "user" });
  });
});

describe("SESSION_SECRET", () => {
  it("refuses a secret shorter than 32 characters, without putting it in the message", async () => {
    vi.stubEnv("SESSION_SECRET", "short-secret-value");
    expect(() => assertSessionSecret()).toThrow(/SESSION_SECRET must be at least 32 characters/);
    expect(() => assertSessionSecret()).toThrow(expect.objectContaining({ message: expect.not.stringContaining("short-secret-value") }));
    await expect(createSessionCookie({ email: "a@x.org", role: "user" })).rejects.toThrow(/SESSION_SECRET/);
  });
  it("refuses an unset secret and accepts 32 characters", () => {
    vi.stubEnv("SESSION_SECRET", undefined as unknown as string);
    expect(() => assertSessionSecret()).toThrow(/SESSION_SECRET/);
    vi.stubEnv("SESSION_SECRET", SECRET);
    expect(() => assertSessionSecret()).not.toThrow();
  });
});

describe("sessionCookieOptions", () => {
  it("is HttpOnly, SameSite=Lax, Path=/, 8 h, no Domain; Secure only in production", () => {
    expect(sessionCookieOptions()).toEqual({ httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 28800 });
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);
  });
});

describe("getSession", () => {
  it("reads the new cookie and ignores the old bddrug_session cookie", async () => {
    const jwe = await createSessionCookie({ email: "eng@example.org", name: "Eng", role: "engineer" });
    cookieStore.get.mockImplementation((name: string) => (name === "intellidrugs_session" ? { name, value: jwe } : undefined));
    expect(await getSession()).toEqual({ email: "eng@example.org", name: "Eng", role: "engineer" });
    cookieStore.get.mockImplementation((name: string) => (name === "bddrug_session" ? { name, value: jwe } : undefined));
    expect(await getSession()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/session.test.ts`
Expected: FAIL with `Failed to resolve import "../lib/session-crypto"`.

- [ ] **Step 3: Write `session-crypto.ts` and rewrite `session.ts`**

`web/lib/session-crypto.ts`:

```ts
/*
 * Session cookie crypto (§9.6). No "server-only" import: the middleware and the e2e session fixture use it too.
 * It must never be imported from a client file (the island check refuses @/lib/session; this module reads
 * SESSION_SECRET, which check-client-bundle.mjs would catch in a client chunk).
 */
import { hkdfSync } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const LEGACY_SESSION_COOKIE = "bddrug_session";
const MIN_SECRET_LENGTH = 32;
const INFO = "intellidrugs-session-v1";

export type SessionClaims = { email: string; name: string; role: string };

/** `__Host-` in production (HttpOnly, Secure, Path=/, no Domain); a plain name in development. */
export function sessionCookieName(production = process.env.NODE_ENV === "production"): string {
  return production ? "__Host-intellidrugs_session" : "intellidrugs_session";
}

/** HKDF-SHA256(SESSION_SECRET, info intellidrugs-session-v1) → 32 bytes. Throws when the secret is too short. */
export function sessionKey(secret: string = process.env.SESSION_SECRET ?? ""): Uint8Array {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters (generate one with: openssl rand -hex 32)`);
  }
  return new Uint8Array(hkdfSync("sha256", secret, new Uint8Array(0), INFO, 32));
}

export async function encryptSession(c: SessionClaims, secret?: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = sessionKey(secret);
  return new EncryptJWT({ email: c.email, name: c.name, role: c.role })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "JWT" })
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + SESSION_TTL_SECONDS)
    .encrypt(key);
}

/** The claims, or null for a forged, tampered, expired, foreign-key or malformed token. */
export async function decryptSession(token: string, secret?: string): Promise<SessionClaims | null> {
  const key = sessionKey(secret);
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtDecrypt(token, key, {
      keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"], requiredClaims: ["exp", "iat"],
    }));
  } catch {
    return null;
  }
  const { email, name, role } = payload;
  if (typeof email !== "string" || !email.includes("@") || typeof role !== "string") return null;
  return { email, name: typeof name === "string" ? name : "", role };
}
```

Replace `web/lib/session.ts`:

```ts
import "server-only";
import { cookies } from "next/headers";
import { ROLES, roleFor, type Role } from "./reviewers";
import { SESSION_TTL_SECONDS, decryptSession, encryptSession, sessionCookieName, sessionKey } from "./session-crypto";

export { LEGACY_SESSION_COOKIE, SESSION_TTL_SECONDS, sessionCookieName } from "./session-crypto";

/** `name` is the Google display name (shown to its owner only, in the account menu). */
export type Session = { email: string; role: Role; name?: string };

/** Throws when SESSION_SECRET is unset or shorter than 32 characters. The message never contains the secret. */
export function assertSessionSecret(): void {
  sessionKey();
}

/** The encrypted session JWT (JWE dir + A256GCM, `{email, name, role}`, 8 h). */
export async function createSessionCookie(session: Session): Promise<string> {
  return encryptSession({ email: session.email, name: session.name ?? "", role: session.role });
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/**
 * Decrypts a session JWE. Null when it is forged, tampered, expired or malformed. The role is re-checked against
 * the current REVIEWERS list: it can drop to `user`, never rise.
 */
export async function verifySessionToken(token: string): Promise<Session | null> {
  const claims = await decryptSession(token);
  if (!claims || !(ROLES as readonly string[]).includes(claims.role)) return null;
  const role = claims.role as Role;
  const effective: Role = role !== "user" && roleFor(claims.email) === role ? role : "user";
  return { email: claims.email, name: claims.name, role: effective };
}

/** The visitor's session from the IntelliDrugs session cookie, or null. The old bddrug_session cookie is ignored. */
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
```

- [ ] **Step 4: Keep `/api/session` and the interim sign-out compiling against the new names**

In `web/app/api/session/route.ts`:
- change the session import to `import { createSessionCookie, sessionCookieName, sessionCookieOptions } from "@/lib/session";`;
- change the cookie line in `POST` to `res.cookies.set(sessionCookieName(), await createSessionCookie({ email, name: typeof decoded.name === "string" ? decoded.name : "", role }), sessionCookieOptions());`;
- change the cookie line in `DELETE` to `res.cookies.set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });` (Task 19 removes `DELETE`).

In `web/lib/session-actions.ts` change the import to `import { sessionCookieName } from "./session";` and the body to `(await cookies()).delete(sessionCookieName());` (Task 20 deletes this file).

Update the two tests that name the cookie. In `tests/session-route.test.ts` the `sessionCookie` and `jwtOf` helpers must also accept the production name `__Host-intellidrugs_session`, or "marks the cookie Secure in production" finds no cookie:

```bash
cd web && perl -pi -e 's/bddrug_session/intellidrugs_session/g; s/(expect\(await verifySessionToken\(.*\)\)\)\.)toEqual/$1toMatchObject/g;
  s/find\(\(c\) => c\.startsWith\("intellidrugs_session="\)\)/find((c) => \/^(__Host-)?intellidrugs_session=\/.test(c))/;
  s/cookie\.split\(";"\)\[0\]\.slice\("intellidrugs_session="\.length\)/cookie.split(";")[0].replace(\/^[^=]*=\/, "")/' tests/session-route.test.ts \
  && perl -pi -e 's/toHaveBeenCalledWith\("bddrug_session"\)/toHaveBeenCalledWith("intellidrugs_session")/' tests/header.test.tsx
grep -n "const sessionCookie\|const jwtOf" tests/session-route.test.ts
```

Expected: the two helper lines now read `const sessionCookie = (res: Response) => res.headers.getSetCookie().find((c) => /^(__Host-)?intellidrugs_session=/.test(c));` and `const jwtOf = (cookie: string) => cookie.split(";")[0].replace(/^[^=]*=/, "");`.

- [ ] **Step 5: Run the session, route and header tests**

Run: `cd web && npx vitest run tests/session.test.ts tests/session-route.test.ts tests/header.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and commit**

Run: `cd web && npm test`
Expected: PASS.

```bash
git add web/lib/session-crypto.ts web/lib/session.ts web/lib/session-actions.ts web/app/api/session/route.ts \
  web/tests/session.test.ts web/tests/session-route.test.ts web/tests/header.test.tsx
git commit -m "feat(web): encrypted session cookie (JWE dir+A256GCM, HKDF key), __Host- name in production" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Rate-limit library, the §9.3 limit table, and per-account action limits

**Files:**
- Create: `web/lib/limits.ts`
- Modify: `web/lib/rate-limit.ts`, `web/lib/actions-core.ts`, `web/app/batches/[id]/page.tsx`, `web/tests/review-actions.test.ts`
- Test: `web/tests/rate-limit.test.ts`, `web/tests/limits.test.ts`

**Interfaces:**
- Consumes: `TOO_MANY_REQUESTS` (Task 3).
- Produces:
  - from `@/lib/rate-limit`: existing `createRateLimiter`, `clientIp`; new `createWindowLimiter({ limit, windowMs, now?, maxKeys? })`, `createDailyCounter({ limit, now?, maxKeys? })` (resets at 00:00 Dhaka), `dhakaDay(ms): number`, `secondsUntilDhakaMidnight(ms): number`, `accountKey(email): string` (SHA-256 hex of the trimmed, lower-cased email);
  - from `@/lib/limits`: `createLimits(now?: () => number, overrides?: { anonymousDaily?: number; accountDaily?: number })`, `type Limits` with keys `perIp`, `anonymousDaily`, `accountDaily`, `suggest`, `versions`, `signIn`, `signOut`, `decision`, `flag`, `partner` (each `{ allow(key: string): boolean; size(): number }`), shared `LIMITS`, `type AccountAction = "decision" | "flag" | "partner"`, `allowAccountAction(kind, email, limits?): boolean`;
  - `submitReview` returns `{ status: 429, code: "rate_limited" }` over the decision limit; `submitFlag` returns `{ status: 429, code: "failed" }` over the flag limit. P1B's decide action and P2's partner action call `allowAccountAction("decision" | "partner", email)`.

- [ ] **Step 1: Write the failing library tests**

Append to `web/tests/rate-limit.test.ts`:

```ts
import { accountKey, createDailyCounter, createWindowLimiter, dhakaDay, secondsUntilDhakaMidnight } from "../lib/rate-limit";

describe("createWindowLimiter (sliding window)", () => {
  it("allows `limit` events per window, then refuses until the oldest leaves the window", () => {
    let now = 0;
    const l = createWindowLimiter({ limit: 10, windowMs: 600_000, now: () => now });
    for (let i = 0; i < 10; i++) expect(l.allow("ip")).toBe(true);
    expect(l.allow("ip")).toBe(false);
    now = 599_999;
    expect(l.allow("ip")).toBe(false);
    now = 600_000;
    expect(l.allow("ip")).toBe(true);
    expect(l.allow("other")).toBe(true);
  });
  it("keeps memory bounded", () => {
    const l = createWindowLimiter({ limit: 1, windowMs: 1000, now: () => 0, maxKeys: 2 });
    l.allow("a"); l.allow("b"); l.allow("c");
    expect(l.size()).toBe(2);
  });
});

describe("Dhaka day (UTC+6, no daylight saving)", () => {
  const at = (h: number, m = 0, s = 0) => Date.UTC(2026, 9, 12, h, m, s);
  it("counts seconds to 00:00 Dhaka, which is 18:00 UTC", () => {
    expect(secondsUntilDhakaMidnight(at(17, 59))).toBe(60);
    expect(secondsUntilDhakaMidnight(at(18))).toBe(86_400);
    expect(secondsUntilDhakaMidnight(at(0))).toBe(18 * 3600);
  });
  it("resets daily counters at 18:00 UTC (Review Focus 2)", () => {
    let now = at(17, 59, 59);
    const c = createDailyCounter({ limit: 2, now: () => now });
    expect(c.allow("ip")).toBe(true);
    expect(c.allow("ip")).toBe(true);
    expect(c.allow("ip")).toBe(false);
    expect(dhakaDay(at(17, 59, 59)) + 1).toBe(dhakaDay(at(18)));
    now = at(18);
    expect(c.allow("ip")).toBe(true);
  });
});

describe("accountKey", () => {
  it("hashes the trimmed, lower-cased email with SHA-256 and never returns the email", () => {
    const k = accountKey("  Pharm@Example.org ");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).toBe(accountKey("pharm@example.org"));
    expect(k).not.toContain("pharm");
  });
});
```

Create `web/tests/limits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allowAccountAction, createLimits } from "@/lib/limits";

const burst = (allow: (k: string) => boolean, n: number) => Array.from({ length: n }, () => allow("k"));

describe("§9.3 limits", () => {
  it("per IP: 10/s with a burst of 30", () => {
    const l = createLimits(() => 0);
    expect(burst((k) => l.perIp.allow(k), 31).filter(Boolean)).toHaveLength(30);
  });
  it("sign-in and sign-out: 10 per 10 minutes each, counted separately", () => {
    let now = 0;
    const l = createLimits(() => now);
    expect(burst((k) => l.signIn.allow(k), 11).filter(Boolean)).toHaveLength(10);
    expect(l.signOut.allow("k")).toBe(true);
    now = 9 * 60_000;
    expect(l.signIn.allow("k")).toBe(false);
    now = 10 * 60_000;
    expect(l.signIn.allow("k")).toBe(true);
  });
  it("suggest 5/s burst 10; versions 1 per 5 s burst 3", () => {
    let now = 0;
    const l = createLimits(() => now);
    expect(burst((k) => l.suggest.allow(k), 11).filter(Boolean)).toHaveLength(10);
    expect(burst((k) => l.versions.allow(k), 4).filter(Boolean)).toHaveLength(3);
    now = 5000;
    expect(l.versions.allow("k")).toBe(true);
    expect(l.versions.allow("k")).toBe(false);
  });
  it("decisions 60 per minute, flags 10 per hour, partner requests 3 per day, per account", () => {
    const l = createLimits(() => 0);
    expect(burst(() => allowAccountAction("decision", "p@x.org", l), 61).filter(Boolean)).toHaveLength(60);
    expect(burst(() => allowAccountAction("flag", "p@x.org", l), 11).filter(Boolean)).toHaveLength(10);
    expect(burst(() => allowAccountAction("partner", "p@x.org", l), 4).filter(Boolean)).toHaveLength(3);
    expect(allowAccountAction("flag", "P@X.org", l)).toBe(false);     // same account, other case
    expect(allowAccountAction("flag", "q@x.org", l)).toBe(true);
  });
  it("daily caps default to 50,000 anonymous per IP and 5,000 per account", () => {
    const l = createLimits(() => 0);
    expect(burst((k) => l.accountDaily.allow(k), 5001).filter(Boolean)).toHaveLength(5000);
    expect(burst((k) => l.anonymousDaily.allow(k), 50_001).filter(Boolean)).toHaveLength(50_000);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/rate-limit.test.ts tests/limits.test.ts`
Expected: FAIL: `createWindowLimiter` is not exported; `@/lib/limits` does not resolve.

- [ ] **Step 3: Extend `rate-limit.ts` and add `limits.ts`**

Append to `web/lib/rate-limit.ts` (and add `import { createHash } from "node:crypto";` at the top):

```ts
export type WindowLimiterOptions = { limit: number; windowMs: number; now?: () => number; maxKeys?: number };

/** At most `limit` events per key in any window of `windowMs` (sliding). Memory is bounded by `maxKeys`. */
export function createWindowLimiter({ limit, windowMs, now = Date.now, maxKeys = 10_000 }: WindowLimiterOptions) {
  const hits = new Map<string, number[]>();
  function allow(key: string): boolean {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((h) => t - h < windowMs);
    hits.delete(key);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    while (hits.size > maxKeys) hits.delete(hits.keys().next().value as string);
    return true;
  }
  return { allow, size: () => hits.size };
}

const DAY_MS = 86_400_000;
const DHAKA_OFFSET_MS = 6 * 3_600_000; // Asia/Dhaka is UTC+6 all year

/** The Dhaka calendar day number of an instant. */
export const dhakaDay = (ms: number) => Math.floor((ms + DHAKA_OFFSET_MS) / DAY_MS);

/** Seconds from `ms` until the next 00:00 in Dhaka (18:00 UTC); used for Retry-After on daily caps. */
export function secondsUntilDhakaMidnight(ms: number): number {
  const local = ms + DHAKA_OFFSET_MS;
  return Math.ceil(((Math.floor(local / DAY_MS) + 1) * DAY_MS - local) / 1000);
}

/** Up to `limit` events per key per Dhaka calendar day. */
export function createDailyCounter({ limit, now = Date.now, maxKeys = 100_000 }: { limit: number; now?: () => number; maxKeys?: number }) {
  let day = dhakaDay(now());
  const counts = new Map<string, number>();
  function allow(key: string): boolean {
    const d = dhakaDay(now());
    if (d !== day) {
      day = d;
      counts.clear();
    }
    const n = (counts.get(key) ?? 0) + 1;
    if (n > limit) return false;
    counts.delete(key);
    counts.set(key, n);
    while (counts.size > maxKeys) counts.delete(counts.keys().next().value as string);
    return true;
  }
  return { allow, size: () => counts.size };
}

/** §9.3 "per account" key: SHA-256 of the trimmed, lower-cased session email. Kept in memory only, never logged. */
export function accountKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}
```

Create `web/lib/limits.ts`:

```ts
import { accountKey, createDailyCounter, createRateLimiter, createWindowLimiter } from "./rate-limit";

/** Every limit in spec §9.3. In memory, single process. */
export function createLimits(now: () => number = Date.now, overrides: { anonymousDaily?: number; accountDaily?: number } = {}) {
  return {
    perIp: createRateLimiter({ ratePerSecond: 10, burst: 30, now }),
    anonymousDaily: createDailyCounter({ limit: overrides.anonymousDaily ?? 50_000, now }),
    accountDaily: createDailyCounter({ limit: overrides.accountDaily ?? 5_000, now }),
    suggest: createRateLimiter({ ratePerSecond: 5, burst: 10, now }),
    versions: createRateLimiter({ ratePerSecond: 0.2, burst: 3, now }),
    signIn: createWindowLimiter({ limit: 10, windowMs: 10 * 60_000, now }),
    signOut: createWindowLimiter({ limit: 10, windowMs: 10 * 60_000, now }),
    decision: createWindowLimiter({ limit: 60, windowMs: 60_000, now }),
    flag: createWindowLimiter({ limit: 10, windowMs: 3_600_000, now }),
    partner: createWindowLimiter({ limit: 3, windowMs: 86_400_000, now }),
  };
}
export type Limits = ReturnType<typeof createLimits>;

/** The process-wide limits used by the server actions (the middleware bundle holds its own instance). */
export const LIMITS: Limits = createLimits();

export type AccountAction = "decision" | "flag" | "partner";
/** True when the account may perform one more `kind` action now (and counts it). */
export function allowAccountAction(kind: AccountAction, email: string, limits: Limits = LIMITS): boolean {
  return limits[kind].allow(accountKey(email));
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run tests/rate-limit.test.ts tests/limits.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing action-limit tests**

In `web/tests/review-actions.test.ts` add after the existing `vi.mock` calls:

```ts
const allowAccountAction = vi.fn((_kind: string, _email: string) => true);
vi.mock("@/lib/limits", () => ({ allowAccountAction: (k: string, e: string) => allowAccountAction(k, e) }));
```

add `allowAccountAction.mockReset(); allowAccountAction.mockReturnValue(true);` to `beforeEach`, and append:

```ts
describe("per-account action limits (§9.3)", () => {
  it("over 60 decisions a minute: rate_limited, with no Turnstile or API call", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    allowAccountAction.mockReturnValue(false);
    expect(await submitReview(review())).toEqual({ status: 429, code: "rate_limited" });
    expect(allowAccountAction).toHaveBeenCalledWith("decision", "pharm@example.org");
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("over 10 flags an hour: the flag outcome is failed", async () => {
    getSession.mockResolvedValue(USER);
    allowAccountAction.mockReturnValue(false);
    expect(await submitFlag(flag())).toEqual({ status: 429, code: "failed" });
    expect(allowAccountAction).toHaveBeenCalledWith("flag", "someone@gmail.com");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

Run: `cd web && npx vitest run tests/review-actions.test.ts`
Expected: FAIL: `submitReview` returns `{ status: 200, code: "saved" }`.

- [ ] **Step 6: Wire the limits into the actions**

In `web/lib/actions-core.ts`:
- add `import { allowAccountAction } from "./limits";`;
- append `| "rate_limited"` to the existing `ReviewCode` union. Do not restate the union: P0 Task 11 widened it, and its `REVIEW_REFUSALS` and `conflictCode()` return the extra codes. After the edit it reads `export type ReviewCode = "saved" | "forbidden" | "captcha" | "invalid" | "stale" | "decided" | "checks" | "issue_open" | "approved" | "checked" | "removed" | "failed" | "rate_limited";`;
- add `429` to the `status` union of `ActionResult`, giving `export type ActionResult<C extends string> = { status: 200 | 400 | 403 | 409 | 429 | 502; code: C };`;
- in `submitReview`, directly before the Turnstile check, add `if (!allowAccountAction("decision", session.email)) return { status: 429, code: "rate_limited" };`;
- in `submitFlag`, directly before the Turnstile check, add `if (!allowAccountAction("flag", session.email)) return { status: 429, code: "failed" };`.

In `web/app/batches/[id]/page.tsx` add `import { TOO_MANY_REQUESTS } from "@/lib/copy";` and the entry `rate_limited: { text: TOO_MANY_REQUESTS, ok: false },` to `REVIEW_OUTCOME`.

- [ ] **Step 7: Run the tests and the suite**

Run: `cd web && npx vitest run tests/review-actions.test.ts && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/lib/rate-limit.ts web/lib/limits.ts web/lib/actions-core.ts "web/app/batches/[id]/page.tsx" \
  web/tests/rate-limit.test.ts web/tests/limits.test.ts web/tests/review-actions.test.ts
git commit -m "feat(web): §9.3 limit table, Dhaka-day caps, per-account keys; limit decisions and flags" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Nonce CSP, request id and the header rules

**Files:**
- Create: `web/lib/security-headers.ts`
- Modify: `web/lib/csp.ts`, `web/middleware.ts`, `web/next.config.ts`
- Test: `web/tests/csp.test.ts` (rewritten), `web/tests/security-headers.test.ts`

**Interfaces:**
- Consumes: `siteHostname()` (Task 10), `TOO_MANY_REQUESTS` (Task 3).
- Produces: from `@/lib/csp`: `buildCsp({ nonce, authDomain?, siteHostname }): string`, `newNonce(): string`, `AUTH_PROXY_CSP = "frame-ancestors 'self'"`; from `@/lib/security-headers`: `AUTH_PROXY_PREFIX = "/__/auth/"`, `nextWithSecurityHeaders(request: NextRequest): NextResponse` (sets request headers `content-security-policy`, `x-nonce`, `x-request-id`; response headers `Content-Security-Policy`, `Cache-Control: private, no-store`). Server code reads `x-nonce` and `x-request-id` with `headers()`.

- [ ] **Step 1: Rewrite the CSP test**

Replace `web/tests/csp.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_PROXY_CSP, buildCsp, newNonce } from "../lib/csp";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

const directives = (csp: string) => new Map(csp.split(";").map((d) => d.trim()).filter(Boolean)
  .map((d) => { const [name, ...values] = d.split(/\s+/); return [name, values] as const; }));

describe("buildCsp (§9.4)", () => {
  it("is exactly the §9.4 policy, with the nonce and 'strict-dynamic' and without 'unsafe-inline' for scripts", () => {
    const d = directives(buildCsp({ nonce: "abc123==", authDomain: "intellidrugs-kb.firebaseapp.com", siteHostname: "drugdb.eliooo.org" }));
    expect([...d.keys()]).toEqual(["default-src", "script-src", "style-src", "img-src", "font-src", "connect-src", "frame-src",
      "frame-ancestors", "base-uri", "form-action", "object-src"]);
    expect(d.get("default-src")).toEqual(["'self'"]);
    expect(d.get("script-src")).toEqual(["'self'", "'nonce-abc123=='", "'strict-dynamic'", "https://challenges.cloudflare.com",
      "https://apis.google.com", "https://www.gstatic.com"]);
    expect(d.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(d.get("img-src")).toEqual(["'self'", "data:"]);
    expect(d.get("font-src")).toEqual(["'self'"]);
    expect(d.get("connect-src")).toEqual(["'self'", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"]);
    expect(d.get("frame-src")).toEqual(["'self'", "https://challenges.cloudflare.com", "https://intellidrugs-kb.firebaseapp.com"]);
    expect(d.get("frame-ancestors")).toEqual(["'none'"]);
    expect(d.get("base-uri")).toEqual(["'none'"]);
    expect(d.get("form-action")).toEqual(["'self'"]);
    expect(d.get("object-src")).toEqual(["'none'"]);
  });

  it("leaves the auth domain out of frame-src when it is the site itself, missing, or not a plain host", () => {
    for (const authDomain of ["drugdb.eliooo.org", undefined, "", "evil.com; script-src *", "https://x.firebaseapp.com", "*"]) {
      const csp = buildCsp({ nonce: "n", authDomain, siteHostname: "drugdb.eliooo.org" });
      expect(directives(csp).get("frame-src")).toEqual(["'self'", "https://challenges.cloudflare.com"]);
      expect(csp).not.toContain("evil");
    }
  });

  it("makes a fresh 128-bit base64 nonce each time", () => {
    const a = newNonce(), b = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(a).not.toBe(b);
  });
});

describe("next.config (§9.4, §9.5)", () => {
  const load = async () => (await import("../next.config")).default;

  it("has no static CSP; X-Frame-Options DENY everywhere except /__/auth", async () => {
    const [app, auth] = await (await load()).headers!();
    expect(app.source).toBe("/((?!__/auth/).*)");
    expect(Object.fromEntries(app.headers.map((h) => [h.key, h.value]))).toEqual({
      "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
    });
    expect(auth.source).toBe("/__/auth/:path*");
    expect(Object.fromEntries(auth.headers.map((h) => [h.key, h.value]))).toEqual({
      "Content-Security-Policy": AUTH_PROXY_CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin",
      "X-Robots-Tag": "noindex, nofollow",
    });
  });

  it("proxies /__/auth to the Firebase project's handler (Firebase's proxy option)", async () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "intellidrugs-kb");
    expect(await (await load()).rewrites!()).toEqual([
      { source: "/__/auth/:path*", destination: "https://intellidrugs-kb.firebaseapp.com/__/auth/:path*" }]);
  });

  it("adds no rewrite without a valid project id", async () => {
    for (const id of ["", "Bad_Project", "x.evil.com/"]) {
      vi.stubEnv("FIREBASE_PROJECT_ID", id);
      vi.resetModules();
      expect(await (await load()).rewrites!()).toEqual([]);
    }
  });
});
```

Create `web/tests/security-headers.test.ts`:

```ts
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextWithSecurityHeaders } from "@/lib/security-headers";

afterEach(() => vi.unstubAllEnvs());
const req = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://localhost${path}`, { headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("nextWithSecurityHeaders (§9.4)", () => {
  it("puts one nonce in the response CSP and in the request headers Next reads", () => {
    const res = nextWithSecurityHeaders(req("/signin"));
    const csp = res.headers.get("content-security-policy")!;
    const nonce = res.headers.get("x-middleware-request-x-nonce")!;
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
  });
  it("uses a new nonce per request", () => {
    expect(nextWithSecurityHeaders(req("/")).headers.get("x-middleware-request-x-nonce"))
      .not.toBe(nextWithSecurityHeaders(req("/")).headers.get("x-middleware-request-x-nonce"));
  });
  it("sets a server-made x-request-id, replacing any the client sent", () => {
    const id = nextWithSecurityHeaders(req("/", { "x-request-id": "client-chosen" })).headers.get("x-middleware-request-x-request-id");
    expect(id).toMatch(UUID);
  });
  it("marks every response private, no-store", () => {
    expect(nextWithSecurityHeaders(req("/products/x")).headers.get("cache-control")).toBe("private, no-store");
  });
  it("sends no app CSP and no nonce on the /__/auth proxy, but still a request id", () => {
    const res = nextWithSecurityHeaders(req("/__/auth/handler", { "x-nonce": "forged", "content-security-policy": "forged" }));
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-nonce")).toBeNull();
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-request-id")).toMatch(UUID);
  });
  it("never forwards the visitor's cookies (the session token) to the proxied Firebase host", () => {
    const res = nextWithSecurityHeaders(req("/__/auth/handler", { cookie: "__Host-intellidrugs_session=jwe; intellidrugs-theme=dark" }));
    expect(res.headers.get("x-middleware-request-cookie")).toBeNull();
    expect(res.headers.get("x-middleware-override-headers")?.split(",")).not.toContain("cookie");
  });
  it("keeps cookies on every other path, where the app needs the session", () => {
    const res = nextWithSecurityHeaders(req("/signin", { cookie: "intellidrugs-theme=dark" }));
    expect(res.headers.get("x-middleware-request-cookie")).toBe("intellidrugs-theme=dark");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/csp.test.ts tests/security-headers.test.ts`
Expected: FAIL: `newNonce` is not exported; `@/lib/security-headers` does not resolve.

- [ ] **Step 3: Write the CSP module, the header helper, the middleware and `next.config.ts`**

Replace `web/lib/csp.ts`:

```ts
/** A Firebase auth domain must be a plain host name; anything else is left out of the CSP. */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** The /__/auth proxy's whole policy (§9.5): our pages frame Firebase's handler; it runs Firebase's scripts. */
export const AUTH_PROXY_CSP = "frame-ancestors 'self'";

/**
 * §9.4 policy, built per request in the middleware. Under 'strict-dynamic' the host list is ignored by modern
 * browsers and kept as the fallback. frame-src lists the Firebase auth domain only when it is not the site itself,
 * so an image built with <project>.firebaseapp.com still signs in with the popup.
 */
export function buildCsp({ nonce, authDomain, siteHostname }: { nonce: string; authDomain?: string; siteHostname: string }): string {
  const authFrame = authDomain && HOST.test(authDomain) && authDomain.toLowerCase() !== siteHostname.toLowerCase()
    ? ` https://${authDomain}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com https://apis.google.com https://www.gstatic.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
    `frame-src 'self' https://challenges.cloudflare.com${authFrame}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

/** 128 random bits, base64. */
export function newNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
}
```

Create `web/lib/security-headers.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "./csp";
import { siteHostname } from "./site";

export const AUTH_PROXY_PREFIX = "/__/auth/";

/**
 * NextResponse.next() with the per-request security headers (§9.4):
 * - request headers for app code: `content-security-policy` (Next reads the nonce from it), `x-nonce`, `x-request-id`;
 * - response headers: the same CSP and `Cache-Control: private, no-store`.
 * The /__/auth proxy gets only the request id, and never the visitor's cookies: the rewrite forwards request headers
 * to <project>.firebaseapp.com, a third-party host that must not see the session token. Its header set comes from
 * next.config.ts.
 */
export function nextWithSecurityHeaders(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-request-id", crypto.randomUUID());
  headers.delete("x-nonce");
  headers.delete("content-security-policy");
  if (request.nextUrl.pathname.startsWith(AUTH_PROXY_PREFIX)) {
    headers.delete("cookie");
    return NextResponse.next({ request: { headers } });
  }

  const nonce = newNonce();
  const csp = buildCsp({ nonce, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, siteHostname: siteHostname() });
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
```

Replace `web/middleware.ts` (Task 14 replaces it again with the full limit table):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { TOO_MANY_REQUESTS } from "@/lib/copy";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";
import { nextWithSecurityHeaders } from "@/lib/security-headers";

// 10 requests/s per client with a burst of 30 (§9.3).
const limiter = createRateLimiter({ ratePerSecond: 10, burst: 30 });

export function middleware(request: NextRequest) {
  if (!limiter.allow(clientIp(request.headers))) {
    return new NextResponse(TOO_MANY_REQUESTS, {
      status: 429,
      headers: { "Retry-After": "1", "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }
  return nextWithSecurityHeaders(request);
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
```

Replace `web/next.config.ts`:

```ts
import type { NextConfig } from "next";
import { AUTH_PROXY_CSP } from "./lib/csp";

/** Firebase project ids: 6–30 characters, lower-case letters, digits and hyphens. */
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      // The app CSP is per request (middleware.ts). Everything but the Firebase auth proxy refuses framing.
      { source: "/((?!__/auth/).*)", headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
      ] },
      // §9.5: the proxied handler runs Firebase's scripts and is framed by our own pages.
      { source: "/__/auth/:path*", headers: [
        { key: "Content-Security-Policy", value: AUTH_PROXY_CSP },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ] },
    ];
  },
  async rewrites() {
    // §9.5 "Continue in this tab": signInWithRedirect with NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=drugdb.eliooo.org.
    const id = process.env.FIREBASE_PROJECT_ID ?? "";
    return PROJECT_ID.test(id) ? [{ source: "/__/auth/:path*", destination: `https://${id}.firebaseapp.com/__/auth/:path*` }] : [];
  },
};
export default config;
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run tests/csp.test.ts tests/security-headers.test.ts tests/session-route.test.ts`
Expected: PASS (the session-route matcher check still matches `/api/session` and `/signin`).

- [ ] **Step 5: Build once to prove Next accepts the config**

Run: `cd web && npm run build`
Expected: `✓ Compiled successfully`, the bundle scan prints `client bundle check: no server secrets`, and the island check prints `client island check: 3 client files, all on the §4.2 allowlist`.

- [ ] **Step 6: Commit**

```bash
git add web/lib/csp.ts web/lib/security-headers.ts web/middleware.ts web/next.config.ts web/tests/csp.test.ts web/tests/security-headers.test.ts
git commit -m "feat(web): per-request nonce CSP without unsafe-inline scripts, request id, /__/auth proxy headers" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Middleware rate limits and the legacy cookie

**Files:**
- Modify: `web/middleware.ts`
- Test: `web/tests/middleware.test.ts`

**Interfaces:**
- Consumes: `createLimits`, `LIMITS`, `type Limits` (Task 12); `accountKey`, `clientIp`, `secondsUntilDhakaMidnight` (Task 12); `nextWithSecurityHeaders`, `AUTH_PROXY_PREFIX` (Task 13); `decryptSession`, `sessionCookieName`, `LEGACY_SESSION_COOKIE` (Task 11); `NEW_COPY`, `NEW_COPY_ROWS`, `TOO_MANY_REQUESTS` (Task 3).
- Produces: `createMiddleware(limits: Limits, now?: () => number)` and `middleware` (= `createMiddleware(LIMITS)`) from `web/middleware.ts`. 429 shapes: plain text `TOO_MANY_REQUESTS` with `Retry-After`; `POST /api/session` 429 is JSON `{ success: false, data: null, message, errors: [{ code: "RATE_LIMITED", message }] }` with the sign-in copy; `/check/suggest` 429 is `[]`.

- [ ] **Step 1: Write the failing middleware test**

Create `web/tests/middleware.test.ts`:

```ts
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLimits } from "@/lib/limits";
import { encryptSession } from "@/lib/session-crypto";
import { createMiddleware } from "@/middleware";

const SECRET = "s".repeat(32);
beforeEach(() => vi.stubEnv("SESSION_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

let t = Date.UTC(2026, 9, 12, 17, 0, 0);          // 23:00 Dhaka: one hour to the daily reset
const clock = () => t;
const req = (path: string, init: { method?: string; ip?: string; cookie?: string } = {}) => new NextRequest(`http://localhost${path}`, {
  method: init.method ?? "GET",
  headers: { "x-forwarded-for": `${init.ip ?? "203.0.113.9"}, 10.0.0.1`, ...(init.cookie ? { cookie: init.cookie } : {}) },
});
const session = async (email: string, secret = SECRET) =>
  `intellidrugs_session=${await encryptSession({ email, name: "", role: "pharmacist" }, secret)}`;

describe("middleware: limits and headers (§9.3, §9.4)", () => {
  it("never limits /healthz", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    for (let i = 0; i < 100; i++) expect((await mw(req("/healthz"))).status).toBe(200);
  });

  it("per IP: the 31st request in the same instant is 429 with Retry-After: 1", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    for (let i = 0; i < 30; i++) expect((await mw(req("/"))).status).toBe(200);
    const res = await mw(req("/"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("1");
    expect(await res.text()).toBe("Too many requests. Please slow down.");
  });

  it("POST /api/session: 10 per 10 minutes per IP, then the sign-in message as JSON; GET is not counted", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    for (let i = 0; i < 10; i++) expect((await mw(req("/api/session", { method: "POST" }))).status).toBe(200);
    expect((await mw(req("/api/session"))).status).toBe(200);
    const res = await mw(req("/api/session", { method: "POST" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ success: false, data: null,
      message: "Too many sign-in attempts. Wait a few minutes and try again.",
      errors: [{ code: "RATE_LIMITED", message: "Too many sign-in attempts. Wait a few minutes and try again." }] });
    expect((await mw(req("/signout", { method: "POST" }))).status).toBe(200);        // counted separately
  });

  it("/check/suggest: 5/s burst 10 per IP, then 429 with an empty list", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    for (let i = 0; i < 10; i++) expect((await mw(req("/check/suggest?q=na"))).status).toBe(200);
    const res = await mw(req("/check/suggest?q=na"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual([]);
  });

  it("/review/*/versions: 1 per 5 s, burst 3, per account", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    const cookie = await session("pharm@example.org");
    for (let i = 0; i < 3; i++) expect((await mw(req("/review/0001-pilot/versions", { cookie }))).status).toBe(200);
    expect((await mw(req("/review/0001-pilot/versions", { cookie }))).status).toBe(429);
  });

  it("anonymous pages: daily cap per IP, Retry-After = seconds until 00:00 Dhaka", async () => {
    const mw = createMiddleware(createLimits(clock, { anonymousDaily: 3, accountDaily: 2 }), clock);
    for (let i = 0; i < 3; i++) expect((await mw(req("/search"))).status).toBe(200);
    const res = await mw(req("/search"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("3600");
    expect((await mw(req("/search", { ip: "198.51.100.7" }))).status).toBe(200);
  });

  it("a signed-in reviewer is not blocked by the anonymous cap on the same IP (Review Focus 2)", async () => {
    const mw = createMiddleware(createLimits(clock, { anonymousDaily: 3, accountDaily: 2 }), clock);
    for (let i = 0; i < 4; i++) await mw(req("/"));
    const cookie = await session("pharm@example.org");
    expect((await mw(req("/", { cookie }))).status).toBe(200);
    expect((await mw(req("/", { cookie }))).status).toBe(200);
    expect((await mw(req("/", { cookie }))).status).toBe(429);              // per-account cap of 2
    expect((await mw(req("/", { cookie: await session("PHARM@example.org") }))).status).toBe(429); // same account
  });

  it("treats unreadable session cookies as anonymous (Review Focus 1)", async () => {
    const mw = createMiddleware(createLimits(clock, { anonymousDaily: 3, accountDaily: 100 }), clock);
    const good = await session("pharm@example.org");
    const tampered = `${good.slice(0, -3)}xyz`;
    const legacyJws = `intellidrugs_session=${await new SignJWT({ email: "pharm@example.org", role: "pharmacist" })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(new TextEncoder().encode(SECRET))}`;
    const rotated = await session("pharm@example.org", "x".repeat(32));
    for (const cookie of [tampered, legacyJws, rotated]) expect((await mw(req("/", { cookie }))).status).toBe(200);
    expect((await mw(req("/", { cookie: tampered }))).status).toBe(429);    // they all used the anonymous bucket
  });

  it("deletes the old bddrug_session cookie on the first response", async () => {
    const mw = createMiddleware(createLimits(clock), clock);
    const res = await mw(req("/", { cookie: "bddrug_session=old.jwt.value" }));
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith("bddrug_session="))!;
    expect(cleared).toMatch(/^bddrug_session=;/);
    expect(cleared).toMatch(/Max-Age=0/);
    expect(cleared).toMatch(/Path=\//);
  });

  it("still sets the security headers on allowed requests", async () => {
    const res = await createMiddleware(createLimits(clock), clock)(req("/signin"));
    expect(res.headers.get("content-security-policy")).toContain("'strict-dynamic'");
    expect(res.headers.get("x-middleware-request-x-request-id")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/middleware.test.ts`
Expected: FAIL: `createMiddleware` is not exported from `@/middleware`.

- [ ] **Step 3: Replace `web/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { NEW_COPY, NEW_COPY_ROWS, TOO_MANY_REQUESTS } from "@/lib/copy";
import { LIMITS, type Limits } from "@/lib/limits";
import { accountKey, clientIp, secondsUntilDhakaMidnight } from "@/lib/rate-limit";
import { AUTH_PROXY_PREFIX, nextWithSecurityHeaders } from "@/lib/security-headers";
import { LEGACY_SESSION_COOKIE, decryptSession, sessionCookieName } from "@/lib/session-crypto";

const NO_STORE = "private, no-store";
const VERSIONS = /^\/review\/[^/]+\/versions$/;
const SIGN_IN_RATE_LIMITED = NEW_COPY[NEW_COPY_ROWS.signIn].rateLimited;

const tooMany = (retryAfter: number) => new NextResponse(TOO_MANY_REQUESTS, {
  status: 429,
  headers: { "Retry-After": String(retryAfter), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": NO_STORE },
});

/** The session email for per-account keys; any unreadable cookie counts as no session. Never logged. */
async function sessionEmail(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(sessionCookieName())?.value;
  if (!token) return null;
  try {
    return (await decryptSession(token))?.email ?? null;
  } catch {
    return null;
  }
}

/** Page requests count toward the daily caps; route handlers with their own limits and the auth proxy do not. */
const isPage = (request: NextRequest, path: string) =>
  (request.method === "GET" || request.method === "HEAD") && !path.startsWith("/api/") && path !== "/check/suggest"
  && !VERSIONS.test(path) && !path.startsWith(AUTH_PROXY_PREFIX);

export function createMiddleware(limits: Limits, now: () => number = Date.now) {
  return async function middleware(request: NextRequest): Promise<NextResponse> {
    const path = request.nextUrl.pathname;
    if (path === "/healthz") return NextResponse.next();       // container healthcheck: never limited

    const ip = clientIp(request.headers);
    if (!limits.perIp.allow(ip)) return tooMany(1);

    if (request.method === "POST" && path === "/api/session" && !limits.signIn.allow(ip)) {
      return NextResponse.json(
        { success: false, data: null, message: SIGN_IN_RATE_LIMITED, errors: [{ code: "RATE_LIMITED", message: SIGN_IN_RATE_LIMITED }] },
        { status: 429, headers: { "Retry-After": "60", "Cache-Control": NO_STORE } });
    }
    if (request.method === "POST" && path === "/signout" && !limits.signOut.allow(ip)) return tooMany(60);
    if (path === "/check/suggest" && !limits.suggest.allow(ip)) {
      return NextResponse.json([], { status: 429, headers: { "Retry-After": "1", "Cache-Control": NO_STORE } });
    }

    const email = await sessionEmail(request);
    const account = email ? accountKey(email) : null;
    if (VERSIONS.test(path)) {
      if (account && !limits.versions.allow(account)) return tooMany(5);
    } else if (isPage(request, path)) {
      const allowed = account ? limits.accountDaily.allow(account) : limits.anonymousDaily.allow(ip);
      if (!allowed) return tooMany(secondsUntilDhakaMidnight(now()));
    }

    const res = nextWithSecurityHeaders(request);
    if (request.cookies.has(LEGACY_SESSION_COOKIE)) res.cookies.set(LEGACY_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };
}

export const middleware = createMiddleware(LIMITS);

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/middleware.test.ts tests/security-headers.test.ts tests/session-route.test.ts`
Expected: PASS (10 middleware tests).

- [ ] **Step 5: Commit**

```bash
git add web/middleware.ts web/tests/middleware.test.ts
git commit -m "feat(web): middleware applies every §9.3 limit; per-account keys; deletes the bddrug_session cookie" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Nonce and action on the legacy Turnstile widget

**Files:**
- Create: `web/lib/nonce.ts`, `web/lib/turnstile-actions.ts`
- Modify: `web/components/Turnstile.tsx`, `web/components/FlagForm.tsx`, `web/app/products/[id]/page.tsx`, `web/app/substances/[id]/page.tsx`, `web/app/check/page.tsx`, `web/app/flags/page.tsx`, `web/app/batches/[id]/page.tsx`
- Test: `web/tests/flag-form.test.tsx`, `web/tests/turnstile.test.tsx` (widget block)

**Interfaces:**
- Consumes: the `x-nonce` request header (Task 13).
- Produces: `cspNonce(): Promise<string | undefined>` from `@/lib/nonce` (server-only; `undefined` outside a request); `TURNSTILE_ACTIONS`, `type TurnstileAction = "decision" | "flag" | "resolve" | "partner" | "signin"` from `@/lib/turnstile-actions` (client-safe); `Turnstile({ action: TurnstileAction; nonce?: string })`; `FlagForm` gains `nonce?: string`.

- [ ] **Step 1: Write the failing tests**

Append to `web/tests/flag-form.test.tsx` inside its `describe`:

```tsx
  it("the flag form's Turnstile script carries the CSP nonce and the widget names action=flag (§9.4)", () => {
    const html = renderToStaticMarkup(
      <FlagForm session={{ email: "u@x.org", role: "user" }} targetType="product" targetId="P-1" nonce="n0nce123" />);
    expect(html).toMatch(/<script[^>]*src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js"[^>]*nonce="n0nce123"/);
    expect(html).toContain('data-action="flag"');
  });
```

In `web/tests/turnstile.test.tsx` replace all four `renderToStaticMarkup(<Turnstile />)` calls (including the one in "refuses the test site key in production") with `renderToStaticMarkup(<Turnstile action="decision" />)` (`grep -c 'renderToStaticMarkup(<Turnstile />)' web/tests/turnstile.test.tsx` prints `0` afterwards) and append inside `describe("Turnstile widget", …)`:

```tsx
  it("passes the nonce to the Cloudflare script and the action to the widget", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAA-site");
    const html = renderToStaticMarkup(<Turnstile action="resolve" nonce="abc" />);
    expect(html).toContain('<div class="cf-turnstile" data-sitekey="0x4AAAAAAA-site" data-action="resolve"></div>');
    expect(html).toMatch(/<script[^>]*nonce="abc"/);
  });
```

and change the first widget assertion to `'<div class="cf-turnstile" data-sitekey="0x4AAAAAAA-site" data-action="decision"></div>'`.

Create `web/tests/nonce.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const headers = vi.fn();
vi.mock("next/headers", () => ({ headers: () => headers() }));
import { cspNonce } from "@/lib/nonce";

describe("cspNonce", () => {
  it("reads x-nonce from the request", async () => {
    headers.mockResolvedValue(new Headers({ "x-nonce": "abc" }));
    expect(await cspNonce()).toBe("abc");
  });
  it("is undefined when there is none or outside a request", async () => {
    headers.mockResolvedValue(new Headers());
    expect(await cspNonce()).toBeUndefined();
    headers.mockRejectedValue(new Error("headers() was called outside a request scope"));
    expect(await cspNonce()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/flag-form.test.tsx tests/turnstile.test.tsx tests/nonce.test.ts`
Expected: FAIL: no `nonce` attribute, no `data-action`; `@/lib/nonce` does not resolve.

- [ ] **Step 3: Write the helpers and update the widget, the form and the pages**

`web/lib/turnstile-actions.ts`:

```ts
/** Turnstile action names (§9.2). Client-safe: the TurnstileField island imports the type. */
export const TURNSTILE_ACTIONS = ["decision", "flag", "resolve", "partner", "signin"] as const;
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[number];
```

`web/lib/nonce.ts`:

```ts
import "server-only";
import { headers } from "next/headers";

/** The per-request CSP nonce set by the middleware (§9.4); undefined outside a request (tests, build). */
export async function cspNonce(): Promise<string | undefined> {
  try {
    return (await headers()).get("x-nonce") ?? undefined;
  } catch {
    return undefined;
  }
}
```

Replace `web/components/Turnstile.tsx`:

```tsx
import { turnstileSiteKey } from "@/lib/turnstile";
import type { TurnstileAction } from "@/lib/turnstile-actions";

/**
 * The implicit Cloudflare Turnstile widget for a server-action <form> on the legacy pages. Turnstile adds the hidden
 * `cf-turnstile-response` field; the action checks it with verifyTurnstile(token, ip, action). Under the nonce CSP
 * the script runs only with the request's nonce (§9.4).
 */
export default function Turnstile({ action, nonce }: { action: TurnstileAction; nonce?: string }) {
  const siteKey = turnstileSiteKey();
  if (!siteKey) return <p role="alert">Verification is not configured, so this action is disabled.</p>;
  return (
    <>
      <div className="cf-turnstile" data-sitekey={siteKey} data-action={action} />
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer nonce={nonce} />
    </>
  );
}
```

In `web/components/FlagForm.tsx`: add `nonce?: string` to the props type and destructuring (`{ session, targetType, targetId, outcome, nonce }`), and replace `<Turnstile />` with `<Turnstile action="flag" nonce={nonce} />`.

In `web/app/products/[id]/page.tsx`, `web/app/substances/[id]/page.tsx` and `web/app/check/page.tsx`: add `import { cspNonce } from "@/lib/nonce";`, add `const nonce = await cspNonce();` on the line after `const session = await getSession();`, and add `nonce={nonce}` to the `<FlagForm …>` element.

In `web/app/flags/page.tsx`: add `import { cspNonce } from "@/lib/nonce";`, add `const nonce = await cspNonce();` after `const session = await getSession();`, and replace `<Turnstile />` with `<Turnstile action="resolve" nonce={nonce} />`.

In `web/app/batches/[id]/page.tsx`: add `import { cspNonce } from "@/lib/nonce";`; add `nonce?: string` to the `ReviewForms` props type and destructuring; replace both `<Turnstile />` inside `ReviewForms` with `<Turnstile action="decision" nonce={nonce} />`; in `BatchPage` add `const nonce = await cspNonce();` after `const session = await getSession();` and pass `nonce={nonce}` on every `<ReviewForms …>` element.

- [ ] **Step 4: Run them and the suite**

Run: `cd web && npx vitest run tests/flag-form.test.tsx tests/turnstile.test.tsx tests/nonce.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/nonce.ts web/lib/turnstile-actions.ts web/components/Turnstile.tsx web/components/FlagForm.tsx web/app web/tests
git commit -m "feat(web): Turnstile script carries the CSP nonce; widgets name their action" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Turnstile action and hostname checks, the e2e test-key branch, and the TurnstileField island

**Files:**
- Create: `web/components/TurnstileField.tsx`, `web/components/TurnstileField.module.css`
- Modify: `web/lib/turnstile.ts`, `web/lib/actions-core.ts`, `web/tests/review-actions.test.ts`
- Test: `web/tests/turnstile.test.tsx` (verify block rewritten), `web/tests/turnstile-field.test.tsx`

**Interfaces:**
- Consumes: `isE2e()`, `siteHostname()` (Task 10); `type TurnstileAction` (Task 15); `BotCheck` (Task 4).
- Produces: `verifyTurnstile(token: unknown, ip: string | null | undefined, action: TurnstileAction): Promise<boolean>`; `TURNSTILE_TEST_SITE_KEYS`, `TURNSTILE_TEST_SECRETS` (plus the existing single-key constants); `turnstileSiteKey()` allows test site keys in production only when `INTELLIDRUGS_E2E=1`; island `TurnstileField({ siteKey: string; action: TurnstileAction; nonce?: string; resetKey?: number; onToken?: (t: string | null) => void; onError?: () => void })` from `@/components/TurnstileField` (explicit render, puts `cf-turnstile-response` into its enclosing form, shows `BotCheck`).

- [ ] **Step 1: Confirm the test-key siteverify response (§9.2)**

Run:

```bash
curl -s -X POST https://challenges.cloudflare.com/turnstile/v0/siteverify \
  -d secret=1x0000000000000000000000000000000AA -d response=XXXX.DUMMY.TOKEN.XXXX
```

Expected (checked live against Cloudflare): a JSON body with `"success":true`, `"hostname":"example.com"`, `"metadata":{"result_with_testing_key":true}` and **no `action` field** (the spec's "empty action": a missing action fails the comparison exactly as `""` would). If the live answer differs, use its values in the `TEST_REPLY` fixture below before continuing, and say so in the commit body.

- [ ] **Step 2: Rewrite the verify tests**

In `web/tests/turnstile.test.tsx` replace the whole `describe("verifyTurnstile", …)` block, and change the import line to also import `TURNSTILE_TEST_SECRETS` and `turnstileSiteKey`:

```tsx
const REAL = { success: true, hostname: "drugdb.eliooo.org", action: "signin" };
/** The live test-secret answer: no `action` field at all (Step 1). */
const TEST_REPLY = { success: true, hostname: "example.com" };

describe("verifyTurnstile (§9.2)", () => {
  beforeEach(() => vi.stubEnv("SITE_HOST", "drugdb.eliooo.org"));

  it("posts the secret, the token and the remote IP with a 5 s timeout, and checks action and hostname", async () => {
    const f = vi.fn().mockResolvedValue(reply(REAL));
    vi.stubGlobal("fetch", f);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    expect(await verifyTurnstile("tok-1", "203.0.113.9", "signin")).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(SITEVERIFY);
    const body = new URLSearchParams(init.body);
    expect([body.get("secret"), body.get("response"), body.get("remoteip")]).toEqual(["real-secret", "tok-1", "203.0.113.9"]);
    expect(timeout).toHaveBeenCalledWith(5000);
    timeout.mockRestore();
  });

  it("refuses a token minted for another action or another hostname", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...REAL, action: "flag" })));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ ...REAL, hostname: "evil.example" })));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ success: true })));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
  });

  it("compares the hostname without the SITE_HOST port", async () => {
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org:443");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(REAL)));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(true);
  });

  it("omits remoteip when the client address is unknown", async () => {
    const f = vi.fn().mockResolvedValue(reply(REAL));
    vi.stubGlobal("fetch", f);
    await verifyTurnstile("tok", "unknown", "signin");
    await verifyTurnstile("tok", null, "signin");
    for (const call of f.mock.calls) expect(new URLSearchParams(call[1].body).has("remoteip")).toBe(false);
  });

  it("fails closed: Cloudflare says no, a non-2xx, non-JSON, a network error or a timeout", async () => {
    for (const r of [reply({ success: false }), reply(REAL, 500), new Response("<html>", { status: 200 }), reply({ ...REAL, success: "true" })]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));
      expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
  });

  it("returns false without calling Cloudflare for a bad token or a missing secret", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    for (const t of [undefined, null, "", 42, new Blob(["x"]), "x".repeat(2049)]) expect(await verifyTurnstile(t, null, "signin")).toBe(false);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses every test secret in production without calling Cloudflare", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const f = vi.fn().mockResolvedValue(reply(TEST_REPLY)); vi.stubGlobal("fetch", f);
    for (const s of TURNSTILE_TEST_SECRETS) {
      vi.stubEnv("TURNSTILE_SECRET_KEY", s);
      expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null, "signin")).toBe(false);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("outside e2e mode the test secret's reply fails the action and hostname checks", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET_KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(TEST_REPLY)));
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null, "signin")).toBe(false);
  });

  it("with INTELLIDRUGS_E2E=1 a test secret is accepted in production and the two comparisons are skipped", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_TEST_SECRET_KEY);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(TEST_REPLY)));
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null, "decision")).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ success: false, "error-codes": ["invalid-input-response"] })));
    vi.stubEnv("TURNSTILE_SECRET_KEY", "2x0000000000000000000000000000000AA");          // always fails
    expect(await verifyTurnstile("XXXX.DUMMY.TOKEN.XXXX", null, "decision")).toBe(false);
  });

  it("with INTELLIDRUGS_E2E=1 a real secret still needs both comparisons", async () => {
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(TEST_REPLY)));
    expect(await verifyTurnstile("tok", null, "signin")).toBe(false);
  });

  it("uses Cloudflare's documented test keys", () => {
    expect(TURNSTILE_TEST_SITE_KEY).toBe("1x00000000000000000000AA");
    expect(TURNSTILE_TEST_SECRET_KEY).toBe("1x0000000000000000000000000000000AA");
    expect([...TURNSTILE_TEST_SECRETS]).toEqual(["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA",
      "3x0000000000000000000000000000000AA"]);
    expect(TURNSTILE_RESPONSE_FIELD).toBe("cf-turnstile-response");
  });

  it("renders a test site key in production only in e2e mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", TURNSTILE_TEST_SITE_KEY);
    expect(turnstileSiteKey()).toBeNull();
    vi.stubEnv("INTELLIDRUGS_E2E", "1");
    expect(turnstileSiteKey()).toBe(TURNSTILE_TEST_SITE_KEY);
  });
});
```

In `web/tests/review-actions.test.ts` change the Turnstile mock to forward the action, and the one call assertion:

```ts
vi.mock("@/lib/turnstile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/turnstile")>()),
  verifyTurnstile: (token: unknown, ip: unknown, action: unknown) => verifyTurnstile(token, ip, action),
}));
```

```ts
    expect(verifyTurnstile).toHaveBeenCalledWith("ts-token", "203.0.113.9", "decision");
```

and append:

```ts
describe("Turnstile actions (§9.2)", () => {
  it("flags check action=flag and resolve checks action=resolve", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    await submitFlag(flag());
    expect(verifyTurnstile).toHaveBeenLastCalledWith("ts-token", "203.0.113.9", "flag");
    fetchMock.mockResolvedValue(ok({ id: 1, status: "resolved" }));
    await submitResolve(form({ flagId: "7", "cf-turnstile-response": "ts-token" }));
    expect(verifyTurnstile).toHaveBeenLastCalledWith("ts-token", "203.0.113.9", "resolve");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd web && npx vitest run tests/turnstile.test.tsx tests/review-actions.test.ts`
Expected: FAIL: `TURNSTILE_TEST_SECRETS` is undefined; action and hostname are not compared; the actions call `verifyTurnstile` with two arguments.

- [ ] **Step 4: Rewrite `lib/turnstile.ts` and pass the actions**

Replace `web/lib/turnstile.ts`:

```ts
import "server-only";
import { isE2e, siteHostname } from "./site";
import type { TurnstileAction } from "./turnstile-actions";

/** Cloudflare's documented test keys. Refused in production unless INTELLIDRUGS_E2E=1 (§9.2, §11.4). */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_SITE_KEYS = ["1x00000000000000000000AA", "2x00000000000000000000AB", "1x00000000000000000000BB",
  "2x00000000000000000000BB", "3x00000000000000000000FF"] as const;
export const TURNSTILE_TEST_SECRETS = ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA"] as const;
/** The hidden form field the widget fills in. */
export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;
const isProduction = () => process.env.NODE_ENV === "production";
const isTestSiteKey = (k: string) => (TURNSTILE_TEST_SITE_KEYS as readonly string[]).includes(k);
const isTestSecret = (s: string) => (TURNSTILE_TEST_SECRETS as readonly string[]).includes(s);

/** The public site key to render, or null when Turnstile is not configured (or a test key reaches production). */
export function turnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  if (!key || (isProduction() && isTestSiteKey(key) && !isE2e())) return null;
  return key;
}

/**
 * Verifies a Turnstile token server-side. Fails closed. A reply counts only when `success` is true, `action`
 * equals the expected action and `hostname` equals SITE_HOST (without port). The single exception is
 * INTELLIDRUGS_E2E=1 with one of Cloudflare's test secrets, whose replies carry a fixed hostname and no action
 * (checked against the live answer in P1A): then only `success` is checked.
 */
export async function verifyTurnstile(token: unknown, ip: string | null | undefined, action: TurnstileAction): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY ?? "";
  if (!secret) return false;
  const e2eTestKey = isTestSecret(secret) && isE2e();
  if (isTestSecret(secret) && isProduction() && !e2eTestKey) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  let result: { success?: unknown; action?: unknown; hostname?: unknown };
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    result = await res.json();
  } catch {
    return false;
  }
  if (result?.success !== true) return false;
  if (e2eTestKey) return true;
  return result.action === action && result.hostname === siteHostname();
}
```

In `web/lib/actions-core.ts` change `turnstilePassed` and its three callers:

```ts
async function turnstilePassed(fd: FormData, action: TurnstileAction): Promise<boolean> {
  return verifyTurnstile(fd.get(TURNSTILE_RESPONSE_FIELD), clientIp(await headers()), action);
}
```

with `import type { TurnstileAction } from "./turnstile-actions";`, and `turnstilePassed(fd, "decision")` in `submitReview`, `turnstilePassed(fd, "flag")` in `submitFlag`, `turnstilePassed(fd, "resolve")` in `submitResolve`.

- [ ] **Step 5: Run them to verify they pass**

Run: `cd web && npx vitest run tests/turnstile.test.tsx tests/review-actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing island test**

Create `web/tests/turnstile-field.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TurnstileField from "@/components/TurnstileField";

type Opts = { sitekey: string; action: string; "response-field-name": string; callback: (t: string) => void;
  "error-callback": () => void; "expired-callback": () => void };
const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
beforeEach(() => {
  api.render.mockReset().mockReturnValue("w1"); api.reset.mockReset(); api.remove.mockReset();
  (window as unknown as { turnstile?: typeof api }).turnstile = api;
});
afterEach(cleanup);
const opts = () => api.render.mock.calls[0][1] as Opts;

describe("TurnstileField island (§4.2)", () => {
  it("renders the widget explicitly with the site key and action, inside its form, and shows Checking", async () => {
    render(<form><TurnstileField siteKey="1x00000000000000000000AA" action="signin" /></form>);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    expect(opts()).toMatchObject({ sitekey: "1x00000000000000000000AA", action: "signin", "response-field-name": "cf-turnstile-response" });
    expect((api.render.mock.calls[0][0] as HTMLElement).closest("form")).not.toBeNull();
    expect(screen.getByText("Checking").className).toBe("botcheck");
  });

  it("reports the token and Bot check passed", async () => {
    const onToken = vi.fn();
    render(<TurnstileField siteKey="k" action="signin" onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => opts().callback("tok-1"));
    expect(onToken).toHaveBeenLastCalledWith("tok-1");
    expect(screen.getByText("Bot check passed")).toBeTruthy();
  });

  it("an error shows Bot check failed, clears the token and calls onError", async () => {
    const onToken = vi.fn(), onError = vi.fn();
    render(<TurnstileField siteKey="k" action="signin" onToken={onToken} onError={onError} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => opts()["error-callback"]());
    expect(screen.getByText("Bot check failed").className).toBe("botcheck is-failed failed");
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(onError).toHaveBeenCalled();
  });

  it("an expired token goes back to Checking", async () => {
    const onToken = vi.fn();
    render(<TurnstileField siteKey="k" action="signin" onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => opts().callback("tok-1"));
    act(() => opts()["expired-callback"]());
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("Checking")).toBeTruthy();
  });

  it("a new resetKey resets the widget for a fresh token", async () => {
    const onToken = vi.fn();
    const { rerender } = render(<TurnstileField siteKey="k" action="signin" onToken={onToken} resetKey={0} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    act(() => opts().callback("tok-1"));
    rerender(<TurnstileField siteKey="k" action="signin" onToken={onToken} resetKey={1} />);
    expect(api.reset).toHaveBeenCalledWith("w1");
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("Checking")).toBeTruthy();
  });

  it("loads Cloudflare's explicit-render script once, with the nonce, when Turnstile is not on the page", () => {
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    render(<><TurnstileField siteKey="k" action="flag" nonce="n1" /><TurnstileField siteKey="k" action="flag" nonce="n1" /></>);
    const scripts = document.head.querySelectorAll('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute("src")).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    expect(scripts[0].getAttribute("nonce")).toBe("n1");
  });
});
```

Run: `cd web && npx vitest run tests/turnstile-field.test.tsx`
Expected: FAIL with `Failed to resolve import "@/components/TurnstileField"`.

- [ ] **Step 7: Write the island**

`web/components/TurnstileField.module.css`:

```css
.field { display: flex; flex-direction: column; gap: var(--s2); min-width: 0; }
```

`web/components/TurnstileField.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import BotCheck, { type BotCheckState } from "@/components/ui/BotCheck";
import type { TurnstileAction } from "@/lib/turnstile-actions";
import styles from "./TurnstileField.module.css";

type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(nonce?: string): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    if (nonce) s.setAttribute("nonce", nonce);
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load")));
    s.onerror = () => { loading = null; reject(new Error("Turnstile did not load")); };
    document.head.appendChild(s);
  });
  return loading;
}

export type TurnstileFieldProps = {
  siteKey: string; action: TurnstileAction; nonce?: string; resetKey?: number;
  onToken?: (token: string | null) => void; onError?: () => void;
};

/**
 * Island (§4.2): explicit Turnstile render, reset and status. Turnstile puts the `cf-turnstile-response` field into
 * the enclosing form; `onToken` hands the same token to a fetch-based caller (sign-in).
 */
export default function TurnstileField({ siteKey, action, nonce, resetKey = 0, onToken, onError }: TurnstileFieldProps) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };
  const [state, setState] = useState<BotCheckState>("checking");

  useEffect(() => {
    let cancelled = false;
    loadTurnstile(nonce).then((ts) => {
      if (cancelled || !box.current) return;
      widget.current = ts.render(box.current, {
        sitekey: siteKey,
        action,
        "response-field-name": "cf-turnstile-response",
        callback: (token: string) => { setState("passed"); callbacks.current.onToken?.(token); },
        "error-callback": () => { setState("failed"); callbacks.current.onToken?.(null); callbacks.current.onError?.(); },
        "expired-callback": () => { setState("checking"); callbacks.current.onToken?.(null); },
      });
    }).catch(() => {
      if (cancelled) return;
      setState("failed");
      callbacks.current.onError?.();
    });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, action, nonce]);

  useEffect(() => {
    if (resetKey === 0 || !widget.current || !window.turnstile) return;
    setState("checking");
    callbacks.current.onToken?.(null);
    window.turnstile.reset(widget.current);
  }, [resetKey]);

  return (
    <div className={styles.field}>
      <div ref={box} />
      <BotCheck state={state} />
    </div>
  );
}
```

- [ ] **Step 8: Run the island test, the island check and the suite**

Run: `cd web && npx vitest run tests/turnstile-field.test.tsx tests/client-islands.test.ts && npm test`
Expected: PASS; the island check counts 4 client files.

- [ ] **Step 9: Commit**

```bash
git add web/lib/turnstile.ts web/lib/actions-core.ts web/components/TurnstileField.tsx web/components/TurnstileField.module.css \
  web/tests/turnstile.test.tsx web/tests/turnstile-field.test.tsx web/tests/review-actions.test.ts
git commit -m "feat(web): Turnstile checks action and hostname, e2e test-key branch, TurnstileField island" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: API `POST /v1/audit-events`

**Files:**
- Create: `api/src/main/java/com/niramoy/bddrug/domain/AuditEvent.java`, `api/src/main/java/com/niramoy/bddrug/application/port/AuditPort.java`, `api/src/main/java/com/niramoy/bddrug/application/AuditService.java`, `api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcAuditAdapter.java`, `api/src/main/java/com/niramoy/bddrug/presentation/AuditController.java`
- Test: `api/src/test/java/com/niramoy/bddrug/AuditApiIntegrationTest.java`

**Interfaces:**
- Consumes: `ops.audit_event` from P0's `V6__item_snapshot_and_audit.sql`; `InternalAuth`, `ApiResponse`, `Validate`, `InvalidQueryException` (existing).
- Produces: `POST /v1/audit-events` (token) with body `{ event, actorEmail?, actorRole?, targetType?, targetId?, outcome, requestId }` → 201 `ApiResponse<{ id }>`; 400 `INVALID_QUERY` with `field` ∈ `event`, `actorEmail`, `actorRole`, `targetType`, `targetId`, `outcome`, `requestId`; 401 without the token. Accepted events: `sign_in`, `sign_in_denied`, `sign_out`, `review_open`, `evidence_open`, `decision_denied` (the §5.15 events the web writes). `AuditPort.append(AuditEvent): Mono<Long>` for P1B (`decision_denied` callers go through the web) and any API code that needs it.

- [ ] **Step 1: Confirm the starting point P0 leaves**

P0 writes its `decision` and `decision_rejected` audit rows with SQL inside `R2dbcReviewAdapter` and adds no audit port, so this task creates `application/port/AuditPort.java`.

Run: `grep -rln "audit_event" api/src/main/java; ls api/src/main/java/com/niramoy/bddrug/application/port/`
Expected: the grep lists `adapter/persistence/R2dbcReviewAdapter.java` (P0's review files may also name the table in comments), and the `port/` listing has no `AuditPort.java`.

- [ ] **Step 2: Write the failing integration test**

Create `api/src/test/java/com/niramoy/bddrug/AuditApiIntegrationTest.java`:

```java
package com.niramoy.bddrug;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static com.niramoy.bddrug.TestSupport.*;
import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@SpringBootTest
@AutoConfigureWebTestClient
class AuditApiIntegrationTest {
    @Container static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16");
    @DynamicPropertySource static void props(DynamicPropertyRegistry r) { TestSupport.props(r, pg); }
    @BeforeAll static void seed() throws Exception { PilotSeed.migrateAndSeed(pg); }

    @Autowired WebTestClient web;

    private static Map<String, Object> event(String event, String outcome, String requestId) {
        Map<String, Object> m = new HashMap<>();
        m.put("event", event);
        m.put("outcome", outcome);
        m.put("requestId", requestId);
        return m;
    }

    private WebTestClient.ResponseSpec post(WebTestClient client, Map<String, ?> body) {
        return client.post().uri("/v1/audit-events").contentType(MediaType.APPLICATION_JSON).bodyValue(body).exchange();
    }

    private long rows() throws Exception { return count(pg, "SELECT count(*) FROM ops.audit_event"); }

    @Test void signInIsStoredWithActorRoleAndTheWebRequestId() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> body = event("sign_in", "ok", rid);
        body.put("actorEmail", "pharm.reviewer@example.org");
        body.put("actorRole", "pharmacist");
        post(internal(web), body).expectStatus().isCreated()
            .expectBody().jsonPath("$.success").isEqualTo(true).jsonPath("$.data.id").isNumber();
        assertThat(text(pg, "SELECT event || '|' || actor_email || '|' || actor_role || '|' || outcome || '|' || " +
            "coalesce(target_type, '-') || '|' || coalesce(target_id, '-') FROM ops.audit_event WHERE request_id = '" + rid + "'"))
            .isEqualTo("sign_in|pharm.reviewer@example.org|pharmacist|ok|-|-");
    }

    @Test void deniedSignInNeedsNoActor() throws Exception {
        String rid = UUID.randomUUID().toString();
        post(internal(web), event("sign_in_denied", "stale_auth", rid)).expectStatus().isCreated();
        assertThat(text(pg, "SELECT coalesce(actor_email, '-') || coalesce(actor_role, '-') || outcome FROM ops.audit_event " +
            "WHERE request_id = '" + rid + "'")).isEqualTo("--stale_auth");
    }

    @Test void reviewOpenCarriesItsBatchItemTarget() throws Exception {
        String rid = UUID.randomUUID().toString();
        Map<String, Object> body = event("review_open", "ok", rid);
        body.put("actorEmail", "eng.reviewer@example.org");
        body.put("actorRole", "engineer");
        body.put("targetType", "batch_item");
        body.put("targetId", "0001-pilot/186-0030-006--napa");
        post(internal(web), body).expectStatus().isCreated();
        assertThat(text(pg, "SELECT target_type || ' ' || target_id FROM ops.audit_event WHERE request_id = '" + rid + "'"))
            .isEqualTo("batch_item 0001-pilot/186-0030-006--napa");
    }

    @Test void eventsTheApiWritesItselfAreRefused() throws Exception {
        long before = rows();
        for (String e : List.of("decision", "decision_rejected", "flag_created", "flag_resolved", "partner_request", "bogus")) {
            post(internal(web), event(e, "ok", UUID.randomUUID().toString())).expectStatus().isBadRequest()
                .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo("event");
        }
        assertThat(rows()).isEqualTo(before);
    }

    private void expectInvalid(Map<String, Object> body, String field) {
        post(internal(web), body).expectStatus().isBadRequest()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("INVALID_QUERY").jsonPath("$.errors[0].field").isEqualTo(field);
    }

    @Test void validationRejectsBadFieldsWithoutWriting() throws Exception {
        long before = rows();
        String rid = UUID.randomUUID().toString();
        Map<String, Object> b;
        b = event("sign_in", "ok", rid); b.put("actorRole", "admin"); expectInvalid(b, "actorRole");
        b = event("sign_in", "ok", rid); b.put("actorEmail", "nobody"); expectInvalid(b, "actorEmail");
        b = event("sign_in", "ok", rid); b.put("targetType", "product"); expectInvalid(b, "targetType");
        b = event("review_open", "ok", rid); b.put("targetType", "batch_item"); b.put("targetId", "x".repeat(201)); expectInvalid(b, "targetId");
        expectInvalid(event("sign_in", "OK!", rid), "outcome");
        expectInvalid(event("sign_in", "a note with spaces", rid), "outcome");
        expectInvalid(event("sign_in", "x".repeat(33), rid), "outcome");
        expectInvalid(event("sign_in", null, rid), "outcome");
        expectInvalid(event("sign_in", "ok", "not-a-uuid"), "requestId");
        expectInvalid(event("sign_in", "ok", null), "requestId");
        assertThat(rows()).isEqualTo(before);
    }

    @Test void needsTheInternalToken() throws Exception {
        long before = rows();
        post(web, event("sign_out", "ok", UUID.randomUUID().toString())).expectStatus().isUnauthorized()
            .expectBody().jsonPath("$.errors[0].code").isEqualTo("UNAUTHORIZED");
        web.post().uri("/v1/audit-events").header(HEADER, "wrong").contentType(MediaType.APPLICATION_JSON)
            .bodyValue(event("sign_out", "ok", UUID.randomUUID().toString())).exchange().expectStatus().isUnauthorized();
        assertThat(rows()).isEqualTo(before);
    }
}
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd api && ./gradlew test --tests 'com.niramoy.bddrug.AuditApiIntegrationTest' --no-daemon`
Expected: FAIL: every POST answers 404 (no handler for `/v1/audit-events`).

- [ ] **Step 4: Write the domain record, port, service, adapter and controller**

`domain/AuditEvent.java`:

```java
package com.niramoy.bddrug.domain;
import java.util.UUID;

/** One row of ops.audit_event (§5.15). No IP addresses and no free text from forms. */
public record AuditEvent(String event, String actorEmail, String actorRole, String targetType, String targetId,
                         String outcome, UUID requestId) {}
```

`application/port/AuditPort.java`:

```java
package com.niramoy.bddrug.application.port;
import com.niramoy.bddrug.domain.AuditEvent;
import reactor.core.publisher.Mono;

public interface AuditPort {
    /** Appends one row and returns its id. The table is append-only (V6 triggers reject UPDATE, DELETE, TRUNCATE). */
    Mono<Long> append(AuditEvent event);
}
```

`application/AuditService.java`:

```java
package com.niramoy.bddrug.application;
import com.niramoy.bddrug.application.port.AuditPort;
import com.niramoy.bddrug.domain.AuditEvent;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Audit events posted by the web server (§5.15, §7.5). The API writes decision and decision_rejected itself, in the
 * decision path, and those rows drive request idempotency, so the web may not post them. Flag events come from
 * FlagService. Nothing here is logged: rows hold team-only emails.
 */
@Service
public class AuditService {
    public static final Set<String> WEB_EVENTS =
        Set.of("sign_in", "sign_in_denied", "sign_out", "review_open", "evidence_open", "decision_denied");
    public static final Set<String> ROLES = Set.of("pharmacist", "engineer", "user");
    public static final Set<String> TARGET_TYPES = Set.of("batch_item", "flag");
    public static final int TARGET_ID_MAX = 200;
    private static final Pattern OUTCOME = Pattern.compile("[a-z_]{1,32}");
    private static final Pattern UUID_TEXT =
        Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

    private final AuditPort port;
    public AuditService(AuditPort port) { this.port = port; }

    public record Request(String event, String actorEmail, String actorRole, String targetType, String targetId,
                          String outcome, String requestId) {}

    public Mono<Long> record(Request r) {
        return Mono.fromCallable(() -> validate(r)).flatMap(port::append);
    }

    static AuditEvent validate(Request r) {
        String event = Validate.oneOf(r.event(), WEB_EVENTS, "event");
        String email = r.actorEmail() == null ? null : Validate.email(r.actorEmail(), "actorEmail");
        String role = r.actorRole() == null ? null : Validate.oneOf(r.actorRole(), ROLES, "actorRole");
        String targetType = r.targetType() == null ? null : Validate.oneOf(r.targetType(), TARGET_TYPES, "targetType");
        String targetId = r.targetId() == null ? null : Validate.text(r.targetId(), 1, TARGET_ID_MAX, "targetId");
        if (r.outcome() == null || !OUTCOME.matcher(r.outcome()).matches())
            throw new InvalidQueryException("outcome", "outcome must be 1-32 lower-case letters or underscores");
        if (r.requestId() == null || !UUID_TEXT.matcher(r.requestId()).matches())
            throw new InvalidQueryException("requestId", "requestId must be a UUID");
        return new AuditEvent(event, email, role, targetType, targetId, r.outcome(), UUID.fromString(r.requestId()));
    }
}
```

`adapter/persistence/R2dbcAuditAdapter.java`:

```java
package com.niramoy.bddrug.adapter.persistence;
import com.niramoy.bddrug.application.port.AuditPort;
import com.niramoy.bddrug.domain.AuditEvent;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
public class R2dbcAuditAdapter implements AuditPort {
    private final DatabaseClient db;
    public R2dbcAuditAdapter(DatabaseClient db) { this.db = db; }

    @Override public Mono<Long> append(AuditEvent e) {
        DatabaseClient.GenericExecuteSpec spec = db.sql(
                "INSERT INTO ops.audit_event (event, actor_email, actor_role, target_type, target_id, outcome, request_id) " +
                "VALUES (:event, :email, :role, :ttype, :tid, :outcome, :rid) RETURNING id")
            .bind("event", e.event()).bind("outcome", e.outcome()).bind("rid", e.requestId());
        spec = nullable(spec, "email", e.actorEmail());
        spec = nullable(spec, "role", e.actorRole());
        spec = nullable(spec, "ttype", e.targetType());
        spec = nullable(spec, "tid", e.targetId());
        return spec.map(r -> r.get("id", Long.class)).one();
    }

    private static DatabaseClient.GenericExecuteSpec nullable(DatabaseClient.GenericExecuteSpec spec, String name, String value) {
        return value == null ? spec.bindNull(name, String.class) : spec.bind(name, value);
    }
}
```

`presentation/AuditController.java`:

```java
package com.niramoy.bddrug.presentation;
import com.niramoy.bddrug.application.AuditService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

/** §7.5: the web server's audit writes. Token only; the body is never echoed (it holds an email). */
@RestController
@RequestMapping("/v1/audit-events")
public class AuditController {
    private final AuditService service;
    private final InternalAuth auth;
    public AuditController(AuditService service, InternalAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    public record Created(long id) {}

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ApiResponse<Created>> create(@RequestHeader(value = InternalAuth.HEADER, required = false) String token,
                                             @RequestBody Mono<AuditService.Request> body) {
        auth.require(token);
        return body.flatMap(service::record).map(id -> ApiResponse.ok(new Created(id)));
    }
}
```

- [ ] **Step 5: Run it to verify it passes, then the whole API suite**

Run: `cd api && ./gradlew test --tests 'com.niramoy.bddrug.AuditApiIntegrationTest' --no-daemon && ./gradlew test --no-daemon`
Expected: `BUILD SUCCESSFUL`; 6 new tests pass and the existing suite stays green.

- [ ] **Step 6: Commit**

```bash
git add api/src/main/java/com/niramoy/bddrug/domain/AuditEvent.java api/src/main/java/com/niramoy/bddrug/application/port/AuditPort.java \
  api/src/main/java/com/niramoy/bddrug/application/AuditService.java api/src/main/java/com/niramoy/bddrug/adapter/persistence/R2dbcAuditAdapter.java \
  api/src/main/java/com/niramoy/bddrug/presentation/AuditController.java api/src/test/java/com/niramoy/bddrug/AuditApiIntegrationTest.java
git commit -m "feat(api): POST /v1/audit-events for the web's sign-in, sign-out and review audit events" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Web audit client and request id

**Files:**
- Create: `web/lib/request-id.ts`, `web/lib/audit.ts`
- Modify: `web/lib/api.ts`, `web/lib/actions-core.ts`, `web/tests/review-actions.test.ts`
- Test: `web/tests/audit.test.ts`

**Interfaces:**
- Consumes: `POST /v1/audit-events` (Task 17); the `x-request-id` request header (Task 13).
- Produces: `requestId(): Promise<string>` from `@/lib/request-id` (server-only; the middleware's UUID, or a fresh one); `type WebAuditEvent = "sign_in" | "sign_in_denied" | "sign_out" | "review_open" | "evidence_open" | "decision_denied"`, `type AuditInput = { event: WebAuditEvent; outcome: string; actorEmail?: string | null; actorRole?: Role | null; targetType?: "batch_item" | "flag" | null; targetId?: string | null }`, `recordAudit(e: AuditInput): Promise<boolean>` (never throws; logs `audit write failed: event=… status=… requestId=…` on failure) from `@/lib/audit`; `postAuditEvent(e: AuditEventRequest)` and `type AuditEventRequest` from `@/lib/api`. The legacy `submitReview` writes `decision_denied` (outcome `unauthenticated` | `forbidden` | `rate_limited` | `captcha`, target `batch_item` `{batchId}/{conceptId}`) whenever it stops a decision before the API call, so the §9.3 limit is audited while the `/batches` review forms are live. P1B calls `recordAudit` for `review_open`, `evidence_open` and its desk's `decision_denied`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/audit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hdrs = { current: new Headers() };
vi.mock("next/headers", () => ({ headers: async () => hdrs.current }));

import { recordAudit } from "@/lib/audit";
import { requestId } from "@/lib/request-id";

const TOKEN = "test-internal-token-0123456789abcdef";
const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("API_URL", "http://api:8080");
  vi.stubEnv("INTERNAL_API_TOKEN", TOKEN);
  hdrs.current = new Headers({ "x-request-id": RID });
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: 1 } }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("requestId", () => {
  it("is the middleware's x-request-id", async () => {
    expect(await requestId()).toBe(RID);
  });
  it("is a fresh UUID when the header is missing or not a UUID", async () => {
    hdrs.current = new Headers({ "x-request-id": "client-chosen" });
    const id = await requestId();
    expect(id).toMatch(UUID);
    hdrs.current = new Headers();
    expect(await requestId()).toMatch(UUID);
  });
});

describe("recordAudit (§5.15)", () => {
  it("posts the event to /v1/audit-events with the token and the request id; absent fields are null", async () => {
    expect(await recordAudit({ event: "sign_in", actorEmail: "pharm@example.org", actorRole: "pharmacist", outcome: "ok" })).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api:8080/v1/audit-events");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Internal-Token"]).toBe(TOKEN);
    expect(JSON.parse(init.body)).toEqual({ event: "sign_in", actorEmail: "pharm@example.org", actorRole: "pharmacist",
      targetType: null, targetId: null, outcome: "ok", requestId: RID });
  });

  it("never throws; on failure it logs the event, status and request id, never the email", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = { event: "sign_out" as const, actorEmail: "pharm@example.org", actorRole: "pharmacist" as const, outcome: "ok" };
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    expect(await recordAudit(e)).toBe(false);
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await recordAudit(e)).toBe(false);
    vi.stubEnv("INTERNAL_API_TOKEN", "");
    expect(await recordAudit(e)).toBe(false);
    const logged = error.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain(`audit write failed: event=sign_out status=500 requestId=${RID}`);
    expect(logged).not.toContain("pharm@");
    error.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/audit.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/audit"`.

- [ ] **Step 3: Write the modules**

Append to `web/lib/api.ts` (after `resolveFlag`):

```ts
export type AuditEventRequest = {
  event: string; actorEmail: string | null; actorRole: string | null; targetType: string | null; targetId: string | null;
  outcome: string; requestId: string;
};
/** POST /v1/audit-events (§7.5). Never carries free text from forms. */
export async function postAuditEvent(e: AuditEventRequest): Promise<WriteResult<{ id: number }>> {
  return write<{ id: number }>("/v1/audit-events", e);
}
```

`web/lib/request-id.ts`:

```ts
import "server-only";
import { headers } from "next/headers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The middleware's per-request id (§9.4), for logs and audit rows; a fresh UUID outside a request. */
export async function requestId(): Promise<string> {
  try {
    const id = (await headers()).get("x-request-id");
    if (id && UUID.test(id)) return id;
  } catch {
    // outside a request scope
  }
  return crypto.randomUUID();
}
```

`web/lib/audit.ts`:

```ts
import "server-only";
import { postAuditEvent } from "./api";
import { requestId } from "./request-id";
import type { Role } from "./reviewers";

export type WebAuditEvent = "sign_in" | "sign_in_denied" | "sign_out" | "review_open" | "evidence_open" | "decision_denied";
export type AuditInput = {
  event: WebAuditEvent; outcome: string; actorEmail?: string | null; actorRole?: Role | null;
  targetType?: "batch_item" | "flag" | null; targetId?: string | null;
};

/**
 * Writes one §5.15 audit row through the API. Best effort: it never throws and returns false on failure, so an
 * audit outage never blocks sign-in or sign-out. The failure log names the event, status and request id only.
 */
export async function recordAudit(e: AuditInput): Promise<boolean> {
  const rid = await requestId();
  const r = await postAuditEvent({
    event: e.event, actorEmail: e.actorEmail ?? null, actorRole: e.actorRole ?? null,
    targetType: e.targetType ?? null, targetId: e.targetId ?? null, outcome: e.outcome, requestId: rid,
  });
  if (!r.ok) console.error(`audit write failed: event=${e.event} status=${r.status} requestId=${rid}`);
  return r.ok;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/audit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing `decision_denied` tests (§5.15, §9.3)**

§9.3: over the decision limit "the action returns `rate_limited` … and a `decision_denied` audit event is written". P1A ships that limit on the legacy `submitReview` (Task 12) and may reach `main` on its own (§12.2, §12.3), so the legacy action writes the event too.

In `web/tests/review-actions.test.ts` add after the existing `vi.mock` calls:

```ts
const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (e: unknown) => recordAudit(e) }));
```

add `recordAudit.mockReset(); recordAudit.mockResolvedValue(true);` to `beforeEach`, and append:

```ts
describe("decision_denied audit (§5.15, §9.3)", () => {
  const denied = (outcome: string, actorEmail: string | null, actorRole: string | null) => ({ event: "decision_denied", outcome,
    actorEmail, actorRole, targetType: "batch_item", targetId: "0001-pilot/N-1" });

  it("no session: unauthenticated, with no actor", async () => {
    getSession.mockResolvedValue(null);
    await submitReview(review());
    expect(recordAudit).toHaveBeenCalledWith(denied("unauthenticated", null, null));
  });
  it("a reader: forbidden, with the reader as actor", async () => {
    getSession.mockResolvedValue(USER);
    await submitReview(review());
    expect(recordAudit).toHaveBeenCalledWith(denied("forbidden", "someone@gmail.com", "user"));
  });
  it("over the decision limit: rate_limited", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    allowAccountAction.mockReturnValue(false);
    await submitReview(review());
    expect(recordAudit).toHaveBeenCalledWith(denied("rate_limited", "pharm@example.org", "pharmacist"));
  });
  it("a failed bot check: captcha", async () => {
    getSession.mockResolvedValue(ENGINEER);
    verifyTurnstile.mockResolvedValue(false);
    await submitReview(review());
    expect(recordAudit).toHaveBeenCalledWith(denied("captcha", "eng@example.org", "engineer"));
  });
  it("no target when the ids are invalid; no event for a saved or invalid decision", async () => {
    getSession.mockResolvedValue(null);
    await submitReview(review({ batchId: "" }));
    expect(recordAudit).toHaveBeenLastCalledWith({ ...denied("unauthenticated", null, null), targetType: null, targetId: null });
    recordAudit.mockClear();
    getSession.mockResolvedValue(PHARMACIST);
    await submitReview(review());
    await submitReview(review({ decision: "maybe" }));
    expect(recordAudit).not.toHaveBeenCalled();
  });
  it("an audit outage never changes the answer", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    allowAccountAction.mockReturnValue(false);
    recordAudit.mockRejectedValue(new Error("audit API down"));
    expect(await submitReview(review())).toEqual({ status: 429, code: "rate_limited" });
  });
});
```

Run: `cd web && npx vitest run tests/review-actions.test.ts`
Expected: FAIL: `recordAudit` is never called.

- [ ] **Step 6: Write `decision_denied` from `submitReview`**

In `web/lib/actions-core.ts` add `import { recordAudit } from "./audit";` and, after the `validId` helper, add:

```ts
type DeniedOutcome = "unauthenticated" | "forbidden" | "rate_limited" | "captcha";
/**
 * §5.15 decision_denied: a decision stopped here, before any API call. The target is the batch item only when both
 * ids are valid (never other form text). Best effort: an audit outage never changes the action's answer.
 */
async function denyDecision(outcome: DeniedOutcome, session: Session | null, fd: FormData): Promise<void> {
  const batchId = field(fd, "batchId"), conceptId = field(fd, "conceptId");
  const targetId = validId(batchId) && validId(conceptId) && batchId.length + conceptId.length < ID_MAX
    ? `${batchId}/${conceptId}` : null;
  await recordAudit({ event: "decision_denied", outcome, actorEmail: session?.email ?? null, actorRole: session?.role ?? null,
    targetType: targetId ? "batch_item" : null, targetId }).catch(() => false);
}
```

In `submitReview` replace the three early returns that stop a decision:

- `if (!isReviewer(session)) return { status: 403, code: "forbidden" };` with

```ts
  if (!isReviewer(session)) {
    await denyDecision(session ? "forbidden" : "unauthenticated", session, fd);
    return { status: 403, code: "forbidden" };
  }
```

- `if (!allowAccountAction("decision", session.email)) return { status: 429, code: "rate_limited" };` (Task 12) with

```ts
  if (!allowAccountAction("decision", session.email)) {
    await denyDecision("rate_limited", session, fd);
    return { status: 429, code: "rate_limited" };
  }
```

- `if (!(await turnstilePassed(fd, "decision"))) return { status: 403, code: "captcha" };` (Task 16) with

```ts
  if (!(await turnstilePassed(fd, "decision"))) {
    await denyDecision("captcha", session, fd);
    return { status: 403, code: "captcha" };
  }
```

The header comment's "Nothing here logs" stays true: `recordAudit` writes a row through the API and logs only the event, status and request id on failure.

Run: `cd web && npx vitest run tests/review-actions.test.ts tests/audit.test.ts && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/lib/api.ts web/lib/request-id.ts web/lib/audit.ts web/lib/actions-core.ts web/tests/audit.test.ts web/tests/review-actions.test.ts
git commit -m "feat(web): audit client and request id for server code; decision_denied from the legacy review action" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: `/api/session` with Turnstile (`action=signin`), `returnTo`, audit; `DELETE` removed

**Files:**
- Modify: `web/app/api/session/route.ts`, `web/lib/firebase-admin.ts`
- Test: `web/tests/session-route.test.ts` (rewritten)

**Interfaces:**
- Consumes: `verifyTurnstile(…, "signin")` (Task 16), `recordAudit` (Task 18), `safeReturnTo`, `siteOrigin` (Task 10), `createSessionCookie`, `sessionCookieName`, `sessionCookieOptions`, `LEGACY_SESSION_COOKIE` (Task 11), `SIGN_IN_STATES` (Task 3).
- Produces: `POST /api/session` with JSON `{ idToken: string; turnstileToken: string; returnTo?: string | null }` → 200 `{ success: true, data: { role, redirectTo }, message: "Signed in", errors: [] }` and the session cookie; 400 `BAD_REQUEST`; 401 with `errors[0].code` `UNVERIFIED_EMAIL` | `STALE_SIGN_IN` | `INVALID_ID_TOKEN` and the matching `SIGN_IN_STATES` body (`unverifiedBody`, `staleAuthBody`, `invalidBody`) as the message (the island picks its text by code, never from the message); 403 `CAPTCHA`; 415; 429 `RATE_LIMITED` (middleware); 503 `SIGNIN_DISABLED`. Audit events `sign_in` (outcome `ok`) and `sign_in_denied` (outcome `captcha` | `unverified` | `stale_auth` | `invalid`, no actor). No `DELETE` export.

- [ ] **Step 1: Rewrite the route test**

Replace `web/tests/session-route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const initializeApp = vi.fn((_options: unknown, _name?: string) => ({ name: "intellidrugs-session" }));
const verifyIdToken = vi.fn();
vi.mock("firebase-admin/app", () => ({ initializeApp: (o: unknown, n?: string) => initializeApp(o, n) }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken }) }));
const verifyTurnstile = vi.fn();
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: (t: unknown, ip: unknown, a: unknown) => verifyTurnstile(t, ip, a) }));
const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (e: unknown) => recordAudit(e) }));

import * as route from "@/app/api/session/route";
import { config as middlewareConfig } from "@/middleware";
import { verifySessionToken } from "@/lib/session";

const nowS = () => Math.floor(Date.now() / 1000);
const decoded = (over: Record<string, unknown> = {}) => ({
  uid: "u1", email: "Pharm@Example.org", email_verified: true, auth_time: nowS() - 10, name: "Farhana Islam", ...over });
const post = (body: unknown, contentType = "application/json") => route.POST(new Request("http://localhost/api/session", {
  method: "POST", headers: { "Content-Type": contentType, "x-forwarded-for": "203.0.113.9" },
  body: typeof body === "string" ? body : JSON.stringify(body) }));
const signIn = (over: Record<string, unknown> = {}) => post({ idToken: "tok", turnstileToken: "ts-1", ...over });
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
const valueOf = (cookie: string) => cookie.split(";")[0].slice(cookie.indexOf("=") + 1);

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  vi.stubEnv("FIREBASE_PROJECT_ID", "intellidrugs-test");
  vi.stubEnv("REVIEWERS", "pharm@example.org:pharmacist,eng@example.org:engineer");
  verifyIdToken.mockReset().mockResolvedValue(decoded());
  verifyTurnstile.mockReset().mockResolvedValue(true);
  recordAudit.mockReset().mockResolvedValue(true);
  initializeApp.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/session", () => {
  it("checks Turnstile with action signin and the client IP before Firebase (initialized as intellidrugs-session)", async () => {
    expect((await signIn()).status).toBe(200);
    expect(verifyTurnstile).toHaveBeenCalledWith("ts-1", "203.0.113.9", "signin");
    // firebase-admin keeps one app per process, so the first sign-in of the file is the one that initializes it (§9.8).
    expect(initializeApp).toHaveBeenCalledWith({ projectId: "intellidrugs-test" }, "intellidrugs-session");
    verifyTurnstile.mockResolvedValue(false);
    verifyIdToken.mockClear();
    const res = await signIn();
    expect(res.status).toBe(403);
    expect((await res.json()).errors[0].code).toBe("CAPTCHA");
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(cookieOf(res, "intellidrugs_session")).toBeUndefined();
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "sign_in_denied", outcome: "captcha" });
  });

  it("sets the encrypted session cookie, clears the old one, and audits sign_in", async () => {
    const res = await signIn();
    const cookie = cookieOf(res, "intellidrugs_session")!;
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=lax/i);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=28800/);
    expect(cookie).not.toMatch(/; Secure/i);
    expect(cookie).not.toMatch(/; Domain=/i);
    expect(await verifySessionToken(valueOf(cookie))).toEqual({ email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" });
    expect(cookieOf(res, "bddrug_session")).toMatch(/Max-Age=0/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ success: true, data: { role: "pharmacist", redirectTo: "/signin?welcome=1" },
      message: "Signed in", errors: [] });
    expect(recordAudit).toHaveBeenCalledWith({ event: "sign_in", actorEmail: "pharm@example.org", actorRole: "pharmacist", outcome: "ok" });
  });

  it("uses the __Host- cookie with Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(cookieOf(await signIn(), "__Host-intellidrugs_session")).toMatch(/; Secure/i);
  });

  it("returns a safe redirect target and never an unsafe one", async () => {
    expect((await (await signIn({ returnTo: "/review/0001-pilot?show=needs" })).json()).data.redirectTo).toBe("/review/0001-pilot?show=needs");
    expect((await (await signIn({ returnTo: "/\\evil.com" })).json()).data.redirectTo).toBe("/signin?welcome=1");
    expect((await (await signIn({ returnTo: null })).json()).data.redirectTo).toBe("/signin?welcome=1");
  });

  it("refuses a returnTo that is not a short string with 400, before Turnstile and Firebase", async () => {
    for (const returnTo of [42, ["/review"], "/" + "x".repeat(2048)]) expect((await signIn({ returnTo })).status).toBe(400);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("maps the user and engineer roles", async () => {
    verifyIdToken.mockResolvedValue(decoded({ email: "someone@gmail.com" }));
    expect((await (await signIn()).json()).data.role).toBe("user");
    verifyIdToken.mockResolvedValue(decoded({ email: "ENG@example.org" }));
    expect((await (await signIn()).json()).data.role).toBe("engineer");
  });

  it.each([
    [{ email_verified: false }, "unverified", "UNVERIFIED_EMAIL", "Your Google account email is not verified."],
    [{ email: undefined }, "unverified", "UNVERIFIED_EMAIL", "Your Google account email is not verified."],
    [{ auth_time: Math.floor(Date.now() / 1000) - 301 }, "stale_auth", "STALE_SIGN_IN", "Sign-in is too old. Please sign in again."],
  ])("refuses %j with 401, audits sign_in_denied %s with no actor, and names the reason by code", async (over, outcome, code, message) => {
    verifyIdToken.mockResolvedValue(decoded(over));
    const res = await signIn();
    expect(res.status).toBe(401);
    expect(cookieOf(res, "intellidrugs_session")).toBeUndefined();
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "sign_in_denied", outcome });
    expect(await res.json()).toMatchObject({ success: false, message, errors: [{ code, message }] });
  });

  it("refuses a token firebase-admin rejects with 401 INVALID_ID_TOKEN and audits invalid", async () => {
    verifyIdToken.mockRejectedValue(Object.assign(new Error("expired"), { code: "auth/id-token-expired" }));
    const res = await signIn();
    expect(res.status).toBe(401);
    expect((await res.json()).errors[0]).toEqual({ code: "INVALID_ID_TOKEN", message: "Sign-in could not be verified. Please try again." });
    expect(recordAudit).toHaveBeenLastCalledWith({ event: "sign_in_denied", outcome: "invalid" });
  });

  it("returns 400 or 415 for a bad body without Turnstile or Firebase", async () => {
    for (const body of [{}, { idToken: "" }, { idToken: 7 }, { idToken: "x".repeat(8193) }, "not json"]) expect((await post(body)).status).toBe(400);
    for (const type of ["text/plain", "application/x-www-form-urlencoded"]) expect((await post({ idToken: "t" }, type)).status).toBe(415);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("returns 503 when sign-in is not configured", async () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    const res = await signIn();
    expect(res.status).toBe(503);
    expect((await res.json()).errors[0].code).toBe("SIGNIN_DISABLED");
  });

  it("still signs in when the audit write fails (Review Focus 5)", async () => {
    recordAudit.mockRejectedValue(new Error("audit API down"));
    const res = await signIn();
    expect(res.status).toBe(200);
    expect(cookieOf(res, "intellidrugs_session")).toBeDefined();
  });

  it("never returns or logs the email", async () => {
    const spies = (["log", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    expect(JSON.stringify(await (await signIn()).json())).not.toMatch(/pharm@/i);
    verifyIdToken.mockResolvedValue(decoded({ email_verified: false }));
    expect(JSON.stringify(await (await signIn()).json())).not.toMatch(/pharm@/i);
    expect(spies.flatMap((s) => s.mock.calls).flat().map(String).join(" ")).not.toMatch(/pharm@/i);
    spies.forEach((s) => s.mockRestore());
  });
});

describe("sign-out is not here", () => {
  it("DELETE /api/session is gone (Next answers 405); POST /signout is the only sign-out", () => {
    expect("DELETE" in route).toBe(false);
  });
});

describe("rate limiting", () => {
  it("the shared middleware covers /api/session and /signin", () => {
    const matcher = new RegExp(`^${middlewareConfig.matcher[0]}$`);
    expect(matcher.test("/api/session")).toBe(true);
    expect(matcher.test("/signin")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/session-route.test.ts`
Expected: FAIL: no Turnstile call, no `redirectTo`, `DELETE` still exported, app name `bddrug-session`.

- [ ] **Step 3: Rewrite the route and rename the Firebase app**

In `web/lib/firebase-admin.ts` change `"bddrug-session"` to `"intellidrugs-session"` (§9.8).

Replace `web/app/api/session/route.ts`:

```ts
import { NextResponse } from "next/server";
import { recordAudit, type AuditInput } from "@/lib/audit";
import { firebaseProjectId, verifyFirebaseIdToken } from "@/lib/firebase-admin";
import { clientIp } from "@/lib/rate-limit";
import { SIGN_IN_STATES } from "@/lib/copy";
import { safeReturnTo } from "@/lib/return-to";
import { roleFor } from "@/lib/reviewers";
import { LEGACY_SESSION_COOKIE, createSessionCookie, sessionCookieName, sessionCookieOptions } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const MAX_ID_TOKEN_LENGTH = 8192;
const MAX_RETURN_TO_LENGTH = 2048;
const MAX_NAME_LENGTH = 200;
/** An ID token is exchanged right after the Google sign-in; older sign-ins are refused (Firebase's session guidance). */
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;
const WELCOME = "/signin?welcome=1";
const NO_STORE = { "Cache-Control": "private, no-store" };

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ success: false, data: null, message, errors: [{ code, message }] }, { status, headers: NO_STORE });

/** Audit writes are best effort (recordAudit logs its own failure); an audit outage never blocks sign-in. */
const audit = (e: AuditInput) => recordAudit(e).catch(() => false);
const deny = async (outcome: "captcha" | "unverified" | "stale_auth" | "invalid", status: number, code: string, message: string) => {
  await audit({ event: "sign_in_denied", outcome });
  return fail(status, code, message);
};

/**
 * POST {idToken, turnstileToken, returnTo}: checks the bot check (action signin), verifies the Firebase ID token,
 * requires a verified email and a fresh sign-in, maps the role from REVIEWERS, and sets the encrypted session cookie.
 * The email is never returned or logged. Rate limiting (10 per 10 minutes per IP) is in middleware.ts.
 */
export async function POST(request: Request) {
  // A JSON body needs a CORS preflight cross-origin, so another site cannot post its own token here (login CSRF).
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") return fail(415, "UNSUPPORTED_MEDIA_TYPE", "Send the token as JSON.");
  const body = await request.json().catch(() => null);
  const idToken = body?.idToken;
  if (typeof idToken !== "string" || idToken.length === 0 || idToken.length > MAX_ID_TOKEN_LENGTH) {
    return fail(400, "BAD_REQUEST", "idToken is required.");
  }
  const returnTo = body?.returnTo ?? null;
  if (returnTo !== null && (typeof returnTo !== "string" || returnTo.length > MAX_RETURN_TO_LENGTH)) {
    return fail(400, "BAD_REQUEST", "returnTo must be a path.");
  }
  const projectId = firebaseProjectId();
  if (!projectId) return fail(503, "SIGNIN_DISABLED", "Reviewer sign-in is not configured.");

  if (!(await verifyTurnstile(body?.turnstileToken, clientIp(request.headers), "signin"))) {
    return deny("captcha", 403, "CAPTCHA", "The bot check did not pass.");
  }

  let decoded: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
  // §1.7 new copy: each 401 names its reason by code; the message is the matching SIGN_IN_STATES body.
  try {
    decoded = await verifyFirebaseIdToken(idToken, projectId);
  } catch {
    return deny("invalid", 401, "INVALID_ID_TOKEN", SIGN_IN_STATES.invalidBody);
  }
  if (typeof decoded.email !== "string" || !decoded.email.includes("@") || decoded.email_verified !== true) {
    return deny("unverified", 401, "UNVERIFIED_EMAIL", SIGN_IN_STATES.unverifiedBody);
  }
  const authAge = Math.floor(Date.now() / 1000) - Number(decoded.auth_time);
  if (!Number.isFinite(authAge) || authAge > MAX_SIGN_IN_AGE_SECONDS) {
    return deny("stale_auth", 401, "STALE_SIGN_IN", SIGN_IN_STATES.staleAuthBody);
  }

  const email = decoded.email.trim().toLowerCase();
  const role = roleFor(email);
  const name = typeof decoded.name === "string" ? decoded.name.slice(0, MAX_NAME_LENGTH) : "";
  const redirectTo = (returnTo !== null && safeReturnTo(returnTo, siteOrigin())) || WELCOME;

  const res = NextResponse.json({ success: true, data: { role, redirectTo }, message: "Signed in", errors: [] }, { headers: NO_STORE });
  res.cookies.set(sessionCookieName(), await createSessionCookie({ email, name, role }), sessionCookieOptions());
  res.cookies.set(LEGACY_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  await audit({ event: "sign_in", actorEmail: email, actorRole: role, outcome: "ok" });
  return res;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/session-route.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add web/app/api/session/route.ts web/lib/firebase-admin.ts web/tests/session-route.test.ts
git commit -m "feat(web): sign-in needs the bot check (action signin), returns a safe redirect, audits; DELETE removed" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: `POST /signout`

**Files:**
- Create: `web/app/signout/route.ts`
- Delete: `web/lib/session-actions.ts`
- Modify: `web/components/Header.tsx`, `web/app/signin/page.tsx`, `web/tests/header.test.tsx`
- Test: `web/tests/signout-route.test.ts`

**Interfaces:**
- Consumes: `getSession`, `sessionCookieName`, `sessionCookieOptions`, `LEGACY_SESSION_COOKIE` (Task 11); `recordAudit` (Task 18); `safeReturnTo`, `siteOrigin` (Task 10).
- Produces: `POST /signout` (form POST; optional field `returnTo`): 403 unless `Origin` equals `siteOrigin()`; otherwise 303 to `/` or `/signin?returnTo=<encoded safe path>`, `Clear-Site-Data: "storage"`, both session cookies cleared, `sign_out` audit event when a session existed. Every sign-out control is `<form method="post" action="/signout">`.

- [ ] **Step 1: Write the failing test**

Create `web/tests/signout-route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (e: unknown) => recordAudit(e) }));

import * as route from "@/app/signout/route";

const PHARMACIST = { email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" };
const signOut = ({ origin = "http://localhost:3000", form = {} }: { origin?: string | null; form?: Record<string, string> } = {}) =>
  route.POST(new Request("http://localhost:3000/signout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(origin === null ? {} : { origin }) },
    body: new URLSearchParams(form),
  }));
const cookieOf = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  getSession.mockReset().mockResolvedValue(PHARMACIST);
  recordAudit.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /signout (§9.6)", () => {
  it.each([null, "https://evil.example", "null", "https://localhost:3000", "http://localhost:3001"])(
    "refuses Origin %j with 403 and changes nothing", async (origin) => {
      const res = await signOut({ origin });
      expect(res.status).toBe(403);
      expect(res.headers.getSetCookie()).toEqual([]);
      expect(recordAudit).not.toHaveBeenCalled();
    });

  it("clears both cookies, sends Clear-Site-Data: \"storage\", audits sign_out and answers 303 to /", async () => {
    const res = await signOut();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("clear-site-data")).toBe('"storage"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(cookieOf(res, "intellidrugs_session")).toMatch(/^intellidrugs_session=;.*Max-Age=0/);
    expect(cookieOf(res, "intellidrugs_session")).toMatch(/HttpOnly/i);
    expect(cookieOf(res, "bddrug_session")).toMatch(/Max-Age=0/);
    expect(recordAudit).toHaveBeenCalledWith({ event: "sign_out", actorEmail: "pharm@example.org", actorRole: "pharmacist", outcome: "ok" });
  });

  it("goes to /signin?returnTo=… for 'Use another Google account' when the path is safe", async () => {
    expect((await signOut({ form: { returnTo: "/review/0001-pilot" } })).headers.get("location"))
      .toBe("/signin?returnTo=%2Freview%2F0001-pilot");
    expect((await signOut({ form: { returnTo: "/\\evil.com" } })).headers.get("location")).toBe("/");
    expect((await signOut({ form: { returnTo: "//evil.com" } })).headers.get("location")).toBe("/");
  });

  it("writes no audit event when there was no session", async () => {
    getSession.mockResolvedValue(null);
    expect((await signOut()).status).toBe(303);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("still signs out when the audit write fails (Review Focus 5)", async () => {
    recordAudit.mockRejectedValue(new Error("audit API down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await signOut();
    expect(res.status).toBe(303);
    expect(cookieOf(res, "intellidrugs_session")).toMatch(/Max-Age=0/);
    expect(error.mock.calls.flat().map(String).join(" ")).not.toContain("pharm@");
    error.mockRestore();
  });

  it("in production checks Origin against https://SITE_HOST and clears the __Host- cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_HOST", "drugdb.eliooo.org");
    expect((await signOut({ origin: "http://localhost:3000" })).status).toBe(403);
    const res = await signOut({ origin: "https://drugdb.eliooo.org" });
    expect(res.status).toBe(303);
    expect(cookieOf(res, "__Host-intellidrugs_session")).toMatch(/Secure/i);
  });

  it("answers POST only", () => {
    expect(Object.keys(route).filter((k) => /^[A-Z]+$/.test(k))).toEqual(["POST"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/signout-route.test.ts`
Expected: FAIL with `Failed to resolve import "@/app/signout/route"`.

- [ ] **Step 3: Write the route and move every sign-out form to it**

`web/app/signout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { safeReturnTo } from "@/lib/return-to";
import { LEGACY_SESSION_COOKIE, getSession, sessionCookieName, sessionCookieOptions } from "@/lib/session";
import { siteOrigin } from "@/lib/site";

export const dynamic = "force-dynamic";
const NO_STORE = "private, no-store";

/**
 * The only sign-out (§9.6). A route handler, so it can send Clear-Site-Data: "storage" (which drops sessionStorage
 * note drafts and leaves cookies alone). Requires Origin = https://SITE_HOST; rate-limited in middleware.ts.
 */
export async function POST(request: Request) {
  const origin = siteOrigin();
  if (request.headers.get("origin") !== origin) {
    return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": NO_STORE } });
  }
  const form = await request.formData().catch(() => null);
  const raw = form?.get("returnTo");
  const returnTo = typeof raw === "string" ? safeReturnTo(raw, origin) : null;

  const session = await getSession();
  if (session) {
    await recordAudit({ event: "sign_out", actorEmail: session.email, actorRole: session.role, outcome: "ok" }).catch(() => false);
  }

  const res = new NextResponse(null, {
    status: 303,
    headers: {
      Location: returnTo ? `/signin?returnTo=${encodeURIComponent(returnTo)}` : "/",
      "Clear-Site-Data": '"storage"',
      "Cache-Control": NO_STORE,
    },
  });
  res.cookies.set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });
  res.cookies.set(LEGACY_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
```

Delete the server action: `git rm web/lib/session-actions.ts`.

In `web/components/Header.tsx`: remove the `signOutAction` import and replace the form with `<form method="post" action="/signout" className={styles.inlineForm}><button type="submit">Sign out</button></form>`.

In `web/app/signin/page.tsx`: remove the `signOutAction` import and replace `<form action={signOutAction}>` with `<form method="post" action="/signout">`.

In `web/tests/header.test.tsx`: delete the `import { signOutAction } from "@/lib/session-actions";` line and the whole `describe("signOutAction", …)` block, and add to the pharmacist `Header` test (React's server renderer prints `class` before a form's `action` and `method`, so the markup is `<form class="inlineForm" action="/signout" method="post">`):

```tsx
    expect(html).toContain('<form class="inlineForm" action="/signout" method="post">');
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run tests/signout-route.test.ts tests/header.test.tsx tests/signin-page.test.tsx && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/signout/route.ts web/components/Header.tsx web/app/signin/page.tsx web/tests/signout-route.test.ts web/tests/header.test.tsx
git commit -m "feat(web): POST /signout with Origin check, Clear-Site-Data and audit; remove signOutAction" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: The sign-in function: `/signin` states and the SignInButton island

**Files:**
- Create: `web/app/signin/navigate.ts`, `web/app/signin/SignInButton.module.css`, `web/app/signin/page.module.css`, `web/lib/live-region.ts`
- Modify: `web/app/signin/SignInButton.tsx`, `web/app/signin/page.tsx`
- Test: `web/tests/signin-page.test.tsx` (rewritten), `web/tests/signin-button.test.tsx`, `web/tests/live-region.test.ts`

**Interfaces:**
- Consumes: `TurnstileField` (Task 16, including `onError`), `Banner`, `Button` (Task 4), `SIGN_IN`, `SIGN_IN_STATES` (Task 3), `safeReturnTo`, `siteOrigin` (Task 10), `turnstileSiteKey` (Task 16), `cspNonce` (Task 15), `POST /api/session` and its 401 codes `UNVERIFIED_EMAIL`, `STALE_SIGN_IN`, `INVALID_ID_TOKEN` (Task 19).
- Produces: island `SignInButton({ config: FirebaseWebConfig; siteKey: string; returnTo: string | null; siteOrigin: string; nonce?: string })`, `type FirebaseWebConfig`, `REDIRECT_FLAG = "intellidrugs-signin-redirect"` (sessionStorage key) from `@/app/signin/SignInButton`; `navigate(url: string)` from `@/app/signin/navigate`; `ANNOUNCE_DELAY_MS = 60`, `announce(region: HTMLElement | null, text: string): () => void` (clears the region, writes `text` after 60 ms, returns a cancel function) from `@/lib/live-region` (client-safe, no `"use client"`; P1B's desk may reuse it). `/signin?returnTo=` is sanitised on the server before it reaches the island. P2 adds the Board P card visuals and the `?welcome=1` states.

- [ ] **Step 1: Write the failing island test**

Create `web/tests/signin-button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fb = vi.hoisted(() => ({
  initializeAuth: vi.fn(() => ({ name: "auth" })),
  inMemoryPersistence: {},
  browserPopupRedirectResolver: {},
  GoogleAuthProvider: class { setCustomParameters = vi.fn(); },
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn(),
  signOut: vi.fn(),
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("firebase/app", () => ({ getApps: () => [], initializeApp: () => ({ name: "app" }) }));
vi.mock("firebase/auth", () => fb);
vi.mock("@/app/signin/navigate", () => ({ navigate }));
vi.mock("@/components/TurnstileField", () => ({
  default: ({ onToken, onError, resetKey = 0, action }:
      { onToken?: (t: string | null) => void; onError?: () => void; resetKey?: number; action: string }) => (
    <div data-testid="turnstile" data-reset={resetKey} data-action={action}>
      <button type="button" onClick={() => onToken?.(`ts-${resetKey}`)}>pass bot check</button>
      <button type="button" onClick={() => { onToken?.(null); onError?.(); }}>fail bot check</button>
    </div>),
}));

import SignInButton, { REDIRECT_FLAG } from "@/app/signin/SignInButton";

const CONFIG = { apiKey: "k", authDomain: "drugdb.eliooo.org", projectId: "p", appId: "a" };
const ORIGIN = "https://drugdb.eliooo.org";
const user = (id: string) => ({ user: { getIdToken: async () => id } });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;

const renderButton = (returnTo: string | null = "/review/0001-pilot") =>
  render(<SignInButton config={CONFIG} siteKey="1x00000000000000000000AA" returnTo={returnTo} siteOrigin={ORIGIN} />);
const google = () => screen.getByRole("button", { name: "Continue with Google" });
const passBotCheck = () => fireEvent.click(screen.getByRole("button", { name: "pass bot check" }));
/** Banner titles also reach the live region (§10.2), so tests look for the visible title by its class. */
const bannerTitle = (text: string) => screen.findByText(text, { selector: ".banner-title" });
const liveRegion = () => document.querySelector<HTMLElement>('[aria-live="polite"]')!;

beforeEach(() => {
  for (const f of [fb.signInWithPopup, fb.signInWithRedirect, fb.getRedirectResult, fb.signOut, navigate]) f.mockReset();
  fb.signInWithPopup.mockResolvedValue(user("id-1"));
  fetchMock = vi.fn().mockResolvedValue(json(200, { success: true, data: { role: "pharmacist", redirectTo: "/review/0001-pilot" } }));
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SignInButton island (§6.2)", () => {
  it("waits for the bot check (action signin) before Continue with Google can be used", () => {
    renderButton();
    expect(screen.getByTestId("turnstile").dataset.action).toBe("signin");
    expect(google().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(google());
    expect(fb.signInWithPopup).not.toHaveBeenCalled();
    passBotCheck();
    expect(google().getAttribute("aria-disabled")).toBeNull();
  });

  it("signs in with the popup, posts idToken, turnstileToken and returnTo, signs Firebase out, then goes to returnTo", async () => {
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/review/0001-pilot"));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/session");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ idToken: "id-1", turnstileToken: "ts-0", returnTo: "/review/0001-pilot" });
    expect(fb.signOut).toHaveBeenCalled();
  });

  it("never follows an unsafe return path: it lands on /signin?welcome=1", async () => {
    renderButton("/\\evil.com");
    passBotCheck();
    fireEvent.click(google());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/signin?welcome=1"));
  });

  it("shows Opening Google, keeping its size, while the Google window is open", async () => {
    let finish!: (v: unknown) => void;
    fb.signInWithPopup.mockReturnValue(new Promise((r) => { finish = r; }));
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await screen.findByText("Finish signing in in the Google window. This page updates when you're done.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Opening Google" }).getAttribute("aria-busy")).toBe("true");
    await act(async () => finish(user("id-1")));
  });

  it("bot check failed: the crit banner and Retry check, which asks for a fresh token", async () => {
    fetchMock.mockResolvedValue(json(403, { success: false, errors: [{ code: "CAPTCHA" }] }));
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("We couldn't confirm you're a person.")).toBeTruthy();
    expect(screen.getByText("You weren't signed in. Retry the check. If it fails again, turn off extensions that block scripts on this page.")).toBeTruthy();
    const before = Number(screen.getByTestId("turnstile").dataset.reset);
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    expect(Number(screen.getByTestId("turnstile").dataset.reset)).toBe(before + 1);
  });

  it("a widget that fails in the browser shows the same banner, and Retry check asks for a fresh token", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "fail bot check" }));
    expect(await bannerTitle("We couldn't confirm you're a person.")).toBeTruthy();
    expect(google().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Retry check" }));
    expect(screen.getByTestId("turnstile").dataset.reset).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resets the bot check after a failed exchange and never re-sends a spent token (Review Focus 4)", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { success: false, message: "Sign-in is too old. Please sign in again.",
      errors: [{ code: "STALE_SIGN_IN", message: "Sign-in is too old. Please sign in again." }] }));
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("Couldn't sign you in.")).toBeTruthy();
    expect(screen.getByText("Sign-in is too old. Please sign in again.")).toBeTruthy();
    expect(screen.getByTestId("turnstile").dataset.reset).toBe("1");
    expect(google().getAttribute("aria-disabled")).toBe("true");
    passBotCheck();
    fireEvent.click(google());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).turnstileToken).toBe("ts-1");
  });

  it.each([["UNVERIFIED_EMAIL", "Your Google account email is not verified."],
    ["INVALID_ID_TOKEN", "Sign-in could not be verified. Please try again."]])(
    "a 401 %s shows its own copy under Couldn't sign you in.", async (code, body) => {
      fetchMock.mockResolvedValue(json(401, { success: false, errors: [{ code }] }));
      renderButton();
      passBotCheck();
      fireEvent.click(google());
      expect(await bannerTitle("Couldn't sign you in.")).toBeTruthy();
      expect(screen.getByText(body)).toBeTruthy();
    });

  it("never echoes the server's message: an unknown 401 shows the request-failed body", async () => {
    fetchMock.mockResolvedValue(json(401, { success: false, message: "<b>pharm@example.org</b>", errors: [{ code: "WHATEVER" }] }));
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("Couldn't sign you in.")).toBeTruthy();
    expect(screen.getByText("Nothing changed. Check your connection and try again.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("pharm@example.org");
  });

  it("429 shows the sign-in rate-limit banner", async () => {
    fetchMock.mockResolvedValue(json(429, { success: false, errors: [{ code: "RATE_LIMITED" }] }));
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("Too many sign-in attempts. Wait a few minutes and try again.")).toBeTruthy();
  });

  it("announces each banner through the page's one polite sr-only live region (§10.2)", async () => {
    fetchMock.mockResolvedValue(json(403, { success: false, errors: [{ code: "CAPTCHA" }] }));
    renderButton();
    const region = liveRegion();
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(region.className).toBe("sr-only");
    expect(region.getAttribute("aria-atomic")).toBe("true");
    expect(region.textContent).toBe("");
    passBotCheck();
    fireEvent.click(google());
    await waitFor(() => expect(region.textContent).toBe("We couldn't confirm you're a person."));
    expect(document.querySelector(".banner")!.closest("[aria-live]")).toBeNull();
  });

  it.each([["a 5xx", () => fetchMock.mockResolvedValue(json(502, {}))], ["a network failure", () => fetchMock.mockRejectedValue(new TypeError("fetch failed"))]])(
    "%s shows Couldn't sign you in. / Nothing changed.", async (_label, arrange) => {
      arrange();
      renderButton();
      passBotCheck();
      fireEvent.click(google());
      expect(await bannerTitle("Couldn't sign you in.")).toBeTruthy();
      expect(screen.getByText("Nothing changed. Check your connection and try again.")).toBeTruthy();
    });

  it("closing the Google window shows Sign-in cancelled. and keeps the unspent token", async () => {
    fb.signInWithPopup.mockRejectedValue({ code: "auth/popup-closed-by-user" });
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("Sign-in cancelled.")).toBeTruthy();
    expect(google().getAttribute("aria-disabled")).toBeNull();
  });

  it("a blocked pop-up offers Continue in this tab, which uses signInWithRedirect", async () => {
    fb.signInWithPopup.mockRejectedValue({ code: "auth/popup-blocked" });
    renderButton();
    passBotCheck();
    fireEvent.click(google());
    expect(await bannerTitle("Your browser blocked the Google window.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue in this tab" }));
    await waitFor(() => expect(fb.signInWithRedirect).toHaveBeenCalled());
    expect(sessionStorage.getItem(REDIRECT_FLAG)).toBe("1");
  });

  it("back from the redirect: reads the Google result, waits for the bot check, then exchanges it", async () => {
    sessionStorage.setItem(REDIRECT_FLAG, "1");
    fb.getRedirectResult.mockResolvedValue(user("id-r"));
    renderButton();
    await waitFor(() => expect(fb.getRedirectResult).toHaveBeenCalled());
    expect(sessionStorage.getItem(REDIRECT_FLAG)).toBeNull();
    passBotCheck();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/review/0001-pilot"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ idToken: "id-r", turnstileToken: "ts-0" });
  });

  it("does not touch Firebase on a plain visit (the SDK loads only when Google sign-in is used)", () => {
    renderButton();
    expect(fb.getRedirectResult).not.toHaveBeenCalled();
    expect(fb.signInWithPopup).not.toHaveBeenCalled();
    expect(fb.signInWithRedirect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/signin-button.test.tsx`
Expected: FAIL: `REDIRECT_FLAG` is not exported and the button reads "Sign in with Google".

- [ ] **Step 3: Write the live-region helper and the island**

Create `web/tests/live-region.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANNOUNCE_DELAY_MS, announce } from "@/lib/live-region";

afterEach(() => vi.useRealTimers());

describe("announce (§10.2)", () => {
  it("clears the region at once and writes the message after 60 ms", () => {
    vi.useFakeTimers();
    const region = document.createElement("p");
    region.textContent = "old";
    announce(region, "Sign-in cancelled.");
    expect(region.textContent).toBe("");
    vi.advanceTimersByTime(ANNOUNCE_DELAY_MS - 1);
    expect(region.textContent).toBe("");
    vi.advanceTimersByTime(1);
    expect(region.textContent).toBe("Sign-in cancelled.");
  });
  it("the returned cancel stops a pending write; a missing region is a no-op", () => {
    vi.useFakeTimers();
    const region = document.createElement("p");
    const cancel = announce(region, "x");
    cancel();
    vi.advanceTimersByTime(100);
    expect(region.textContent).toBe("");
    expect(() => announce(null, "x")()).not.toThrow();
  });
});
```

Run: `cd web && npx vitest run tests/live-region.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/live-region"`.

`web/lib/live-region.ts`:

```ts
/** §10.2: messages are set by clearing the region and writing after 60 ms. Client-safe; no React, no "use client". */
export const ANNOUNCE_DELAY_MS = 60;

/** Clears `region`, writes `text` after 60 ms, and returns a function that cancels the pending write. */
export function announce(region: HTMLElement | null, text: string): () => void {
  if (!region) return () => {};
  region.textContent = "";
  const timer = setTimeout(() => { region.textContent = text; }, ANNOUNCE_DELAY_MS);
  return () => clearTimeout(timer);
}
```

Run: `cd web && npx vitest run tests/live-region.test.ts`
Expected: PASS (2 tests).

`web/app/signin/navigate.ts`:

```ts
/** The one place the sign-in island leaves the page (tests replace it). */
export function navigate(url: string): void {
  window.location.assign(url);
}
```

`web/app/signin/SignInButton.module.css`:

```css
.root { display: flex; flex-direction: column; gap: var(--s3); max-width: 420px; }
.hint { font-size: 13.5px; color: var(--fg-2); }
```

Replace `web/app/signin/SignInButton.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Auth } from "firebase/auth";
import TurnstileField from "@/components/TurnstileField";
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { SIGN_IN, SIGN_IN_STATES } from "@/lib/copy";
import { announce } from "@/lib/live-region";
import { safeReturnTo } from "@/lib/return-to";
import { navigate } from "./navigate";
import styles from "./SignInButton.module.css";

/** Public Firebase web config (not secret). */
export type FirebaseWebConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };
/** sessionStorage flag set before signInWithRedirect; Clear-Site-Data on sign-out removes it with everything else. */
export const REDIRECT_FLAG = "intellidrugs-signin-redirect";
const WELCOME = "/signin?welcome=1";

type Status = "idle" | "loading" | "captcha" | "cancelled" | "blocked" | "failed" | "rejected" | "rate_limited";
/** The 401 codes of POST /api/session (Task 19) and their §1.7 bodies; anything else reads as "request failed". */
const REJECTED_BODY: Record<string, string> = {
  UNVERIFIED_EMAIL: SIGN_IN_STATES.unverifiedBody,
  STALE_SIGN_IN: SIGN_IN_STATES.staleAuthBody,
  INVALID_ID_TOKEN: SIGN_IN_STATES.invalidBody,
};

let auth: Auth | null = null;
/** Loads the Firebase SDK lazily, only once Google sign-in is actually used (§10.6). Firebase keeps nothing. */
async function firebase(config: FirebaseWebConfig) {
  const [{ getApps, initializeApp }, fb] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  if (!auth) {
    const app = getApps()[0] ?? initializeApp(config);
    auth = fb.initializeAuth(app, { persistence: fb.inMemoryPersistence, popupRedirectResolver: fb.browserPopupRedirectResolver });
  }
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return { auth, fb, provider };
}

/**
 * Island (§4.2, §6.2): Google sign-in with the bot check. The Turnstile token (action signin) is required before the
 * button works; it is single-use, so every failed exchange asks Turnstile for a fresh one.
 */
export default function SignInButton({ config, siteKey, returnTo, siteOrigin, nonce }:
    { config: FirebaseWebConfig; siteKey: string; returnTo: string | null; siteOrigin: string; nonce?: string }) {
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const pendingIdToken = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [rejectedBody, setRejectedBody] = useState<string>(SIGN_IN_STATES.requestFailedBody);
  const [resetKey, setResetKey] = useState(0);
  const live = useRef<HTMLParagraphElement>(null);

  const onToken = useCallback((t: string | null) => { tokenRef.current = t; setToken(t); }, []);
  const freshCheck = useCallback(() => { tokenRef.current = null; setToken(null); setResetKey((k) => k + 1); }, []);

  const exchange = useCallback(async (idToken: string, turnstileToken: string) => {
    tokenRef.current = null;
    setToken(null);
    let res: Response;
    try {
      res = await fetch("/api/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ idToken, turnstileToken, returnTo }),
      });
    } catch {
      freshCheck();
      setStatus("failed");
      return;
    }
    if (res.ok) {
      navigate(safeReturnTo(returnTo, siteOrigin) ?? WELCOME);
      return;
    }
    freshCheck();
    if (res.status === 429) { setStatus("rate_limited"); return; }
    const body = await res.json().catch(() => null);
    if (res.status === 403 && body?.errors?.[0]?.code === "CAPTCHA") { setStatus("captcha"); return; }
    if (res.status === 401) {
      // The text is picked by code from our own copy, never echoed from the response.
      const code = body?.errors?.[0]?.code;
      setRejectedBody(typeof code === "string" && code in REJECTED_BODY ? REJECTED_BODY[code] : SIGN_IN_STATES.requestFailedBody);
      setStatus("rejected");
      return;
    }
    setStatus("failed");
  }, [returnTo, siteOrigin, freshCheck]);

  // Back from signInWithRedirect ("Continue in this tab"): read Google's result, then exchange it once a token exists.
  useEffect(() => {
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(REDIRECT_FLAG) === "1";
      sessionStorage.removeItem(REDIRECT_FLAG);
    } catch {
      // storage blocked: there is no redirect to finish
    }
    if (!flagged) return;
    setStatus("loading");
    (async () => {
      try {
        const { auth: a, fb } = await firebase(config);
        const result = await fb.getRedirectResult(a);
        if (!result) { setStatus("cancelled"); return; }
        const idToken = await result.user.getIdToken();
        await fb.signOut(a);
        if (tokenRef.current) await exchange(idToken, tokenRef.current);
        else pendingIdToken.current = idToken;
      } catch {
        setStatus("failed");
      }
    })();
    // Runs once, on the page load that follows the redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token && pendingIdToken.current) {
      const idToken = pendingIdToken.current;
      pendingIdToken.current = null;
      void exchange(idToken, token);
    }
  }, [token, exchange]);

  async function signIn() {
    const t = tokenRef.current;
    if (!t || status === "loading") return;
    setStatus("loading");
    try {
      const { auth: a, fb, provider } = await firebase(config);
      const credential = await fb.signInWithPopup(a, provider);
      const idToken = await credential.user.getIdToken();
      await fb.signOut(a);
      await exchange(idToken, t);
    } catch (e) {
      const code = (e as { code?: unknown })?.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") setStatus("cancelled");
      else if (code === "auth/popup-blocked") setStatus("blocked");
      else setStatus("failed");
    }
  }

  async function continueInTab() {
    try {
      sessionStorage.setItem(REDIRECT_FLAG, "1");
    } catch {
      // storage blocked: the redirect still runs; the result is read when the flag can be set
    }
    setStatus("loading");
    try {
      const { auth: a, fb, provider } = await firebase(config);
      await fb.signInWithRedirect(a, provider);
    } catch {
      setStatus("failed");
    }
  }

  const disabled = !token || status === "loading";
  const banner =
    status === "captcha" ? (
      <Banner tone="crit" role="note" title={SIGN_IN.captchaTitle} body={SIGN_IN.captchaBody}
        action={<Button variant="tonal" size="sm" onClick={() => { setStatus("idle"); freshCheck(); }}>{SIGN_IN.retry}</Button>} />
    ) : status === "cancelled" ? (
      <Banner tone="info" role="note" title={SIGN_IN.cancelledTitle} body={SIGN_IN.cancelledBody} />
    ) : status === "blocked" ? (
      <Banner tone="warn" role="note" title={SIGN_IN.blockedTitle} body={SIGN_IN.blockedBody}
        action={<Button variant="primary" size="sm" onClick={continueInTab}>{SIGN_IN.continueInTab}</Button>} />
    ) : status === "failed" ? (
      <Banner tone="crit" role="note" title={SIGN_IN_STATES.requestFailedTitle} body={SIGN_IN_STATES.requestFailedBody} />
    ) : status === "rejected" ? (
      <Banner tone="crit" role="note" title={SIGN_IN_STATES.requestFailedTitle} body={rejectedBody} />
    ) : status === "rate_limited" ? (
      <Banner tone="warn" role="note" title={SIGN_IN_STATES.rateLimited} />
    ) : null;

  // §10.2: the page's one polite live region announces each banner's title (clear, then write after 60 ms).
  const BANNER_TITLE: Partial<Record<Status, string>> = {
    captcha: SIGN_IN.captchaTitle, cancelled: SIGN_IN.cancelledTitle, blocked: SIGN_IN.blockedTitle,
    failed: SIGN_IN_STATES.requestFailedTitle, rejected: SIGN_IN_STATES.requestFailedTitle, rate_limited: SIGN_IN_STATES.rateLimited,
  };
  const announcement = BANNER_TITLE[status];
  useEffect(() => (announcement ? announce(live.current, announcement) : undefined), [status, announcement]);

  return (
    <div className={styles.root}>
      <Button variant="primary" size="lg" aria-disabled={disabled ? "true" : undefined} busy={status === "loading"}
        busyLabel={SIGN_IN.loading} onClick={disabled ? undefined : signIn}>
        {SIGN_IN.button}
      </Button>
      {status === "loading" && <p className={styles.hint}>{SIGN_IN.loadingHint}</p>}
      <TurnstileField siteKey={siteKey} action="signin" nonce={nonce} resetKey={resetKey} onToken={onToken}
        onError={() => setStatus("captcha")} />
      <div>{banner}</div>
      <p ref={live} className="sr-only" aria-live="polite" aria-atomic="true" />
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd web && npx vitest run tests/signin-button.test.tsx tests/live-region.test.ts`
Expected: PASS (18 island tests, 2 live-region tests).

- [ ] **Step 5: Rewrite the page test**

Replace `web/tests/signin-page.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-nonce": "n1" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/app/signin/SignInButton", () => ({
  default: (props: Record<string, unknown>) => <pre data-testid="island">{JSON.stringify(props)}</pre> }));

import SignInPage from "@/app/signin/page";

const configure = () => {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "AIza-public-key");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "drugdb.eliooo.org");
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:123:web:abc");
  vi.stubEnv("FIREBASE_PROJECT_ID", "intellidrugs-kb");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "0x4AAAAAAA-site");
};
const render = async (returnTo?: string | string[]) =>
  renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve(returnTo === undefined ? {} : { returnTo }) }));
const islandProps = (html: string) =>
  JSON.parse(html.match(/<pre data-testid="island">(.*?)<\/pre>/)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

beforeEach(() => { getSession.mockReset(); getSession.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());

describe("/signin (§6.2)", () => {
  it("offers Continue with Google with the bot check, the site origin and the nonce", async () => {
    configure();
    const html = await render();
    expect(html).toContain("<h1");
    expect(html).toContain("Sign in to IntelliDrugs");
    expect(html).toContain("New here? The same button creates your account.");
    expect(islandProps(html)).toEqual({
      config: { apiKey: "AIza-public-key", authDomain: "drugdb.eliooo.org", projectId: "intellidrugs-kb", appId: "1:123:web:abc" },
      siteKey: "0x4AAAAAAA-site", returnTo: null, siteOrigin: "http://localhost:3000", nonce: "n1",
    });
    expect(html).toContain("<noscript><p>Sign-in needs JavaScript for Google and the bot check.</p></noscript>");
  });

  it("passes only a safe returnTo to the island", async () => {
    configure();
    expect(islandProps(await render("/review/0001-pilot?show=needs")).returnTo).toBe("/review/0001-pilot?show=needs");
    expect(islandProps(await render("/\\evil.com")).returnTo).toBeNull();
    expect(islandProps(await render("https://drugdb.eliooo.org.evil.com")).returnTo).toBeNull();
    expect(islandProps(await render(["/a", "/b"])).returnTo).toBe("/a");
  });

  it("says sign-in is not available when Firebase or Turnstile is not configured", async () => {
    for (const missing of ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_APP_ID",
      "FIREBASE_PROJECT_ID", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]) {
      configure();
      vi.stubEnv(missing, "");
      const html = await render();
      expect(html).toContain('<p class="banner-title">Sign-in is not available right now.</p>');
      expect(html).toContain("Searching and checking interactions don&#x27;t need an account.");
      expect(html).not.toContain('data-testid="island"');
    }
  });

  it("when already signed in shows the role and a sign-out form, never the email", async () => {
    configure();
    getSession.mockResolvedValue({ email: "eng@example.org", name: "Eng", role: "engineer" });
    const html = await render();
    expect(html).toContain("Signed in as Engineer.");
    expect(html).toContain('<form action="/signout" method="post">');
    expect(html).not.toContain("eng@example.org");
    expect(html).not.toContain('data-testid="island"');
  });
});
```

Run: `cd web && npx vitest run tests/signin-page.test.tsx`
Expected: FAIL: the page still renders "Reviewer sign-in" and passes only `config`.

- [ ] **Step 6: Rewrite the page**

`web/app/signin/page.module.css`:

```css
.page { display: flex; flex-direction: column; gap: var(--s4); max-width: 480px; }
.sub { color: var(--fg-2); }
```

Replace `web/app/signin/page.tsx`:

```tsx
import Banner from "@/components/ui/Banner";
import Button from "@/components/ui/Button";
import { SIGN_IN, SIGN_IN_STATES } from "@/lib/copy";
import { cspNonce } from "@/lib/nonce";
import { firstParam } from "@/lib/params";
import { safeReturnTo } from "@/lib/return-to";
import { ROLE_LABEL } from "@/lib/reviewers";
import { getSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site";
import { turnstileSiteKey } from "@/lib/turnstile";
import SignInButton, { type FirebaseWebConfig } from "./SignInButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · IntelliDrugs" };

/**
 * P1A ships the sign-in function (§12.2): the bot check, the return path and the error states. P2 adds the Board P
 * card and the ?welcome=1 states.
 */
export default async function SignInPage({ searchParams }: { searchParams?: Promise<{ returnTo?: string | string[] }> }) {
  const session = await getSession();
  const origin = siteOrigin();
  const returnTo = safeReturnTo(firstParam((await searchParams)?.returnTo), origin);
  const config: FirebaseWebConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  const siteKey = turnstileSiteKey();
  const configured = Object.values(config).every((v) => v.length > 0);

  return (
    <section className={styles.page}>
      <h1 className="t-title1">{SIGN_IN.heading}</h1>
      {session ? (
        <>
          <p>{`Signed in as ${ROLE_LABEL[session.role]}.`}</p>
          <form method="post" action="/signout"><Button variant="plain" type="submit">Sign out</Button></form>
        </>
      ) : configured && siteKey ? (
        <>
          <p className={styles.sub}>{SIGN_IN.sub}</p>
          <SignInButton config={config} siteKey={siteKey} returnTo={returnTo} siteOrigin={origin} nonce={await cspNonce()} />
          <noscript><p>{SIGN_IN_STATES.noScript}</p></noscript>
        </>
      ) : (
        <Banner tone="info" role="note" title={SIGN_IN_STATES.notConfiguredTitle} body={SIGN_IN_STATES.notConfiguredBody} />
      )}
    </section>
  );
}
```

- [ ] **Step 7: Run the sign-in tests, the island check and the suite**

Run: `cd web && npx vitest run tests/signin-page.test.tsx tests/signin-button.test.tsx tests/client-islands.test.ts && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/app/signin web/tests/signin-page.test.tsx web/tests/signin-button.test.tsx
git commit -m "feat(web): sign-in with the bot check, a safe return path and the §6.2 error states" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Shared chrome: header, account menu, footer theme control

**Files:**
- Create: `web/components/AccountMenu.tsx`, `web/components/AccountMenu.module.css`, `web/components/Footer.tsx`, `web/components/Footer.module.css`
- Modify: `web/components/Header.tsx`, `web/components/Header.module.css`, `web/app/layout.tsx`
- Test: `web/tests/header.test.tsx` (rewritten), `web/tests/account-menu.test.tsx`

**Interfaces:**
- Consumes: `Wordmark`, `buttonClass` (Tasks 4–5), `ThemeSwitch` and `type Theme` (Task 7), `POST /signout` (Task 20), `FOOTER_LINE` (Task 3).
- Produces: island `AccountMenu({ children: ReactNode })` (a `<details>`; Esc and outside press close it); `Header({ session: Session | null; theme: Theme })`; `Footer({ theme: Theme })`. P1B adds "Review desk", "Problem reports and partner requests", "Keyboard shortcuts and settings" and the "Single-key shortcuts" control inside the account menu panel; P2 replaces the nav links with the §6.1 navigation.

- [ ] **Step 1: Write the failing tests**

Replace `web/tests/header.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()), getSession: () => getSession() }));
const cookieStore = { get: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => new Headers() }));
vi.mock("@/lib/theme-actions", () => ({ setThemeAction: vi.fn() }));

import Header from "@/components/Header";
import RootLayout from "@/app/layout";

const PHARMACIST = { email: "pharm@example.org", name: "Farhana Islam", role: "pharmacist" as const };
beforeEach(() => { getSession.mockReset(); cookieStore.get.mockReset(); });

describe("Header", () => {
  it("anonymous: the wordmark links home, the checker link, and a tonal Sign in", () => {
    const html = renderToStaticMarkup(<Header session={null} theme="system" />);
    expect(html).toMatch(/<a class="home" href="\/"><span class="wordmark s20"/);
    expect(html).toContain('<a href="/check">Interaction checker</a>');
    expect(html).toContain('<a class="btn btn--tonal btn--sm" href="/signin">Sign in</a>');
    expect(html).not.toContain("<details");
    expect(html).not.toContain("/batches");
  });

  it("signed in: a <details> account menu with own name and email, role badge, theme control and sign-out form", () => {
    const html = renderToStaticMarkup(<Header session={PHARMACIST} theme="dark" />);
    expect(html).toContain('<details class="menu">');
    expect(html).toContain('<span aria-hidden="true">FI</span><span class="sr-only">Account menu for Farhana Islam</span>');
    expect(html.match(/pharm@example\.org/g)).toHaveLength(1);
    expect(html.indexOf("pharm@example.org")).toBeGreaterThan(html.indexOf("<details"));
    expect(html).toContain('<span class="role-badge">Pharmacist</span>');
    expect(html).toContain('aria-label="Colour theme"');
    expect(html).toContain('<form action="/signout" method="post"><button type="submit" class="btn btn--plain btn--sm">Sign out</button></form>');
    for (const href of ["/batches", "/flags"]) expect(html).toContain(`href="${href}"`);
  });

  it("a reader gets no role badge and no reviewer links; a missing name falls back to the email", () => {
    const html = renderToStaticMarkup(<Header session={{ email: "someone@gmail.com", role: "user" }} theme="system" />);
    expect(html).not.toContain("role-badge");
    expect(html).not.toContain("/batches");
    expect(html).not.toContain("/flags");
    expect(html).toContain("Account menu for someone@gmail.com");
    expect(html).toContain('<span aria-hidden="true">SG</span>');
  });
});

describe("RootLayout chrome", () => {
  it("renders the header, the page and the footer with its line and the theme control", async () => {
    getSession.mockResolvedValue(null);
    const html = renderToStaticMarkup(await RootLayout({ children: <p>page</p> }));
    expect(html).toContain("<header");
    expect(html).toContain("<p>page</p>");
    expect(html).toMatch(/<footer[^>]*>[\s\S]*A drug knowledge base for Bangladesh\. Decision support, not a substitute for clinical judgement\.[\s\S]*aria-label="Colour theme"/);
  });

  it("shows the owner's email once, inside the account menu, and nowhere else", async () => {
    getSession.mockResolvedValue(PHARMACIST);
    const html = renderToStaticMarkup(await RootLayout({ children: null }));
    expect(html.match(/pharm@example\.org/g)).toHaveLength(1);
  });
});
```

Create `web/tests/account-menu.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import AccountMenu from "@/components/AccountMenu";

afterEach(cleanup);
const setup = () => render(<>
  <AccountMenu><summary tabIndex={0}>Account</summary><button type="button">Inside</button></AccountMenu>
  <p>Outside</p>
</>);

describe("AccountMenu island (§4.2)", () => {
  it("Esc closes the open menu and returns focus to its summary", () => {
    const { container } = setup();
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("summary"));
  });

  it("a press outside closes it; a press inside keeps it open", () => {
    const { container } = setup();
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent.pointerDown(screen.getByText("Inside"));
    expect(details.open).toBe(true);
    fireEvent.pointerDown(screen.getByText("Outside"));
    expect(details.open).toBe(false);
  });

  it("is a plain <details> without JavaScript", () => {
    expect(renderToStaticMarkup(<AccountMenu><summary>A</summary></AccountMenu>)).toBe('<details class="menu"><summary>A</summary></details>');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/header.test.tsx tests/account-menu.test.tsx`
Expected: FAIL: `@/components/AccountMenu` does not resolve and the header still prints "Reviewer sign-in".

- [ ] **Step 3: Write the account menu, header and footer, and wire the layout**

`web/components/AccountMenu.module.css`:

```css
.menu { position: relative; }
.menu > summary { list-style: none; cursor: pointer; }
.menu > summary::-webkit-details-marker { display: none; }
```

`web/components/AccountMenu.tsx`:

```tsx
"use client";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./AccountMenu.module.css";

/** Island (§4.2): a <details> menu that also closes on Esc (focus back to the summary) and on a press outside. */
export default function AccountMenu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !el.open) return;
      el.open = false;
      el.querySelector<HTMLElement>("summary")?.focus();
    };
    const onPress = (e: Event) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, []);
  return <details ref={ref} className={styles.menu}>{children}</details>;
}
```

Replace `web/components/Header.module.css`:

```css
.bar { display: flex; align-items: center; gap: var(--s5); max-width: 1040px; margin: 0 auto; padding: var(--s3) var(--s4); border-bottom: 1px solid var(--line); }
.home { color: var(--fg); text-decoration: none; min-height: 24px; display: inline-flex; align-items: center; }
.nav { display: flex; flex-wrap: wrap; gap: var(--s4); }
.end { margin-left: auto; }
.avatar { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font: 600 13px/1 var(--font-ui); }
.panel { position: absolute; right: 0; top: calc(100% + var(--s2)); z-index: 20; min-width: 260px; display: flex; flex-direction: column; align-items: flex-start; gap: var(--s3); padding: var(--s4); border-radius: var(--r-panel); background: var(--surface); box-shadow: var(--shadow-2); }
.who { display: flex; flex-direction: column; gap: 2px; }
.who span { color: var(--fg-2); font-size: 13px; overflow-wrap: anywhere; }
@media (max-width: 720px) { .bar { flex-wrap: wrap; gap: var(--s3); } }
```

Replace `web/components/Header.tsx`:

```tsx
import AccountMenu from "@/components/AccountMenu";
import ThemeSwitch from "@/components/ThemeSwitch";
import { buttonClass } from "@/components/ui/Button";
import Wordmark from "@/components/ui/Wordmark";
import { ROLE_LABEL } from "@/lib/reviewers";
import type { Session } from "@/lib/session";
import type { Theme } from "@/lib/theme";
import styles from "./Header.module.css";

/** Two initials from the display name, else from the email's parts. */
const initials = (s: Session) => ((s.name ?? "").trim() || s.email)
  .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/**
 * Site header. The owner's own name and email appear only inside their account menu (§2.2); nobody else's email
 * is ever rendered. The links are the current routes until P1B (/review) and P2 (§6.1 navigation) replace them.
 */
export default function Header({ session, theme }: { session: Session | null; theme: Theme }) {
  const reviewer = session?.role === "pharmacist" || session?.role === "engineer";
  const displayName = session ? (session.name ?? "").trim() || session.email : "";
  return (
    <header className={styles.bar}>
      <a className={styles.home} href="/"><Wordmark size={20} /></a>
      <nav className={styles.nav} aria-label="Main">
        <a href="/check">Interaction checker</a>
        {reviewer && <a href="/batches">Batches</a>}
        {reviewer && <a href="/flags">Flags</a>}
      </nav>
      <div className={styles.end}>
        {session ? (
          <AccountMenu>
            <summary className={styles.avatar}>
              <span aria-hidden="true">{initials(session)}</span><span className="sr-only">{`Account menu for ${displayName}`}</span>
            </summary>
            <div className={styles.panel}>
              <p className={styles.who}><b>{displayName}</b><span>{session.email}</span></p>
              {reviewer && <span className="role-badge">{ROLE_LABEL[session.role]}</span>}
              <ThemeSwitch value={theme} />
              <form method="post" action="/signout"><button type="submit" className={buttonClass("plain", "sm")}>Sign out</button></form>
            </div>
          </AccountMenu>
        ) : (
          <a className={buttonClass("tonal", "sm")} href="/signin">Sign in</a>
        )}
      </div>
    </header>
  );
}
```

`web/components/Footer.module.css`:

```css
.footer { max-width: 1040px; margin: 0 auto; padding: var(--s6) var(--s4); display: flex; flex-wrap: wrap; align-items: center; gap: var(--s4); border-top: 1px solid var(--line); color: var(--fg-2); font-size: 13px; }
.line { flex: 1 1 280px; }
```

`web/components/Footer.tsx`:

```tsx
import ThemeSwitch from "@/components/ThemeSwitch";
import Wordmark from "@/components/ui/Wordmark";
import { FOOTER_LINE } from "@/lib/copy";
import type { Theme } from "@/lib/theme";
import styles from "./Footer.module.css";

/** Footer with the theme control (§3.3). P2 adds the §6.1 links, licence lines and legal line. */
export default function Footer({ theme }: { theme: Theme }) {
  return (
    <footer className={styles.footer}>
      <Wordmark size={16} />
      <p className={styles.line}>{FOOTER_LINE}</p>
      <ThemeSwitch value={theme} />
    </footer>
  );
}
```

In `web/app/layout.tsx` add `import Footer from "@/components/Footer";`, pass the theme to the header and render the footer after `<main>`:

```tsx
        <Header session={session} theme={theme} />
        <main id="content" className={styles.main}>{children}</main>
        <Footer theme={theme} />
```

- [ ] **Step 4: Run the chrome tests, the guards and the suite**

Run: `cd web && npx vitest run tests/header.test.tsx tests/account-menu.test.tsx tests/layout.test.tsx tests/marks.test.ts tests/inline-styles.test.ts tests/client-islands.test.ts && npm test && npm run lint:css`
Expected: PASS; the island check counts 5 client files.

- [ ] **Step 5: Commit**

```bash
git add web/components web/app/layout.tsx web/tests/header.test.tsx web/tests/account-menu.test.tsx
git commit -m "feat(web): IntelliDrugs header with account menu, footer theme control" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: `/healthz`, `robots.txt`, image healthcheck, compose and deploy changes, Firebase auth-domain steps

**Files:**
- Create: `web/app/healthz/route.ts`, `web/app/robots.ts`
- Modify: `web/Dockerfile`, `deploy/docker-compose.yml`, `deploy/.env.example`, `.github/workflows/deploy.yml`, `README.md`
- Test: `web/tests/healthz.test.ts`, `web/tests/deploy-config.test.ts`

**Interfaces:**
- Consumes: middleware's `/healthz` bypass (Task 14); `SITE_HOST` handling (Task 10).
- Produces: `GET /healthz` → `200 ok` (text/plain, `no-store`); `/robots.txt` → `User-Agent: *` / `Disallow: /`; `web.environment` gains `SITE_HOST: ${SITE_HOST}` and `HERO_CONCEPT_ID: ${HERO_CONCEPT_ID:-}`; deploy pre-flight requires `SITE_HOST`; the smoke check requests `$PUBLIC_URL/healthz`.

- [ ] **Step 1: Write the failing tests**

Create `web/tests/healthz.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GET } from "@/app/healthz/route";
import robots from "@/app/robots";

describe("/healthz (§2.1)", () => {
  it("answers 200 ok as uncached plain text", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("robots.txt (§9.2)", () => {
  it("disallows everything while the site is in pilot", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
```

Create `web/tests/deploy-config.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repo = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const webService = () => {
  const c = repo("deploy/docker-compose.yml");
  return c.slice(c.indexOf("\n  web:"), c.indexOf("\n  etl:"));
};

describe("deploy configuration (§12.4)", () => {
  it("passes SITE_HOST and HERO_CONCEPT_ID to the web container", () => {
    expect(webService()).toContain("SITE_HOST: ${SITE_HOST}\n");
    expect(webService()).toContain("HERO_CONCEPT_ID: ${HERO_CONCEPT_ID:-}\n");
  });
  it("deploy/docker-compose.yml never sets INTELLIDRUGS_E2E (§11.4)", () => {
    expect(repo("deploy/docker-compose.yml")).not.toContain("INTELLIDRUGS_E2E");
  });
  it(".env.example lists both new variables with their production values", () => {
    const env = repo("deploy/.env.example");
    expect(env).toMatch(/^SITE_HOST=drugdb\.eliooo\.org$/m);
    expect(env).toMatch(/^HERO_CONCEPT_ID=186-0030-006--napa$/m);
  });
  it("the web image checks /healthz every 30 s", () => {
    expect(repo("web/Dockerfile")).toContain("HEALTHCHECK --interval=30s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1");
  });
  it("deploy requires SITE_HOST, smoke-checks /healthz, and copies only the production compose file", () => {
    const d = repo(".github/workflows/deploy.yml");
    expect(d).toContain(`grep -q '^SITE_HOST=..*' .env`);
    expect(d).toContain('"$PUBLIC_URL/healthz"');
    expect(d).not.toContain('"$PUBLIC_URL/batches"');
    expect(d).toContain('source: "deploy/docker-compose.yml,db/migrations,batches"');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd web && npx vitest run tests/healthz.test.ts tests/deploy-config.test.ts`
Expected: FAIL: `@/app/healthz/route` does not resolve; the compose file has no `SITE_HOST`.

- [ ] **Step 3: Add the routes and the configuration**

`web/app/healthz/route.ts`:

```ts
export const dynamic = "force-dynamic";

/** Liveness for the container healthcheck (§2.1, §12.4). middleware.ts never rate-limits it. */
export function GET(): Response {
  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
```

`web/app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

/** The site stays out of search engines during the pilot (§9.2, §13 Q3). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
```

In `web/Dockerfile` add after `EXPOSE 3000`:

```dockerfile
HEALTHCHECK --interval=30s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
```

In `deploy/docker-compose.yml`, in `web.environment`, after the `REVIEWERS` line add:

```yaml
      # Public host (§9.2): Turnstile hostname check, sign-out Origin check, return paths. Required in production.
      SITE_HOST: ${SITE_HOST}
      # Landing page hero product (§6.1).
      HERO_CONCEPT_ID: ${HERO_CONCEPT_ID:-}
```

Append to `deploy/.env.example`:

```
# --- IntelliDrugs (P1A) ---
# Public host name. Required: the web server refuses to start without it and deploy refuses to run.
SITE_HOST=drugdb.eliooo.org
# Landing page hero product (spec §6.1).
HERO_CONCEPT_ID=186-0030-006--napa
```

and change the `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=` line to `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=drugdb.eliooo.org` with the comment line above it `# drugdb.eliooo.org once the Google OAuth redirect URI below is added (README "Firebase auth domain").`

In `.github/workflows/deploy.yml`, in the ssh `script`, directly after the `for k in SESSION_SECRET INTERNAL_API_TOKEN; do … done` loop add:

```bash
            grep -q '^SITE_HOST=..*' .env || { echo "deploy/.env: SITE_HOST must be set (SITE_HOST=drugdb.eliooo.org); see README Deploy" >&2; exit 1; }
```

and replace the last step with:

```yaml
      - run: curl -fsS --retry 12 --retry-delay 10 --retry-all-errors "$PUBLIC_URL/healthz" -o /dev/null
```

In `README.md`, at the end of "Reviewer sign-in setup", add:

````markdown
### Firebase auth domain (before the P1A deploy, in this order)

"Continue in this tab" (sign-in with a redirect) needs Firebase's auth handler on our own domain. The web app proxies
`/__/auth/*` to `https://<project>.firebaseapp.com/__/auth/*`; Caddy needs no change.

1. Set the GitHub repository variable `FIREBASE_AUTH_DOMAIN=drugdb.eliooo.org` (the deploy workflow bakes it into the
   web image as `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`) and the same value for `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` in the
   host `~/drugdb/deploy/.env`.
2. Google Cloud console > APIs & Services > Credentials > the Firebase web OAuth client: add the authorized redirect URI
   `https://drugdb.eliooo.org/__/auth/handler`. Without it sign-in fails with `redirect_uri_mismatch`.
3. Add `SITE_HOST=drugdb.eliooo.org` and `HERO_CONCEPT_ID=186-0030-006--napa` to the host `.env`. Deploy refuses to
   run without `SITE_HOST`.

Do all three before P1A merges to `main`. Until then the image keeps `<project>.firebaseapp.com`, which the CSP still
allows for the popup.

Local runs with Cloudflare's test keys: the server checks each Turnstile token's action and hostname, and the test keys
answer with neither, so set `INTELLIDRUGS_E2E=1` and `SITE_HOST=localhost:3000` in your shell for a local production
build. Never set `INTELLIDRUGS_E2E` on the host.
````

- [ ] **Step 4: Run them to verify they pass**

Run: `cd web && npx vitest run tests/healthz.test.ts tests/deploy-config.test.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Validate the compose file**

Run: `cd deploy && DB_USER=x DB_PASSWORD=x GHCR_OWNER=x IMAGE_TAG=x SESSION_SECRET=x INTERNAL_API_TOKEN=x SITE_HOST=drugdb.eliooo.org docker compose -f docker-compose.yml config --services`
Expected: `db`, `flyway`, `api`, `web` (and no error).

- [ ] **Step 6: Commit**

```bash
git add web/app/healthz web/app/robots.ts web/Dockerfile deploy/docker-compose.yml deploy/.env.example .github/workflows/deploy.yml README.md \
  web/tests/healthz.test.ts web/tests/deploy-config.test.ts
git commit -m "feat(deploy): /healthz smoke check and image healthcheck, SITE_HOST and HERO_CONCEPT_ID, Firebase auth-domain steps" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: End-to-end harness (CI compose override, Playwright, axe, Lighthouse CI)

**Files:**
- Create: `deploy/docker-compose.ci.yml`, `web/e2e/seed/00-check-schema.sql`, `web/playwright.config.ts`, `web/e2e/session.ts`, `web/e2e/foundation.spec.ts`, `web/e2e/zz-rate-limit.spec.ts`, `web/lighthouserc.json`
- Modify: `.github/workflows/ci.yml`, `web/tests/deploy-config.test.ts`

**Interfaces:**
- Consumes: everything above; `encryptSession`, `sessionCookieName` (Task 11).
- Produces: `signInAs(context: BrowserContext, role: "pharmacist" | "engineer" | "user", name?: string): Promise<void>`, `BASE_URL`, `E2E_SECRET`, `E2E_EMAILS` from `web/e2e/session.ts`; the `seed` compose service that runs every `web/e2e/seed/*.sql` in name order (P1B adds the pilot rows as `10-pilot.sql`); the CI `e2e` job. P1B, P2 and P3 add spec files to `web/e2e/` and URLs to `lighthouserc.json`.

- [ ] **Step 1: Write the failing configuration test**

Append to `web/tests/deploy-config.test.ts`:

```ts
describe("CI-only compose override (§11.4)", () => {
  it("builds api and web from source, runs web in e2e mode on localhost, and makes edge a local network", () => {
    const ci = repo("deploy/docker-compose.ci.yml");
    expect(ci).toContain('INTELLIDRUGS_E2E: "1"');
    expect(ci).toContain("SITE_HOST: localhost:3000");
    expect(ci).toContain("context: ../web");
    expect(ci).toContain("context: ../api");
    expect(ci).toMatch(/edge: \{external: false/);
    expect(ci).not.toContain("drugdb.eliooo.org");
  });
  it("runs as its own compose project, so it never touches the bddrug containers or the bddrug_dbdata volume", () => {
    expect(repo("deploy/docker-compose.ci.yml")).toMatch(/^name: bddrug-ci$/m);
  });
  it("the e2e job runs Playwright and Lighthouse CI against both compose files", () => {
    const yml = repo(".github/workflows/ci.yml");
    expect(yml).toContain("-f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml");
    expect(yml).toContain("npx playwright test");
    expect(yml).toContain("npx lhci autorun");
  });
});
```

Run: `cd web && npx vitest run tests/deploy-config.test.ts`
Expected: FAIL with `ENOENT … deploy/docker-compose.ci.yml`.

- [ ] **Step 2: Write the compose override and the seed hook**

`deploy/docker-compose.ci.yml`:

```yaml
# CI only (spec §11.4). Never copied to the host: deploy.yml copies deploy/docker-compose.yml alone.
# Usage: docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml up -d --build db flyway api web
# Its own project name (the later file's name wins over `name: bddrug`), so its containers, network and dbdata volume
# never replace or delete the bddrug ones. Never run it on the EC2 host.
name: bddrug-ci
services:
  api:
    image: bddrug-api:ci
    build: {context: ../api}
    environment:
      INTERNAL_API_TOKEN: e2e-internal-token-0123456789abcdef0123
  web:
    image: bddrug-web:ci
    build:
      context: ../web
      args:
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: 1x00000000000000000000AA
        NEXT_PUBLIC_FIREBASE_API_KEY: e2e-dummy-api-key
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: localhost
        NEXT_PUBLIC_FIREBASE_APP_ID: "1:0:web:e2e"
        FIREBASE_PROJECT_ID: intellidrugs-e2e
    environment:
      INTELLIDRUGS_E2E: "1"
      SITE_HOST: localhost:3000
      SESSION_SECRET: e2e-session-secret-0123456789abcdef0123456789
      INTERNAL_API_TOKEN: e2e-internal-token-0123456789abcdef0123
      TURNSTILE_SECRET_KEY: 1x0000000000000000000000000000000AA
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: 1x00000000000000000000AA
      FIREBASE_PROJECT_ID: intellidrugs-e2e
      NEXT_PUBLIC_FIREBASE_API_KEY: e2e-dummy-api-key
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: localhost
      NEXT_PUBLIC_FIREBASE_APP_ID: "1:0:web:e2e"
      REVIEWERS: pharm@e2e.test:pharmacist,eng@e2e.test:engineer
    ports: ["3000:3000"]
  seed:
    image: postgres:16
    profiles: [seed]
    entrypoint: ["sh", "-c", "for f in /seed/*.sql; do psql -v ON_ERROR_STOP=1 -h db -U \"$$PGUSER\" -d bddrug -f \"$$f\" || exit 1; done"]
    environment: {PGUSER: "${DB_USER}", PGPASSWORD: "${DB_PASSWORD}"}
    volumes: [../web/e2e/seed:/seed:ro]
    depends_on: {db: {condition: service_healthy}}
    networks: [internal]
networks:
  # The shared Caddy network does not exist in CI; a local one gives the web container outbound access to Turnstile.
  edge: {external: false, name: bddrug_ci_edge}
```

`web/e2e/seed/00-check-schema.sql`:

```sql
-- Fails the seed step fast when P0's V6 migration has not run (the audit endpoint needs ops.audit_event).
-- P1B adds the pilot rows as 10-pilot.sql.
SELECT 1 FROM ops.audit_event LIMIT 0;
```

- [ ] **Step 3: Write the Playwright harness and the P1A specs**

`web/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

/** Runs the production build started by deploy/docker-compose.ci.yml (spec §11.4). Files run in name order. */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

`web/e2e/session.ts`:

```ts
import type { BrowserContext } from "@playwright/test";
import { encryptSession, sessionCookieName } from "../lib/session-crypto";

/** Must equal SESSION_SECRET in deploy/docker-compose.ci.yml. There is no Google in e2e: the test mints the cookie. */
export const E2E_SECRET = process.env.E2E_SESSION_SECRET ?? "e2e-session-secret-0123456789abcdef0123456789";
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const E2E_EMAILS = { pharmacist: "pharm@e2e.test", engineer: "eng@e2e.test", user: "reader@e2e.test" } as const;

export async function signInAs(context: BrowserContext, role: keyof typeof E2E_EMAILS, name = "E2E Reviewer"): Promise<void> {
  const value = await encryptSession({ email: E2E_EMAILS[role], name, role }, E2E_SECRET);
  await context.addCookies([{ name: sessionCookieName(true), value, url: BASE_URL, httpOnly: true, secure: true, sameSite: "Lax" }]);
}
```

`web/e2e/foundation.spec.ts`:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { BASE_URL, signInAs } from "./session";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const scriptSrc = (csp: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src ")) ?? "";

test.describe("liveness and headers (§9.4)", () => {
  test("/healthz answers ok and is never rate-limited", async ({ request }) => {
    const answers = await Promise.all(Array.from({ length: 60 }, () => request.get("/healthz")));
    expect(answers.map((a) => a.status())).toEqual(Array(60).fill(200));
    expect(await answers[0].text()).toBe("ok");
  });

  test("robots.txt disallows everything during the pilot", async ({ request }) => {
    expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
  });

  test("each page gets its own nonce CSP without 'unsafe-inline' scripts, and every script tag carries the nonce", async ({ request }) => {
    const first = await request.get("/signin");
    const second = await request.get("/signin");
    const csp = first.headers()["content-security-policy"];
    const nonce = /'nonce-([^']+)'/.exec(scriptSrc(csp))?.[1];
    expect(nonce).toBeTruthy();
    expect(scriptSrc(csp)).toContain("'strict-dynamic'");
    expect(scriptSrc(csp)).not.toContain("'unsafe-inline'");
    expect(second.headers()["content-security-policy"]).not.toBe(csp);
    const scripts = (await first.text()).match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
    expect(first.headers()["x-frame-options"]).toBe("DENY");
    expect(first.headers()["cache-control"]).toMatch(/private/);
    expect(first.headers()["cache-control"]).toMatch(/no-store/);
  });

  test("the browser loads the sign-in page with no CSP violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
    await page.goto("/signin");
    await expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });
    expect(violations).toEqual([]);
  });
});

test.describe("theme (§3.3)", () => {
  test("the server renders data-theme from the cookie, so the first paint is right", async ({ context, page }) => {
    await context.addCookies([{ name: "intellidrugs-theme", value: "dark", url: BASE_URL }]);
    expect(await (await page.request.get("/signin")).text()).toMatch(/<html lang="en" data-theme="dark"/);
  });

  test("with JavaScript a click switches at once and persists", async ({ page }) => {
    await page.goto("/signin");
    await page.locator("footer").getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect((await page.context().cookies()).find((c) => c.name === "intellidrugs-theme")?.value).toBe("dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("without JavaScript the form posts and the page comes back in the new theme", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto("/signin");
    await page.locator("footer").getByRole("button", { name: "Light" }).click();
    await page.waitForLoadState();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await context.close();
  });
});

test.describe("sign-in function (§6.2)", () => {
  test("Continue with Google waits for the bot check (Cloudflare test key), then becomes usable", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in to IntelliDrugs" })).toBeVisible();
    await expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Continue with Google" })).not.toHaveAttribute("aria-disabled", "true");
  });

  test("without JavaScript the page says why sign-in cannot work", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: BASE_URL });
    const page = await context.newPage();
    await page.goto("/signin");
    await expect(page.getByText("Sign-in needs JavaScript for Google and the bot check.")).toBeVisible();
    await context.close();
  });

  test("return path (§11.4): /signin?returnTo=/\\evil.com reaches the island as null, so sign-in lands on /signin?welcome=1", async ({ request }) => {
    // There is no Google in e2e, so the case stops at the island's server-rendered props, serialised in the RSC payload
    // (quotes may be escaped there). The payload also carries the raw query in its router state, so the match is anchored
    // on the island's own prop order: config, siteKey, returnTo, siteOrigin, nonce. The island's step from a null
    // returnTo to /signin?welcome=1 is pinned by signin-button.test.tsx ("never follows an unsafe return path").
    const evil = await (await request.get("/signin?returnTo=%2F%5Cevil.com")).text();
    expect(evil).toMatch(/\\?"returnTo\\?":null,\\?"siteOrigin\\?"/);
    const safe = await (await request.get("/signin?returnTo=%2Freview%2F0001-pilot")).text();
    expect(safe).toMatch(/\\?"returnTo\\?":\\?"\/review\/0001-pilot\\?",\\?"siteOrigin\\?"/);
  });

  const themes = [
    { label: "light", cookie: "light", forced: false },
    { label: "dark", cookie: "dark", forced: false },
    { label: "forced colours", cookie: "system", forced: true },
  ] as const;
  for (const t of themes) {
    test(`axe: /signin has no WCAG 2.2 AA violations (${t.label})`, async ({ context, page }) => {
      await context.addCookies([{ name: "intellidrugs-theme", value: t.cookie, url: BASE_URL }]);
      if (t.forced) await page.emulateMedia({ forcedColors: "active" });
      await page.goto("/signin");
      await expect(page.getByText("Bot check passed")).toBeVisible({ timeout: 20_000 });
      const result = await new AxeBuilder({ page }).withTags(WCAG).exclude("iframe").analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
  }
});

test.describe("sign-out (§9.6)", () => {
  test("clears the session cookie and sessionStorage drafts (Clear-Site-Data) and lands on /", async ({ context, page }) => {
    await signInAs(context, "pharmacist", "Farhana Islam");
    await page.goto("/signin");
    await page.evaluate(() => sessionStorage.setItem("intellidrugs-note-draft", "draft text"));
    await page.locator("header summary").click();
    const [response] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === "/signout"),
      page.locator("header").getByRole("button", { name: "Sign out" }).click(),
    ]);
    expect(response.status()).toBe(303);
    expect(response.headers()["clear-site-data"]).toBe('"storage"');
    await page.waitForURL(`${BASE_URL}/`);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
    expect((await context.cookies()).some((c) => c.name === "__Host-intellidrugs_session")).toBe(false);
  });

  test("refuses a sign-out without our Origin", async ({ request }) => {
    expect((await request.post("/signout")).status()).toBe(403);
    expect((await request.post("/signout", { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
  });

  test("DELETE /api/session is gone", async ({ request }) => {
    expect((await request.delete("/api/session")).status()).toBe(405);
  });
});
```

`web/e2e/zz-rate-limit.spec.ts` (named to run last: it uses up the sign-in allowance for ten minutes):

```ts
import { expect, test } from "@playwright/test";

test("POST /api/session: the 11th attempt in 10 minutes is 429 with the sign-in message (§9.3)", async ({ request }) => {
  const statuses: number[] = [];
  for (let i = 0; i < 10; i++) statuses.push((await request.post("/api/session", { data: {} })).status());
  expect(statuses).toEqual(Array(10).fill(400));
  const res = await request.post("/api/session", { data: {} });
  expect(res.status()).toBe(429);
  expect((await res.json()).message).toBe("Too many sign-in attempts. Wait a few minutes and try again.");
});
```

`web/lighthouserc.json` (P2 adds `/`, `/search?q=paracetamol`, a product page and `/check` with the S5 budgets at error level):

```json
{
  "ci": {
    "collect": { "url": ["http://localhost:3000/signin"], "numberOfRuns": 1 },
    "assert": {
      "assertions": {
        "categories:accessibility": ["error", { "minScore": 1 }],
        "categories:performance": ["warn", { "minScore": 0.9 }]
      }
    },
    "upload": { "target": "filesystem", "outputDir": ".lighthouseci" }
  }
}
```

- [ ] **Step 4: Add the CI job**

Append to `.github/workflows/ci.yml` under `jobs:`:

```yaml
  e2e:
    runs-on: ubuntu-24.04
    env:
      DB_USER: bddrug
      DB_PASSWORD: ci
      GHCR_OWNER: ci
      IMAGE_TAG: ci
      COMPOSE: docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: {node-version: "22"}
      - run: cd web && npm ci && npx playwright install --with-deps chromium
      - run: $COMPOSE up -d --build db flyway api web
      - run: $COMPOSE run --rm seed
      - run: curl -fsS --retry 30 --retry-delay 2 --retry-all-errors http://localhost:3000/healthz
      - run: cd web && E2E_BASE_URL=http://localhost:3000 npx playwright test
      - run: cd web && npx lhci autorun
      - if: failure()
        run: $COMPOSE logs --no-color web api | tail -n 300
```

- [ ] **Step 5: Run the configuration test**

Run: `cd web && npx vitest run tests/deploy-config.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Run the stack and the e2e suite locally (Docker required)**

Never run this on the EC2 host. The override's `name: bddrug-ci` keeps it apart from a local `bddrug` stack, and `down -v` below removes only the `bddrug-ci` volumes; check with `docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml config | head -1`, which prints `name: bddrug-ci`.

```bash
export DB_USER=bddrug DB_PASSWORD=ci GHCR_OWNER=ci IMAGE_TAG=ci
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml up -d --build db flyway api web
docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml run --rm seed
curl -fsS --retry 30 --retry-delay 2 --retry-all-errors http://localhost:3000/healthz && echo
cd web && npx playwright install chromium && E2E_BASE_URL=http://localhost:3000 npx playwright test && npx lhci autorun
```

Expected: `ok`; Playwright `17 passed`; LHCI `All results processed!` with the accessibility assertion passing. Then stop the stack: `docker compose -f deploy/docker-compose.yml -f deploy/docker-compose.ci.yml down -v`.

- [ ] **Step 7: Commit**

```bash
git add deploy/docker-compose.ci.yml web/e2e web/playwright.config.ts web/lighthouserc.json .github/workflows/ci.yml web/tests/deploy-config.test.ts
git commit -m "feat(deploy): CI-only compose override and e2e job with Playwright, axe and Lighthouse CI" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: The request log line (§5.15, §9.7)

§5.15: "The web container's stdout logs never contain emails, notes, flag messages, or the query strings of `/search` and `/check`. Logs record the route template, status, duration and request id." §9.4: server code reads `x-request-id` with `headers()`, "logs it". This task writes that one line for every response app code ends itself: the middleware's own answers (429s now, P1B's redirects later), the `/api/session` and `/signout` route handlers, and the three legacy server actions. A request the middleware passes on to a server-rendered page is not logged by app code: Next.js gives the middleware no hook for the page's final status, and the pages add none. `/healthz` is not logged either (the container healthcheck calls it every 30 s).

**Files:**
- Create: `web/lib/request-log.ts`
- Modify: `web/middleware.ts`, `web/app/api/session/route.ts`, `web/app/signout/route.ts`, `web/lib/review-actions.ts`, `web/tests/middleware.test.ts`, `web/tests/session-route.test.ts`, `web/tests/signout-route.test.ts`, `web/tests/review-actions.test.ts`
- Test: `web/tests/request-log.test.ts`

**Interfaces:**
- Consumes: `createMiddleware` (Task 14), the `/api/session` `POST` (Task 19), the `/signout` `POST` (Task 20), `requestId()` (Task 18), the `x-request-id` request header (Task 13).
- Produces: from `@/lib/request-log` (no `server-only`: the middleware imports it): `STATIC_ROUTES`, `DYNAMIC_ROUTES`, `UNMATCHED_ROUTE = "[unmatched]"`, `routeTemplate(path: string): string`, `type RequestLog = { route: string; method: string; status: number; ms: number; requestId: string | null }`, `logRequest(e: RequestLog): void` (one JSON line `{"msg":"request","route","method","status","ms","requestId"}` on stdout), `withRequestLog(route: string, handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response>`. P1B and P2 add their routes to `STATIC_ROUTES` / `DYNAMIC_ROUTES`, wrap their route handlers with `withRequestLog`, and log their server actions with an `action:` route name.

- [ ] **Step 1: Write the failing library test**

Create `web/tests/request-log.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { UNMATCHED_ROUTE, logRequest, routeTemplate, withRequestLog } from "@/lib/request-log";

const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
const spyLog = () => vi.spyOn(console, "log").mockImplementation(() => {});
const lines = (log: ReturnType<typeof spyLog>) => log.mock.calls.map((c) => JSON.parse(String(c[0])));
afterEach(() => vi.restoreAllMocks());

describe("routeTemplate", () => {
  it.each([
    ["/products/186-0030-006--napa", "/products/[id]"], ["/substances/BDS-000010", "/substances/[id]"],
    ["/batches/0001-pilot", "/batches/[id]"], ["/review/0001-pilot", "/review/[batchId]"],
    ["/review/0001-pilot/N-1", "/review/[batchId]/[conceptId]"], ["/review/0001-pilot/versions", "/review/[batchId]/versions"],
    ["/review/flags", "/review/flags"], ["/__/auth/handler", "/__/auth/[...path]"], ["/", "/"], ["/api/session", "/api/session"],
  ])("%s is logged as %s", (path, template) => {
    expect(routeTemplate(path)).toBe(template);
  });

  it("drops the query string and the fragment (§9.7: no /search or /check query in logs)", () => {
    expect(routeTemplate("/search?q=paracetamol")).toBe("/search");
    expect(routeTemplate("/check?ids=186-0030-006--napa&ids=X-2#flag")).toBe("/check");
  });

  it("never echoes an unknown path", () => {
    expect(routeTemplate("/someone@example.org/x")).toBe(UNMATCHED_ROUTE);
  });
});

describe("logRequest", () => {
  it("writes one JSON line with the route, method, status, rounded duration and request id only", () => {
    const log = spyLog();
    logRequest({ route: "/search", method: "get", status: 429, ms: 1.6, requestId: RID });
    expect(lines(log)).toEqual([{ msg: "request", route: "/search", method: "GET", status: 429, ms: 2, requestId: RID }]);
  });

  it("drops a request id that is not a UUID and names an unknown method OTHER", () => {
    const log = spyLog();
    logRequest({ route: "/", method: "BREW", status: 405, ms: 0, requestId: "pharm@example.org" });
    expect(lines(log)).toEqual([{ msg: "request", route: "/", method: "OTHER", status: 405, ms: 0, requestId: null }]);
  });
});

describe("withRequestLog", () => {
  const request = () => new Request("http://localhost/api/session?who=pharm@example.org", {
    method: "POST", headers: { "x-request-id": RID, "content-type": "application/json" }, body: JSON.stringify({ idToken: "secret-token" }) });

  it("logs the handler's status with the middleware's request id, never the URL, the body or an email", async () => {
    const log = spyLog();
    const handler = withRequestLog("/api/session", async () => new Response("{}", { status: 401 }));
    expect((await handler(request())).status).toBe(401);
    expect(lines(log)).toEqual([{ msg: "request", route: "/api/session", method: "POST", status: 401, ms: expect.any(Number), requestId: RID }]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/pharm@|secret-token/);
  });

  it("logs 500 when the handler throws, and rethrows", async () => {
    const log = spyLog();
    const handler = withRequestLog("/signout", async () => { throw new Error("boom"); });
    await expect(handler(request())).rejects.toThrow("boom");
    expect(lines(log)[0]).toMatchObject({ route: "/signout", status: 500 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run tests/request-log.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/request-log"`.

- [ ] **Step 3: Write the module**

`web/lib/request-log.ts`:

```ts
/*
 * The web container's request log line (§5.15, §9.7): route template, method, status, duration and request id, one
 * JSON line on stdout. Never a raw path, a query string, an email, a note or any other form text. No "server-only":
 * the middleware imports it.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

/** Routes logged as they are. P1B and P2 add theirs. */
export const STATIC_ROUTES: readonly string[] = ["/", "/search", "/check", "/check/suggest", "/signin", "/signout",
  "/api/session", "/healthz", "/robots.txt", "/icon.svg", "/batches", "/flags", "/review", "/review/flags"];
/** Dynamic routes: the pattern and the template logged for it, most specific first. P1B and P2 add theirs. */
export const DYNAMIC_ROUTES: readonly (readonly [RegExp, string])[] = [
  [/^\/products\/[^/]+$/, "/products/[id]"],
  [/^\/substances\/[^/]+$/, "/substances/[id]"],
  [/^\/batches\/[^/]+$/, "/batches/[id]"],
  [/^\/review\/[^/]+\/versions$/, "/review/[batchId]/versions"],
  [/^\/review\/[^/]+\/[^/]+$/, "/review/[batchId]/[conceptId]"],
  [/^\/review\/[^/]+$/, "/review/[batchId]"],
  [/^\/__\/auth\/.+$/, "/__/auth/[...path]"],
];
export const UNMATCHED_ROUTE = "[unmatched]";

/** The route template of a path. The query string and fragment are dropped; an unknown path is never echoed. */
export function routeTemplate(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  if (STATIC_ROUTES.includes(pathname)) return pathname;
  for (const [pattern, template] of DYNAMIC_ROUTES) if (pattern.test(pathname)) return template;
  return UNMATCHED_ROUTE;
}

export type RequestLog = { route: string; method: string; status: number; ms: number; requestId: string | null };

/** One line per response. `route` is a template from routeTemplate(), a route handler's own path, or an `action:` name. */
export function logRequest({ route, method, status, ms, requestId }: RequestLog): void {
  const m = method.toUpperCase();
  console.log(JSON.stringify({ msg: "request", route, method: METHODS.includes(m) ? m : "OTHER", status,
    ms: Math.round(ms), requestId: requestId && UUID.test(requestId) ? requestId : null }));
}

/** Wraps a route handler so each request logs one line with the request id the middleware set (§9.4). */
export function withRequestLog(route: string, handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const started = performance.now();
    let status = 500;
    try {
      const res = await handler(request);
      status = res.status;
      return res;
    } finally {
      logRequest({ route, method: request.method, status, ms: performance.now() - started, requestId: request.headers.get("x-request-id") });
    }
  };
}
```

Run: `cd web && npx vitest run tests/request-log.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 4: Write the failing caller tests**

Append to `web/tests/middleware.test.ts`:

```ts
describe("middleware request log (§5.15, §9.7)", () => {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("logs each response it ends itself with the route template, never the query string or the email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const mw = createMiddleware(createLimits(clock, { anonymousDaily: 1, accountDaily: 100 }), clock);
    expect((await mw(req("/search?q=warfarin", { ip: "192.0.2.50" }))).status).toBe(200);   // passed on: not logged here
    expect((await mw(req("/search?q=warfarin", { ip: "192.0.2.50" }))).status).toBe(429);
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
      { msg: "request", route: "/search", method: "GET", status: 429, ms: expect.any(Number), requestId: expect.stringMatching(UUID_RE) }]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/warfarin|pharm@/);
    log.mockRestore();
  });
});
```

Append inside `describe("POST /api/session", …)` in `web/tests/session-route.test.ts`:

```ts
  it("logs one request line: /api/session, POST, the status, a duration and the request id (§9.7)", async () => {
    const RID = "3f2b8c1e-5d4a-4c6b-9e7f-0a1b2c3d4e5f";
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await route.POST(new Request("http://localhost/api/session", { method: "POST",
      headers: { "Content-Type": "application/json", "x-request-id": RID },
      body: JSON.stringify({ idToken: "tok", turnstileToken: "ts-1" }) }));
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
      { msg: "request", route: "/api/session", method: "POST", status: 200, ms: expect.any(Number), requestId: RID }]);
    log.mockRestore();
  });
```

Append inside `describe("POST /signout (§9.6)", …)` in `web/tests/signout-route.test.ts`:

```ts
  it("logs one request line: /signout, POST, 303 (§9.7), never the email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await signOut();
    expect(log.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
      { msg: "request", route: "/signout", method: "POST", status: 303, ms: expect.any(Number), requestId: null }]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("pharm@");
    log.mockRestore();
  });
```

Append to `web/tests/review-actions.test.ts`:

```ts
describe("server action log line (§5.15, §9.7)", () => {
  it("logs action:review, action:flag and action:resolve with their status, never a note, a message or an email", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    getSession.mockResolvedValue(PHARMACIST);
    await reviewAction(review({ note: "Patient Rahim has a rash" })).catch(() => {});          // ends in a redirect
    await flagAction(flag({ message: "Wrong company for Rahim" })).catch(() => {});
    fetchMock.mockResolvedValue(ok({ id: 1, status: "resolved" }));
    await resolveFlagAction(form({ flagId: "7", "cf-turnstile-response": "ts-token" })).catch(() => {});
    const lines = log.mock.calls.map((c) => JSON.parse(String(c[0])));
    expect(lines.map((l) => [l.route, l.method, typeof l.status, typeof l.ms])).toEqual([
      ["action:review", "POST", "number", "number"], ["action:flag", "POST", "number", "number"], ["action:resolve", "POST", "number", "number"]]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/Rahim|pharm@/);
    log.mockRestore();
  });
});
```

Run: `cd web && npx vitest run tests/middleware.test.ts tests/session-route.test.ts tests/signout-route.test.ts tests/review-actions.test.ts`
Expected: FAIL: nothing is logged.

- [ ] **Step 5: Log from the middleware, the two route handlers and the actions**

In `web/middleware.ts` add `import { logRequest, routeTemplate } from "@/lib/request-log";`, change the line `  return async function middleware(request: NextRequest): Promise<NextResponse> {` inside `createMiddleware` to `  const handle = async (request: NextRequest): Promise<NextResponse> => {` (the body and its closing `  };` stay as they are, so later edits that anchor on its lines still match), and add directly after that closing `  };`, before the closing `}` of `createMiddleware`:

```ts
  return async function middleware(request: NextRequest): Promise<NextResponse> {
    const started = performance.now();
    const res = await handle(request);
    // Responses the middleware ends itself (429s; P1B's redirects) are logged here. A passed-on request
    // (x-middleware-next: 1) is logged by its route handler or server action, if at all.
    if (res.headers.get("x-middleware-next") !== "1") {
      logRequest({ route: routeTemplate(request.nextUrl.pathname), method: request.method, status: res.status,
        ms: performance.now() - started, requestId: crypto.randomUUID() });
    }
    return res;
  };
```

In `web/app/api/session/route.ts` add `import { withRequestLog } from "@/lib/request-log";`, change `export async function POST(request: Request) {` to `async function handle(request: Request): Promise<Response> {`, and add at the end of the file:

```ts
export const POST = withRequestLog("/api/session", handle);
```

In `web/app/signout/route.ts` make the same two changes, with `export const POST = withRequestLog("/signout", handle);`.

In `web/lib/review-actions.ts` add, after the existing import:

```ts
import { requestId } from "./request-id";
import { logRequest } from "./request-log";

/** §5.15 log line for a server action: its name, status and duration, never its form fields. Not exported. */
async function logged<T extends { status: number }>(route: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  const result = await run();
  logRequest({ route, method: "POST", status: result.status, ms: performance.now() - started, requestId: await requestId() });
  return result;
}
```

and replace `await submitReview(formData)` with `await logged("action:review", () => submitReview(formData))`, `await submitFlag(formData)` with `await logged("action:flag", () => submitFlag(formData))`, and `await submitResolve(formData)` with `await logged("action:resolve", () => submitResolve(formData))`.

- [ ] **Step 6: Run the tests, the suite and the build**

Run: `cd web && npx vitest run tests/request-log.test.ts tests/middleware.test.ts tests/session-route.test.ts tests/signout-route.test.ts tests/review-actions.test.ts && npm test && npm run build`
Expected: PASS; the build accepts `export const POST = withRequestLog(…)` as a route handler export.

- [ ] **Step 7: Commit**

```bash
git add web/lib/request-log.ts web/middleware.ts web/app/api/session/route.ts web/app/signout/route.ts web/lib/review-actions.ts \
  web/tests/request-log.test.ts web/tests/middleware.test.ts web/tests/session-route.test.ts web/tests/signout-route.test.ts \
  web/tests/review-actions.test.ts
git commit -m "feat(web): request log line with route template, status, duration and request id" \
  -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Finishing P1A

- [ ] Run everything once more from a clean tree: `cd web && npm ci && npm run lint:css && npm test && npm run build`, `cd api && ./gradlew test --no-daemon`, and the Task 24 Step 6 e2e block. Expected: all green; `postbuild` prints both the bundle scan and `client island check: 5 client files, all on the §4.2 allowlist`.
- [ ] Before merging to `main` (which deploys), confirm the §12.4 Firebase auth-domain steps and the host `.env` `SITE_HOST` line are done (README "Firebase auth domain"). After the deploy, `curl -fsS https://drugdb.eliooo.org/healthz` answers `ok`, and the response headers of `https://drugdb.eliooo.org/signin` show a `'nonce-…'` CSP.
