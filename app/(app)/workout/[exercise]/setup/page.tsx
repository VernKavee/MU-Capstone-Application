import Form from "next/form";
import { notFound } from "next/navigation";
import { ruleBasedLogic, SETUP_LIMITS } from "@/lib/exercise";
import { createClient } from "@/lib/supabase/server";

// The three numbers in the counter's face, as they will read on the live screen.
const field = "w-24 rounded-lg border border-ink/25 bg-ink/5 px-2 py-1 text-right font-display text-4xl leading-none tabular-nums";
const row = "flex items-center justify-between gap-4 py-3";
// The arm, as two pills: the radio itself is hidden, the pill shows the choice and the focus.
const pill =
  "cursor-pointer rounded-lg border border-ink/25 bg-ink/5 px-4 py-2 font-display text-3xl leading-none has-checked:border-ink has-checked:bg-ink has-checked:text-background has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-tape";

// Section 4.1. The three numbers, and the arm where the row asks for one, travel to the
// guide screen in the query string; nothing is stored until the first set is saved
// (ADR-0004). The arm has no default: the user picks it.
export default async function SetupPage({ params, searchParams }: PageProps<"/workout/[exercise]/setup">) {
  const { exercise: id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: exercise } = await supabase.from("exercises").select("id, name, rule_based_logic").eq("id", id).maybeSingle().throwOnError();
  if (!exercise) notFound();
  const choosesSide = ruleBasedLogic(exercise).state_machine.chooses_side;

  return (
    <main className="max-w-md space-y-6 p-6">
      <h1>{exercise.name}</h1>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <Form action={`/workout/${exercise.id}/guide`} className="space-y-6">
        <div className="divide-y border-y">
          <label className={row}>
            Reps per set
            <input name="reps" type="number" required {...SETUP_LIMITS.reps} defaultValue={SETUP_LIMITS.reps.default} className={field} />
          </label>
          <label className={row}>
            Number of sets
            <input name="sets" type="number" required {...SETUP_LIMITS.sets} defaultValue={SETUP_LIMITS.sets.default} className={field} />
          </label>
          <label className={row}>
            Rest between sets (seconds)
            <input name="rest" type="number" required {...SETUP_LIMITS.rest} defaultValue={SETUP_LIMITS.rest.default} className={field} />
          </label>
          {choosesSide && (
            <div role="radiogroup" aria-labelledby="arm" className={row}>
              <span id="arm">Arm</span>
              <span className="flex gap-2">
                {(["left", "right"] as const).map((side) => (
                  <label key={side} className={pill}>
                    <input type="radio" name="side" value={side} required className="sr-only" />
                    {side === "left" ? "Left" : "Right"}
                  </label>
                ))}
              </span>
            </div>
          )}
        </div>
        <button type="submit" className="btn">
          Continue to the guide
        </button>
      </Form>
    </main>
  );
}
