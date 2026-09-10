import Form from "next/form";
import { notFound } from "next/navigation";
import { SETUP_LIMITS } from "@/lib/exercise";
import { createClient } from "@/lib/supabase/server";

const field = "mt-1 w-full rounded border p-2";

// Section 4.1. The three numbers travel to the guide screen in the query string; nothing
// is stored until the first set is saved (ADR-0004).
export default async function SetupPage({ params, searchParams }: PageProps<"/workout/[exercise]/setup">) {
  const { exercise: id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: exercise } = await supabase.from("exercises").select("id, name").eq("id", id).maybeSingle();
  if (!exercise) notFound();

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">{exercise.name}</h1>
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>
      )}
      <Form action={`/workout/${exercise.id}/guide`} className="space-y-4">
        <label className="block text-sm">
          Reps per set
          <input name="reps" type="number" required {...SETUP_LIMITS.reps} defaultValue={SETUP_LIMITS.reps.default} className={field} />
        </label>
        <label className="block text-sm">
          Number of sets
          <input name="sets" type="number" required {...SETUP_LIMITS.sets} defaultValue={SETUP_LIMITS.sets.default} className={field} />
        </label>
        <label className="block text-sm">
          Rest between sets (seconds)
          <input name="rest" type="number" required {...SETUP_LIMITS.rest} defaultValue={SETUP_LIMITS.rest.default} className={field} />
        </label>
        <button type="submit" className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
          Continue to the guide
        </button>
      </Form>
    </main>
  );
}
