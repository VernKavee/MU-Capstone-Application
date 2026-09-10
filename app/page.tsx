import { signOut } from "./(auth)/actions";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Home</h1>
      <p className="text-sm">Signed in as {String(data?.claims.email ?? "")}</p>
      <form action={signOut}>
        <button type="submit" className="rounded border px-3 py-1">Sign out</button>
      </form>
    </main>
  );
}
