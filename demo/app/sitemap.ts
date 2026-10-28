import type { MetadataRoute } from "next";

import { SITE_URL } from "../lib/site";

export const dynamic = "force-static";

const BASE = SITE_URL;

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/playground", "/method", "/results", "/traces"].map((path) => ({
    url: `${BASE}${path}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.8,
  }));
}
