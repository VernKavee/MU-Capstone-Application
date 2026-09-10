// Feedback stub (ADR-0007). Sujira's component replaces this file with the LLM call and
// the knowledge base retrieval. The text is assembled from the input so the seam is
// visibly real: the medical history is quoted back, the set's violations are named, and
// the earlier sets of the workout and the past workouts are counted.
import type { FeedbackInput, FeedbackOutput } from "./contracts.ts";

const DELAY_MS = 1500; // a short artificial wait so the loading state is exercised

export async function writeFeedback(input: FeedbackInput, delayMs = DELAY_MS): Promise<FeedbackOutput> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const { set, workout, history, profile, exercise } = input;
  const counts = new Map<string, number>();
  for (const attempt of set.attempts) for (const v of attempt.violations) counts.set(v.message, (counts.get(v.message) ?? 0) + 1);
  const worst = [...counts].sort((a, b) => b[1] - a[1])[0];
  const lowest = set.similarity
    ? (Object.entries(set.similarity).filter(([k]) => k !== "overall") as [string, number][]).sort((a, b) => a[1] - b[1])[0]
    : null;
  const earlierIssues = workout.earlier_sets.reduce((n, s) => n + s.totals.attempts - s.totals.correct_reps, 0);

  const lines = [
    `${set.kind === "repair" ? "Repair set" : "Set"} ${set.set_no} of ${workout.target_sets}, ${exercise.name.toLowerCase()}: ${set.totals.correct_reps} correct ${set.totals.correct_reps === 1 ? "rep" : "reps"} in ${set.totals.attempts} ${set.totals.attempts === 1 ? "attempt" : "attempts"}.`,
    worst
      ? `The most frequent issue was "${worst[0]}", on ${worst[1]} ${worst[1] === 1 ? "attempt" : "attempts"}. Slow the movement down and fix that one first.`
      : "No rule fired on any attempt. Keep the same tempo next set.",
    set.similarity && lowest
      ? `Your motion matched the expert ${set.similarity.overall}% overall, lowest in the ${lowest[0].replace("_", " and ")} at ${lowest[1]}%.`
      : "Similarity is not available for this set.",
    workout.earlier_sets.length
      ? `Earlier in this workout you had ${earlierIssues} ${earlierIssues === 1 ? "attempt" : "attempts"} that did not count over ${workout.earlier_sets.length} ${workout.earlier_sets.length === 1 ? "set" : "sets"}.`
      : "This is the first set of the workout.",
    history.length
      ? `Your last ${history.length} ${exercise.name.toLowerCase()} ${history.length === 1 ? "workout" : "workouts"} ${history.length === 1 ? "is" : "are"} in the context.`
      : `This is your first ${exercise.name.toLowerCase()} workout on record.`,
    `Your profile notes "${profile.medical_history}", so this advice would be checked against it.`,
    "(Stub feedback: no language model was called.)",
  ];
  return { feedback: lines.join(" ") };
}
