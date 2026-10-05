// Run with `npm run test:unit`. Hand-checked geometry, plus four values printed by the
// research repo's angles.py at 2695984 for the same arbitrary points. The floor bar cases
// are ported from tests/test_exercise_session.py (test_floor_bar_*).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bodyYaw,
  calculateAngle,
  extractAngles,
  FloorBar,
  hasWorld3d,
  horizontalOffsetAlongAxis,
  keypointBbox,
  pickMoreBentSide,
  thighSplit,
  trunkTiltFromVertical,
  type Vec,
} from "./angles.ts";
import { emptyKeypoints, type Keypoints, type LandmarkName } from "./types.ts";

const close = (actual: number | null, expected: number, tol = 1e-9) =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `${actual} != ${expected}`);

test("primitives match the Python to 1e-9", () => {
  const a: Vec = [0.13, -0.42, 0.07];
  const b: Vec = [0.02, 0.11, -0.05];
  const c: Vec = [-0.31, 0.27, 0.19];
  const d: Vec = [0.05, 0.6, 0.22];
  close(calculateAngle(a, b, c), 112.32297111496227);
  close(trunkTiltFromVertical(a, b), 17.074245817675504);
  close(horizontalOffsetAlongAxis(a, b, c), -0.03107868226605187);
  close(thighSplit(a, b, c, d), 60.95604322390175);
});

test("hand-checked angles", () => {
  close(calculateAngle([1, 0, 0], [0, 0, 0], [0, 1, 0]), 90, 1e-5);
  // The 1e-7 added to the norms keeps a straight line just short of 180, as in Python.
  close(calculateAngle([1, 0, 0], [0, 0, 0], [-1, 0, 0]), 180, 0.03);
  close(trunkTiltFromVertical([0, -1, 0], [0, 0, 0]), 0, 0.03);
  close(trunkTiltFromVertical([1, 0, 0], [0, 0, 0]), 90);
  close(trunkTiltFromVertical([1, -1, 0], [0, 0, 0]), 45, 1e-5);
  assert.equal(thighSplit([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 1, 0]), null);
});

test("ties: the more bent side goes to right on a tie, a missing angle reads 180", () => {
  assert.equal(pickMoreBentSide({ left_elbow: 90, right_elbow: 90 }, "left_elbow", "right_elbow"), "right");
  assert.equal(pickMoreBentSide({ left_elbow: 80, right_elbow: 90 }, "left_elbow", "right_elbow"), "left");
  assert.equal(pickMoreBentSide({ right_elbow: 170 }, "left_elbow", "right_elbow"), "right");
});

test("world 3D, bounding box, yaw, and the extracted keys", () => {
  const kp = emptyKeypoints();
  assert.equal(hasWorld3d(kp), false);
  assert.equal(keypointBbox(kp), null);
  const put = (name: LandmarkName, x3: number, y3: number, z3: number, x = 0.5, y = 0.5) =>
    (kp[name] = { x, y, z: 0, x_3d: x3, y_3d: y3, z_3d: z3, score: 1 });
  // Turned 45 degrees: the left side is farther from the camera (larger z).
  const r = 0.2 * Math.SQRT1_2;
  put("left_shoulder", -r, -0.5, r, 0.4, 0.2);
  put("right_shoulder", r, -0.5, -r, 0.6, 0.2);
  put("left_hip", -r, 0, r, 0.45, 0.6);
  put("right_hip", r, 0, -r, 0.55, 0.9);
  assert.equal(hasWorld3d(kp), true);
  assert.deepEqual(keypointBbox(kp), [0.4, 0.2, 0.6, 0.9]);
  close(bodyYaw(kp), 45);
  const angles = extractAngles(kp);
  assert.deepEqual(Object.keys(angles).sort(), [
    "left_body_alignment", "left_elbow", "left_knee", "left_shoulder_angle",
    "right_body_alignment", "right_elbow", "right_knee", "right_shoulder_angle", "thigh_split",
  ]);
  kp.left_knee = { ...kp.left_hip }; // a zero-length thigh: thigh_split is absent, not 0
  assert.equal("thigh_split" in extractAngles(kp), false);
});

// Both arms: shoulders at shoulderY, wrists at wristY (world y points down), each elbow
// bent out sideways so both segments stay 0.5 long: arm length 1 at any depth.
function arms(shoulderY: number, wristY: number, rightWristScore = 1, rightWristY: number | null = null): Keypoints {
  const kp = emptyKeypoints();
  const put = (name: LandmarkName, y: number, x: number, z = 0, score = 1) => (kp[name] = { x: 0, y: 0, z: 0, x_3d: x, y_3d: y, z_3d: z, score });
  const half = (wristY - shoulderY) / 2;
  for (const [side, x] of [["left", -0.2], ["right", 0.2]] as const) {
    put(`${side}_shoulder`, shoulderY, x);
    put(`${side}_elbow`, shoulderY + half, x, Math.sqrt(0.25 - half ** 2));
    const right = side === "right";
    put(`${side}_wrist`, right && rightWristY !== null ? rightWristY : wristY, x, 0, right ? rightWristScore : 1);
  }
  return kp;
}

test("floor bar: mid-shoulder height above the wrists, in arm lengths", () => {
  close(new FloorBar().update(arms(0, 1)), 1);
  close(new FloorBar().update(arms(0.6, 1)), 0.4);
});

test("floor bar: a hidden wrist is held where the hands were last seen", () => {
  const bar = new FloorBar();
  bar.update(arms(0, 1));
  close(bar.update(arms(0.6, 1, 0.1, 0.7)), 0.4);
  close(new FloorBar().update(arms(0.6, 1, 0.1, 0.7)), 0.25); // no held vector: the guess as read
});

test("floor bar: zeroed 3D gives no reading", () => {
  assert.equal(new FloorBar().update(emptyKeypoints()), null);
});
