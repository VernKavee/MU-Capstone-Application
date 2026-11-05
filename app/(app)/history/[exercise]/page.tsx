import Link from "next/link";
import { notFound } from "next/navigation";
import { formatWhen, meanSimilarity } from "@/lib/history";
import type { SetSimilarity } from "@/lib/set";
import { createClient } from "@/lib/supabase/server";
import { userTimeZone } from "@/lib/time-zone";
import { BackLink } from "@/app/(app)/back-link";

const PAGE = 20;

// Level 3 (REQUIREMENTS section 5, ADR-0004): one exercise's workouts with at least one
// saved set, newest first, each with its date and the mean similarity over its sets, initial
// and repair. A workout left part way is listed, marked not finished. Twenty to a page, older
// ones from `?before=`, the start time of the last row shown. Fetches each workout's setup and
// its sets' kind and similarity, nothing else.
export default async function ExerciseHistoryPage({ params, searchParams }: PageProps<"/history/[exercise]">) {
  const { exercise: id } = await params;
  const { before: cursor } = await searchParams;
  const before = typeof cursor === "string" && Number.isFinite(Date.parse(cursor)) ? cursor : null;
  const supabase = await createClient();
  const tz = await userTimeZone();
  let query = supabase
    .from("workouts")
    .select("id, started_at, ended_at, target_reps, target_sets, sets!inner(kind, similarity)")
    .eq("exercise_id", id);
  if (before) query = query.lt("started_at", before);
  const [{ data: exercise }, { data: rows }] = await Promise.all([
    supabase.from("exercises").select("id, name").eq("id", id).maybeSingle().throwOnError(),
    query.order("started_at", { ascending: false }).limit(PAGE + 1).throwOnError(),
  ]);
  if (!exercise) notFound();
  const list = rows.slice(0, PAGE);
  const older = rows.length > PAGE ? `/history/${exercise.id}?before=${encodeURIComponent(list[list.length - 1].started_at)}` : null;

  return (
    <main className="max-w-2xl space-y-6 p-6">
      <header className="space-y-2">
        <BackLink href="/history">History</BackLink>
        <h1>{exercise.name}</h1>
        <p className="text-sm text-muted">
          {before ? "Older workouts" : "Workouts"}, newest first.{" "}
          {before && (
            <Link href={`/history/${exercise.id}`} className="underline">
              Back to the newest
            </Link>
          )}
        </p>
      </header>

      {list.length ? (
        <ol className="divide-y border-y">
          {list.map((workout) => {
            const repairs = workout.sets.filter((s) => s.kind === "repair").length;
            const mean = meanSimilarity(workout.sets.map((s) => s.similarity as SetSimilarity | null));
            return (
              <li key={workout.id}>
                <Link href={`/history/${exercise.id}/${workout.id}`} className="flex items-center justify-between gap-4 px-1 py-3 hover:bg-foreground/5">
                  <span>
                    <span className="block font-medium">
                      {formatWhen(workout.started_at, tz)}
                      {!workout.ended_at && <span className="ml-2 text-sm font-normal text-muted">Not finished</span>}
                    </span>
                    <span className="block text-sm text-muted">
                      {workout.target_sets} {workout.target_sets === 1 ? "set" : "sets"} of {workout.target_reps}
                      {repairs > 0 && `, ${repairs} repair ${repairs === 1 ? "set" : "sets"}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-display text-4xl leading-none tabular-nums">{mean === null ? "–" : `${mean}%`}</span>
                    <span className="block text-xs text-muted">similarity</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p>
          No {exercise.name.toLowerCase()} workouts {before ? "before these" : "yet"}.{" "}
          <Link href={`/workout/${exercise.id}/setup`} className="underline">
            Start one
          </Link>
          .
        </p>
      )}
      {older && (
        <Link href={older} className="btn-quiet inline-block">
          Older workouts
        </Link>
      )}
    </main>
  );
}
