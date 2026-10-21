// Port of the research repo's src/kinematics_engine/angles.py, 3D world branch only
// (WEB_APP_PORT.md section 4), and the measurements exercise_session.py reads from the
// keypoints: the push-up floor bar (section 9a) and the curl elbow rebuild (section 9b).
// Norms are sqrt(x*x + y*y + z*z), never Math.hypot, except in the rebuild, whose Python
// uses math.hypot. Every epsilon sits where the Python puts it (section 10), so numbers
// match to 1e-9.

import type { FrameSize, Keypoints, LandmarkName } from "./types.ts";

export type Vec = [number, number, number];
// A frame's angles. Every key the engine computes is a number; only the push-up's
// floor_bar, added by the session, can be null.
export type Angles = Record<string, number | null>;

const DEG = 180 / Math.PI; // numpy's rad2deg multiplies by this constant
export const UP: Vec = [0, -1, 0]; // MediaPipe world y points down

export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: Vec) => Math.sqrt(dot(a, a));
export const dist = (a: Vec, b: Vec) => norm(sub(a, b));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// A missing angle reads as 180, as `angles.get(key, 180.0)` does. Never used for
// floor_bar, which stays null (section 9a).
export const angleOr180 = (angles: Angles, key: string) => angles[key] ?? 180;

export const world = (kp: Keypoints, name: LandmarkName): Vec => [kp[name].x_3d, kp[name].y_3d, kp[name].z_3d];

// The angle at b between ba and bc, in degrees.
export function calculateAngle(a: Vec, b: Vec, c: Vec): number {
  const ba = sub(a, b);
  const bc = sub(c, b);
  const cosine = clamp(dot(ba, bc) / (norm(ba) * norm(bc) + 1e-7), -1, 1);
  return Math.acos(cosine) * DEG;
}

// The hip->shoulder segment's tilt from the vertical line: 0 upright, 90 horizontal.
export function trunkTiltFromVertical(shoulder: Vec, hip: Vec): number {
  const trunk = sub(shoulder, hip);
  const cosine = clamp(Math.abs(dot(trunk, UP)) / (norm(trunk) * norm(UP) + 1e-7), 0, 1);
  return Math.acos(cosine) * DEG;
}

// Signed projection of point - origin onto axis, both flattened into the ground plane.
export function horizontalOffsetAlongAxis(point: Vec, origin: Vec, axis: Vec): number {
  const upNorm = norm(UP) + 1e-7;
  const upUnit: Vec = [UP[0] / upNorm, UP[1] / upNorm, UP[2] / upNorm];
  const flatten = (v: Vec): Vec => {
    const d = dot(v, upUnit);
    return [v[0] - d * upUnit[0], v[1] - d * upUnit[1], v[2] - d * upUnit[2]];
  };
  const axisH = flatten(axis);
  const n = norm(axisH) + 1e-7;
  const axisHUnit: Vec = [axisH[0] / n, axisH[1] / n, axisH[2] / n];
  return dot(flatten(sub(point, origin)), axisHUnit);
}

// The angle between the two hip->knee thighs, or null when either is degenerate.
// Divides with no epsilon, like the Python.
export function thighSplit(leftHip: Vec, leftKnee: Vec, rightHip: Vec, rightKnee: Vec): number | null {
  const left = sub(leftKnee, leftHip);
  const right = sub(rightKnee, rightHip);
  const ln = norm(left);
  const rn = norm(right);
  if (ln <= 1e-6 || rn <= 1e-6) return null;
  return Math.acos(clamp(dot(left, right) / (ln * rn), -1, 1)) * DEG;
}

// The more flexed side; a tie goes to right.
export function pickMoreBentSide(angles: Angles, leftKey: string, rightKey: string): "left" | "right" {
  return 180 - angleOr180(angles, leftKey) > 180 - angleOr180(angles, rightKey) ? "left" : "right";
}

// True when the trunk has any length in 3D on either side.
export function hasWorld3d(kp: Keypoints): boolean {
  return (["left", "right"] as const).some((side) => dist(world(kp, `${side}_shoulder`), world(kp, `${side}_hip`)) > 1e-6);
}

// Image-normalised bounding box over every joint scoring at least minScore.
export function keypointBbox(kp: Keypoints, minScore = 0.3): [number, number, number, number] | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const joint of Object.values(kp)) {
    if (joint.score >= minScore) {
      xs.push(joint.x);
      ys.push(joint.y);
    }
  }
  if (!xs.length) return null;
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// One pair's rotation about world up: positive when the left side turned away.
function pairYaw(kp: Keypoints, suffix: "hip" | "shoulder", minScore: number): number | null {
  const left = kp[`left_${suffix}`];
  const right = kp[`right_${suffix}`];
  if (left.score < minScore || right.score < minScore) return null;
  const dx = left.x_3d - right.x_3d;
  const dz = left.z_3d - right.z_3d;
  if (Math.sqrt(dx * dx + dz * dz) <= 1e-6) return null;
  return Math.atan2(dz, Math.abs(dx)) * DEG;
}

// Body yaw: the mean of the hip and shoulder pairs' yaw. 0 faces the camera.
export function bodyYaw(kp: Keypoints, minScore = 0.3): number | null {
  const vals = [pairYaw(kp, "hip", minScore), pairYaw(kp, "shoulder", minScore)].filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// extract_exercise_angles(is_3d=True), only the keys the engine reads. thigh_split is
// absent, not 0, when a thigh is degenerate: the lunge gate keys its fallback off that.
export function extractAngles(kp: Keypoints): Record<string, number> {
  const p = (name: LandmarkName) => world(kp, name);
  const angles: Record<string, number> = {};
  for (const side of ["left", "right"] as const) {
    angles[`${side}_elbow`] = calculateAngle(p(`${side}_shoulder`), p(`${side}_elbow`), p(`${side}_wrist`));
    angles[`${side}_knee`] = calculateAngle(p(`${side}_hip`), p(`${side}_knee`), p(`${side}_ankle`));
    angles[`${side}_shoulder_angle`] = calculateAngle(p(`${side}_elbow`), p(`${side}_shoulder`), p(`${side}_hip`));
    angles[`${side}_body_alignment`] = calculateAngle(p(`${side}_shoulder`), p(`${side}_hip`), p(`${side}_ankle`));
  }
  const split = thighSplit(p("left_hip"), p("left_knee"), p("right_hip"), p("right_knee"));
  if (split !== null) angles.thigh_split = split;
  return angles;
}

const SEEN_SCORE = 0.5;

// Push-up depth: mean wrist height above the mid-shoulder, in arm lengths (section 9a).
// A hidden wrist is held where the last left->right wrist vector puts it. Reads the raw
// scores, not the far-side-masked copy the state machine gets.
export class FloorBar {
  wristVec: [number, number, number] | null = null;

  reset() {
    this.wristVec = null;
  }

  update(kp: Keypoints): number | null {
    let lw = world(kp, "left_wrist");
    let rw = world(kp, "right_wrist");
    const leftSeen = kp.left_wrist.score >= SEEN_SCORE;
    const rightSeen = kp.right_wrist.score >= SEEN_SCORE;
    const v = this.wristVec;
    if (leftSeen && rightSeen) this.wristVec = [rw[0] - lw[0], rw[1] - lw[1], rw[2] - lw[2]];
    else if (v && leftSeen) rw = [lw[0] + v[0], lw[1] + v[1], lw[2] + v[2]];
    else if (v && rightSeen) lw = [rw[0] - v[0], rw[1] - v[1], rw[2] - v[2]];
    const side = kp.right_elbow.score > kp.left_elbow.score ? "right" : "left"; // a tie goes to left
    const arm =
      dist(world(kp, `${side}_shoulder`), world(kp, `${side}_elbow`)) + dist(world(kp, `${side}_elbow`), world(kp, `${side}_wrist`));
    if (arm <= 1e-6) return null;
    const shoulderY = (kp.left_shoulder.y_3d + kp.right_shoulder.y_3d) / 2;
    return ((lw[1] + rw[1]) / 2 - shoulderY) / arm;
  }
}

// The curl elbow near the top of the curl, re-read from the picture (section 9b, Python
// CurlArmRebuild in exercise_session.py). MediaPipe's world depth under-folds the elbow
// there, its image x, y do not: the upper arm keeps MediaPipe's depth clipped to what its
// straight-arm image length allows, the forearm gets none. Blended in by the raw angle, so
// the straight-arm end reads as before. Raw values stay as `*_raw` keys. Calibration is
// in pixels, so a new frame size starts it over (the Python fixes the size at start).
export class CurlArmRebuild {
  static BLEND_RAW = 130;
  static BLEND_REBUILT = 110;
  static STRAIGHT_MIN = 140; // calibrate on frames where the raw elbow reads this straight
  static CALIB_SCORE = 0.5;
  static CALIB_SAMPLES = 150;
  static CALIB_MIN = 10;

  size: FrameSize | null = null;
  calib = { left: { lengths: [] as number[], scales: [] as number[] }, right: { lengths: [] as number[], scales: [] as number[] } };

  reset() {
    this.size = null;
    this.calib = { left: { lengths: [], scales: [] }, right: { lengths: [], scales: [] } };
  }

  update(kp: Keypoints, angles: Record<string, number>, size: FrameSize): Record<string, number> {
    if (!this.size || this.size[0] !== size[0] || this.size[1] !== size[1]) {
      this.reset();
      this.size = size;
    }
    const [width, height] = size;
    const px = (j: LandmarkName): [number, number] => [kp[j].x * width, kp[j].y * height];
    const C = CurlArmRebuild;
    const out = { ...angles };
    for (const side of ["left", "right"] as const) {
      const [S, E, W, H] = (["shoulder", "elbow", "wrist", "hip"] as const).map((j) => `${side}_${j}` as LandmarkName);
      const raw = angles[`${side}_elbow`];
      const rawSh = angles[`${side}_shoulder_angle`];
      if (raw === undefined) continue;
      out[`${side}_elbow_raw`] = raw;
      out[`${side}_shoulder_angle_raw`] = rawSh;
      const score = Math.min(kp[S].score, kp[E].score, kp[W].score);
      if (score < 0.3) continue;
      const [sx, sy] = px(S);
      const [ex, ey] = px(E);
      const [wx, wy] = px(W);
      const u = [ex - sx, ey - sy];
      const f = [wx - ex, wy - ey];
      const lu = Math.hypot(u[0], u[1]);
      const worldU = Math.hypot(kp[E].x_3d - kp[S].x_3d, kp[E].y_3d - kp[S].y_3d, kp[E].z_3d - kp[S].z_3d);
      const { lengths, scales } = this.calib[side];
      if (raw >= C.STRAIGHT_MIN && score >= C.CALIB_SCORE && lu > 0 && worldU > 0) {
        lengths.push(lu);
        scales.push(worldU / lu);
        if (lengths.length > C.CALIB_SAMPLES) lengths.shift();
        if (scales.length > C.CALIB_SAMPLES) scales.shift();
      }
      const w = Math.min(1, Math.max(0, (C.BLEND_RAW - raw) / (C.BLEND_RAW - C.BLEND_REBUILT)));
      if (w === 0 || lengths.length < C.CALIB_MIN) continue;
      const ref = [...lengths].sort((a, b) => a - b)[Math.trunc(0.9 * (lengths.length - 1))]; // 90th percentile
      const mPerPx = [...scales].sort((a, b) => a - b)[Math.floor(scales.length / 2)];
      const bound = Math.sqrt(Math.max(ref * ref - lu * lu, 0));
      const dz = Math.max(-bound, Math.min(bound, (kp[E].z_3d - kp[S].z_3d) / mPerPx));
      const rebuilt = vectorAngle([-u[0], -u[1], -dz], [f[0], f[1], 0]);
      if (rebuilt === null) continue;
      out[`${side}_elbow`] = w * rebuilt + (1 - w) * raw;
      if (rawSh !== undefined && kp[H].score >= 0.3) {
        const [hx, hy] = px(H);
        const sh = vectorAngle([u[0], u[1], dz], [hx - sx, hy - sy, (kp[H].z_3d - kp[S].z_3d) / mPerPx]);
        if (sh !== null) out[`${side}_shoulder_angle`] = w * sh + (1 - w) * rawSh;
      }
    }
    return out;
  }
}

// The angle between u and v in degrees, or null when either has no length.
function vectorAngle(u: Vec, v: Vec): number | null {
  const nu = Math.hypot(...u);
  const nv = Math.hypot(...v);
  if (nu < 1e-9 || nv < 1e-9) return null;
  return Math.acos(clamp((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv), -1, 1)) * DEG;
}
