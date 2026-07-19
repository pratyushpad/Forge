import type { MetadataRoute } from "next";

const BASE = "https://forge-iota-coral.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/playground", "/method", "/results", "/traces"].map((path) => ({
    url: `${BASE}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.8,
  }));
}
