// The JSON contracts of ADR-0007. Similarity is Punnapat's component, feedback with
// retrieval is Sujira's. Each is one function; the stubs in this folder are replaced by an
// HTTP client to the real component, or by the component itself in TypeScript, without
// touching the caller in app/(app)/workout/[exercise]/live/actions.ts.
import type { Side } from "../engine/rules.ts";
import type { Rule } from "../exercise";
import type { Attempt, KeypointFile, Outcome, Similarity, Totals } from "../set.ts";

// The layout Punnapat agreed on 2026-10-05, SeniorProject's scratch/export_similarity.py.
// frame_start..frame_end are inclusive indexes into landmarks.frames.
export type SimilarityInput = {
  exercise_key: string;
  source: string; // the set's id
  side: Side | null; // the workout's chosen arm, null when the exercise has no choice
  totals: Totals;
  attempts: {
    attempt_no: number;
    outcome: Outcome;
    rep_number: number | null; // null for an abandoned attempt
    frame_start: number | null;
    frame_end: number | null;
    violations: string[]; // rule names
    side: string | null; // the engine's active_side for the attempt
  }[];
  // The stored keypoint file, each frame labelled with the attempt and rep it is inside:
  // null between attempts, and rep null inside an abandoned attempt.
  landmarks: Omit<KeypointFile, "frames"> & { frames: (KeypointFile["frames"][number] & { attempt: number | null; rep: number | null })[] };
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
