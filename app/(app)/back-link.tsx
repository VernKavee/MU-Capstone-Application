import Link from "next/link";
import type { ReactNode } from "react";

// The one way back on every page under a tab, top left, named for where it goes. The round
// chevron is the 44 px target; the label says the parent page, as the mockup showed.
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="-ml-1 inline-flex items-center gap-2 rounded-full pr-3 font-medium text-muted hover:text-foreground">
      <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-foreground">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </span>
      {children}
    </Link>
  );
}
