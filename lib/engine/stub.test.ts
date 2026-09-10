// Run with `npm run test:unit`. The one check that fails if the stub stops honouring the
// seam: the phases run in order, the counter only moves on a correct rep, warnings come
// from the row's rules, and the report totals add up.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { RuleBasedLogic } from "../exercise";
import { createStubEngine } from "./stub.ts";
import { emptyKeypoints, type FrameResult, type Keypoints, type LandmarkName } from "./types.ts";

const logic: RuleBasedLogic = {
  source: "test",
  state_machine: {
    states: ["Idle", "Concentric", "Inflection", "Eccentric"],
    thresholds: { thr_standing: 160 },
    arming: { joints: ["hip", "knee", "ankle"], ready_tilt_min: null, ready_tilt_max: 30 },
  },
  rules: [
    { name: "knee_depth", check: "knee_depth", priority: 1, scope: "rep", debounce_frames: 1, threshold: { depth_target: 100 }, messages: { en: "Lower to 90 degrees" }, highlight_joints: [] },
    { name: "back_straight", check: "back_straight", priority: 3, scope: "frame", debounce_frames: 10, threshold: { tilt_max: 55 }, messages: { en: "Keep back straight" }, highlight_joints: [] },
  ],
};
const messages = logic.rules.map((r) => r.messages.en);

// mulberry32, so the run is the same every time.
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A whole body in view, centred, with arms down or out to the sides.
function body(armsOut: boolean): Keypoints {
  const kp = emptyKeypoints();
  const put = (name: LandmarkName, x: number, y: number) => (kp[name] = { x, y, z: 0, x_3d: 0, y_3d: 0, z_3d: 0, score: 0.95 });
  put("nose", 0.5, 0.1);
  for (const [side, dx] of [["left", 0.06], ["right", -0.06]] as const) {
    put(`${side}_shoulder`, 0.5 + dx, 0.25);
    put(`${side}_elbow`, armsOut ? 0.5 + dx * 3 : 0.5 + dx, armsOut ? 0.25 : 0.4);
    put(`${side}_wrist`, armsOut ? 0.5 + dx * 5 : 0.5 + dx, armsOut ? 0.25 : 0.55);
    put(`${side}_hip`, 0.5 + dx, 0.55);
    put(`${side}_knee`, 0.5 + dx, 0.75);
    put(`${side}_ankle`, 0.5 + dx, 0.95);
  }
  return kp;
}

const FRAME_MS = 1000 / 30;

test("phases run in order and the counter only moves on a correct rep", () => {
  const engine = createStubEngine(logic, "squat", seeded(7));
  let t = 0;
  const run = (kp: Keypoints, frames: number) => {
    const out: FrameResult[] = [];
    for (let i = 0; i < frames; i++) out.push(engine.process(kp, (t += FRAME_MS)));
    return out;
  };

  let last = run(emptyKeypoints(), 5).at(-1)!;
  assert.equal(last.placement_phase, "guiding");
  assert.equal(last.placement_cues[0], "Move into frame so the camera can see your whole body");
  assert.equal(last.ready_phase, "waiting");

  last = run(body(false), 10).at(-1)!;
  assert.equal(last.placement_phase, "placed");
  assert.equal(last.ready_phase, "waiting");
  assert.equal(last.ready_pose, null);

  last = run(body(true), 10).at(-1)!;
  assert.equal(last.ready_phase, "countdown");
  assert.equal(last.ready_pose, "t_pose");
  assert.ok(last.countdown_s !== null && last.countdown_s <= 3);

  last = run(body(true), 3 * 30 + 2).at(-1)!;
  assert.equal(last.ready_phase, "active");
  assert.equal(last.countdown_s, null);

  // Sixty seconds of set. Every counter change is checked against the frame's event.
  const frames = run(body(false), 60 * 30);
  let prev = last;
  let completed = 0;
  let abandoned = 0;
  let incorrect = 0;
  for (const f of frames) {
    assert.ok(logic.state_machine.states.includes(f.state));
    assert.ok(f.warning.length <= 1);
    for (const w of [...f.warning, ...f.warning_display]) assert.ok(messages.includes(w), w);
    if (f.warnings_all.length) assert.equal(f.warning[0], f.warnings_all[0].message);
    const dCorrect = f.correct_rep_count - prev.correct_rep_count;
    const dReps = f.rep_count - prev.rep_count;
    const dAttempts = f.attempt_count - prev.attempt_count;
    if (f.event === "rep_completed") {
      completed += 1;
      assert.equal(dReps, 1);
      assert.equal(dAttempts, 1);
      const rep = engine.getSessionReport().reps[f.rep_count - 1];
      assert.equal(dCorrect, rep.correct ? 1 : 0);
      if (!rep.correct) incorrect += 1;
    } else if (f.event === "rep_abandoned") {
      abandoned += 1;
      assert.equal(dReps, 0);
      assert.equal(dAttempts, 1);
      assert.equal(dCorrect, 0);
      assert.equal(f.warning[0], "Lower to 90 degrees");
    } else {
      assert.equal(dReps, 0);
      assert.equal(dAttempts, 0);
      assert.equal(dCorrect, 0);
    }
    prev = f;
  }
  assert.ok(completed >= 15, `only ${completed} reps in a minute`);
  assert.ok(incorrect >= 1 && abandoned >= 1, "the seed should produce each outcome");

  const report = engine.getSessionReport();
  assert.equal(report.schema_version, 4);
  assert.equal(report.total_reps_completed, completed);
  assert.equal(report.total_attempts_abandoned, abandoned);
  assert.equal(report.total_attempts, completed + abandoned);
  assert.equal(report.total_reps_correct, completed - incorrect);
  assert.equal(report.reps.length, completed);
  assert.equal(report.abandoned_attempts.length, abandoned);
  assert.equal(prev.correct_rep_count, report.total_reps_correct);

  // A person walking out of view pauses the set without ending it.
  const gone = run(emptyKeypoints(), 30).at(-1)!;
  assert.equal(gone.low_confidence, true);
  assert.equal(gone.ready_phase, "active");
  assert.equal(gone.rep_count, report.total_reps_completed);

  engine.reset();
  const fresh = engine.process(body(false), (t += FRAME_MS));
  assert.equal(fresh.rep_count, 0);
  assert.equal(fresh.attempt_count, 0);
  assert.equal(fresh.placement_phase, "guiding");
  assert.equal(engine.getSessionReport().total_attempts, 0);
});

test("placement cues follow the body's position", () => {
  const engine = createStubEngine(logic, "squat", seeded(1));
  const kp = body(false);
  for (const name of Object.keys(kp) as LandmarkName[]) kp[name].x -= 0.35;
  const f = engine.process(kp, 1);
  assert.equal(f.placement_ok, false);
  assert.equal(f.placement_cues[0], "Move left to center yourself in frame");
});
