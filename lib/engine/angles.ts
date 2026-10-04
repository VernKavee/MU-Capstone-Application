// Port of the research repo's src/kinematics_engine/angles.py, 3D world branch only
// (WEB_APP_PORT.md section 4). Norms are sqrt(x*x + y*y + z*z), never Math.hypot, and
// every epsilon sits where the Python puts it (section 10), so numbers match to 1e-9.

import type { Keypoints, LandmarkName } from "./types.ts";

export type Vec = [number, number, number];
// A frame's angles. Every key the engine computes is a number; only the push-up's
// floor_bar, added by the session, can be null.
export type Angles = Record<string, number | null>;

const DEG = 180 / Math.PI; // numpy's rad2deg multiplies by this constant
const UP: Vec = [0, -1, 0]; // MediaPipe world y points down

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
