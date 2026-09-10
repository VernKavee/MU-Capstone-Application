// The JSON contracts of ADR-0007. Similarity is Punnapat's component, feedback with
// retrieval is Sujira's. Each is one function; the stubs in this folder are replaced by an
// HTTP client to the real component, or by the component itself in TypeScript, without
// touching the caller in app/(app)/workout/[exercise]/live/actions.ts.
import type { Rule } from "../exercise";
import type { Attempt, KeypointFile, Outcome, Similarity, Totals } from "../set.ts";

export type SimilarityInput = {
  exercise_key: string;
  landmarks: KeypointFile;
  attempts: { attempt_no: number; frame_start: number | null; frame_end: number | null; outcome: Outcome }[];
};

// Abandoned attempts get no similarity (ADR-0003); the set's numbers average the
// completed reps.
export type SimilarityOutput = {
  attempts: { attempt_no: number; similarity: Similarity }[];
  set: Similarity;
};

export type SetSummary = {
  set_no: number;
  kind: "initial" | "repair";
  ended_by: string;
  totals: Totals;
  similarity: Similarity | null;
  feedback: string | null;
};

export type FeedbackInput = {
  profile: { display_name: string; age: number; gender: string; weight_kg: number; height_cm: number; medical_history: string };
  exercise: { id: string; name: string; rules: Rule[] };
  workout: { target_reps: number; target_sets: number; rest_seconds: number; earlier_sets: SetSummary[] };
  set: SetSummary & { attempts: Attempt[] };
  // Past workouts of the same exercise, newest first, at most HISTORY_WORKOUTS of them.
  history: { started_at: string; target_reps: number; target_sets: number; sets: SetSummary[] }[];
};

export type FeedbackOutput = { feedback: string };

// The bound on past workouts in the feedback input, decided in Phase 4 (ADR-0007).
export const HISTORY_WORKOUTS = 5;
