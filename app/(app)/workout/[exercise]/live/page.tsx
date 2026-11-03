import { notFound, redirect } from "next/navigation";
import { parseSetup, ruleBasedLogic, setupError, setupQuery } from "@/lib/exercise";
import { isUuid } from "@/lib/history";
import { resumePoint } from "@/lib/set";
import { createClient } from "@/lib/supabase/server";
import { LiveScreen } from "./live-screen";

// Sections 4.3 and 4.4: the camera opens, the ready gate and countdown run, then one set
// is counted live. The engine is configured from the row's rule_based_logic, never from
// the exercise name (ADR-0006). `workout` in the address is the workout this visit saves
// into, put there by the live screen after its first save, so a reload can pick it up.
export default async function LivePage({ params, searchParams }: PageProps<"/workout/[exercise]/live">) {
  const { exercise: id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: exercise } = await supabase.from("exercises").select("*").eq("id", id).maybeSingle().throwOnError();
  if (!exercise) notFound();
  const logic = ruleBasedLogic(exercise);
  let setup = parseSetup(query, logic);
  if (!setup) redirect(`/workout/${id}/setup?error=${setupError(logic)}`);

  let resume: { workoutId: string; setNo: number } | null = null;
  if (query.workout !== undefined) {
    const { data: workout } = isUuid(query.workout)
      ? await supabase
          .from("workouts")
          .select("target_reps, target_sets, rest_seconds, side, ended_at, sets(set_no, ended_at)")
          .eq("id", query.workout)
          .eq("exercise_id", id)
          .maybeSingle()
          .throwOnError()
      : { data: null };
    const setNo = workout && resumePoint(workout, new Date());
    if (!workout || !setNo) redirect(`/workout/${id}/live?${setupQuery(setup)}`);
    // The workout's own setup, so the resumed sets match the saved ones.
    setup = { reps: workout.target_reps, sets: workout.target_sets, rest: workout.rest_seconds, side: workout.side as typeof setup.side };
    resume = { workoutId: query.workout as string, setNo };
  }

  return (
    <LiveScreen
      exercise={{ id: exercise.id, name: exercise.name, engineKey: exercise.engine_key, landscape: exercise.landscape, logic }}
      setup={setup}
      resume={resume}
    />
  );
}
