import Form from "next/form";
import { notFound } from "next/navigation";
import { ruleBasedLogic, SETUP_LIMITS } from "@/lib/exercise";
import { createClient } from "@/lib/supabase/server";
import { Stepper } from "./stepper";
import { BackLink } from "@/app/(app)/back-link";

const row = "flex items-center justify-between gap-4 py-3 text-lg";
// The arm, as two pills: the radio itself is hidden, the pill shows the choice and the focus.
const pill =
  "cursor-pointer rounded-lg border border-line bg-surface px-4 py-2 font-display text-3xl leading-none has-checked:border-accent has-checked:bg-accent has-checked:text-accent-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-tape";

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
      <BackLink href="/">Home</BackLink>
      <h1>{exercise.name}</h1>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <Form action={`/workout/${exercise.id}/guide`} className="space-y-6">
        <div className="card divide-y divide-line px-4">
          <Stepper name="reps" label="Reps per set" min={SETUP_LIMITS.reps.min} max={SETUP_LIMITS.reps.max} initial={SETUP_LIMITS.reps.default} />
          <Stepper name="sets" label="Sets" min={SETUP_LIMITS.sets.min} max={SETUP_LIMITS.sets.max} initial={SETUP_LIMITS.sets.default} />
          <Stepper name="rest" label="Rest (seconds)" min={SETUP_LIMITS.rest.min} max={SETUP_LIMITS.rest.max} initial={SETUP_LIMITS.rest.default} by={5} />
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
