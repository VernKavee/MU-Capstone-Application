// Run with `npm run test:unit`. The frame loop fed scripted engine frames, with no camera
// and no MediaPipe: the capture starts on the first active frame, each end condition ends
// the set only while it is active, frames after the end are ignored, and identical frames
// reach React once.
import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyKeypoints, type Engine, type FrameResult, type SessionReport } from "../engine/types.ts";
import { LiveSession, type Snapshot } from "./session.ts";

// The two browser globals the loop touches without a camera: the sound checks window for
// speech, and ending a set cancels the animation frame.
Object.assign(globalThis, { window: globalThis, cancelAnimationFrame: () => {} });

const report: SessionReport = {
  schema_version: 4, generated_at: "", exercise_name: "squat", engine: "mediapipe",
  filter: { active: false, stage: null, name: null, params: null },
  ready_gate: { enabled: true, phase: "active", countdown_s: 3, ended_by_pose: false },
  total_attempts: 0, total_reps_completed: 0, total_reps_correct: 0, total_attempts_abandoned: 0, reps: [], abandoned_attempts: [],
};

function frame(ready_phase: FrameResult["ready_phase"], over: Partial<FrameResult> = {}): FrameResult {
  return {
    keypoints: emptyKeypoints(), angles: {}, rep_count: 0, correct_rep_count: 0, attempt_count: 0, state: "Idle", event: "none",
    warning: [], warnings_all: [], warning_display: [], warning_display_rules: [], low_confidence: false, filter_active: false,
    armed: ready_phase === "active", ready_phase, ready_pose: null, countdown_s: null, placement_phase: "placed", placement_ok: true,
    placement_cues: [], body_yaw_deg: null, target_yaw_deg: null, distance_state: "ok", ...over,
  };
}

// A loop whose engine returns the script's frames in order, fed 1.1 s apart so the frame
// rate stays at one and never changes what the HUD shows.
function loop(script: FrameResult[], limits = { target: 2, attemptCap: 4 }) {
  const snapshots: Snapshot[] = [];
  const engine: Engine = { process: () => script.shift()!, getSessionReport: () => report, reset: () => {} };
  const session = new LiveSession({
    engine,
    rules: [],
    ...limits,
    model: "full",
    video: { videoWidth: 640, videoHeight: 480 } as unknown as HTMLVideoElement,
    canvas: { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement,
    onChange: (s) => snapshots.push(s),
  });
  let now = 0;
  const feed = (frames: number) => {
    for (let i = 0; i < frames; i++) session.feed(emptyKeypoints(), (now += 1100));
  };
  return { snapshots, feed };
}

test("the capture starts on the first active frame and the set ends at the target", () => {
  const { snapshots, feed } = loop([
    frame("waiting"),
    frame("countdown", { countdown_s: 1 }),
    frame("active"),
    frame("active", { state: "Concentric", event: "rep_started", warnings_all: [{ name: "back_straight", message: "Keep back straight" }] }),
    frame("active", { event: "rep_completed", rep_count: 1, correct_rep_count: 1, attempt_count: 1 }),
    frame("active", { state: "Concentric", event: "rep_started", rep_count: 1, correct_rep_count: 1, attempt_count: 1 }),
    frame("active", { event: "rep_completed", rep_count: 2, correct_rep_count: 2, attempt_count: 2 }),
    frame("active"), // after the end, never processed
  ]);
  feed(8);
  const ended = snapshots.filter((s) => s.status === "ended");
  assert.equal(ended.length, 1, "the set ends once");
  assert.equal(snapshots.at(-1), ended[0], "and nothing reaches React after it");
  const capture = ended[0].capture!;
  assert.equal(capture.endedBy, "target_reached");
  assert.deepEqual(capture.frames.map((f) => [f.t, f.state, f.event]), [
    [0, "Idle", "none"],
    [1100, "Concentric", "rep_started"],
    [2200, "Idle", "rep_completed"],
    [3300, "Concentric", "rep_started"],
    [4400, "Idle", "rep_completed"],
  ]);
  assert.deepEqual(capture.frames[1].violations, ["back_straight"]);
  assert.equal(capture.report, report, "the engine's report, as it gave it");
  assert.equal(capture.video, null, "no MediaRecorder here, so no video");
});

test("no end condition counts before the set is active; then the attempt cap ends it", () => {
  const { snapshots, feed } = loop([
    frame("countdown", { countdown_s: 2, correct_rep_count: 5, attempt_count: 9 }),
    frame("active", { rep_count: 3, correct_rep_count: 1, attempt_count: 3 }),
    frame("active", { rep_count: 3, correct_rep_count: 1, attempt_count: 4 }),
  ]);
  feed(1);
  assert.equal(snapshots.at(-1)!.status, "running");
  feed(2);
  assert.equal(snapshots.at(-1)!.capture?.endedBy, "attempt_cap");
});

test("the engine's own end of the set counts as ended by the user", () => {
  const { snapshots, feed } = loop([frame("active"), frame("ended")]);
  feed(2);
  assert.equal(snapshots.at(-1)!.capture?.endedBy, "user_ended");
});

test("identical frames reach React once", () => {
  const { snapshots, feed } = loop([
    frame("waiting"),
    frame("waiting"),
    frame("waiting"),
    frame("waiting", { placement_phase: "guiding", placement_cues: ["Move closer to the camera"] }),
  ]);
  feed(4);
  assert.deepEqual(snapshots.map((s) => s.frame?.placement_cues[0] ?? null), [null, "Move closer to the camera"]);
});
