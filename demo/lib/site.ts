// Canonical origin for metadata, sitemap and robots. Set NEXT_PUBLIC_SITE_URL on
// whichever host serves the site so OG and canonical URLs point at a live page.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://forge-grpo.vercel.app";
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";
