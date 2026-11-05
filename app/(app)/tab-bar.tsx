"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Chart, Gear, Home } from "./icons";

const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/history", label: "History", Icon: Chart },
  { href: "/settings", label: "Settings", Icon: Gear },
] as const;

// A bottom tab bar on a phone, as in the report's wireframes; a top bar with the name on a
// laptop. One nav either way, first in the page so keyboard order matches the laptop's.
export function TabBar() {
  const pathname = usePathname();
  if (pathname.endsWith("/live")) return null; // the camera stage takes the whole screen
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-10 border-t bg-surface md:sticky md:top-0 md:border-b md:border-t-0">
      <div className="mx-auto flex max-w-5xl items-center md:px-6">
        <Link href="/" className="hidden font-display text-2xl leading-none md:block">
          Posture Coach
        </Link>
        <ul className="flex flex-1 md:ml-auto md:flex-none md:gap-6">
          {TABS.map(({ href, label, Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-0.5 pt-2 pb-2.5 text-xs font-medium md:flex-row md:gap-2 md:py-4 md:text-sm ${active ? "font-semibold text-accent" : "text-muted hover:text-foreground"}`}
                >
                  <Icon className="size-6 md:size-5" />
                  {label}
                  {active && <span aria-hidden className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent md:inset-x-0 md:top-auto md:bottom-0" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
