// Run with `npm run test:unit`. The push-up cases are ported from the research repo's
// tests/test_arming_gate.py (test_pushup_*); the squat and lunge cases check the
// template method the parity test then exercises on real recordings.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { RuleBasedLogic } from "../exercise";
import type { Angles } from "./angles.ts";
import { CONCENTRIC, createFsm, ECCENTRIC, IDLE, INFLECTION, type BaseFsm } from "./fsm.ts";
import type { RepEvent } from "./types.ts";

const machine = (thresholds: Record<string, number>, arming: RuleBasedLogic["state_machine"]["arming"]) => ({
  states: ["Idle", "Concentric", "Inflection", "Eccentric"],
  thresholds: { consecutive_frames_req: 3, ...thresholds },
  arming,
  confidence_joints: [],
});
const SQUAT = machine({ thr_standing: 160, thr_inflection: 120, thr_descending: 150, hysteresis_buffer: 10 }, { joints: ["hip", "knee", "ankle"], ready_tilt_min: null, ready_tilt_max: 30 });
const PUSHUP = machine({ thr_standing: 0.9, thr_inflection: 0.54, thr_descending: 0.85, hysteresis_buffer: 0.1 }, { joints: ["shoulder", "elbow", "wrist"], ready_tilt_min: 60, ready_tilt_max: null });
const LUNGE = machine({ thr_standing: 155, thr_inflection: 105, thr_descending: 145, hysteresis_buffer: 12, lunge_start_split_min: 58 }, { joints: ["hip", "knee", "ankle"], ready_tilt_min: null, ready_tilt_max: 30 });

function feed(fsm: BaseFsm, angles: Angles, count: number, tilt: number | null = null): RepEvent[] {
  return Array.from({ length: count }, () => fsm.update(angles, null, tilt).event);
}

// Push-up, in floor-bar arm lengths: lower is deeper.
const TOP = 0.95, DOWN = 0.75, DEPTH = 0.4;
const bar = (b: number | null) => ({ floor_bar: b });

function armedPushup() {
  const fsm = createFsm("pushup", PUSHUP);
  feed(fsm, bar(TOP), 10, 80);
  feed(fsm, bar(DOWN), 3, 80);
  assert.equal(fsm.state, CONCENTRIC);
  return fsm;
}

test("push-up: standing with straight arms never arms, a plank does", () => {
  const standing = createFsm("pushup", PUSHUP);
  feed(standing, bar(TOP), 30, 10);
  assert.equal(standing.isArmed, false);
  const plank = createFsm("pushup", PUSHUP);
  feed(plank, bar(TOP), 10, 80);
  assert.equal(plank.isArmed, true);
  feed(plank, bar(TOP), 40, 10); // stood up: the posture path still disarms
  assert.equal(plank.isArmed, false);
});

test("push-up: standing up mid-attempt abandons it", () => {
  const fsm = armedPushup();
  feed(fsm, bar(DEPTH), 3, 80);
  assert.deepEqual(feed(fsm, bar(DEPTH), 1, 10), ["rep_abandoned"]);
  feed(fsm, bar(TOP), 5, 10);
  assert.equal(fsm.repCount, 0);
});

test("push-up: shoulders below the hands abandons and opens nothing", () => {
  const fsm = armedPushup();
  assert.deepEqual(feed(fsm, bar(-0.3), 1, 80), ["rep_abandoned"]);
  assert.ok(feed(fsm, bar(-0.3), 20, 80).every((e) => e === "none"));
});

test("push-up: a frame without a floor bar changes nothing", () => {
  const fsm = armedPushup();
  const frames = fsm.frameCounter;
  for (let i = 0; i < 10; i++) assert.deepEqual(fsm.update(bar(null), null, 80), { repCount: 0, state: CONCENTRIC, event: "none" });
  assert.equal(fsm.frameCounter, frames);
});

test("push-up: a full cycle counts once", () => {
  const fsm = armedPushup();
  feed(fsm, bar(DEPTH), 3, 80);
  assert.equal(fsm.state, INFLECTION);
  feed(fsm, bar(0.7), 3, 80);
  assert.equal(fsm.state, ECCENTRIC);
  assert.deepEqual(feed(fsm, bar(TOP), 3, 80), ["none", "none", "rep_completed"]);
  assert.equal(fsm.repCount, 1);
});

test("squat: unarmed opens nothing; armed counts, abandons, and banks a re-descend", () => {
  const knees = (a: number) => ({ left_knee: a, right_knee: a });
  const fsm = createFsm("squat", SQUAT);
  assert.ok(feed(fsm, knees(100), 20).every((e) => e === "none")); // never held the start
  fsm.forceArm();
  feed(fsm, knees(170), 3);
  assert.deepEqual(feed(fsm, knees(140), 4), ["none", "none", "rep_started", "none"]);
  assert.deepEqual(feed(fsm, knees(165), 1), ["rep_abandoned"]); // above standing: at once
  assert.equal(fsm.abandonedCount, 1);
  feed(fsm, knees(140), 3);
  feed(fsm, knees(100), 3); // inflection
  feed(fsm, knees(135), 3); // eccentric
  assert.equal(fsm.state, ECCENTRIC);
  assert.deepEqual(feed(fsm, knees(110), 3), ["none", "none", "rep_completed"]); // re-descend
  assert.equal(fsm.state, IDLE);
  assert.equal(fsm.attemptCount, 2);
});

test("lunge: no attempt opens until the thighs split", () => {
  const fsm = createFsm("lunge", LUNGE);
  fsm.forceArm();
  assert.ok(feed(fsm, { left_knee: 120, right_knee: 170, thigh_split: 30 }, 10).every((e) => e === "none"));
  assert.ok(feed(fsm, { left_knee: 120, right_knee: 140, thigh_split: 70 }, 3).includes("rep_started"));
  assert.equal(fsm.activeSideHint, null);
});
