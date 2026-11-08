import Link from "next/link";
import { lastSevenDays, WEEK_FETCH_MS, weeklySummary } from "@/lib/history";
import type { SetSimilarity } from "@/lib/set";
import { createClient } from "@/lib/supabase/server";
import { userTimeZone } from "@/lib/time-zone";
import { WeeklySummary } from "./weekly-summary";
import { ChevronRight, Figure } from "./icons";

export default async function HomePage() {
  const supabase = await createClient();
  const tz = await userTimeZone();
  const now = new Date();
  // Level 1 fetches the start time and similarity of the last seven days' sets, nothing else.
  // The page renders beside the (app) layout, not after it, so for a user still without a
  // profile it runs while the layout's gate redirects: no row is not a failure here.
  const [{ data: profile }, { data: exercises }, { data: sets }] = await Promise.all([
    supabase.from("profiles").select("display_name").maybeSingle().throwOnError(),
    supabase.from("exercises").select("id, name, camera_hint, thumbnail_url").order("sort_order").throwOnError(),
    supabase.from("sets").select("started_at, similarity").gte("started_at", new Date(now.getTime() - WEEK_FETCH_MS).toISOString()).throwOnError(),
  ]);
  const week = weeklySummary(
    lastSevenDays(now, tz),
    sets.map((s) => ({ started_at: s.started_at, similarity: s.similarity as SetSimilarity | null })),
    tz,
  );

  return (
    <main className="space-y-8 p-6">
      <h1>Hello, {profile?.display_name}</h1>
      {/* Side by side on a laptop: the week on the left, the four exercises on the right. */}
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <WeeklySummary days={week} />
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Start a workout</h2>
          {/* Rows on one card, as in the mockup: the thumbnail in its square once it exists. */}
          <ul className="card divide-y divide-line px-4">
            {exercises.map((exercise) => (
              <li key={exercise.id}>
                <Link href={`/workout/${exercise.id}/setup`} className="flex items-center gap-3 py-3 text-lg font-semibold hover:text-accent">
                  <span aria-hidden className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2 text-accent">
                    {exercise.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={exercise.thumbnail_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Figure className="size-6" />
                    )}
                  </span>
                  <span className="min-w-0">
                    {exercise.name}
                    <span className="block text-sm font-normal text-muted">{exercise.camera_hint}</span>
                  </span>
                  <ChevronRight className="ml-auto size-5 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
