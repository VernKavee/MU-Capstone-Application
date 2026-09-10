import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("display_name").single();
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Hello, {profile?.display_name}</h1>
      <p className="text-sm opacity-70">Exercise selection and the weekly summary arrive in later phases.</p>
    </main>
  );
}
