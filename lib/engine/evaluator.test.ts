// Run with `npm run test:unit`. The evaluator cases pin the orderings of
// WEB_APP_PORT.md section 10 and the rule-named values of section 8; the floor bar's
// own cases are in angles.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rule } from "../exercise";
import { ExerciseSession, FormEvaluator } from "./evaluator.ts";
import { accumulatorFor } from "./rules.ts";
import { emptyKeypoints, type Keypoints, type LandmarkName } from "./types.ts";

test("floor bar: the session reset clears the held wrist", () => {
  const session = new ExerciseSession(
    {
      source: "test",
      state_machine: {
        states: ["Idle", "Concentric", "Inflection", "Eccentric"],
        thresholds: { thr_standing: 0.9, thr_inflection: 0.54, thr_descending: 0.85, hysteresis_buffer: 0.1, consecutive_frames_req: 3, left_tilt_max: 30 },
        arming: { joints: ["shoulder", "elbow", "wrist"], ready_tilt_min: 60, ready_tilt_max: null },
        confidence_joints: ["shoulder", "elbow", "wrist"],
        chooses_side: false,
        ready_pose: "plank",
      },
      placement: { yaw_center: 45, yaw_tol: 25 },
      rules: [],
    },
    "pushup",
  );
  const kp = emptyKeypoints();
  kp.left_wrist.score = kp.right_wrist.score = 1;
  session.floorBar!.update(kp);
  assert.notEqual(session.floorBar!.wristVec, null);
  session.reset();
  assert.equal(session.floorBar!.wristVec, null);
});

const rule = (r: Partial<Rule> & Pick<Rule, "name" | "priority" | "scope" | "threshold">): Rule => ({
  check: r.name,
  debounce_s: r.scope === "frame" ? 0.15 : 0,
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

test("evaluator: a frame rule needs its wait, records once, and shows the top priority", () => {
  const ev = new FormEvaluator(CURL_RULES, accumulatorFor("dumbbell_biceps_curls", CURL_RULES));
  let ms = 0;
  const step = (elbow: number, flare: number, event: "none" | "rep_started" | "rep_completed" = "none") =>
    ev.process(...curlFrame(elbow, flare), event, "left", (ms += 40));
  assert.deepEqual(step(150, 60, "rep_started"), []); // the run starts
  for (let i = 0; i < 3; i++) assert.deepEqual(step(120, 60), []);
  assert.deepEqual(step(100, 60), ["elbow_flare"]); // 160 ms in, the fifth frame
  step(50, 20); // run broken
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
  ev.process(...curlFrame(130), "rep_started", "left", 0);
  ev.process(...curlFrame(90), "none", "left", 33);
  assert.deepEqual(ev.process(...curlFrame(10), "rep_abandoned", "left", 67), ["partial_curl"]);
  const [attempt] = ev.abandoned;
  assert.equal(attempt.attempt_number, 1);
  assert.equal(attempt.rep_stats.min_elbow, 90); // the abandoning frame's 10 is not accumulated
  assert.equal(attempt.rep_stats.partial_curl, 90); // the top was missed
  assert.deepEqual(ev.lastViolations(), [{ name: "partial_curl", message: "partial_curl" }]);
});

test("evaluator: an infinite stat is null, a null one is omitted", () => {
  const rules = [rule({ name: "partial_squat", priority: 1, scope: "rep", threshold: { depth_target: 100 } })];
  const ev = new FormEvaluator(rules, accumulatorFor("squat", rules));
  ev.process({}, null, "rep_abandoned", null, 0); // not in a rep: nothing recorded
  assert.equal(ev.abandoned.length, 0);
  ev.process({ left_knee: 140, right_knee: 140 }, null, "rep_started", null, 33);
  ev.process({}, null, "rep_abandoned", null, 67);
  const stats = ev.abandoned[0].rep_stats;
  assert.equal(stats.max_back_tilt, null); // -inf: no keypoints all attempt
  assert.equal("knee_parallel_deg" in stats, false); // never in the depth band
  assert.equal(stats.min_knee, 140);
  assert.equal(stats.partial_squat, 140);
});

// Image x: hips 0.2 apart (the left hip at 0.6, so the left leg's outside is +x), each toe
// under its hip, each knee `dev` hip widths outside its own toe line (negative = in). The
// shoulders above the hips give the frame world 3D, which the evaluator needs.
function toeLineFrame(leftDev: number, rightDev: number): Keypoints {
  const kp = emptyKeypoints();
  const put = (name: LandmarkName, x: number, y3d = 0) => (kp[name] = { x, y: 0, z: 0, x_3d: x - 0.5, y_3d: y3d, z_3d: 0, score: 1 });
  put("left_shoulder", 0.6, -0.5);
  put("right_shoulder", 0.4, -0.5);
  put("left_hip", 0.6);
  put("right_hip", 0.4);
  put("left_foot_index", 0.6);
  put("right_foot_index", 0.4);
  put("left_knee", 0.6 + 0.2 * leftDev);
  put("right_knee", 0.4 - 0.2 * rightDev);
  return kp;
}

test("squat: the knee rules read the toe line at the rep's deepest frame", () => {
  const rules = [
    rule({ name: "partial_squat", priority: 1, scope: "rep", threshold: { depth_target: 100 } }),
    rule({ name: "knee_valgus", priority: 2, scope: "rep", threshold: { toe_line_in: -0.3 } }),
    rule({ name: "knee_varus", priority: 3, scope: "rep", threshold: { toe_line_out: 0.35 } }),
  ];
  const squat = (frames: [number, Keypoints][]) => {
    const ev = new FormEvaluator(rules, accumulatorFor("squat", rules));
    frames.forEach(([knee, kp], i) => ev.process({ left_knee: knee, right_knee: knee }, kp, i ? "none" : "rep_started", null, i * 33));
    ev.process({ left_knee: 170, right_knee: 170 }, toeLineFrame(0, 0), "rep_completed", null, frames.length * 33);
    return ev.reps[0];
  };
  // Knees in at the top and on the way up, inside the line at the bottom: no knee cue.
  const quiet = squat([[150, toeLineFrame(-0.3, -0.3)], [95, toeLineFrame(0.05, 0)], [110, toeLineFrame(-0.3, -0.3)]]);
  assert.deepEqual(quiet.violations, []);
  assert.ok(Math.abs((quiet.rep_stats.knee_valgus as number) - 0.05) < 1e-9);
  assert.deepEqual(squat([[150, toeLineFrame(0, 0)], [95, toeLineFrame(-0.2, -0.15)]]).violations, ["knee_valgus"]);
  assert.deepEqual(squat([[150, toeLineFrame(0, 0)], [95, toeLineFrame(0.2, 0.14)]]).violations, []); // under the +0.35 bar
  assert.deepEqual(squat([[150, toeLineFrame(0, 0)], [95, toeLineFrame(0.2, 0.16)]]).violations, ["knee_varus"]);
});

// The frame on which elbow_flare fires, with frames 1000 / fps ms apart.
function firesOn(fps: number) {
  const ev = new FormEvaluator(CURL_RULES, accumulatorFor("dumbbell_biceps_curls", CURL_RULES));
  for (let n = 0; n < 30; n++) {
    if (ev.process(...curlFrame(120, 60), n === 0 ? "rep_started" : "none", "left", (n * 1000) / fps).length) return n + 1;
  }
  return null;
}

test("evaluator: the wait is the same time at any frame rate", () => {
  // 0.15 s from the first violated frame: 3 frames at 13 fps, 7 at 35, 10 at 58.
  assert.equal(firesOn(13), 3);
  assert.equal(firesOn(35), 7);
  assert.equal(firesOn(58), 10);
});

test("evaluator: a gap over the 0.3 s limit starts the run over", () => {
  const ev = new FormEvaluator(CURL_RULES, accumulatorFor("dumbbell_biceps_curls", CURL_RULES));
  const flared = (event: "none" | "rep_started", ms: number) => ev.process(...curlFrame(120, 60), event, "left", ms);
  flared("rep_started", 0);
  assert.deepEqual(flared("none", 333), []); // 333 ms unseen: the run restarts here
  assert.deepEqual(flared("none", 450), []);
  assert.deepEqual(flared("none", 483), ["elbow_flare"]); // 150 ms since 333
});

test("evaluator: one dropped frame at 13 fps keeps the run", () => {
  const ev = new FormEvaluator(CURL_RULES, accumulatorFor("dumbbell_biceps_curls", CURL_RULES));
  const flared = (event: "none" | "rep_started", ms: number) => ev.process(...curlFrame(120, 60), event, "left", ms);
  flared("rep_started", 0);
  assert.deepEqual(flared("none", 77), []);
  assert.deepEqual(flared("none", 231), ["elbow_flare"]); // a 154 ms gap, under 300
});
