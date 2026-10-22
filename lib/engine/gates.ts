// Port of src/pipeline/ready_pose.py and placement_guide.py (WEB_APP_PORT.md sections 3,
// 9, 10): the ready pose, the ready gate on the wall clock, and the placement guide. No
// 2D fallback: without world 3D the ready pose and the yaw read null.

import { bodyYaw, calculateAngle, hasWorld3d, keypointBbox, world } from "./angles.ts";
import { trunkTiltDeg } from "./evaluator.ts";
import type { DistanceState, Keypoints, LandmarkName, PlacementPhase, ReadyPhase } from "./types.ts";
import type { Side } from "./rules.ts";

const READY_REQUIRED_JOINTS: LandmarkName[] = [
  "nose", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
  "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
];
const READY_MIN_SCORE = 0.5;
const READY_ELBOW_MIN = 150;
const T_POSE: [number, number] = [65, 115]; // shoulder abduction, degrees
const A_POSE: [number, number] = [25, 55];
// Standing: mid-hip below mid-shoulder by this fraction of the trunk (y down). A push-up
// plank with straight arms is a T pose by the arm angles alone and ended sets.
const READY_UPRIGHT_MIN = 0.7;
const READY_HOLD_FRAMES = 8;
const END_HOLD_FRAMES = 30;
const END_GRACE_S = 3;
export const COUNTDOWN_S = 3;

// Both arms straight and abducted into the same band, whole body visible.
export function detectReadyPose(kp: Keypoints): "t_pose" | "a_pose" | null {
  if (!READY_REQUIRED_JOINTS.every((n) => kp[n].score >= READY_MIN_SCORE)) return null;
  if (!hasWorld3d(kp)) return null;
  const mid = (a: LandmarkName, b: LandmarkName) => world(kp, a).map((v, i) => (v + world(kp, b)[i]) / 2);
  const shoulder = mid("left_shoulder", "right_shoulder");
  const hip = mid("left_hip", "right_hip");
  const trunk = Math.hypot(hip[0] - shoulder[0], hip[1] - shoulder[1], hip[2] - shoulder[2]);
  if (!(trunk > 1e-6 && (hip[1] - shoulder[1]) / trunk >= READY_UPRIGHT_MIN)) return null;
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

// The plank top, side-on (SeniorProject 7420788, 2026-10-21). One side is judged, the one
// whose lowest shoulder, elbow, wrist, hip, knee, and ankle score is higher (a tie goes to
// left), since at a side view the far limbs are guessed. On it all six score 0.5 or more,
// the arm is straight (the T pose's 150), the leg straight (so hands and knees is not a
// plank), and the trunk is tiltMin or more from vertical (the row's arming tilt).
const PLANK_KNEE_MIN = 150;
const PLANK_SIDE_JOINTS = ["shoulder", "elbow", "wrist", "hip", "knee", "ankle"] as const;

export function detectPlank(kp: Keypoints, tiltMin: number): "plank" | null {
  if (!hasWorld3d(kp)) return null;
  const low = (side: Side) => Math.min(...PLANK_SIDE_JOINTS.map((j) => kp[`${side}_${j}`].score));
  const side: Side = low("left") >= low("right") ? "left" : "right";
  if (low(side) < READY_MIN_SCORE) return null;
  const [shoulder, elbow, wrist, hip, knee, ankle] = PLANK_SIDE_JOINTS.map((j) => world(kp, `${side}_${j}`));
  if (calculateAngle(shoulder, elbow, wrist) < READY_ELBOW_MIN) return null;
  if (calculateAngle(hip, knee, ankle) < PLANK_KNEE_MIN) return null;
  const tilt = trunkTiltDeg(kp);
  return tilt !== null && tilt >= tiltMin ? "plank" : null;
}

// The pose that starts a set, and for a plank the bars: tiltMin to start, leftTiltMax to
// end on getting up.
export type ReadyKind = { pose: "t_pose" } | { pose: "plank"; tiltMin: number; leftTiltMax: number };

export type ReadyStatus = {
  phase: ReadyPhase;
  pose: "t_pose" | "a_pose" | "plank" | null;
  countdownS: number | null;
  justActivated: boolean;
  justEnded: boolean;
};

// WAITING (a ready pose held 8 frames, framed) -> COUNTDOWN (3 s, then held at 0 until placed)
// -> ACTIVE -> ENDED (a T pose held 30 frames, after 3 s of the set). ENDED is terminal.
// For a plank the ready pose is the plank top and ENDED is getting up: the trunk under
// leftTiltMax held 30 frames, standing or kneeling upright.
export class ReadyPoseGate {
  kind: ReadyKind;
  phase: ReadyPhase = "waiting";
  endedByPose = false;
  holdStreak = 0;
  deadlineMs = 0;
  activeSinceMs = 0;

  constructor(kind: ReadyKind = { pose: "t_pose" }) {
    this.kind = kind;
  }

  reset() {
    this.phase = "waiting";
    this.endedByPose = false;
    this.holdStreak = 0;
    this.deadlineMs = 0;
    this.activeSinceMs = 0;
  }

  // placed: placement's verdict, the countdown holds at 0 without it. framed: its stand
  // check while waiting, the ready pose counts only with it. Both true without placement.
  update(kp: Keypoints, nowMs: number, placed: boolean, framed = true): ReadyStatus {
    const kind = this.kind;
    const pose = kind.pose === "plank" ? detectPlank(kp, kind.tiltMin) : detectReadyPose(kp);
    const status =(countdownS: number | null = null, justActivated = false, justEnded = false): ReadyStatus => ({
      phase: this.phase, pose, countdownS, justActivated, justEnded,
    });
    const secondsLeft = () => Math.max(0, (this.deadlineMs - nowMs) / 1000);

    if (this.phase === "waiting") {
      if (pose === null || !framed) {
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
      // Only the T pose ends a set; an A pose is too close to standing between reps. A
      // plank set ends on getting up; a rest on hands and knees keeps the trunk level.
      let ending: boolean;
      if (kind.pose === "plank") {
        const tilt = trunkTiltDeg(kp);
        ending = tilt !== null && tilt < kind.leftTiltMax;
      } else {
        ending = pose === "t_pose";
      }
      if (ending && (nowMs - this.activeSinceMs) / 1000 >= END_GRACE_S) {
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
// A body lying across the frame (the plank start): distance by the width. Scaled from
// portrait phone sets, placeholders until a landscape run (SeniorProject 7420788).
const PLANK_WIDTH_MIN = 0.4;
const PLANK_WIDTH_MAX = 0.95;
const PLACED_HOLD_FRAMES = 8;
const CUE: Record<string, string> = {
  "framing:head_cut": "Step back -- your head is out of frame",
  "framing:feet_cut": "Step back -- your feet are out of frame",
  "distance:too_far": "Move closer to the camera",
  "distance:too_close": "Step back from the camera",
  // Lying (the plank start): the user is on the floor, so the cue moves the phone
  // (SeniorProject 3da5e15).
  "lying_framing:cut": "Fit your whole body in the frame",
  "lying_distance:too_far": "Bring the phone closer so your body fills the frame",
  "lying_distance:too_close": "Fit your whole body in the frame",
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

// framingCheck for a body lying across the frame: distance by the width, "cut" when the
// box reaches any edge, centring as framingCheck.
export function lyingFramingCheck(bbox: [number, number, number, number] | null): [DistanceState, Centering, string] {
  if (bbox === null) return ["not_detected", "not_detected", "not_detected"];
  const [xMin, yMin, xMax, yMax] = bbox;
  const width = xMax - xMin;
  const inside = xMin > EDGE_MARGIN && xMax < 1 - EDGE_MARGIN && yMin > EDGE_MARGIN && yMax < 1 - EDGE_MARGIN;
  const distance = width < PLANK_WIDTH_MIN ? "too_far" : width > PLANK_WIDTH_MAX ? "too_close" : "ok";
  return [distance, framingCheck(bbox)[1], inside ? "ok" : "cut"];
}

export type PlacementTarget = { yaw_center: number; yaw_tol: number };

// "ok" inside the band on |yaw|; outside it, the turn toward the latched side's target.
// requireSign makes the band one-sided: "ok" only on the latched side.
// Positive yaw is turning to your own left (SeniorProject 504a5fc, flipped 2026-10-22).
export function facingCheck(yaw: number | null, target: PlacementTarget, latchedSign: number | null = null, requireSign = false): string {
  if (yaw === null) return "not_detected";
  const magnitude = requireSign && latchedSign !== null ? latchedSign * yaw : Math.abs(yaw);
  if (target.yaw_center - target.yaw_tol <= magnitude && magnitude <= target.yaw_center + target.yaw_tol) return "ok";
  const sign = latchedSign ?? (yaw >= 0 ? 1 : -1);
  return sign * target.yaw_center - yaw > 0 ? "turn_left" : "turn_right";
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
// PLACED for good. The turn side is latched on the first yaw reading. A near side (the
// arm the user chose) must face the camera: positive yaw is the left side turned away, so
// left is the negative band, fixed from the start and one-sided.
export class PlacementGuide {
  target: PlacementTarget;
  nearSign: number | null;
  phase: PlacementPhase = "guiding";
  holdStreak = 0;
  targetSign: number | null = null;
  framing: typeof framingCheck;
  lying: boolean;

  // lying: the body lies across the frame (the plank start), so framing is lyingFramingCheck.
  constructor(target: PlacementTarget, nearSide: Side | null = null, lying = false) {
    this.target = target;
    this.framing = lying ? lyingFramingCheck : framingCheck;
    this.lying = lying;
    this.nearSign = nearSide === null ? null : nearSide === "left" ? -1 : 1;
    this.targetSign = this.nearSign;
  }

  reset() {
    this.phase = "guiding";
    this.holdStreak = 0;
    this.targetSign = this.nearSign;
  }

  update(kp: Keypoints): PlacementStatus {
    if (this.phase === "placed") return placementStatus("placed", true);
    const [distance, centering, framing] = this.framing(keypointBbox(kp, MIN_SCORE));
    const yaw = hasWorld3d(kp) ? bodyYaw(kp, MIN_SCORE) : null;
    if (yaw !== null && this.targetSign === null) this.targetSign = yaw >= 0 ? 1 : -1;
    const facing = facingCheck(yaw, this.target, this.targetSign, this.nearSign !== null);
    const ok = framing === "ok" && distance === "ok" && centering === "ok" && facing === "ok";
    const prefix = this.lying ? "lying_" : "";
    const cues = cuesOf(ok, `${prefix}framing:${framing}`, `${prefix}distance:${distance}`, `centering:${centering}`, `facing:${facing}`);
    const status = { phase: this.phase, ok, bodyYaw: yaw, targetYaw: this.target.yaw_center, distance, cues };
    if (!ok) {
      this.holdStreak = 0;
    } else if (++this.holdStreak >= PLACED_HOLD_FRAMES) {
      this.phase = "placed";
      return { ...status, phase: "placed", cues: [] };
    }
    return status;
  }

  // Framing, distance, and centring only, while the ready gate waits for the T pose: the
  // pose counts only once these pass, so the countdown's hold is left for the turn. Nothing
  // is held or latched; the phase stays guiding.
  standCheck(kp: Keypoints): PlacementStatus {
    const [distance, centering, framing] = framingCheck(keypointBbox(kp, MIN_SCORE));
    const ok = framing === "ok" && distance === "ok" && centering === "ok";
    const cues = cuesOf(ok, `framing:${framing}`, `distance:${distance}`, `centering:${centering}`);
    return { phase: this.phase, ok, bodyYaw: null, targetYaw: null, distance, cues };
  }
}

// The cue text of every failed check, in the given order.
function cuesOf(ok: boolean, ...keys: string[]): string[] {
  const cues = [...new Set(keys.map((key) => CUE[key]).filter((text): text is string => text !== undefined))];
  if (!cues.length && !ok) cues.push(CUE_FALLBACK);
  return cues;
}
