import type { MetadataRoute } from "next";

/** The site stays out of search engines during the pilot (§9.2, §13 Q3). */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
