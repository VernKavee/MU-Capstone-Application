"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/history", label: "History" },
  { href: "/settings", label: "Settings" },
] as const;

// A bottom tab bar on a phone, as in the report's wireframes; a top bar with the name on a
// laptop. One nav either way, first in the page so keyboard order matches the laptop's.
export function TabBar() {
  const pathname = usePathname();
  if (pathname.endsWith("/live")) return null; // the camera stage takes the whole screen
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-10 border-t bg-background md:sticky md:top-0 md:border-b md:border-t-0">
      <div className="mx-auto flex max-w-5xl items-center md:px-6">
        <Link href="/" className="hidden font-display text-2xl leading-none md:block">
          Posture Coach
        </Link>
        <ul className="flex flex-1 md:ml-auto md:flex-none md:gap-6">
          {TABS.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative block py-3.5 text-center text-sm md:py-4 ${active ? "font-semibold" : "text-ink/60 hover:text-ink"}`}
                >
                  {label}
                  {active && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-ink md:inset-x-0 md:top-auto md:bottom-0" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
