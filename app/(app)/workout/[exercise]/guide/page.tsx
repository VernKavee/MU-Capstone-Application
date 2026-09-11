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
  const { data: exercise } = await supabase.from("exercises").select("*").eq("id", id).maybeSingle().throwOnError();
  if (!exercise) notFound();
  const rules = [...ruleBasedLogic(exercise).rules].sort((a, b) => a.priority - b.priority);

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-2">
        <h1>{exercise.name}</h1>
        <p className="text-sm opacity-70">
          {setup.sets} {setup.sets === 1 ? "set" : "sets"} of {setup.reps} reps, {setup.rest} s rest.{" "}
          <Link href={`/workout/${exercise.id}/setup`} className="underline">Change</Link>
        </p>
      </header>

      {/* On a laptop the video on the left, what to do on the right. */}
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        {exercise.guide_video_url ? (
          <video src={exercise.guide_video_url} controls playsInline className="w-full rounded-xl bg-black" />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-black text-sm text-ink/50 ring-1 ring-ink/10">
            Demonstration video not available yet
          </div>
        )}

        <div className="max-w-prose space-y-6">
          <p className="whitespace-pre-line leading-relaxed">{exercise.guide_text}</p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">What the coach checks</h2>
            <p className="text-sm opacity-70">A rep only counts when none of these fire. When more than one fires, the one listed first is shown.</p>
            {/* Each rule as its warning band looks on the live screen, in priority order. */}
            <ol className="space-y-2">
              {rules.map((rule) => (
                <li key={rule.name} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded-md bg-tape px-3 py-1 font-semibold text-tape-ink">{rule.messages.en}</span>
                  <span className="text-xs opacity-60">{rule.scope === "rep" ? "judged per rep" : "judged live"}</span>
                </li>
              ))}
            </ol>
          </section>

          <Link href={`/workout/${exercise.id}/live?reps=${setup.reps}&sets=${setup.sets}&rest=${setup.rest}`} className="btn">
            Open camera
          </Link>
        </div>
      </div>
    </main>
  );
}
