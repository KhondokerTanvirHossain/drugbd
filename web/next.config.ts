import type { NextConfig } from "next";
import { buildCsp } from "./lib/csp";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: buildCsp(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN) },
    ] }];
  },
};
export default config;
