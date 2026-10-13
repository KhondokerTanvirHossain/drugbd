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
