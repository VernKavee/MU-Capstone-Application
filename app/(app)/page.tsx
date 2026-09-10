import Link from "next/link";
import { localDate, WEEK_FETCH_MS, weekDays, weeklySummary } from "@/lib/history";
import type { Similarity } from "@/lib/set";
import { createClient } from "@/lib/supabase/server";
import { userTimeZone } from "@/lib/time-zone";
import { WeeklySummary } from "./weekly-summary";

export default async function HomePage() {
  const supabase = await createClient();
  const tz = await userTimeZone();
  const now = new Date();
  // Level 1 fetches the start time and similarity of this week's sets, nothing else.
  const [{ data: profile }, { data: exercises }, { data: sets }] = await Promise.all([
    supabase.from("profiles").select("display_name").single(),
    supabase.from("exercises").select("id, name, thumbnail_url").order("sort_order"),
    supabase.from("sets").select("started_at, similarity").gte("started_at", new Date(now.getTime() - WEEK_FETCH_MS).toISOString()),
  ]);
  const week = weeklySummary(
    weekDays(now, tz),
    (sets ?? []).map((s) => ({ started_at: s.started_at, similarity: s.similarity as Similarity | null })),
    tz,
  );

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Hello, {profile?.display_name}</h1>
      <WeeklySummary days={week} today={localDate(now, tz)} />
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
    </main>
  );
}
