import Link from "next/link";
import { notFound } from "next/navigation";
import { ENDED_BY, meanSimilarity, setOrder } from "@/lib/history";
import type { Similarity, Totals } from "@/lib/set";
import { createClient } from "@/lib/supabase/server";

// Section 4.5's finished summary, read back from the database so it shows what was saved:
// every set with its counts, similarity, and feedback. Feedback still being written shows
// as not there yet; the retry lives on the set-complete screen (ADR-0007).
export default async function DonePage({ params }: PageProps<"/workout/[exercise]/done/[workout]">) {
  const { exercise, workout: id } = await params;
  const supabase = await createClient();
  const { data: workout } = await supabase
    .from("workouts")
    .select("*, exercises!inner(name), sets(*)")
    .eq("id", id)
    .eq("exercise_id", exercise)
    .maybeSingle();
  if (!workout) notFound();

  const sets = [...workout.sets].sort(setOrder);
  const totals = sets.map((s) => s.totals as Totals);
  const sum = (key: keyof Totals) => totals.reduce((n, t) => n + t[key], 0);
  const mean = meanSimilarity(sets.map((s) => s.similarity as Similarity | null));
  const name = workout.exercises.name;

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-1">
        <p className="text-sm opacity-60">{name}, workout finished</p>
        <h1 className="text-2xl font-semibold">
          {sum("correct_reps")} correct reps in {sum("attempts")} attempts
        </h1>
        <p className="text-sm">
          {sets.filter((s) => s.kind === "initial").length} of {workout.target_sets} sets of {workout.target_reps} reps
          {mean !== null && `, ${mean}% mean similarity`}.
        </p>
      </header>

      <ol className="space-y-5">
        {sets.map((set, i) => {
          const t = totals[i];
          const similarity = set.similarity as Similarity | null;
          return (
            <li key={set.id} className="space-y-2 border-t pt-4">
              <h2 className="font-medium">
                {set.kind === "repair" ? "Repair set" : "Set"} {set.set_no}
              </h2>
              <p className="text-sm opacity-70">
                {t.correct_reps} correct of {t.attempts} attempts, {t.abandoned_attempts} abandoned, {ENDED_BY[set.ended_by]}
                {similarity && `, ${similarity.overall}% similarity`}
                {set.repair_declined && ", repair set skipped"}.
              </p>
              <p className="leading-relaxed">{set.llm_feedback ?? "No feedback yet. If it is still being written, it appears when you reload this page."}</p>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-4">
        <Link href="/" className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
          Home
        </Link>
        <Link href={`/history/${exercise}/${id}`} className="text-sm underline">
          Replay it in History
        </Link>
        <Link href={`/workout/${exercise}/setup`} className="text-sm underline">
          Another {name.toLowerCase()} workout
        </Link>
      </div>
    </main>
  );
}
