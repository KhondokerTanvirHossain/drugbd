import type { BrowserContext } from "@playwright/test";
import { encryptSession, sessionCookieName } from "../lib/session-crypto";

/** Must equal SESSION_SECRET in deploy/docker-compose.ci.yml. There is no Google in e2e: the test mints the cookie. */
export const E2E_SECRET = process.env.E2E_SESSION_SECRET ?? "e2e-session-secret-0123456789abcdef0123456789";
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const E2E_EMAILS = { pharmacist: "pharm@e2e.test", engineer: "eng@e2e.test", senior: "senior@e2e.test", qa: "qa@e2e.test",
  user: "reader@e2e.test" } as const;
/** A second qa account (QA portal) that never creates or owns a key, so its /review/qa key list is always empty (§11.4 axe). */
export const E2E_QA_EMPTY = "qa-empty@e2e.test";

/**
 * Mints the production session cookie (§9.6, §11.4). A `__Host-` cookie must be Secure, Path=/ and carry no Domain.
 * Playwright's `url` form would derive `secure: false` from http://localhost, so the cookie is set by domain and path
 * instead; Chromium stores a domain without a leading dot as a host-only cookie, and treats localhost as secure.
 */
export async function signInAs(context: BrowserContext, role: keyof typeof E2E_EMAILS, name = "E2E Reviewer",
    email: string = E2E_EMAILS[role]): Promise<void> {
  const value = await encryptSession({ email, name, role }, E2E_SECRET);
  await context.addCookies([{
    name: sessionCookieName(true), value, domain: new URL(BASE_URL).hostname, path: "/",
    httpOnly: true, secure: true, sameSite: "Lax",
  }]);
}
