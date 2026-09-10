import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { parseSetup, ruleBasedLogic } from "@/lib/exercise";
import { createClient } from "@/lib/supabase/server";

// Section 4.2: guide text and the demonstration video before the camera opens.
export default async function GuidePage({ params, searchParams }: PageProps<"/workout/[exercise]/guide">) {
  const { exercise: id } = await params;
  const setup = parseSetup(await searchParams);
  if (!setup) redirect(`/workout/${id}/setup?error=${encodeURIComponent("Check the reps, sets, and rest values.")}`);

  const supabase = await createClient();
  const { data: exercise } = await supabase.from("exercises").select("*").eq("id", id).maybeSingle();
  if (!exercise) notFound();
  const rules = [...ruleBasedLogic(exercise).rules].sort((a, b) => a.priority - b.priority);

  return (
    <main className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{exercise.name}</h1>
        <p className="text-sm">
          {setup.sets} {setup.sets === 1 ? "set" : "sets"} of {setup.reps} reps, {setup.rest} s rest.{" "}
          <Link href={`/workout/${exercise.id}/setup`} className="underline">Change</Link>
        </p>
      </header>

      {exercise.guide_video_url ? (
        <video src={exercise.guide_video_url} controls playsInline className="w-full rounded-lg" />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-lg bg-foreground/5 text-sm opacity-60">
          Demonstration video not available yet
        </div>
      )}

      <p className="whitespace-pre-line">{exercise.guide_text}</p>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">What the coach checks</h2>
        <ol className="list-decimal space-y-1 pl-5">
          {rules.map((rule) => (
            <li key={rule.name}>
              {rule.messages.en}{" "}
              <span className="text-xs opacity-60">{rule.scope === "rep" ? "judged per rep" : "judged live"}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs opacity-60">A rep only counts when none of these fire.</p>
      </section>

      <button type="button" disabled className="rounded bg-black px-4 py-2 text-white opacity-50 dark:bg-white dark:text-black">
        Open camera
      </button>
      <p className="text-xs opacity-60">The camera screen arrives in Phase 3.</p>
    </main>
  );
}
