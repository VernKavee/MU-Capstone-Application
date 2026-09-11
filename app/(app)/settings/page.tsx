import { signOut } from "../../(auth)/actions";
import { ProfileForm } from "../../profile/profile-form";
import { SubmitButton } from "../../submit-button";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const supabase = await createClient();
  // No row only while the (app) layout's gate, rendering beside this page, redirects.
  const { data: profile } = await supabase.from("profiles").select("*").maybeSingle().throwOnError();
  const { error, saved } = await searchParams;

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {saved && <p role="status" className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">Profile saved.</p>}
      <ProfileForm mode="settings" profile={profile} error={typeof error === "string" ? error : undefined} />
      <form action={signOut}>
        <SubmitButton pendingText="Signing out" className="rounded border px-4 py-2">Sign out</SubmitButton>
      </form>
    </main>
  );
}
