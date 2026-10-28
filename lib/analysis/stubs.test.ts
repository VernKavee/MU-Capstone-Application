// Run with `npm run test:unit`. The contracts of ADR-0007: similarity keeps the body parts a
// rep is scored on and nothing for an abandoned attempt, from the real service's answer and from
// the stub alike; feedback visibly carries the medical history.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { Attempt } from "../set.ts";
import type { FeedbackInput } from "./contracts.ts";
import { writeFeedback } from "./feedback.ts";
import { fromService, scoreSimilarity, type ServiceOutput } from "./similarity.ts";

// The service's answer for a rounded-back squat set against its built-in reference, as
// SeniorProject's tests/fixtures/similarity_pipeline_output_squat_rounded_45_vs_builtin.json records it.
const squat = (): ServiceOutput => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/similarity-output-squat.json"), "utf8"));

const attempt = (attempt_no: number, outcome: Attempt["outcome"], violations: string[] = []): Attempt => ({
  schema_version: 1, attempt_no, outcome, rep_number: null, frame_start: 0, frame_end: 1, state_durations_s: {},
  violations: violations.map((rule) => ({ rule, message: rule, priority: 1, scope: "rep", state: null, value: null, threshold: {} })),
  rep_stats: {}, similarity: null,
});

test("the service's answer keeps the squat's torso and legs, and no abandoned attempt", () => {
  const out = fromService(squat());
  assert.deepEqual(out.attempts.map((a) => a.attempt_no), [1, 2, 3, 5, 7], "attempts 4 and 6 were abandoned");
  for (const a of out.attempts) assert.deepEqual(Object.keys(a.similarity.body_parts), ["torso", "left_leg", "right_leg"], "no arm on a squat");
  assert.equal(out.attempts[0].similarity.score, 42.5);
  assert.deepEqual(out.set, { mean_score: 38.8, mean_score_correct: null, mean_score_incorrect: 38.8, body_parts: out.set.body_parts, weakest_body_part: "torso", model: "bpe_v3_seed2026" });
  assert.deepEqual(Object.keys(out.set.body_parts), ["torso", "left_leg", "right_leg"]);
});

test("a rep the service could not score keeps its reason and no number", () => {
  const raw = squat();
  Object.assign(raw.attempts[1], { score: null, skipped_reason: "pose lost for 0.8 s in a row" });
  const skipped = fromService(raw).attempts[1].similarity;
  assert.deepEqual([skipped.score, skipped.body_parts, skipped.skipped_reason], [null, {}, "pose lost for 0.8 s in a row"]);
});

test("an error from the service throws, so the set offers a retry", () => {
  const raw = { ...squat(), status: "error" as const, error: "target: landmarks.frame_size must be [width, height]" };
  assert.throws(() => fromService(raw), /frame_size/);
});

test("the stub: the exercise's parts per completed attempt, none for abandoned", async () => {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = await scoreSimilarity(
    { exercise_key: "squat", source: "set", side: null, totals: { attempts: 3, completed_reps: 2, correct_reps: 1, abandoned_attempts: 1 },
      landmarks: { schema_version: 1, joints: [], fields: ["x", "y", "z", "x_3d", "y_3d", "z_3d", "score"], fps: 30, frames: [] },
      attempts: [attempt(1, "correct"), attempt(2, "abandoned"), attempt(3, "incorrect")].map((a) => ({ ...a, violations: a.violations.map((v) => v.rule), side: null })) },
    random,
  );
  assert.deepEqual(out.attempts.map((a) => a.attempt_no), [1, 3]);
  for (const a of out.attempts) {
    assert.deepEqual(Object.keys(a.similarity.body_parts), ["torso", "left_leg", "right_leg"]);
    for (const v of [a.similarity.score!, ...Object.values(a.similarity.body_parts)]) assert.ok(v >= 0 && v <= 100);
  }
  assert.ok(out.attempts[0].similarity.score! > out.attempts[1].similarity.score!, "the stub scores a correct rep above an incorrect one");
  assert.deepEqual([out.set.mean_score_correct, out.set.mean_score_incorrect], [out.attempts[0].similarity.score, out.attempts[1].similarity.score]);
  assert.equal(out.set.model, "stub");
});

test("feedback quotes the medical history and names the worst violation", async () => {
  const input: FeedbackInput = {
    profile: { display_name: "A", age: 30, gender: "female", weight_kg: 60, height_cm: 165, medical_history: "broken left leg in 2024" },
    exercise: { id: "squat", name: "Squat", rules: [] },
    workout: { target_reps: 10, target_sets: 3, rest_seconds: 60, earlier_sets: [] },
    set: { set_no: 1, kind: "initial", ended_by: "target_reached", totals: { attempts: 3, completed_reps: 2, correct_reps: 1, abandoned_attempts: 1 },
      similarity: { mean_score: 80, mean_score_correct: 85, mean_score_incorrect: 75, body_parts: { torso: 70, left_leg: 85, right_leg: 84 }, weakest_body_part: "torso", model: "stub" }, feedback: null,
      attempts: [attempt(1, "correct"), attempt(2, "abandoned", ["Keep back straight"]), attempt(3, "incorrect", ["Keep back straight"])] },
    history: [],
  };
  const { feedback } = await writeFeedback(input, 0);
  assert.match(feedback, /broken left leg in 2024/);
  assert.match(feedback, /"Keep back straight", on 2 attempts/);
  assert.match(feedback, /lowest in the torso at 70%/);
});
