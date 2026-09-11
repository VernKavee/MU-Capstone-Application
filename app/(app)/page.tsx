import Link from "next/link";
import { lastSevenDays, WEEK_FETCH_MS, weeklySummary } from "@/lib/history";
import type { Similarity } from "@/lib/set";
import { createClient } from "@/lib/supabase/server";
import { userTimeZone } from "@/lib/time-zone";
import { WeeklySummary } from "./weekly-summary";

export default async function HomePage() {
  const supabase = await createClient();
  const tz = await userTimeZone();
  const now = new Date();
  // Level 1 fetches the start time and similarity of the last seven days' sets, nothing else.
  // The page renders beside the (app) layout, not after it, so for a user still without a
  // profile it runs while the layout's gate redirects: no row is not a failure here.
  const [{ data: profile }, { data: exercises }, { data: sets }] = await Promise.all([
    supabase.from("profiles").select("display_name").maybeSingle().throwOnError(),
    supabase.from("exercises").select("id, name, thumbnail_url").order("sort_order").throwOnError(),
    supabase.from("sets").select("started_at, similarity").gte("started_at", new Date(now.getTime() - WEEK_FETCH_MS).toISOString()).throwOnError(),
  ]);
  const week = weeklySummary(
    lastSevenDays(now, tz),
    sets.map((s) => ({ started_at: s.started_at, similarity: s.similarity as Similarity | null })),
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
          <ul className="grid grid-cols-2 gap-3">
            {exercises.map((exercise) => (
              <li key={exercise.id}>
                {/* A black tile like the stage: the thumbnail fills it once it exists, and the
                    name sits over it in a pill, as the live screen's labels sit over video. */}
                <Link
                  href={`/workout/${exercise.id}/setup`}
                  className="relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-xl bg-black p-2.5 ring-1 ring-ink/10 hover:ring-ink/50"
                >
                  {exercise.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={exercise.thumbnail_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden className="absolute left-3 top-3 text-xs text-ink/50">
                      Thumbnail not available yet
                    </span>
                  )}
                  <span className="relative self-start rounded-md bg-black/55 px-1.5 py-1 font-display text-3xl leading-none backdrop-blur-sm">
                    {exercise.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
