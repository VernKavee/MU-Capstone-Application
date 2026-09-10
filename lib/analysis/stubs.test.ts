// Run with `npm run test:unit`. The stubs honour the contracts of ADR-0007: six numbers
// for every completed attempt and none for an abandoned one, and feedback that visibly
// carries the medical history.
import assert from "node:assert/strict";
import { test } from "node:test";
import { REGIONS, type Attempt } from "../set.ts";
import type { FeedbackInput } from "./contracts.ts";
import { writeFeedback } from "./feedback.ts";
import { scoreSimilarity } from "./similarity.ts";

const attempt = (attempt_no: number, outcome: Attempt["outcome"], violations: string[] = []): Attempt => ({
  schema_version: 1, attempt_no, outcome, rep_number: null, frame_start: 0, frame_end: 1, state_durations_s: {},
  violations: violations.map((rule) => ({ rule, message: rule, priority: 1, scope: "rep", state: null, value: null, threshold: {} })),
  rep_stats: {}, similarity: null,
});

test("similarity: six numbers per completed attempt, none for abandoned", async () => {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out = await scoreSimilarity(
    { exercise_key: "squat", landmarks: { schema_version: 1, joints: [], fields: ["x", "y", "z", "x_3d", "y_3d", "z_3d", "score"], fps: 30, frames: [] },
      attempts: [attempt(1, "correct"), attempt(2, "abandoned"), attempt(3, "incorrect")] },
    random,
  );
  assert.deepEqual(out.attempts.map((a) => a.attempt_no), [1, 3]);
  for (const a of out.attempts) {
    assert.deepEqual(Object.keys(a.similarity).sort(), ["overall", ...REGIONS].sort());
    for (const v of Object.values(a.similarity)) assert.ok(v >= 0 && v <= 100 && Number.isInteger(v));
  }
  assert.ok(out.attempts[0].similarity.overall > out.attempts[1].similarity.overall, "a correct rep scores above an incorrect one");
  assert.ok(out.set.overall > 0);
});

test("feedback quotes the medical history and names the worst violation", async () => {
  const input: FeedbackInput = {
    profile: { display_name: "A", age: 30, gender: "female", weight_kg: 60, height_cm: 165, medical_history: "broken left leg in 2024" },
    exercise: { id: "squat", name: "Squat", rules: [] },
    workout: { target_reps: 10, target_sets: 3, rest_seconds: 60, earlier_sets: [] },
    set: { set_no: 1, kind: "initial", ended_by: "target_reached", totals: { attempts: 3, completed_reps: 2, correct_reps: 1, abandoned_attempts: 1 },
      similarity: { overall: 80, head_neck: 90, back_core: 85, hips_pelvis: 70, knees: 75, ankles_feet: 80 }, feedback: null,
      attempts: [attempt(1, "correct"), attempt(2, "abandoned", ["Keep back straight"]), attempt(3, "incorrect", ["Keep back straight"])] },
    history: [],
  };
  const { feedback } = await writeFeedback(input, 0);
  assert.match(feedback, /broken left leg in 2024/);
  assert.match(feedback, /"Keep back straight", on 2 attempts/);
  assert.match(feedback, /lowest in the hips and pelvis at 70%/);
});
