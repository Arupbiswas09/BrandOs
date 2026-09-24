import type { MetadataRoute } from "next";

/** BrandOS is a private workspace. Nothing here belongs in a search engine. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
