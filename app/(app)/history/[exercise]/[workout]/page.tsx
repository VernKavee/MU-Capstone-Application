import Link from "next/link";
import { notFound } from "next/navigation";
import { ruleBasedLogic } from "@/lib/exercise";
import { isMarkdown, plainFeedback, readFeedback } from "@/lib/feedback-text";
import { ENDED_BY, feedbackSummary, formatWhen, isUuid, meanSimilarity, setOrder } from "@/lib/history";
import { jointIndices } from "@/lib/live/skeleton";
import { BODY_PARTS, type Attempt, type SetSimilarity, type Totals } from "@/lib/set";
import { createClient } from "@/lib/supabase/server";
import { userTimeZone } from "@/lib/time-zone";
import { WhatToFix } from "../../../set-feedback";
import { Replay } from "./replay";
import { RetryFeedback } from "./retry-feedback";
import { BackLink } from "@/app/(app)/back-link";

const setName = (s: { set_no: number; kind: string }) => `${s.kind === "repair" ? "Repair set" : "Set"} ${s.set_no}`;

// Level 4 (REQUIREMENTS section 5): one workout. Every set is listed with its numbers and
// the chosen one (?set=) is shown in full: the video with the skeleton drawn from the
// keypoint file, similarity per region, every violation of every attempt, and the
// feedback. Only the chosen set's attempts, feedback, and file paths are fetched, and the
// files themselves only when Play is pressed.
export default async function WorkoutPage({ params, searchParams }: PageProps<"/history/[exercise]/[workout]">) {
  const { exercise: exerciseId, workout: id } = await params;
  const { set: chosen, error } = await searchParams;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const tz = await userTimeZone();
  const { data: workout } = await supabase
    .from("workouts")
    .select("id, started_at, ended_at, target_reps, target_sets, exercises!inner(name, rule_based_logic), sets(id, set_no, kind, ended_by, repair_declined, totals, similarity)")
    .eq("id", id)
    .eq("exercise_id", exerciseId)
    .maybeSingle()
    .throwOnError();
  if (!workout?.sets.length) notFound();
  const sets = [...workout.sets].sort(setOrder);
  const selected = sets.find((s) => s.id === chosen) ?? sets[0];
  // The same policies just returned this set, so exactly one row comes back.
  const { data: detail } = await supabase.from("sets").select("attempts, llm_feedback, video_url, keypoints_url").eq("id", selected.id).single().throwOnError();
  // Prompt v16's list of what to fix, else v15's opening paragraph, else the clamped text
  // (Markdown saved before v16 with its marks dropped).
  const fixes = detail.llm_feedback ? readFeedback(detail.llm_feedback).summary : null;
  const summary = detail.llm_feedback && !isMarkdown(detail.llm_feedback) ? feedbackSummary(detail.llm_feedback) : null;

  const name = workout.exercises.name;
  const totals = sets.map((s) => s.totals as Totals);
  const correct = totals.reduce((n, t) => n + t.correct_reps, 0);
  const tries = totals.reduce((n, t) => n + t.attempts, 0);
  const repairs = sets.filter((s) => s.kind === "repair").length;
  const mean = meanSimilarity(sets.map((s) => s.similarity as SetSimilarity | null));
  const highlight = Object.fromEntries(ruleBasedLogic(workout.exercises).rules.map((r) => [r.name, jointIndices(r.highlight_joints)]));
  const href = (setId: string) => `/history/${exerciseId}/${id}?set=${setId}`;

  return (
    <main className="space-y-6 p-6">
      <header className="space-y-2">
        <BackLink href={`/history/${exerciseId}`}>{name}</BackLink>
        <h1>{formatWhen(workout.started_at, tz)}</h1>
        <p className="text-sm text-muted">
          {workout.target_sets} {workout.target_sets === 1 ? "set" : "sets"} of {workout.target_reps}
          {repairs > 0 && `, ${repairs} repair ${repairs === 1 ? "set" : "sets"}`}. {correct} correct reps in {tries} attempts
          {mean !== null && `, ${mean}% mean similarity`}.{!workout.ended_at && " Not finished."}
        </p>
      </header>

      <nav aria-label="Sets of this workout">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sets.map((s, i) => {
            const on = s.id === selected.id;
            const score = (s.similarity as SetSimilarity | null)?.mean_score;
            const notes = [s.ended_by !== "target_reached" && ENDED_BY[s.ended_by], s.repair_declined && "repair skipped"].filter(Boolean);
            return (
              <li key={s.id}>
                <Link
                  href={href(s.id)}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={`block h-full rounded-xl border p-3 ${on ? "border-accent bg-accent text-accent-ink" : "bg-surface hover:border-accent"}`}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="whitespace-nowrap text-sm font-medium">{setName(s)}</span>
                    <span className="font-semibold tabular-nums">{score === undefined ? "–" : `${Math.round(score)}%`}</span>
                  </span>
                  <span className={`mt-1 block text-xs ${on ? "text-accent-ink/85" : "text-muted"}`}>
                    {totals[i].correct_reps} correct, {totals[i].attempts} attempts
                  </span>
                  {notes.length > 0 && <span className={`block text-xs ${on ? "text-accent-ink/85" : "text-muted"}`}>{notes.join(", ")}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Replay
        key={selected.id}
        video={detail.video_url}
        keypoints={detail.keypoints_url}
        attempts={detail.attempts as unknown as Attempt[]}
        highlight={highlight}
        // Keyed because Replay places both beside its own children, and elements built here
        // arrive on the client without the key check React gives its own JSX.
        regions={<BodyParts key="regions" similarity={selected.similarity as SetSimilarity | null} />}
        feedback={
          <section key="feedback" aria-labelledby="feedback-title" className="space-y-2">
            <h2 id="feedback-title" className="font-semibold">
              Feedback on {setName(selected).toLowerCase()}
            </h2>
            {detail.llm_feedback ? (
              <div className="space-y-2">
                {fixes ? (
                  <WhatToFix summary={fixes} attempts={detail.attempts as unknown as Attempt[]} />
                ) : summary ? (
                  <p className="whitespace-pre-line leading-relaxed">{summary}</p>
                ) : (
                  <p className="line-clamp-4 leading-relaxed">{plainFeedback(detail.llm_feedback)}</p>
                )}
                <Link href={`/history/${exerciseId}/${id}/feedback?set=${selected.id}`} className="inline-block text-sm font-semibold text-accent">
                  Read the full feedback
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted">No feedback was written for this set.</p>
                <RetryFeedback exercise={exerciseId} workout={id} set={selected.id} from="history" error={typeof error === "string" ? error : undefined} />
              </div>
            )}
          </section>
        }
      />
    </main>
  );
}

// The set's similarity: the mean score as the page's one big figure, then the body parts the
// exercise is scored on as meters on the same 0 to 100 scale.
function BodyParts({ similarity }: { similarity: SetSimilarity | null }) {
  if (!similarity) return <p className="text-sm text-muted">Similarity was not scored for this set.</p>;
  return (
    <section aria-label="Similarity to the expert motion" className="space-y-4">
      <p className="flex items-end gap-3">
        <span className="font-display text-7xl leading-[0.8] text-accent">{Math.round(similarity.mean_score)}</span>
        <span className="text-sm leading-snug text-muted">% similar to the expert motion, over the scored reps</span>
      </p>
      <dl className="space-y-2">
        {BODY_PARTS.filter((part) => similarity.body_parts[part] !== undefined).map((part) => (
          <div key={part} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3 text-sm">
            <dt className="first-letter:uppercase">{part.replace("_", " ")}</dt>
            <dd aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${similarity.body_parts[part]}%` }} />
            </dd>
            <dd className="text-right tabular-nums">{Math.round(similarity.body_parts[part]!)}%</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
