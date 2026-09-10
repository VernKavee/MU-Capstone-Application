import Link from "next/link";
import { notFound } from "next/navigation";
import { meanSimilarity } from "@/lib/history";
import type { Similarity } from "@/lib/set";
import { createClient } from "@/lib/supabase/server";
import { userTimeZone } from "@/lib/time-zone";

// Level 3 (REQUIREMENTS section 5, ADR-0004): one exercise's finished workouts, newest
// first, each with its date and the mean similarity over its sets, initial and repair.
// Fetches each workout's setup and its sets' kind and similarity, nothing else.
export default async function ExerciseHistoryPage({ params }: PageProps<"/history/[exercise]">) {
  const { exercise: id } = await params;
  const supabase = await createClient();
  const tz = await userTimeZone();
  const [{ data: exercise }, { data: workouts }] = await Promise.all([
    supabase.from("exercises").select("id, name").eq("id", id).maybeSingle(),
    // ponytail: no paging; add .range() if a tester passes a few hundred workouts
    supabase
      .from("workouts")
      .select("id, started_at, target_reps, target_sets, sets(kind, similarity)")
      .eq("exercise_id", id)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false }),
  ]);
  if (!exercise) notFound();
  const list = workouts ?? [];
  const thisYear = new Date().toLocaleDateString("en-GB", { year: "numeric", timeZone: tz });

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-1">
        <Link href="/history" className="text-sm underline">
          History
        </Link>
        <h1 className="text-2xl font-semibold">{exercise.name}</h1>
        <p className="text-sm opacity-70">
          {list.length} finished {list.length === 1 ? "workout" : "workouts"}, newest first
        </p>
      </header>

      {list.length ? (
        <ol className="divide-y border-y">
          {list.map((workout) => {
            const at = new Date(workout.started_at);
            const year = at.toLocaleDateString("en-GB", { year: "numeric", timeZone: tz });
            const date = at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(year === thisYear ? {} : { year: "numeric" }), timeZone: tz });
            const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
            const repairs = workout.sets.filter((s) => s.kind === "repair").length;
            const mean = meanSimilarity(workout.sets.map((s) => s.similarity as Similarity | null));
            return (
              <li key={workout.id}>
                <Link href={`/history/${exercise.id}/${workout.id}`} className="flex items-center justify-between gap-4 px-1 py-3 hover:bg-foreground/5">
                  <span>
                    <span className="block font-medium">
                      {date}, {time}
                    </span>
                    <span className="block text-sm opacity-70">
                      {workout.target_sets} {workout.target_sets === 1 ? "set" : "sets"} of {workout.target_reps}
                      {repairs > 0 && `, ${repairs} repair ${repairs === 1 ? "set" : "sets"}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-xl font-semibold tabular-nums">{mean === null ? "–" : `${mean}%`}</span>
                    <span className="block text-xs opacity-70">similarity</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p>
          No finished {exercise.name.toLowerCase()} workouts yet.{" "}
          <Link href={`/workout/${exercise.id}/setup`} className="underline">
            Start one
          </Link>
          .
        </p>
      )}
    </main>
  );
}
