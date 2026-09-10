import { redirect } from "next/navigation";
import { gateState } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";

// Everything inside (app) needs current consent and a complete profile.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const { consented, hasProfile } = await gateState(supabase);
  if (!consented) redirect("/consent");
  if (!hasProfile) redirect("/profile/setup");
  return <>{children}</>;
}
