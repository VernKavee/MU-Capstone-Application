import { redirect } from "next/navigation";
import { ProfileForm } from "../profile-form";
import { gateState } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";

export default async function ProfileSetupPage({ searchParams }: PageProps<"/profile/setup">) {
  const supabase = await createClient();
  const { consented, hasProfile } = await gateState(supabase);
  if (!consented) redirect("/consent");
  if (hasProfile) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-lg p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Your profile</h1>
      <p className="text-sm">Needed before your first workout. Everything here can be changed later in Settings.</p>
      <ProfileForm mode="setup" error={typeof error === "string" ? error : undefined} />
    </main>
  );
}
