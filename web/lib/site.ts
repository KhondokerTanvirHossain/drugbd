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
  if (isE2e() && host.toLowerCase().replace(/:\d+$/, "") === PRODUCTION_HOST)
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
