import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "./icons";

// The one way back on every page under a tab, top left, named for where it goes. The round
// chevron is the 44 px target; the label says the parent page, as the mockup showed.
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="-ml-1 inline-flex items-center gap-2 rounded-full pr-3 font-medium text-muted hover:text-foreground">
      <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-foreground">
        <ChevronLeft />
      </span>
      {children}
    </Link>
  );
}
