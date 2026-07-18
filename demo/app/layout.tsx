import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge — GRPO reasoning, base vs tuned",
  description:
    "Qwen2.5-1.5B taught to reason with GRPO on an 8GB GPU. Compare the base model against the GRPO-tuned model side by side on grade-school math.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
