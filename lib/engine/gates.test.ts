// Run with `npm run test:unit`. Ported from the research repo's tests/test_ready_pose.py
// and tests/test_placement_guide.py, minus their 2D-fallback and frame-clock cases,
// which the port does not have, then the two gate-order tests of
// tests/test_frame_processor.py and the gates' wiring into the engine. Centring is
// flipped for the mirrored stage (WEB_APP_PORT.md section 9).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { RuleBasedLogic } from "../exercise";
import { createEngine } from "./engine.ts";
import { detectReadyPose, facingCheck, framingCheck, PlacementGuide, ReadyPoseGate } from "./gates.ts";
import { emptyKeypoints, type Keypoints, type LandmarkName } from "./types.ts";

// Arm poses as (elbow, wrist) offsets from the shoulder, x away from the midline, y down.
const ARMS = {
  t: [[0.3, 0], [0.6, 0]],
  a: [[0.15, 0.35], [0.3, 0.7]],
  down: [[0.02, 0.35], [0.04, 0.7]],
  bent_t: [[0.3, 0], [0.3, 0.3]],
} as const;
type Arms = keyof typeof ARMS;

// A standing body facing the camera in world metres (the ready pose fixtures).
function standing(arms: Arms = "t", score = 1, leftArms?: Arms): Keypoints {
  const kp = emptyKeypoints();
  const put = (name: LandmarkName, x: number, y: number) => (kp[name] = { x: 0.5, y: 0.5, z: 0, x_3d: x, y_3d: y, z_3d: 0, score });
  put("nose", 0, -0.7);
  for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
    put(`${side}_shoulder`, 0.2 * sign, -0.5);
    put(`${side}_hip`, 0.1 * sign, 0);
    put(`${side}_knee`, 0.1 * sign, 0.5);
    put(`${side}_ankle`, 0.1 * sign, 1);
    const [[ex, ey], [wx, wy]] = ARMS[side === "left" ? (leftArms ?? arms) : arms];
    put(`${side}_elbow`, 0.2 * sign + sign * ex, -0.5 + ey);
    put(`${side}_wrist`, 0.2 * sign + sign * wx, -0.5 + wy);
  }
  return kp;
}

test("ready pose: T and A detected, a relaxed stand, bent or uneven arms are not", () => {
  assert.equal(detectReadyPose(standing("t")), "t_pose");
  assert.equal(detectReadyPose(standing("a")), "a_pose");
  assert.equal(detectReadyPose(standing("down")), null);
  assert.equal(detectReadyPose(standing("bent_t")), null);
  assert.equal(detectReadyPose(standing("t", 1, "down")), null);
});

test("ready pose: the whole body at 0.5, with world 3D", () => {
  for (const joint of ["left_ankle", "nose", "right_knee"] as const) {
    const kp = standing("t");
    kp[joint] = { ...kp[joint], score: 0 };
    assert.equal(detectReadyPose(kp), null, joint);
  }
  assert.equal(detectReadyPose(standing("t", 0.4)), null);
  assert.equal(detectReadyPose(standing("t", 0.9)), "t_pose");
  assert.equal(detectReadyPose(emptyKeypoints()), null);
});

function hold(gate: ReadyPoseGate, kp: Keypoints, frames: number, t0: number, dt = 50) {
  let status = gate.update(kp, t0, true);
  for (let i = 1; i < frames; i++) status = gate.update(kp, t0 + i * dt, true);
  return status;
}

// Drives a gate to active; returns the time of the activating frame.
function activate(gate: ReadyPoseGate) {
  hold(gate, standing("t"), 8, 0);
  const t = 350 + 3000;
  gate.update(standing("down"), t, true);
  assert.equal(gate.phase, "active");
  return t;
}

test("ready gate: the pose is held 8 frames, and a break restarts the hold", () => {
  const gate = new ReadyPoseGate();
  assert.equal(hold(gate, standing("t"), 7, 0).phase, "waiting");
  gate.update(standing("down"), 400, true);
  assert.equal(hold(gate, standing("t"), 7, 450).phase, "waiting");
  assert.equal(gate.update(standing("t"), 800, true).phase, "countdown");
});

test("ready gate: the countdown runs on the wall clock, survives a dropped pose, and holds at 0 until placed", () => {
  const gate = new ReadyPoseGate();
  const start = hold(gate, standing("t"), 8, 0);
  assert.equal(start.phase, "countdown");
  assert.equal(start.countdownS, 3);
  const mid = gate.update(standing("down"), 350 + 2000, true);
  assert.equal(mid.phase, "countdown");
  assert.ok(Math.abs((mid.countdownS ?? 0) - 1) < 1e-9);
  const waiting = gate.update(standing("down"), 350 + 3500, false);
  assert.deepEqual([waiting.phase, waiting.countdownS], ["countdown", 0]);
  const go = gate.update(standing("down"), 350 + 3550, true);
  assert.deepEqual([go.phase, go.justActivated, go.countdownS], ["active", true, null]);
});

test("ready gate: a T pose ends the set after the grace period, an A pose or a brief T never does", () => {
  const ends = new ReadyPoseGate();
  const status = hold(ends, standing("t"), 30, activate(ends) + 3000);
  assert.deepEqual([status.phase, status.justEnded, ends.endedByPose], ["ended", true, true]);

  const early = new ReadyPoseGate();
  assert.equal(hold(early, standing("t"), 60, activate(early), 10).phase, "active");

  const aPose = new ReadyPoseGate();
  assert.equal(hold(aPose, standing("a"), 90, activate(aPose) + 3000).phase, "active");

  const brief = new ReadyPoseGate();
  const t = activate(brief) + 3000;
  hold(brief, standing("t"), 29, t);
  brief.update(standing("down"), t + 1450, true);
  assert.equal(hold(brief, standing("t"), 29, t + 1500).phase, "active");

  brief.reset();
  assert.deepEqual([brief.phase, brief.endedByPose], ["waiting", false]);
});

test("framing: distance, head and feet cut, and centring in the user's own frame", () => {
  assert.deepEqual(framingCheck(null), ["not_detected", "not_detected", "not_detected"]);
  assert.deepEqual(framingCheck([0.35, 0.2, 0.65, 0.8]), ["ok", "ok", "ok"]);
  assert.equal(framingCheck([0.4, 0.4, 0.6, 0.6])[0], "too_far");
  assert.equal(framingCheck([0.3, 0, 0.7, 1])[0], "too_close");
  assert.equal(framingCheck([0.35, 0, 0.65, 0.6])[2], "head_cut");
  assert.equal(framingCheck([0.35, 0.2, 0.65, 1])[2], "feet_cut");
  // A body on the right of the image is on the user's left: they move right.
  assert.equal(framingCheck([0.7, 0.2, 0.9, 0.8])[1], "move_right");
  assert.equal(framingCheck([0.05, 0.2, 0.25, 0.8])[1], "move_left");
});

const SQUAT = { yaw_center: 45, yaw_tol: 12 };

test("facing: the band on |yaw|, the turn direction, and the latched side", () => {
  assert.equal(facingCheck(null, SQUAT), "not_detected");
  assert.equal(facingCheck(45, SQUAT), "ok");
  assert.equal(facingCheck(-45, SQUAT), "ok");
  for (const [yaw, expected] of [[0, "turn_right"], [5, "turn_right"], [-5, "turn_left"], [80, "turn_left"], [-80, "turn_right"]] as const) {
    assert.equal(facingCheck(yaw, SQUAT), expected, String(yaw));
  }
  assert.equal(facingCheck(-0.78, SQUAT), "turn_left");
  assert.equal(facingCheck(-0.78, SQUAT, 1), "turn_right");
  assert.equal(facingCheck(0.55, SQUAT, -1), "turn_left");
});

// A standing body at a yaw in world metres, with a matching image box of height 0.82.
function turned(yaw: number, arms: Arms = "down", centerX = 0.5, scale = 1): Keypoints {
  const kp = emptyKeypoints();
  const c = Math.cos((yaw * Math.PI) / 180);
  const s = Math.sin((yaw * Math.PI) / 180);
  // Body frame: x lateral (left negative), y down. The left side turns away (+z).
  const put = (name: LandmarkName, x: number, y: number, imgY: number) =>
    (kp[name] = { x: centerX + x * 0.2 * scale, y: 0.5 + (imgY - 0.5) * scale, z: 0, x_3d: x * c, y_3d: y, z_3d: -x * s, score: 1 });
  put("nose", 0, -0.7, 0.1);
  for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
    put(`${side}_shoulder`, 0.2 * sign, -0.5, 0.2);
    put(`${side}_hip`, 0.2 * sign, 0, 0.55);
    put(`${side}_knee`, 0.2 * sign, 0.5, 0.75);
    put(`${side}_ankle`, 0.2 * sign, 1, 0.92);
    const [[ex, ey], [wx, wy]] = ARMS[arms];
    put(`${side}_elbow`, 0.2 * sign + sign * ex, -0.5 + ey, 0.35);
    put(`${side}_wrist`, 0.2 * sign + sign * wx, -0.5 + wy, 0.5);
  }
  return kp;
}

test("placement guide: guides a frontal body, latches after 8 good frames, and stays placed", () => {
  const guide = new PlacementGuide(SQUAT);
  const frontal = guide.update(turned(0));
  assert.deepEqual([frontal.phase, frontal.ok, frontal.cues[0]], ["guiding", false, "Turn to your right"]);
  assert.ok(Math.abs((frontal.bodyYaw ?? 1) - 0) < 1e-9);
  guide.update(turned(45));
  guide.update(turned(0)); // breaks the hold
  for (let i = 0; i < 7; i++) assert.equal(guide.update(turned(45)).phase, "guiding");
  const placed = guide.update(turned(45));
  assert.deepEqual([placed.phase, placed.ok], ["placed", true]);
  assert.deepEqual(guide.update(emptyKeypoints()), { phase: "placed", ok: true, bodyYaw: null, targetYaw: null, distance: "not_detected", cues: [] });
  guide.reset();
  assert.equal(guide.update(turned(0)).phase, "guiding");
});

test("placement guide: cues in priority order, and the generic cue without a body", () => {
  const guide = new PlacementGuide(SQUAT);
  assert.deepEqual(guide.update(emptyKeypoints()).cues, ["Move into frame so the camera can see your whole body"]);
  assert.equal(guide.update(turned(45, "down", 0.5, 0.3)).distance, "too_far");
  assert.deepEqual(guide.update(turned(0, "down", 0.8)).cues, ["Move right to center yourself in frame", "Turn to your right"]);
});

test("placement guide: the turn cue does not flip across frontal", () => {
  const guide = new PlacementGuide(SQUAT);
  const trace = [13.7, 8.4, 0.8, -1.9, -6.8, -10.2, -11.9, -5.8, -1.7, -0.3, 0.55, 1.0, 10.1, 17.2];
  const cues = new Set(trace.map((yaw) => guide.update(turned(yaw)).cues[0]));
  assert.deepEqual([...cues], ["Turn to your right"]);
  assert.equal(guide.targetSign, 1);
});

test("placement guide: a chosen arm faces the camera, one band only", () => {
  const left = new PlacementGuide(SQUAT, "left");
  assert.equal(left.targetSign, -1);
  assert.equal(left.update(turned(2)).cues[0], "Turn to your left"); // unlatched this steers right
  assert.ok(left.update(turned(-45)).ok);
  const mirrored = left.update(turned(45));
  assert.deepEqual([mirrored.ok, mirrored.cues[0]], [false, "Turn to your left"]);
  left.reset();
  assert.equal(left.targetSign, -1);
  const right = new PlacementGuide(SQUAT, "right");
  assert.ok(right.update(turned(45)).ok);
  assert.equal(right.update(turned(-45)).cues[0], "Turn to your right");
  assert.equal(facingCheck(-45, SQUAT, 1, true), "turn_right");
  assert.equal(facingCheck(45, SQUAT, 1, true), "ok");
});

const LOGIC: RuleBasedLogic = {
  source: "test",
  state_machine: {
    states: ["Idle", "Concentric", "Inflection", "Eccentric"],
    thresholds: { thr_standing: 160, thr_inflection: 120, thr_descending: 150, hysteresis_buffer: 10, consecutive_frames_req: 3 },
    arming: { joints: ["hip", "knee", "ankle"], ready_tilt_min: null, ready_tilt_max: 30 },
    confidence_joints: ["hip", "knee", "ankle"],
    chooses_side: false,
  },
  placement: SQUAT,
  rules: [{ name: "partial_squat", check: "partial_squat", priority: 1, scope: "rep", debounce_frames: 1, threshold: { depth_target: 100 }, messages: { en: "Lower to 90 degrees" }, highlight_joints: [] }],
};

// 40 frames a second, as in the Python gate-order tests.
function clocked() {
  const engine = createEngine(LOGIC, "squat");
  let t = 0;
  return { engine, step: (kp: Keypoints) => engine.process(kp, (t += 25)) };
}

test("engine: the T pose facing the camera starts the countdown, which holds at 0 until placed", () => {
  const { step } = clocked();
  let r = step(turned(0, "t"));
  for (let i = 1; i < 8; i++) r = step(turned(0, "t"));
  assert.equal(r.ready_phase, "countdown");
  assert.deepEqual([r.placement_phase, r.placement_cues], ["guiding", []]); // no turn cue during the T pose
  for (let i = 0; i < 200; i++) r = step(turned(0)); // 5 s, still facing the camera
  assert.deepEqual([r.ready_phase, r.countdown_s, r.placement_phase], ["countdown", 0, "guiding"]);
  assert.equal(r.placement_cues[0], "Turn to your right");
  for (let i = 0; i < 8; i++) r = step(turned(45)); // placed on the eighth frame: the set starts
  assert.deepEqual([r.placement_phase, r.ready_phase, r.armed], ["placed", "active", true]);
});

test("engine: placed early still waits for the countdown", () => {
  const { step } = clocked();
  for (let i = 0; i < 8; i++) step(turned(0, "t"));
  let r = step(turned(45));
  for (let i = 1; i < 40; i++) r = step(turned(45)); // 1 s at 45: placed, still counting down
  assert.deepEqual([r.placement_phase, r.ready_phase], ["placed", "countdown"]);
  for (let i = 0; i < 80; i++) r = step(turned(45));
  assert.equal(r.ready_phase, "active");
});

test("engine: nothing counts before the set or after a T pose ends it", () => {
  const engine = createEngine(LOGIC, "squat", { placement: false });
  const crouch = standing("down");
  crouch.left_knee = { ...crouch.left_knee, z_3d: 0.3 };
  crouch.right_knee = { ...crouch.right_knee, z_3d: 0.3 };
  let r = engine.process(crouch, 0);
  for (let i = 1; i < 20; i++) r = engine.process(crouch, i * 50);
  assert.deepEqual([r.ready_phase, r.state, r.attempt_count, r.armed], ["waiting", "Idle", 0, false]);
  let t = 1000;
  for (let i = 0; i < 8; i++) engine.process(standing("t"), (t += 50));
  r = engine.process(standing("down"), (t += 3000));
  assert.deepEqual([r.ready_phase, r.armed, r.placement_phase], ["active", true, "disabled"]);
  t += 3000;
  for (let i = 0; i < 30; i++) r = engine.process(standing("t"), (t += 50));
  assert.deepEqual([r.ready_phase, r.armed], ["ended", false]);
  const report = engine.getSessionReport();
  assert.deepEqual(report.ready_gate, { enabled: true, phase: "ENDED", countdown_s: 3, ended_by_pose: true });
  engine.reset();
  assert.equal(engine.getSessionReport().ready_gate.phase, "WAITING");
});

test("engine: without world 3D an active frame is low confidence, not a crash", () => {
  const engine = createEngine(LOGIC, "squat", { placement: false, ready: false, armed: true });
  const flat = emptyKeypoints();
  for (const name of Object.keys(flat) as LandmarkName[]) flat[name] = { ...flat[name], score: 1 };
  const r = engine.process(flat, 0);
  assert.deepEqual([r.low_confidence, r.ready_phase, r.event, r.state], [true, "disabled", "none", "Idle"]);
  assert.equal(engine.getSessionReport().ready_gate.enabled, false);
});
