import { notFound, redirect } from "next/navigation";
import { parseSetup, ruleBasedLogic } from "@/lib/exercise";
import { createClient } from "@/lib/supabase/server";
import { LiveScreen } from "./live-screen";

// Sections 4.3 and 4.4: the camera opens, the ready gate and countdown run, then one set
// is counted live. The engine is configured from the row's rule_based_logic, never from
// the exercise name (ADR-0006).
export default async function LivePage({ params, searchParams }: PageProps<"/workout/[exercise]/live">) {
  const { exercise: id } = await params;
  const setup = parseSetup(await searchParams);
  if (!setup) redirect(`/workout/${id}/setup?error=${encodeURIComponent("Check the reps, sets, and rest values.")}`);

  const supabase = await createClient();
  const { data: exercise } = await supabase.from("exercises").select("*").eq("id", id).maybeSingle();
  if (!exercise) notFound();

  return (
    <LiveScreen
      exercise={{ id: exercise.id, name: exercise.name, engineKey: exercise.engine_key, logic: ruleBasedLogic(exercise) }}
      setup={setup}
    />
  );
}
