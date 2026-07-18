import type { Metadata } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter_Tight({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://forge-iota-coral.vercel.app"),
  title: "Forge — GRPO reasoning, base vs tuned",
  description:
    "Qwen2.5-1.5B taught to reason with GRPO on an 8GB GPU. Compare the base model against the GRPO-tuned model side by side on grade-school math.",
  openGraph: {
    title: "Forge — GRPO reasoning, base vs tuned",
    description:
      "GSM8K pass@1 58.8% → 70.0% from RL alone on an 8 GB RTX 5060. Watch the base and GRPO-tuned models solve the same problems side by side.",
    url: "/",
    siteName: "Forge",
    images: ["/reward_curve.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Forge — GRPO reasoning, base vs tuned",
    description: "GSM8K pass@1 58.8% → 70.0% from RL alone on an 8 GB RTX 5060.",
    images: ["/reward_curve.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable}`}>{children}</body>
    </html>
  );
}
