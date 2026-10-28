/** @type {import('next').NextConfig} */
// NEXT_PUBLIC_STATIC_EXPORT=1 builds a fully static site into out/ (Netlify,
// GitHub Pages, any file host). The live /api/generate proxy cannot exist in a
// static build, so the build command removes app/api first (see netlify.toml)
// and the playground replays the six recorded problems instead.
const isStatic = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig = isStatic
  ? { reactStrictMode: true, output: "export" }
  : {
      reactStrictMode: true,
      async headers() {
        return [{ source: "/(.*)", headers: securityHeaders }];
      },
    };
export default nextConfig;
