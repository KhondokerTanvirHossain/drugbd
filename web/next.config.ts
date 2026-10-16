import type { NextConfig } from "next";
import { AUTH_PROXY_CSP } from "./lib/csp";

/** Firebase project ids: 6–30 characters, lower-case letters, digits and hyphens. */
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: { cssChunking: false },
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
