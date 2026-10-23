// Port of src/rule_based/form_rules.py (WEB_APP_PORT.md sections 4, 5, 8). The check
// registry is keyed by the row's `check` name and reads its bars from the rule's
// `threshold`; the per-rep accumulator is chosen by engine key (ADR-0006, section 5.3).

import type { Rule } from "../exercise";
import {
  angleOr180,
  calculateAngle,
  dist,
  dot,
  horizontalOffsetAlongAxis,
  norm,
  pickMoreBentSide,
  sub,
  trunkTiltFromVertical,
  UP,
  type Angles,
  type Vec,
} from "./angles.ts";
import type { Keypoints, LandmarkName } from "./types.ts";

export const MIN_LM_SCORE = 0.3;
// |sin yaw| above which the far side is untrusted: the knee rules' profile skip and the
// session's far-side score mask.
export const PROFILE_RATIO_MIN = 0.85;
const KNEE_PARALLEL_BAND = 8; // knee angle read only this close to partial_squat's depth_target
const LUNGE_BOTTOM_WINDOW = 2; // frames either side of the front knee's deepest frame

export type Side = "left" | "right";
// Accumulated per attempt. Infinity is the "never seen" sentinel; null is absent.
export type Stats = Record<string, number | null>;
type Threshold = Record<string, number>;

// A world point, or null when the joint is under MIN_LM_SCORE or there are no keypoints.
export function point3d(kp: Keypoints | null, name: LandmarkName): Vec | null {
  if (!kp || kp[name].score < MIN_LM_SCORE) return null;
  return [kp[name].x_3d, kp[name].y_3d, kp[name].z_3d];
}

export function hipProfileRatio(kp: Keypoints | null): number | null {
  const left = point3d(kp, "left_hip");
  const right = point3d(kp, "right_hip");
  if (!left || !right) return null;
  const d = dist(left, right);
  if (d <= 1e-6) return null;
  return Math.abs(left[2] - right[2]) / d;
}

// The side farther from the camera at a strong profile, else null.
export function farSideAtStrongProfile(kp: Keypoints | null): Side | null {
  const left = point3d(kp, "left_hip");
  const right = point3d(kp, "right_hip");
  if (!left || !right) return null;
  const d = dist(left, right);
  if (d <= 1e-6) return null;
  const dz = left[2] - right[2];
  if (Math.abs(dz) / d <= PROFILE_RATIO_MIN) return null;
  return dz > 0 ? "left" : "right";
}

function trunkTilts(kp: Keypoints | null): number[] {
  const tilts: number[] = [];
  for (const side of ["left", "right"] as const) {
    const shoulder = point3d(kp, `${side}_shoulder`);
    const hip = point3d(kp, `${side}_hip`);
    if (shoulder && hip) tilts.push(trunkTiltFromVertical(shoulder, hip));
  }
  return tilts;
}

const meanTrunkTilt = (kp: Keypoints | null) => {
  const t = trunkTilts(kp);
  return t.length ? t.reduce((a, b) => a + b, 0) / t.length : null;
};
const minTrunkTilt = (kp: Keypoints | null) => {
  const t = trunkTilts(kp);
  return t.length ? Math.min(...t) : null;
};
// Push-up: the shoulder-hip-ankle angle of the side whose three joints score best (the
// lowest of the three decides a side, a tie goes to left). The hidden far ankle is guessed
// low at the 45 degree camera. Without keypoints both sides are averaged.
function trustedBodyAlignment(angles: Angles, kp: Keypoints | null): number {
  const left = angleOr180(angles, "left_body_alignment");
  const right = angleOr180(angles, "right_body_alignment");
  if (!kp) return (left + right) / 2;
  return trustedBodySide(kp) === "right" ? right : left;
}

function trustedBodySide(kp: Keypoints): Side {
  const trust = (side: Side) => Math.min(...(["shoulder", "hip", "ankle"] as const).map((j) => kp[`${side}_${j}`].score));
  return trust("right") > trust("left") ? "right" : "left";
}

// The trusted side's hip below its shoulder-ankle line in world y (down): a sag, judged
// against the tighter sag bar. False for a pike or a missing joint (SeniorProject ded29a2).
function hipSags(kp: Keypoints | null): boolean {
  if (!kp) return false;
  const side = trustedBodySide(kp);
  const [s, h, a] = (["shoulder", "hip", "ankle"] as const).map((j) => point3d(kp, `${side}_${j}`));
  if (!s || !h || !a) return false;
  const d = sub(a, s);
  const dd = dot(d, d);
  if (dd <= 1e-12) return false;
  const t = dot(sub(h, s), d) / dd;
  return h[1] - (s[1] + t * d[1]) > 0;
}

// [3D angle between the two knee->ankle lines, signed convergence along the hip line], or
// null. The convergence gives each knee its ankle's z, so the guessed depth drops out of it
// (SeniorProject eddf6f1, KNEE_CONVERGE_MIN).
function kneeParallelism(kp: Keypoints | null): [number, number] | null {
  const names = ["left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"] as const;
  const p = Object.fromEntries(names.map((n) => [n, point3d(kp, n)])) as Record<(typeof names)[number], Vec | null>;
  if (names.some((n) => p[n] === null)) return null;
  const pt = p as Record<(typeof names)[number], Vec>;
  const profile = hipProfileRatio(kp);
  if (profile !== null && profile > PROFILE_RATIO_MIN) return null;
  const shank = { left: sub(pt.left_knee, pt.left_ankle), right: sub(pt.right_knee, pt.right_ankle) };
  if (dist(shank.left, [0, 0, 0]) <= 1e-6 || dist(shank.right, [0, 0, 0]) <= 1e-6) return null;
  const angle = calculateAngle(shank.left, [0, 0, 0], shank.right);
  const leftToRight = sub(pt.right_hip, pt.left_hip);
  const rightToLeft: Vec = [-leftToRight[0], -leftToRight[1], -leftToRight[2]];
  const flat = (knee: Vec, ankle: Vec): Vec => [knee[0], knee[1], ankle[2]];
  const direction =
    horizontalOffsetAlongAxis(flat(pt.left_knee, pt.left_ankle), pt.left_ankle, leftToRight) +
    horizontalOffsetAlongAxis(flat(pt.right_knee, pt.right_ankle), pt.right_ankle, rightToLeft);
  return [angle, direction];
}

// Signed frontal part of the shank angle (deg): each shank's medial tilt from UP, seen along
// the body's forward axis (lateral = the hip line flattened onto the ground), both added,
// positive = knees inside their ankles. Null wherever kneeParallelism abstains
// (SeniorProject 00437d1, _knee_frontal_tilt).
function kneeFrontalTilt(kp: Keypoints | null): number | null {
  if (kneeParallelism(kp) === null) return null;
  const p = (n: LandmarkName) => point3d(kp, n) as Vec;
  const across = sub(p("right_hip"), p("left_hip"));
  const along = dot(across, UP);
  const flat: Vec = [across[0] - along * UP[0], across[1] - along * UP[1], across[2] - along * UP[2]];
  const length = norm(flat);
  if (length <= 1e-6) return null;
  const lateral: Vec = [flat[0] / length, flat[1] / length, flat[2] / length];
  const tilt = (side: Side, medial: Vec) => {
    const shank = sub(p(`${side}_knee`), p(`${side}_ankle`));
    return (Math.atan2(dot(shank, medial), dot(shank, UP)) * 180) / Math.PI;
  };
  return tilt("left", lateral) + tilt("right", [-lateral[0], -lateral[1], -lateral[2]]);
}

// Both knees' sideways offsets from their own toe lines in the picture, added, in hip widths,
// image x only, + = outside; null without keypoints or with the hips level in x
// (SeniorProject 4fdba6b, _knee_toe_line).
function kneeToeLine(kp: Keypoints | null): number | null {
  if (!kp) return null;
  const hipWidth = Math.abs(kp.right_hip.x - kp.left_hip.x);
  if (hipWidth <= 1e-6) return null;
  let total = 0;
  for (const [side, other] of [["left", "right"], ["right", "left"]] as const) {
    const outward = kp[`${side}_hip`].x > kp[`${other}_hip`].x ? 1 : -1;
    total += ((kp[`${side}_knee`].x - kp[`${side}_foot_index`].x) * outward) / hipWidth;
  }
  return total;
}

const stat = (stats: Stats, key: string, fallback: number) => stats[key] ?? fallback;

function lungeFrontKnee(stats: Stats): number | null {
  const left = stat(stats, "min_left_knee", Infinity);
  const right = stat(stats, "min_right_knee", Infinity);
  return left === Infinity || right === Infinity ? null : Math.min(left, right);
}

// check: true violated, false satisfied, null no verdict. value: the number the rule
// compared, written under the rule's name when an attempt ends (section 8).
type Check = {
  requiresKeypoints: boolean;
  check(angles: Angles, kp: Keypoints | null, side: Side | null, stats: Stats, t: Threshold): boolean | null;
  value(stats: Stats, t: Threshold): number | null;
};


export const CHECKS: Record<string, Check> = {
  partial_squat: {
    requiresKeypoints: false,
    check(angles, kp, side, stats, t) {
      const minKnee = stat(stats, "min_knee", Infinity);
      return minKnee === Infinity ? null : minKnee > t.depth_target;
    },
    value: (stats) => stats.min_knee ?? null,
  },
  // Both from the toe line at the rep's deepest frame, one signed number, so at most one fires.
  knee_valgus: {
    requiresKeypoints: true,
    check(angles, kp, side, stats, t) {
      const toeLine = stats.knee_toe_line ?? null;
      return toeLine === null ? null : toeLine < t.toe_line_in;
    },
    value: (stats) => stats.knee_toe_line ?? null,
  },
  knee_varus: {
    requiresKeypoints: true,
    check(angles, kp, side, stats, t) {
      const toeLine = stats.knee_toe_line ?? null;
      return toeLine === null ? null : toeLine > t.toe_line_out;
    },
    value: (stats) => stats.knee_toe_line ?? null,
  },
  rounded_back: {
    requiresKeypoints: true,
    check(angles, kp, side, stats, t) {
      const tilt = meanTrunkTilt(kp);
      return tilt === null ? null : tilt > t.tilt_max;
    },
    value: (stats) => stats.max_back_tilt ?? null,
  },
  hip_sag_or_pike: {
    requiresKeypoints: false,
    check: (angles, kp, side, stats, t) => trustedBodyAlignment(angles, kp) < (hipSags(kp) ? t.sag_align_min : t.align_min),
    value: (stats) => stats.min_body_alignment ?? null,
  },
  partial_pushup: {
    requiresKeypoints: false,
    check(angles, kp, side, stats, t) {
      const minBar = stat(stats, "min_floor_bar", Infinity);
      return minBar === Infinity ? null : minBar > t.floor_bar_max;
    },
    value: (stats) => stats.min_floor_bar ?? null,
  },
  shallow_lunge: {
    requiresKeypoints: false,
    check(angles, kp, side, stats, t) {
      const front = lungeFrontKnee(stats);
      return front === null ? null : front > t.front_shallow_max;
    },
    value: lungeFrontKnee,
  },
  excessive_front_knee_flexion: {
    requiresKeypoints: false,
    check(angles, kp, side, stats, t) {
      const front = lungeFrontKnee(stats);
      return front === null ? null : front < t.front_deep_min;
    },
    value: lungeFrontKnee,
  },
  forward_trunk_lean: {
    requiresKeypoints: true,
    check(angles, kp, side, stats, t) {
      const tilt = minTrunkTilt(kp);
      return tilt === null ? null : tilt > t.tilt_max;
    },
    value: (stats) => stats.max_torso_tilt ?? null,
  },
  // The back knee judged at the bottom; no verdict on an attempt that never reached depth.
  straight_back_leg: {
    requiresKeypoints: false,
    check(angles, kp, side, stats, t) {
      const minLeft = stat(stats, "min_left_knee", Infinity);
      const minRight = stat(stats, "min_right_knee", Infinity);
      if (minLeft === Infinity || minRight === Infinity) return null;
      if (Math.min(minLeft, minRight) > t.front_target) return null;
      const front = minLeft <= minRight ? "left" : "right"; // a tie goes to left
      const back = stat(stats, `back_at_${front}_bottom`, Infinity);
      return back === Infinity ? null : back > t.back_max_min;
    },
    value(stats) {
      const front = stat(stats, "min_left_knee", Infinity) <= stat(stats, "min_right_knee", Infinity) ? "left" : "right";
      return stats[`back_at_${front}_bottom`] ?? null;
    },
  },
  elbow_flare: {
    requiresKeypoints: true,
    check(angles, kp, side, stats, t) {
      if (side === null) return null;
      const angle = angles[`${side}_shoulder_angle`] ?? null;
      const shoulder = point3d(kp, `${side}_shoulder`);
      const hip = point3d(kp, `${side}_hip`);
      const elbow = point3d(kp, `${side}_elbow`);
      if (angle === null || !shoulder || !hip || !elbow) return null;
      if (dist(shoulder, hip) <= 1e-6 || dist(shoulder, elbow) <= 1e-6) return null;
      return angle > t.flare_max;
    },
    value: () => null, // no statistic is recorded for it (section 8)
  },
  partial_curl: {
    requiresKeypoints: false,
    check(angles, kp, side, stats, t) {
      const min = stat(stats, "min_elbow", Infinity);
      const max = stat(stats, "max_elbow", -Infinity);
      if (min === Infinity || max === -Infinity) return null;
      return !(min <= t.flex_target && max >= t.ext_target);
    },
    // The half that failed: the top when it was missed, otherwise the bottom.
    value: (stats, t) => (stat(stats, "min_elbow", Infinity) > t.flex_target ? stats.min_elbow : stats.max_elbow) ?? null,
  },
};

export type Accumulator = {
  init(): Stats;
  accumulate(stats: Stats, angles: Angles, kp: Keypoints | null, side: Side | null): void;
  pickActiveSide: ((angles: Angles) => Side) | null;
};

const num = (stats: Stats, key: string) => stats[key] as number;

function squat(rules: Rule[]): Accumulator {
  const depth = rules.find((r) => r.check === "partial_squat")?.threshold.depth_target;
  if (depth === undefined) throw new Error("the squat accumulator reads partial_squat's depth_target");
  return {
    init: () => ({
      min_knee: Infinity,
      max_back_tilt: -Infinity,
      _knee_parallel_n: 0,
      _knee_parallel_sum: 0,
      _knee_converge_sum: 0,
      knee_parallel_deg: null,
      knee_converge_sign: null,
      _knee_frontal_n: 0,
      _knee_frontal_sum: 0,
      knee_frontal_deg: null,
      knee_toe_line: null,
    }),
    accumulate(stats, angles, kp) {
      const avgKnee = (angleOr180(angles, "left_knee") + angleOr180(angles, "right_knee")) / 2;
      if (avgKnee < stat(stats, "min_knee", Infinity)) stats.knee_toe_line = kneeToeLine(kp); // the deepest frame so far
      stats.min_knee = Math.min(stat(stats, "min_knee", Infinity), avgKnee);
      const tilt = meanTrunkTilt(kp);
      if (tilt !== null) stats.max_back_tilt = Math.max(stat(stats, "max_back_tilt", -Infinity), tilt);
      if (Math.abs(avgKnee - depth) <= KNEE_PARALLEL_BAND) {
        const reading = kneeParallelism(kp);
        if (reading) {
          const n = stat(stats, "_knee_parallel_n", 0) + 1;
          stats._knee_parallel_n = n;
          stats._knee_parallel_sum = stat(stats, "_knee_parallel_sum", 0) + reading[0];
          stats._knee_converge_sum = stat(stats, "_knee_converge_sum", 0) + reading[1];
          stats.knee_parallel_deg = num(stats, "_knee_parallel_sum") / n;
          stats.knee_converge_sign = num(stats, "_knee_converge_sum") / n;
        }
        const frontal = kneeFrontalTilt(kp);
        if (frontal !== null) {
          const n = stat(stats, "_knee_frontal_n", 0) + 1;
          stats._knee_frontal_n = n;
          stats._knee_frontal_sum = stat(stats, "_knee_frontal_sum", 0) + frontal;
          stats.knee_frontal_deg = num(stats, "_knee_frontal_sum") / n;
        }
      }
    },
    pickActiveSide: null,
  };
}

const pushup: Accumulator = {
  init: () => ({ min_floor_bar: Infinity, min_elbow: Infinity, min_body_alignment: Infinity }),
  accumulate(stats, angles, kp) {
    const floorBar = angles.floor_bar ?? null;
    if (floorBar !== null) stats.min_floor_bar = Math.min(stat(stats, "min_floor_bar", Infinity), floorBar);
    const avgElbow = (angleOr180(angles, "left_elbow") + angleOr180(angles, "right_elbow")) / 2;
    stats.min_elbow = Math.min(stat(stats, "min_elbow", Infinity), avgElbow);
    stats.min_body_alignment = Math.min(stat(stats, "min_body_alignment", Infinity), trustedBodyAlignment(angles, kp));
  },
  pickActiveSide: null,
};

const lunge: Accumulator = {
  init: () => ({
    min_left_knee: Infinity, min_right_knee: Infinity,
    back_at_left_bottom: Infinity, back_at_right_bottom: Infinity,
    left_since_min: Infinity, right_since_min: Infinity,
    prev1_left_knee: Infinity, prev1_right_knee: Infinity,
    prev2_left_knee: Infinity, prev2_right_knee: Infinity,
    max_torso_tilt: -Infinity,
    profile_ratio_sum: 0, profile_frames: 0, hip_dz_sum: 0,
  }),
  accumulate(stats, angles, kp) {
    const knee = { left: angleOr180(angles, "left_knee"), right: angleOr180(angles, "right_knee") };
    // The back knee at the bottom, for both legs: the other knee's smallest value within
    // LUNGE_BOTTOM_WINDOW frames of this side's deepest frame.
    for (const [side, o] of [["left", "right"], ["right", "left"]] as const) {
      if (knee[side] < num(stats, `min_${side}_knee`)) {
        stats[`back_at_${side}_bottom`] = Math.min(knee[o], num(stats, `prev1_${o}_knee`), num(stats, `prev2_${o}_knee`));
        stats[`${side}_since_min`] = 0;
      } else if (num(stats, `${side}_since_min`) < LUNGE_BOTTOM_WINDOW) {
        stats[`${side}_since_min`] = num(stats, `${side}_since_min`) + 1;
        stats[`back_at_${side}_bottom`] = Math.min(num(stats, `back_at_${side}_bottom`), knee[o]);
      }
    }
    for (const side of ["left", "right"] as const) {
      stats[`prev2_${side}_knee`] = stats[`prev1_${side}_knee`];
      stats[`prev1_${side}_knee`] = knee[side];
      stats[`min_${side}_knee`] = Math.min(num(stats, `min_${side}_knee`), knee[side]);
    }
    const tilt = minTrunkTilt(kp);
    if (tilt !== null) stats.max_torso_tilt = Math.max(stat(stats, "max_torso_tilt", -Infinity), tilt);
    const left = point3d(kp, "left_hip");
    const right = point3d(kp, "right_hip");
    if (left && right) {
      const d = dist(left, right);
      if (d > 1e-6) {
        const dz = left[2] - right[2];
        stats.profile_ratio_sum = stat(stats, "profile_ratio_sum", 0) + Math.abs(dz) / d;
        stats.profile_frames = stat(stats, "profile_frames", 0) + 1;
        stats.hip_dz_sum = stat(stats, "hip_dz_sum", 0) + dz;
      }
    }
  },
  pickActiveSide: null,
};

const curl: Accumulator = {
  init: () => ({ min_elbow: Infinity, max_elbow: -Infinity, profile_ratio_sum: 0, profile_frames: 0 }),
  accumulate(stats, angles, kp, side) {
    if (side === null) return;
    const elbow = angleOr180(angles, `${side}_elbow`);
    stats.min_elbow = Math.min(stat(stats, "min_elbow", Infinity), elbow);
    stats.max_elbow = Math.max(stat(stats, "max_elbow", -Infinity), elbow);
    const profile = hipProfileRatio(kp);
    if (profile !== null) {
      stats.profile_ratio_sum = stat(stats, "profile_ratio_sum", 0) + profile;
      stats.profile_frames = stat(stats, "profile_frames", 0) + 1;
    }
  },
  pickActiveSide: (angles) => pickMoreBentSide(angles, "left_elbow", "right_elbow"),
};

export function accumulatorFor(engineKey: string, rules: Rule[]): Accumulator {
  switch (engineKey) {
    case "squat":
      return squat(rules);
    case "pushup":
      return pushup;
    case "lunge":
      return lunge;
    case "dumbbell_biceps_curls":
      return curl;
    default:
      throw new Error(`no accumulator for engine key ${engineKey}`);
  }
}
