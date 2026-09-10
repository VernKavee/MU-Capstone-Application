import { signOut } from "../../(auth)/actions";
import { ProfileForm } from "../../profile/profile-form";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").single();
  const { error, saved } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-lg p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {saved && <p role="status" className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">Profile saved.</p>}
      <ProfileForm mode="settings" profile={profile} error={typeof error === "string" ? error : undefined} />
      <form action={signOut}>
        <button type="submit" className="rounded border px-4 py-2">Sign out</button>
      </form>
    </main>
  );
}
