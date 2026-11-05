import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { parseSetup, ruleBasedLogic, setupError, setupQuery } from "@/lib/exercise";
import { createClient } from "@/lib/supabase/server";
import { BackLink } from "@/app/(app)/back-link";

// Section 4.2: guide text and the demonstration video before the camera opens.
export default async function GuidePage({ params, searchParams }: PageProps<"/workout/[exercise]/guide">) {
  const { exercise: id } = await params;
  const supabase = await createClient();
  const { data: exercise } = await supabase.from("exercises").select("*").eq("id", id).maybeSingle().throwOnError();
  if (!exercise) notFound();
  const logic = ruleBasedLogic(exercise);
  const setup = parseSetup(await searchParams, logic);
  if (!setup) redirect(`/workout/${id}/setup?error=${setupError(logic)}`);
  const rules = [...logic.rules].sort((a, b) => a.priority - b.priority);

  return (
    <main className="space-y-6 p-6">
      <BackLink href={`/workout/${exercise.id}/setup`}>Setup</BackLink>
      <header className="space-y-2">
        <h1>{exercise.name}</h1>
        <p className="text-sm text-muted">
          {setup.sets} {setup.sets === 1 ? "set" : "sets"} of {setup.reps} reps, {setup.rest} s rest
          {setup.side && `, ${setup.side} arm`}.
        </p>
      </header>

      {/* On a laptop the video on the left, what to do on the right. */}
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        {exercise.guide_video_url ? (
          <video src={exercise.guide_video_url} controls playsInline className="w-full rounded-xl bg-black" />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-surface-2 text-sm text-muted">
            Demonstration video not available yet
          </div>
        )}

        <div className="max-w-prose space-y-6">
          <p className="whitespace-pre-line leading-relaxed">{exercise.guide_text}</p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">What the coach checks</h2>
            <p className="text-sm text-muted">A rep only counts when none of these fire. When more than one fires, the one listed first is shown.</p>
            {/* Each rule as its warning band looks on the live screen, in priority order. */}
            <ol className="space-y-2">
              {rules.map((rule) => (
                <li key={rule.name} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded-md bg-tape px-3 py-1 font-semibold text-tape-ink">{rule.messages.en}</span>
                  <span className="text-xs text-muted">{rule.scope === "rep" ? "judged per rep" : "judged live"}</span>
                </li>
              ))}
            </ol>
          </section>

          <Link href={`/workout/${exercise.id}/live?${setupQuery(setup)}`} className="btn">
            Open camera
          </Link>
        </div>
      </div>
    </main>
  );
}
