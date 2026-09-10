import Link from "next/link";
import { notFound } from "next/navigation";
import { ruleBasedLogic } from "@/lib/exercise";
import { ENDED_BY, formatWhen, meanSimilarity, setOrder } from "@/lib/history";
import { jointIndices } from "@/lib/live/skeleton";
import { REGIONS, type Attempt, type Similarity, type Totals } from "@/lib/set";
import { createClient } from "@/lib/supabase/server";
import { userTimeZone } from "@/lib/time-zone";
import { Replay } from "./replay";

const setName = (s: { set_no: number; kind: string }) => `${s.kind === "repair" ? "Repair set" : "Set"} ${s.set_no}`;

// Level 4 (REQUIREMENTS section 5): one workout. Every set is listed with its numbers and
// the chosen one (?set=) is shown in full: the video with the skeleton drawn from the
// keypoint file, similarity per region, every violation of every attempt, and the
// feedback. Only the chosen set's attempts, feedback, and file paths are fetched, and the
// files themselves only when Play is pressed.
export default async function WorkoutPage({ params, searchParams }: PageProps<"/history/[exercise]/[workout]">) {
  const { exercise: exerciseId, workout: id } = await params;
  const { set: chosen } = await searchParams;
  const supabase = await createClient();
  const tz = await userTimeZone();
  const { data: workout } = await supabase
    .from("workouts")
    .select("id, started_at, target_reps, target_sets, exercises!inner(name, rule_based_logic), sets(id, set_no, kind, ended_by, repair_declined, totals, similarity)")
    .eq("id", id)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  if (!workout?.sets.length) notFound();
  const sets = [...workout.sets].sort(setOrder);
  const selected = sets.find((s) => s.id === chosen) ?? sets[0];
  const { data: detail } = await supabase.from("sets").select("attempts, llm_feedback, video_url, keypoints_url").eq("id", selected.id).single();
  if (!detail) notFound();

  const name = workout.exercises.name;
  const totals = sets.map((s) => s.totals as Totals);
  const correct = totals.reduce((n, t) => n + t.correct_reps, 0);
  const tries = totals.reduce((n, t) => n + t.attempts, 0);
  const repairs = sets.filter((s) => s.kind === "repair").length;
  const mean = meanSimilarity(sets.map((s) => s.similarity as Similarity | null));
  const highlight = Object.fromEntries(ruleBasedLogic(workout.exercises).rules.map((r) => [r.name, jointIndices(r.highlight_joints)]));
  const href = (setId: string) => `/history/${exerciseId}/${id}?set=${setId}`;

  return (
    <main data-wide className="space-y-6 p-6">
      <header className="space-y-1">
        <Link href={`/history/${exerciseId}`} className="text-sm underline">
          {name}
        </Link>
        <h1 className="text-2xl font-semibold">{formatWhen(workout.started_at, tz)}</h1>
        <p className="text-sm opacity-70">
          {workout.target_sets} {workout.target_sets === 1 ? "set" : "sets"} of {workout.target_reps}
          {repairs > 0 && `, ${repairs} repair ${repairs === 1 ? "set" : "sets"}`}. {correct} correct reps in {tries} attempts
          {mean !== null && `, ${mean}% mean similarity`}.
        </p>
      </header>

      <nav aria-label="Sets of this workout">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {sets.map((s, i) => {
            const on = s.id === selected.id;
            const overall = (s.similarity as Similarity | null)?.overall;
            const notes = [s.ended_by !== "target_reached" && ENDED_BY[s.ended_by], s.repair_declined && "repair skipped"].filter(Boolean);
            return (
              <li key={s.id}>
                <Link
                  href={href(s.id)}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={`block h-full rounded-lg border p-3 ${on ? "border-foreground bg-foreground text-background" : "hover:border-foreground"}`}
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="whitespace-nowrap text-sm font-medium">{setName(s)}</span>
                    <span className="font-semibold tabular-nums">{overall === undefined ? "–" : `${overall}%`}</span>
                  </span>
                  <span className="mt-1 block text-xs opacity-70">
                    {totals[i].correct_reps} correct, {totals[i].attempts} attempts
                  </span>
                  {notes.length > 0 && <span className="block text-xs opacity-70">{notes.join(", ")}</span>}
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
        regions={<Regions key="regions" similarity={selected.similarity as Similarity | null} />}
        feedback={
          <section key="feedback" aria-labelledby="feedback-title" className="space-y-2">
            <h2 id="feedback-title" className="font-medium">
              Feedback on {setName(selected).toLowerCase()}
            </h2>
            {detail.llm_feedback ? (
              <div className="space-y-2">
                <p className="line-clamp-4 leading-relaxed">{detail.llm_feedback}</p>
                <Link href={`/history/${exerciseId}/${id}/feedback?set=${selected.id}`} className="inline-block text-sm underline">
                  Read the full feedback
                </Link>
              </div>
            ) : (
              <p className="text-sm opacity-70">No feedback was written for this set.</p>
            )}
          </section>
        }
      />
    </main>
  );
}

// The set's similarity: the overall number as the page's one big figure, then the five
// regions as meters on the same 0 to 100 scale.
function Regions({ similarity }: { similarity: Similarity | null }) {
  if (!similarity) return <p className="text-sm opacity-70">Similarity was not scored for this set.</p>;
  return (
    <section aria-label="Similarity to the expert motion" className="space-y-4">
      <p className="flex items-end gap-3">
        <span className="font-display text-7xl leading-[0.8]">{similarity.overall}</span>
        <span className="text-sm leading-snug opacity-70">% similar to the expert motion, over the completed reps</span>
      </p>
      <dl className="space-y-2">
        {REGIONS.map((region) => (
          <div key={region} className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3 text-sm">
            <dt className="first-letter:uppercase">{region.replace("_", " and ")}</dt>
            <dd aria-hidden className="h-2 overflow-hidden rounded-full bg-foreground/10">
              <span className="block h-full rounded-full bg-foreground" style={{ width: `${similarity[region]}%` }} />
            </dd>
            <dd className="text-right tabular-nums">{similarity[region]}%</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
