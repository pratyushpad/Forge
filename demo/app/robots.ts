import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The proxy spins a billed GPU; there is nothing here for a crawler to index.
      disallow: "/api/",
    },
    sitemap: "https://forge-iota-coral.vercel.app/sitemap.xml",
  };
}
