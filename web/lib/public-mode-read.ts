import "server-only";
import { cache } from "react";
import { isMode, type PublicMode } from "./public-mode";

/**
 * GET /v1/public-mode (spec §7.4.1, §6.10, D74): which records the public site shows. Public, never with the token and with
 * no scope; no-store. React cache() dedupes the read within one render only, and nothing is kept across requests, so a
 * recreated API changes the site on the next request without a web restart. A failed or malformed answer throws: the page
 * fails as it does when its data read fails, and never falls back to either mode.
 */
export const getPublicMode = cache(async (): Promise<PublicMode> => {
  const res = await fetch(`${process.env.API_URL ?? "http://api:8080"}/v1/public-mode`,
    { cache: "no-store", signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const mode = (await res.json().catch(() => null))?.data?.mode;
  if (!isMode(mode)) throw new Error("API error: malformed public mode");
  return mode;
});
