import type { Metadata, Viewport } from "next";
import { SITE_URL } from "../lib/site";
import { Playfair_Display, Source_Sans_3, JetBrains_Mono } from "next/font/google";
import SiteNav from "./_components/SiteNav";
import "./tokens.css";
import "./globals.css";

// Playfair Display is the voice: a high-contrast transitional serif, used
// roman for headlines and italic for the one emphasised word inside them.
// Source Sans 3 does all the reading and all the interface chrome.
// JetBrains Mono is reserved for machine output only — reasoning traces,
// measured figures, model ids, code.
const display = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const sans = Source_Sans_3({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-sans",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const viewport: Viewport = {
  themeColor: "#F9F8F4",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Forge: GRPO reasoning, base vs tuned",
  description:
    "Qwen2.5-1.5B taught to reason with GRPO on an 8GB GPU. Compare the base model against the tuned model side by side on grade-school math.",
  openGraph: {
    title: "Forge: GRPO reasoning, base vs tuned",
    description:
      "GSM8K pass@1 58.8% to 70.0% from RL alone on an 8 GB RTX 5060. Watch the base and tuned models solve the same problems side by side.",
    url: "/",
    siteName: "Forge",
  },
  twitter: {
    card: "summary_large_image",
    title: "Forge: GRPO reasoning, base vs tuned",
    description: "GSM8K pass@1 58.8% to 70.0% from RL alone on an 8 GB RTX 5060.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.) inject
          data-* attributes onto <body> before React hydrates. This suppresses
          the warning for body's own attributes only — real mismatches in the
          tree below still surface. */}
      <body suppressHydrationWarning className={`${display.variable} ${sans.variable} ${jetbrainsMono.variable}`}>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
