// Port of src/rule_based/form_evaluator.py and exercise_session.py (WEB_APP_PORT.md
// sections 4, 8, 9a, 10): streaks, show one and record all, the attempt records, the
// push-up floor bar, and the session that steps the state machine and the rules
// together on one frame.

import type { Rule, RuleBasedLogic } from "../exercise";
import { dist, hasWorld3d, trunkTiltFromVertical, world, type Angles } from "./angles.ts";
import { createFsm, type BaseFsm } from "./fsm.ts";
import { accumulatorFor, CHECKS, farSideAtStrongProfile, point3d, type Accumulator, type Side, type Stats } from "./rules.ts";
import { LANDMARK_NAMES, type AbandonedRecord, type Keypoints, type RepEvent, type RepRecord, type RepStats, type RuleRef } from "./types.ts";

type BoundRule = { rule: Rule; message: string; check: (typeof CHECKS)[string] };

const byPriority = (rules: BoundRule[]) => [...rules].sort((a, b) => a.rule.priority - b.rule.priority);

export class FormEvaluator {
  rules: BoundRule[];
  acc: Accumulator;
  stats: Stats;
  activeSide: Side | null = null;
  inRep = false;
  current: BoundRule[] = []; // every rule violated this attempt, first seen first
  reps: RepRecord[] = [];
  abandoned: AbandonedRecord[] = [];
  last: BoundRule[] = [];
  streaks = new Map<string, number>();

  constructor(rules: Rule[], acc: Accumulator) {
    this.rules = rules.map((rule) => {
      const check = CHECKS[rule.check];
      if (!check) throw new Error(`no check named ${rule.check}`);
      return { rule, message: rule.messages.en, check };
    });
    this.acc = acc;
    this.stats = acc.init();
  }

  reset() {
    this.stats = this.acc.init();
    this.activeSide = null;
    this.inRep = false;
    this.current = [];
    this.reps = [];
    this.abandoned = [];
    this.last = [];
    this.streaks = new Map();
  }

  // Returns the show-one message for this frame, zero or one item.
  process(angles: Angles, keypoints: Keypoints | null, event: RepEvent, activeSide: Side | null): string[] {
    const kp = keypoints && hasWorld3d(keypoints) ? keypoints : null;

    if (event === "rep_started") {
      this.activeSide = activeSide ?? (this.acc.pickActiveSide ? this.acc.pickActiveSide(angles) : null);
      this.stats = this.acc.init();
      this.current = [];
      this.streaks = new Map();
      this.inRep = true;
    } else if (event === "rep_abandoned") {
      // Not counted; the rep-scope rules still say why. This frame is not accumulated.
      let violated: BoundRule[] = [];
      if (this.inRep) {
        violated = this.checkRepRules(angles, kp);
        this.abandoned.push({ attempt_number: this.abandoned.length + 1, active_side: this.activeSide, counted: false, ...this.summary() });
      }
      this.inRep = false;
      this.stats = this.acc.init();
      this.current = [];
      this.streaks = new Map();
      this.activeSide = null;
      this.last = violated;
      return showOne(violated);
    }

    const violated: BoundRule[] = [];
    if (this.inRep) {
      this.acc.accumulate(this.stats, angles, kp, this.activeSide);
      for (const bound of this.rules) {
        if (bound.rule.scope !== "frame") continue;
        // No keypoints: skipped WITHOUT resetting the streak. A null verdict resets it.
        if (bound.check.requiresKeypoints && kp === null) continue;
        if (bound.check.check(angles, kp, this.activeSide, this.stats, bound.rule.threshold) === true) {
          const streak = (this.streaks.get(bound.rule.name) ?? 0) + 1;
          this.streaks.set(bound.rule.name, streak);
          if (streak >= bound.rule.debounce_frames) {
            this.record(bound);
            violated.push(bound);
          }
        } else {
          this.streaks.set(bound.rule.name, 0);
        }
      }
    }

    if (event === "rep_completed") {
      violated.push(...this.checkRepRules(angles, kp));
      this.reps.push({ rep_number: this.reps.length + 1, active_side: this.activeSide, correct: this.current.length === 0, ...this.summary() });
      this.inRep = false;
      this.streaks = new Map();
    }

    this.last = violated;
    return showOne(violated);
  }

  checkRepRules(angles: Angles, kp: Keypoints | null): BoundRule[] {
    const violated: BoundRule[] = [];
    for (const bound of this.rules) {
      if (bound.rule.scope !== "rep") continue;
      if (bound.check.check(angles, kp, this.activeSide, this.stats, bound.rule.threshold) === true) {
        this.record(bound);
        violated.push(bound);
      }
    }
    return violated;
  }

  record(bound: BoundRule) {
    if (!this.current.some((b) => b.rule.name === bound.rule.name)) this.current.push(bound);
  }

  // warnings, violations, and rep_stats of the attempt that just ended.
  summary() {
    const ordered = byPriority(this.current);
    return { warnings: ordered.map((b) => b.message), violations: ordered.map((b) => b.rule.name), rep_stats: this.snapshot() };
  }

  // A null stat is omitted and an infinite one becomes null, as the Python's
  // _snapshot_stats. Then each rule's compared number under the rule's own name.
  snapshot(): RepStats {
    const out: RepStats = {};
    for (const [key, value] of Object.entries(this.stats)) {
      if (value !== null) out[key] = Number.isFinite(value) ? value : null;
    }
    for (const { rule, check } of this.rules) {
      const value = check.value(this.stats, rule.threshold);
      out[rule.name] = value !== null && Number.isFinite(value) ? value : null;
    }
    return out;
  }

  get correctRepCount() {
    return this.reps.filter((r) => r.correct).length;
  }

  lastViolations(): RuleRef[] {
    return byPriority(this.last).map((b) => ({ name: b.rule.name, message: b.message }));
  }
}

function showOne(violated: BoundRule[]): string[] {
  if (!violated.length) return [];
  return [violated.reduce((top, b) => (b.rule.priority < top.rule.priority ? b : top)).message];
}

// The smaller hip->shoulder tilt of the two sides, for the arming posture check.
export function trunkTiltDeg(kp: Keypoints): number | null {
  const tilts: number[] = [];
  for (const side of ["left", "right"] as const) {
    const shoulder = point3d(kp, `${side}_shoulder`);
    const hip = point3d(kp, `${side}_hip`);
    if (!shoulder || !hip || dist(shoulder, hip) <= 1e-6) continue;
    tilts.push(trunkTiltFromVertical(shoulder, hip));
  }
  return tilts.length ? Math.min(...tilts) : null;
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

// ExerciseSession: one step of both layers. The caller guarantees world 3D.
export class ExerciseSession {
  fsm: BaseFsm;
  evaluator: FormEvaluator;
  floorBar: FloorBar | null;
  lastEvent: RepEvent = "none";

  constructor(logic: RuleBasedLogic, engineKey: string, side: Side | null = null) {
    this.fsm = createFsm(engineKey, logic.state_machine, side);
    this.evaluator = new FormEvaluator(logic.rules, accumulatorFor(engineKey, logic.rules));
    this.floorBar = engineKey === "pushup" ? new FloorBar() : null;
  }

  update(extracted: Record<string, number>, kp: Keypoints) {
    // The far side's scores are zeroed at a strong profile, in the copy the FSM gets.
    const far = farSideAtStrongProfile(kp);
    const scores = Object.fromEntries(LANDMARK_NAMES.map((n) => [n, far && n.startsWith(`${far}_`) ? 0 : kp[n].score]));
    const tilt = trunkTiltDeg(kp);
    const angles: Angles = this.floorBar ? { ...extracted, floor_bar: this.floorBar.update(kp) } : extracted;
    const step = this.fsm.update(angles, scores, tilt);
    this.lastEvent = step.event;
    const warning = this.evaluator.process(angles, kp, step.event, this.fsm.activeSideHint as Side | null);
    return { ...step, warning };
  }

  reset() {
    this.fsm.reset();
    this.evaluator.reset();
    this.lastEvent = "none";
    this.floorBar?.reset();
  }
}
