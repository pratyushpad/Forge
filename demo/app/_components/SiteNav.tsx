"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// /results and /traces slot in here as they get built.
const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/playground", label: "Playground" },
  { href: "/method", label: "Method" },
];

export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="sitenav" aria-label="Primary">
      <div className="sitenav-inner">
        <Link href="/" className="wordmark">
          <span className="wordmark-bar" aria-hidden="true" />
          Forge
        </Link>
        <ul className="navlinks">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`navlink${active ? " active" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
