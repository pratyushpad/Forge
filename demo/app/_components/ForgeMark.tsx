import { useId } from "react";

/**
 * Scalable Forge brand mark — the chamfered-F glyph geometry from
 * `app/icon.svg`, lifted out of its favicon tile so it can stand alone from
 * 16px (nav) up to hero scale. No client-only hooks besides `useId` (SSR-safe
 * by design), so this renders fine from a Server Component too.
 *
 * `heat={false}` (default) fills with `currentColor` — wrap it in something
 * that sets `color` and the mark follows. `heat` fills via an inline
 * `<linearGradient>` matching the `--heat` ember→glow gradient used
 * everywhere else (the `.hot` text treatment, `.bar`, `.sec-label::before`).
 */
export default function ForgeMark({
  size = 24,
  heat = false,
  className,
}: {
  /** Rendered width/height in px. */
  size?: number;
  /** Fill with the ember→glow heat gradient instead of currentColor. */
  heat?: boolean;
  className?: string;
}) {
  const gradientId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Forge"
      className={className}
    >
      {heat && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--ember-deep)" />
            <stop offset="0.55" stopColor="var(--ember)" />
            <stop offset="1" stopColor="var(--glow)" />
          </linearGradient>
        </defs>
      )}
      <g fill={heat ? `url(#${gradientId})` : "currentColor"}>
        <path d="M11 9 H17 V27 L14 31 L11 27 Z" />
        <path d="M11 9 H30 L24 16 H11 Z" />
        <path d="M11 19 H26 L20 25 H11 Z" />
      </g>
    </svg>
  );
}
