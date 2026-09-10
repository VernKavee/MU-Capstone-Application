"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TZ_COOKIE } from "@/lib/history";

// Weeks run Monday to Sunday in the browser's time zone (Phase 0), and the pages that date
// sets render on the server, so the browser hands its zone over in a cookie. The first
// visit, or a new zone, refreshes once.
export function TimeZone({ current }: { current: string | undefined }) {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === current) return;
    document.cookie = `${TZ_COOKIE}=${zone}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [current, router]);
  return null;
}
