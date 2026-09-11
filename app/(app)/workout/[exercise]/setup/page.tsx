import Form from "next/form";
import { notFound } from "next/navigation";
import { SETUP_LIMITS } from "@/lib/exercise";
import { createClient } from "@/lib/supabase/server";

// The three numbers in the counter's face, as they will read on the live screen.
const field = "w-24 rounded-lg border border-ink/25 bg-ink/5 px-2 py-1 text-right font-display text-4xl leading-none tabular-nums";
const row = "flex items-center justify-between gap-4 py-3";

// Section 4.1. The three numbers travel to the guide screen in the query string; nothing
// is stored until the first set is saved (ADR-0004).
export default async function SetupPage({ params, searchParams }: PageProps<"/workout/[exercise]/setup">) {
  const { exercise: id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: exercise } = await supabase.from("exercises").select("id, name").eq("id", id).maybeSingle().throwOnError();
  if (!exercise) notFound();

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
        </div>
        <button type="submit" className="btn">
          Continue to the guide
        </button>
      </Form>
    </main>
  );
}
