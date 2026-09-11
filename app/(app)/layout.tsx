import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TabBar } from "./tab-bar";
import { TimeZone } from "./time-zone";
import { gateState } from "@/lib/gate";
import { TZ_COOKIE } from "@/lib/history";
import { createClient } from "@/lib/supabase/server";

// Everything inside (app) needs current consent and a complete profile.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { consented, hasProfile } = await gateState(supabase);
  if (!consented) redirect("/consent");
  if (!hasProfile) redirect("/profile/setup");
  return (
    <>
      <TimeZone current={(await cookies()).get(TZ_COOKIE)?.value} />
      <TabBar />
      {/* One column for every page, so titles never move between pages or against the
          loading screen. Each page sets its own measure inside it, left aligned. */}
      <div className="mx-auto w-full max-w-5xl flex-1 pb-16 md:pb-0">{children}</div>
    </>
  );
}
