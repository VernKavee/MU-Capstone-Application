// Port of src/pipeline/ready_pose.py and placement_guide.py (WEB_APP_PORT.md sections 3,
// 9, 10): the ready pose, the ready gate on the wall clock, and the placement guide. No
// 2D fallback: without world 3D the ready pose and the yaw read null.

import { bodyYaw, calculateAngle, hasWorld3d, keypointBbox, world } from "./angles.ts";
import type { DistanceState, Keypoints, LandmarkName, PlacementPhase, ReadyPhase } from "./types.ts";

const READY_REQUIRED_JOINTS: LandmarkName[] = [
  "nose", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
  "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
];
const READY_MIN_SCORE = 0.5;
const READY_ELBOW_MIN = 150;
const T_POSE: [number, number] = [65, 115]; // shoulder abduction, degrees
const A_POSE: [number, number] = [25, 55];
const READY_HOLD_FRAMES = 8;
const END_HOLD_FRAMES = 30;
const END_GRACE_S = 3;
export const COUNTDOWN_S = 3;

// Both arms straight and abducted into the same band, whole body visible.
export function detectReadyPose(kp: Keypoints): "t_pose" | "a_pose" | null {
  if (!READY_REQUIRED_JOINTS.every((n) => kp[n].score >= READY_MIN_SCORE)) return null;
  if (!hasWorld3d(kp)) return null;
  const abductions: number[] = [];
  for (const side of ["left", "right"] as const) {
    const [hip, shoulder, elbow, wrist] = (["hip", "shoulder", "elbow", "wrist"] as const).map((j) => world(kp, `${side}_${j}`));
    if (calculateAngle(shoulder, elbow, wrist) < READY_ELBOW_MIN) return null;
    abductions.push(calculateAngle(hip, shoulder, elbow));
  }
  const within = ([lo, hi]: [number, number]) => abductions.every((a) => lo <= a && a <= hi);
  if (within(T_POSE)) return "t_pose";
  if (within(A_POSE)) return "a_pose";
  return null;
}

export type ReadyStatus = {
  phase: ReadyPhase;
  pose: "t_pose" | "a_pose" | null;
  countdownS: number | null;
  justActivated: boolean;
  justEnded: boolean;
};

// WAITING (a ready pose held 8 frames) -> COUNTDOWN (3 s, then held at 0 until placed)
// -> ACTIVE -> ENDED (a T pose held 30 frames, after 3 s of the set). ENDED is terminal.
export class ReadyPoseGate {
  phase: ReadyPhase = "waiting";
  endedByPose = false;
  holdStreak = 0;
  deadlineMs = 0;
  activeSinceMs = 0;

  reset() {
    this.phase = "waiting";
    this.endedByPose = false;
    this.holdStreak = 0;
    this.deadlineMs = 0;
    this.activeSinceMs = 0;
  }

  update(kp: Keypoints, nowMs: number, placed: boolean): ReadyStatus {
    const pose = detectReadyPose(kp);
    const status = (countdownS: number | null = null, justActivated = false, justEnded = false): ReadyStatus => ({
      phase: this.phase, pose, countdownS, justActivated, justEnded,
    });
    const secondsLeft = () => Math.max(0, (this.deadlineMs - nowMs) / 1000);

    if (this.phase === "waiting") {
      if (pose === null) {
        this.holdStreak = 0;
      } else if (++this.holdStreak >= READY_HOLD_FRAMES) {
        this.holdStreak = 0;
        this.phase = "countdown";
        this.deadlineMs = nowMs + COUNTDOWN_S * 1000;
        return status(secondsLeft());
      }
      return status();
    }
    if (this.phase === "countdown") {
      // Not gated on the pose: the countdown is the window to turn and get into position.
      const left = secondsLeft();
      if (left <= 0 && placed) {
        this.phase = "active";
        this.activeSinceMs = nowMs;
        this.holdStreak = 0;
        return status(null, true);
      }
      return status(left);
    }
    if (this.phase === "active") {
      // Only the T pose ends a set; an A pose is too close to standing between reps.
      if (pose === "t_pose" && (nowMs - this.activeSinceMs) / 1000 >= END_GRACE_S) {
        if (++this.holdStreak >= END_HOLD_FRAMES) {
          this.holdStreak = 0;
          this.phase = "ended";
          this.endedByPose = true;
          return status(null, false, true);
        }
      } else {
        this.holdStreak = 0;
      }
    }
    return status();
  }
}

const MIN_SCORE = 0.3;
const BBOX_HEIGHT_MIN = 0.45;
const BBOX_HEIGHT_MAX = 0.95;
const EDGE_MARGIN = 0.03;
const CENTER_TOL = 0.15;
const PLACED_HOLD_FRAMES = 8;
const CUE: Record<string, string> = {
  "framing:head_cut": "Step back -- your head is out of frame",
  "framing:feet_cut": "Step back -- your feet are out of frame",
  "distance:too_far": "Move closer to the camera",
  "distance:too_close": "Step back from the camera",
  "centering:move_left": "Move left to center yourself in frame",
  "centering:move_right": "Move right to center yourself in frame",
  "facing:turn_left": "Turn to your left",
  "facing:turn_right": "Turn to your right",
};
const CUE_FALLBACK = "Move into frame so the camera can see your whole body";

type Centering = "move_left" | "move_right" | "ok" | "not_detected";

// [distance, centering, framing] from the image bounding box. Centering is flipped
// against the Python (section 9): the stage is mirrored, so a body on the left of the
// image is on the user's right and moves to their left.
export function framingCheck(bbox: [number, number, number, number] | null): [DistanceState, Centering, string] {
  if (bbox === null) return ["not_detected", "not_detected", "not_detected"];
  const [xMin, yMin, xMax, yMax] = bbox;
  const height = yMax - yMin;
  const centerX = (xMin + xMax) / 2;
  const framing = yMin <= EDGE_MARGIN ? "head_cut" : yMax >= 1 - EDGE_MARGIN ? "feet_cut" : "ok";
  const distance = height < BBOX_HEIGHT_MIN ? "too_far" : height > BBOX_HEIGHT_MAX ? "too_close" : "ok";
  const centering = centerX < 0.5 - CENTER_TOL ? "move_left" : centerX > 0.5 + CENTER_TOL ? "move_right" : "ok";
  return [distance, centering, framing];
}

export type PlacementTarget = { yaw_center: number; yaw_tol: number };

// "ok" inside the band on |yaw|; outside it, the turn toward the latched side's target.
export function facingCheck(yaw: number | null, target: PlacementTarget, latchedSign: number | null = null): string {
  if (yaw === null) return "not_detected";
  const magnitude = Math.abs(yaw);
  if (target.yaw_center - target.yaw_tol <= magnitude && magnitude <= target.yaw_center + target.yaw_tol) return "ok";
  const sign = latchedSign ?? (yaw >= 0 ? 1 : -1);
  return sign * target.yaw_center - yaw > 0 ? "turn_right" : "turn_left";
}

export type PlacementStatus = {
  phase: PlacementPhase;
  ok: boolean;
  bodyYaw: number | null;
  targetYaw: number | null;
  distance: DistanceState;
  cues: string[];
};

export const placementStatus = (phase: PlacementPhase, ok: boolean): PlacementStatus => ({
  phase, ok, bodyYaw: null, targetYaw: null, distance: "not_detected", cues: [],
});

// GUIDING until framing, distance, centring, and facing hold ok for 8 frames, then
// PLACED for good. The turn side is latched on the first yaw reading.
export class PlacementGuide {
  target: PlacementTarget;
  phase: PlacementPhase = "guiding";
  holdStreak = 0;
  targetSign: number | null = null;

  constructor(target: PlacementTarget) {
    this.target = target;
  }

  reset() {
    this.phase = "guiding";
    this.holdStreak = 0;
    this.targetSign = null;
  }

  update(kp: Keypoints): PlacementStatus {
    if (this.phase === "placed") return placementStatus("placed", true);
    const [distance, centering, framing] = framingCheck(keypointBbox(kp, MIN_SCORE));
    const yaw = hasWorld3d(kp) ? bodyYaw(kp, MIN_SCORE) : null;
    if (yaw !== null && this.targetSign === null) this.targetSign = yaw >= 0 ? 1 : -1;
    const facing = facingCheck(yaw, this.target, this.targetSign);
    const ok = framing === "ok" && distance === "ok" && centering === "ok" && facing === "ok";
    const cues = [`framing:${framing}`, `distance:${distance}`, `centering:${centering}`, `facing:${facing}`]
      .map((key) => CUE[key])
      .filter((text): text is string => text !== undefined);
    if (!cues.length && !ok) cues.push(CUE_FALLBACK);
    const status = { phase: this.phase, ok, bodyYaw: yaw, targetYaw: this.target.yaw_center, distance, cues };
    if (!ok) {
      this.holdStreak = 0;
    } else if (++this.holdStreak >= PLACED_HOLD_FRAMES) {
      this.phase = "placed";
      return { ...status, phase: "placed", cues: [] };
    }
    return status;
  }
}
