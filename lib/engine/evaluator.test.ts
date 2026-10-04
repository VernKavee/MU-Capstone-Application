// Run with `npm run test:unit`. The floor bar cases are ported from the research repo's
// tests/test_exercise_session.py (test_floor_bar_*); the evaluator cases pin the
// orderings of WEB_APP_PORT.md section 10 and the rule-named values of section 8.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rule } from "../exercise";
import { ExerciseSession, FloorBar, FormEvaluator } from "./evaluator.ts";
import { accumulatorFor } from "./rules.ts";
import { emptyKeypoints, type Keypoints, type LandmarkName } from "./types.ts";

const close = (actual: number | null | undefined, expected: number) =>
  assert.ok(typeof actual === "number" && Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// Both arms: shoulders at shoulderY, wrists at wristY (world y points down), each elbow
// bent out sideways so both segments stay 0.5 long: arm length 1 at any depth.
function arms(shoulderY: number, wristY: number, rightWristScore = 1, rightWristY: number | null = null): Keypoints {
  const kp = emptyKeypoints();
  const put = (name: LandmarkName, y: number, x: number, z = 0, score = 1) => (kp[name] = { x: 0, y: 0, z: 0, x_3d: x, y_3d: y, z_3d: z, score });
  const half = (wristY - shoulderY) / 2;
  for (const [side, x] of [["left", -0.2], ["right", 0.2]] as const) {
    put(`${side}_shoulder`, shoulderY, x);
    put(`${side}_elbow`, shoulderY + half, x, Math.sqrt(0.25 - half ** 2));
    const right = side === "right";
    put(`${side}_wrist`, right && rightWristY !== null ? rightWristY : wristY, x, 0, right ? rightWristScore : 1);
  }
  return kp;
}

test("floor bar: mid-shoulder height above the wrists, in arm lengths", () => {
  close(new FloorBar().update(arms(0, 1)), 1);
  close(new FloorBar().update(arms(0.6, 1)), 0.4);
});

test("floor bar: a hidden wrist is held where the hands were last seen", () => {
  const bar = new FloorBar();
  bar.update(arms(0, 1));
  close(bar.update(arms(0.6, 1, 0.1, 0.7)), 0.4);
  close(new FloorBar().update(arms(0.6, 1, 0.1, 0.7)), 0.25); // no held vector: the guess as read
});

test("floor bar: zeroed 3D gives no reading, and the session reset clears the held wrist", () => {
  assert.equal(new FloorBar().update(emptyKeypoints()), null);
  const session = new ExerciseSession(
    {
      source: "test",
      state_machine: {
        states: ["Idle", "Concentric", "Inflection", "Eccentric"],
        thresholds: { thr_standing: 0.9, thr_inflection: 0.54, thr_descending: 0.85, hysteresis_buffer: 0.1, consecutive_frames_req: 3 },
        arming: { joints: ["shoulder", "elbow", "wrist"], ready_tilt_min: 60, ready_tilt_max: null },
        confidence_joints: ["shoulder", "elbow", "wrist"],
      },
      placement: { yaw_center: 45, yaw_tol: 25 },
      rules: [],
    },
    "pushup",
  );
  session.floorBar!.update(arms(0, 1));
  assert.notEqual(session.floorBar!.wristVec, null);
  session.reset();
  assert.equal(session.floorBar!.wristVec, null);
});

const rule = (r: Partial<Rule> & Pick<Rule, "name" | "priority" | "scope" | "threshold">): Rule => ({
  check: r.name,
  debounce_frames: r.scope === "frame" ? 10 : 1,
  messages: { en: r.name },
  highlight_joints: [],
  ...r,
});
const CURL_RULES = [
  rule({ name: "elbow_flare", priority: 1, scope: "frame", threshold: { flare_max: 45 } }),
  rule({ name: "partial_curl", priority: 2, scope: "rep", threshold: { flex_target: 55, ext_target: 145 } }),
];

// A curl frame: the left arm with the given elbow angle and upper-arm swing.
function curlFrame(elbow: number, flare = 20): [Record<string, number>, Keypoints] {
  const kp = emptyKeypoints();
  const put = (name: LandmarkName, x: number, y: number, z = 0) => (kp[name] = { x: 0, y: 0, z: 0, x_3d: x, y_3d: y, z_3d: z, score: 1 });
  put("left_shoulder", -0.2, -0.5);
  put("left_hip", -0.2, 0);
  put("left_elbow", -0.2 - 0.3 * Math.sin((flare * Math.PI) / 180), -0.5 + 0.3 * Math.cos((flare * Math.PI) / 180));
  put("right_shoulder", 0.2, -0.5);
  put("right_hip", 0.2, 0);
  return [{ left_elbow: elbow, right_elbow: 175, left_shoulder_angle: flare, right_shoulder_angle: 10 }, kp];
}

test("evaluator: a frame rule needs its debounce, records once, and shows the top priority", () => {
  const ev = new FormEvaluator(CURL_RULES, accumulatorFor("dumbbell_biceps_curls", CURL_RULES));
  const step = (elbow: number, flare: number, event: "none" | "rep_started" | "rep_completed" = "none") =>
    ev.process(...curlFrame(elbow, flare), event, "left");
  assert.deepEqual(step(150, 60, "rep_started"), []); // streak 1
  for (let i = 0; i < 8; i++) assert.deepEqual(step(120, 60), []);
  assert.deepEqual(step(100, 60), ["elbow_flare"]); // the tenth frame
  step(50, 20); // streak broken
  // Completed at 150 after a top of 50: partial_curl passes, elbow_flare stays recorded.
  assert.deepEqual(step(150, 20, "rep_completed"), []);
  const [rep] = ev.reps;
  assert.equal(rep.correct, false);
  assert.deepEqual(rep.violations, ["elbow_flare"]);
  assert.equal(rep.active_side, "left");
  assert.equal(rep.rep_stats.min_elbow, 50);
  assert.equal(rep.rep_stats.partial_curl, 150); // the top was reached, so the bottom
  assert.equal(rep.rep_stats.elbow_flare, null);
  assert.equal(ev.correctRepCount, 0);
});

test("evaluator: an abandoned attempt runs the rep rules on stats without that frame", () => {
  const ev = new FormEvaluator(CURL_RULES, accumulatorFor("dumbbell_biceps_curls", CURL_RULES));
  ev.process(...curlFrame(130), "rep_started", "left");
  ev.process(...curlFrame(90), "none", "left");
  assert.deepEqual(ev.process(...curlFrame(10), "rep_abandoned", "left"), ["partial_curl"]);
  const [attempt] = ev.abandoned;
  assert.equal(attempt.attempt_number, 1);
  assert.equal(attempt.rep_stats.min_elbow, 90); // the abandoning frame's 10 is not accumulated
  assert.equal(attempt.rep_stats.partial_curl, 90); // the top was missed
  assert.deepEqual(ev.lastViolations(), [{ name: "partial_curl", message: "partial_curl" }]);
});

test("evaluator: an infinite stat is null, a null one is omitted", () => {
  const rules = [rule({ name: "partial_squat", priority: 1, scope: "rep", threshold: { depth_target: 100 } })];
  const ev = new FormEvaluator(rules, accumulatorFor("squat", rules));
  ev.process({}, null, "rep_abandoned", null); // not in a rep: nothing recorded
  assert.equal(ev.abandoned.length, 0);
  ev.process({ left_knee: 140, right_knee: 140 }, null, "rep_started", null);
  ev.process({}, null, "rep_abandoned", null);
  const stats = ev.abandoned[0].rep_stats;
  assert.equal(stats.max_back_tilt, null); // -inf: no keypoints all attempt
  assert.equal("knee_parallel_deg" in stats, false); // never in the depth band
  assert.equal(stats.min_knee, 140);
  assert.equal(stats.partial_squat, 140);
});
