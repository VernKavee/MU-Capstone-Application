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
    <main className="max-w-md space-y-6 p-6">
      <h1>Settings</h1>
      {saved && (
        <p role="status" className="rounded-lg bg-foreground/10 px-4 py-2.5 text-sm">
          Profile saved.
        </p>
      )}
      <ProfileForm mode="settings" profile={profile} error={typeof error === "string" ? error : undefined} />
      <form action={signOut} className="border-t pt-6">
        <SubmitButton pendingText="Signing out" className="btn-quiet">
          Sign out
        </SubmitButton>
      </form>
    </main>
  );
}
