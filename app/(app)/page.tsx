import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const [{ data: profile }, { data: exercises }] = await Promise.all([
    supabase.from("profiles").select("display_name").single(),
    supabase.from("exercises").select("id, name, thumbnail_url").order("sort_order"),
  ]);
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Hello, {profile?.display_name}</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Start a workout</h2>
        <ul className="grid grid-cols-2 gap-4">
          {exercises?.map((exercise) => (
            <li key={exercise.id}>
              <Link
                href={`/workout/${exercise.id}/setup`}
                className="block overflow-hidden rounded-lg border hover:border-foreground"
              >
                {exercise.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={exercise.thumbnail_url} alt="" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-foreground/5 text-xs opacity-60">
                    Thumbnail not available yet
                  </div>
                )}
                <span className="block p-3 font-medium">{exercise.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-sm opacity-70">The weekly summary arrives in Phase 5.</p>
    </main>
  );
}
