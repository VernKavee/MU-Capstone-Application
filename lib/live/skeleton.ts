// The skeleton overlay, drawn the same way live (lib/live/session.ts) and at replay
// (history level 4, ADR-0005): bone-white bones and joints, tape yellow where a warning's
// highlight joints are. The face is left out, except the nose.
import { LANDMARK_NAMES, type LandmarkName } from "@/lib/engine/types";

const INK = "rgba(233, 228, 216, 0.75)";
const TAPE = "#FFC940";
const FIRST_BODY_INDEX = 11;
// MediaPipe's POSE_CONNECTIONS from the shoulders down, copied so that replay does not load
// the pose model's package.
const BONES = [
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
] as const;

export type Point = { x: number; y: number; score: number }; // image-normalised; score is visibility

// Landmark i comes from at(i); the joints in lit are drawn in tape yellow.
export function drawSkeleton(ctx: CanvasRenderingContext2D, at: (i: number) => Point, lit: Set<number>) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = Math.max(2, w / 400);
  ctx.lineCap = "round";
  for (const [start, end] of BONES) {
    const a = at(start);
    const b = at(end);
    if (a.score < 0.5 || b.score < 0.5) continue;
    ctx.strokeStyle = lit.has(start) && lit.has(end) ? TAPE : INK;
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }
  for (let i = 0; i < LANDMARK_NAMES.length; i++) {
    if (i > 0 && i < FIRST_BODY_INDEX) continue;
    const p = at(i);
    if (p.score < 0.5) continue;
    const on = lit.has(i);
    ctx.fillStyle = on ? TAPE : INK;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, on ? w / 90 : w / 160, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A rule's highlight_joints (ADR-0006) as landmark indices.
export const jointIndices = (names: string[]) => names.map((n) => LANDMARK_NAMES.indexOf(n as LandmarkName)).filter((i) => i >= 0);
