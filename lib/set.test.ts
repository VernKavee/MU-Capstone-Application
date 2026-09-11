// Run with `npm run test:unit`. The one check that fails if the merge stops honouring
// ADR-0003: one record per attempt in order, frame ranges from the events, state
// durations from the frames, and violations carrying the state they fired in. Also the
// ADR-0004 rule for what follows a set.
import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyKeypoints, type SessionReport } from "./engine/types.ts";
import type { Rule } from "./exercise";
import type { KeypointFrame } from "./live/session.ts";
import { afterSet, buildAttempts, hasViolation, toKeypointFile, totalsOf } from "./set.ts";

const rules: Rule[] = [
  { name: "knee_depth", check: "knee_depth", priority: 1, scope: "rep", debounce_frames: 1, threshold: { depth_target: 100 }, messages: { en: "Lower to 90 degrees" }, highlight_joints: [] },
  { name: "back_straight", check: "back_straight", priority: 3, scope: "frame", debounce_frames: 10, threshold: { tilt_max: 55 }, messages: { en: "Keep back straight" }, highlight_joints: [] },
];

// Frames at 100 ms: one correct rep, one abandoned attempt, one incorrect rep.
const script: [string, KeypointFrame["event"], string[]][] = [
  ["Idle", "none", []],
  ["Concentric", "rep_started", []],
  ["Concentric", "none", []],
  ["Inflection", "none", []],
  ["Eccentric", "none", []],
  ["Idle", "rep_completed", []],
  ["Concentric", "rep_started", []],
  ["Concentric", "none", []],
  ["Idle", "rep_abandoned", []],
  ["Concentric", "rep_started", []],
  ["Concentric", "none", ["back_straight"]],
  ["Inflection", "none", []],
  ["Eccentric", "none", []],
  ["Idle", "rep_completed", ["knee_depth"]],
];
const frames: KeypointFrame[] = script.map(([state, event, violations], i) => ({ t: i * 100, state, event, violations, keypoints: emptyKeypoints() }));

const report: SessionReport = {
  schema_version: 4, generated_at: "", exercise_name: "squat", engine: "mediapipe",
  filter: { active: false, stage: null, name: null, params: null },
  ready_gate: { enabled: true, phase: "active", countdown_s: 3, ended_by_pose: false },
  total_attempts: 3, total_reps_completed: 2, total_reps_correct: 1, total_attempts_abandoned: 1,
  reps: [
    { rep_number: 1, correct: true, warnings: [], violations: [], rep_stats: { min_knee: 88 } },
    { rep_number: 2, correct: false, warnings: ["Lower to 90 degrees", "Keep back straight"], violations: ["knee_depth", "back_straight"], rep_stats: { knee_depth: 112 } },
  ],
  abandoned_attempts: [{ attempt_number: 1, counted: false, warnings: [], violations: [], rep_stats: {} }],
};

test("attempts merge the report with the frames", () => {
  const attempts = buildAttempts(frames, report, rules);
  assert.deepEqual(attempts.map((a) => [a.attempt_no, a.outcome, a.rep_number, a.frame_start, a.frame_end]), [
    [1, "correct", 1, 1, 5],
    [2, "abandoned", null, 6, 8],
    [3, "incorrect", 2, 9, 13],
  ]);
  assert.deepEqual(attempts[0].state_durations_s, { concentric: 0.2, inflection: 0.1, eccentric: 0.1 });
  assert.deepEqual(attempts[1].state_durations_s, { concentric: 0.2 });
  assert.equal(attempts[0].violations.length, 0);
  const [knee, back] = attempts[2].violations;
  assert.deepEqual([knee.rule, knee.state, knee.value, knee.threshold, knee.scope], ["knee_depth", "idle", 112, { depth_target: 100 }, "rep"]);
  assert.deepEqual([back.rule, back.state, back.value, back.message], ["back_straight", "concentric", null, "Keep back straight"]);
  assert.equal(attempts.every((a) => a.similarity === null), true);
  assert.equal(hasViolation(attempts), true);
  assert.equal(hasViolation(attempts.slice(0, 2)), false);
  assert.deepEqual(totalsOf(report), { attempts: 3, completed_reps: 2, correct_reps: 1, abandoned_attempts: 1 });
});

test("a record without an event keeps its place, without a frame range", () => {
  const attempts = buildAttempts(frames.slice(0, 9), report, rules);
  assert.equal(attempts.length, 3);
  assert.deepEqual([attempts[2].outcome, attempts[2].frame_start, attempts[2].frame_end], ["incorrect", null, null]);
});

test("the keypoint file is one flat row of 231 numbers per frame at capture rate", () => {
  const file = toKeypointFile(frames);
  assert.equal(file.frames.length, 14);
  assert.equal(file.fps, 10);
  assert.equal(file.frames[0].points.length, 33 * 7);
  assert.equal(file.joints.length, 33);
  assert.deepEqual(file.frames[13], { t: 1300, state: "Idle", event: "rep_completed", points: file.frames[13].points });
});

test("one repair set follows an initial set with any violation, then the rest or the end", () => {
  const attempts = buildAttempts(frames, report, rules);
  const clean = attempts.slice(0, 2);
  const abandonedWithViolation = [{ ...attempts[1], violations: attempts[2].violations }];
  assert.equal(afterSet({ kind: "initial", setNo: 1, attempts }, 3, false), "repair");
  assert.equal(afterSet({ kind: "initial", setNo: 1, attempts: abandonedWithViolation }, 3, false), "repair", "an abandoned attempt's violation counts");
  assert.equal(afterSet({ kind: "initial", setNo: 1, attempts }, 3, true), "rest", "a skipped repair set goes to the rest");
  assert.equal(afterSet({ kind: "repair", setNo: 1, attempts }, 3, false), "rest", "never a repair set after a repair set");
  assert.equal(afterSet({ kind: "initial", setNo: 3, attempts: clean }, 3, false), "finish");
  assert.equal(afterSet({ kind: "repair", setNo: 3, attempts }, 3, false), "finish");
});
