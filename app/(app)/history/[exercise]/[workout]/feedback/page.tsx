import Link from "next/link";
import { notFound } from "next/navigation";
import { formatWhen } from "@/lib/history";
import { createClient } from "@/lib/supabase/server";
import { userTimeZone } from "@/lib/time-zone";

// The feedback detail screen (REQUIREMENTS section 6): the full coaching text of one set
// (?set=), which level 4 shows only the start of. Fetches that set's feedback and labels.
export default async function FeedbackPage({ params, searchParams }: PageProps<"/history/[exercise]/[workout]/feedback">) {
  const { exercise: exerciseId, workout: workoutId } = await params;
  const { set: setId } = await searchParams;
  if (typeof setId !== "string") notFound();
  const supabase = await createClient();
  const tz = await userTimeZone();
  const { data: set } = await supabase
    .from("sets")
    .select("set_no, kind, llm_feedback, workouts!inner(started_at, target_sets, exercise_id, exercises!inner(name))")
    .eq("id", setId)
    .eq("workout_id", workoutId)
    .eq("workouts.exercise_id", exerciseId)
    .maybeSingle();
  if (!set) notFound();
  const { workouts: workout } = set;

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-1">
        <Link href={`/history/${exerciseId}/${workoutId}?set=${setId}`} className="text-sm underline">
          {workout.exercises.name}, {formatWhen(workout.started_at, tz)}
        </Link>
        <h1 className="text-2xl font-semibold">
          Feedback on {set.kind === "repair" ? "repair set" : "set"} {set.set_no} of {workout.target_sets}
        </h1>
      </header>
      {set.llm_feedback ? (
        <p className="max-w-prose whitespace-pre-line text-lg leading-relaxed">{set.llm_feedback}</p>
      ) : (
        <p className="opacity-70">No feedback was written for this set.</p>
      )}
      <p className="max-w-prose text-sm opacity-70">
        Written by the coaching component from this set&apos;s attempts and similarity, your earlier sets and past workouts of this
        exercise, and your profile, medical history included.
      </p>
    </main>
  );
}
