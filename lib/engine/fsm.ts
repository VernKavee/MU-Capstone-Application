// Port of src/fsm_counter/base_fsm.py and exercise_fsms.py (WEB_APP_PORT.md sections 4
// and 10). The bars come from the row's state_machine; what defines a measurement stays
// a constant here. The four machines are chosen by engine key (ADR-0006, section 5.3).

import type { RuleBasedLogic } from "../exercise";
import { angleOr180, pickMoreBentSide, type Angles } from "./angles.ts";
import type { RepEvent } from "./types.ts";

// Index into the row's state_machine.states, the Python ExerciseState value.
export const IDLE = 0;
export const CONCENTRIC = 1;
export const INFLECTION = 2;
export const ECCENTRIC = 3;

const ARM_FRAMES_REQ = 10;
const DISARM_FRAMES_REQ = 40;
const ARM_MIN_SCORE = 0.5;
const LEFT_TILT_MAX = 30; // PushUpFSM: leaving the plank
const SIDE_JOINTS = ["shoulder", "elbow", "wrist"];

export type JointScores = Record<string, number>;
export type FsmStep = { repCount: number; state: number; event: RepEvent };

type StateMachine = RuleBasedLogic["state_machine"];

const bar = (sm: StateMachine, key: string) => {
  const value = sm.thresholds[key];
  if (typeof value !== "number") throw new Error(`state_machine.thresholds.${key} is missing`);
  return value;
};

export abstract class BaseFsm {
  thrStanding: number;
  thrInflection: number;
  thrDescending: number;
  hysteresis: number;
  framesReq: number;
  armingEnabled: boolean;
  armJoints: string[];
  readyTiltMin: number | null;
  readyTiltMax: number | null;
  disarmOnExtendedAngle = true;

  state = IDLE;
  repCount = 0;
  abandonedCount = 0;
  frameCounter = 0;
  stateFrameCount = 0;
  redescendFrames = 0;
  jointScores: JointScores | null = null;
  trunkTilt: number | null = null;
  armed = false;
  readyStreak = 0;
  notReadyStreak = 0;

  constructor(sm: StateMachine) {
    this.thrStanding = bar(sm, "thr_standing");
    this.thrInflection = bar(sm, "thr_inflection");
    this.thrDescending = bar(sm, "thr_descending");
    this.hysteresis = bar(sm, "hysteresis_buffer");
    this.framesReq = bar(sm, "consecutive_frames_req");
    this.armingEnabled = sm.arming !== null;
    this.armJoints = sm.arming?.joints ?? [];
    this.readyTiltMin = sm.arming?.ready_tilt_min ?? null;
    this.readyTiltMax = sm.arming?.ready_tilt_max ?? null;
  }

  reset() {
    this.state = IDLE;
    this.repCount = 0;
    this.abandonedCount = 0;
    this.frameCounter = 0;
    this.stateFrameCount = 0;
    this.redescendFrames = 0;
    this.jointScores = null;
    this.trunkTilt = null;
    this.armed = false;
    this.readyStreak = 0;
    this.notReadyStreak = 0;
  }

  get attemptCount() {
    return this.repCount + this.abandonedCount;
  }

  get isArmed() {
    return this.armingEnabled ? this.armed : true;
  }

  get activeSideHint(): string | null {
    return null;
  }

  changeState(next: number) {
    if (this.state === next) return;
    this.state = next;
    this.stateFrameCount = 0;
    this.redescendFrames = 0;
    if (next === IDLE) {
      this.readyStreak = 0;
      this.notReadyStreak = 0;
    }
  }

  forceArm() {
    this.armed = true;
    this.readyStreak = 0;
    this.notReadyStreak = 0;
  }

  forceDisarm() {
    this.armed = false;
    this.readyStreak = 0;
    this.notReadyStreak = 0;
  }

  // Hooks the four machines override. The defaults: no extra start gate, never left
  // the exercise, nothing to do when a re-descend banks a rep.
  abstract primary(angles: Angles): number;
  startGateOk(angles: Angles, primary: number): boolean;
  startGateOk() {
    return true;
  }
  leftExercise(angles: Angles, primary: number): boolean;
  leftExercise() {
    return false;
  }
  onRedescendBank() {}

  armScoresOk() {
    if (this.jointScores === null || !this.armJoints.length) return true;
    const scores = this.jointScores;
    return (["left", "right"] as const).some((side) => this.armJoints.every((j) => (scores[`${side}_${j}`] ?? 0) >= ARM_MIN_SCORE));
  }

  readyPostureOk() {
    const tilt = this.trunkTilt;
    if (tilt === null) return true;
    if (this.readyTiltMin !== null && tilt < this.readyTiltMin) return false;
    if (this.readyTiltMax !== null && tilt > this.readyTiltMax) return false;
    return true;
  }

  update(angles: Angles, jointScores: JointScores | null, trunkTilt: number | null): FsmStep {
    this.frameCounter += 1;
    this.stateFrameCount += 1;
    this.jointScores = jointScores;
    this.trunkTilt = trunkTilt;

    const primary = this.primary(angles);
    let event: RepEvent = "none";

    if (this.state !== IDLE && this.leftExercise(angles, primary)) {
      this.abandonedCount += 1;
      this.changeState(IDLE);
      return { repCount: this.repCount, state: this.state, event: "rep_abandoned" };
    }

    if (this.state === IDLE) {
      if (this.armingEnabled) {
        if (primary >= this.thrDescending && this.armScoresOk() && this.readyPostureOk()) {
          this.readyStreak += 1;
          this.notReadyStreak = 0;
          if (this.readyStreak >= ARM_FRAMES_REQ) this.armed = true;
        } else {
          this.readyStreak = 0;
          // Out of the start position is not the same as having left the exercise.
          if (this.disarmOnExtendedAngle || !this.armScoresOk()) {
            this.notReadyStreak += 1;
            if (this.notReadyStreak >= DISARM_FRAMES_REQ) this.armed = false;
          } else {
            this.notReadyStreak = 0;
          }
        }
      }
      if (primary < this.thrDescending && this.isArmed && this.startGateOk(angles, primary)) {
        if (this.stateFrameCount >= this.framesReq) {
          this.changeState(CONCENTRIC);
          event = "rep_started";
        }
      } else {
        this.stateFrameCount = 0;
      }
    } else if (this.state === CONCENTRIC) {
      if (primary <= this.thrInflection) {
        if (this.stateFrameCount >= this.framesReq) this.changeState(INFLECTION);
      } else if (primary > this.thrStanding) {
        this.abandonedCount += 1;
        this.changeState(IDLE);
        event = "rep_abandoned";
      }
    } else if (this.state === INFLECTION) {
      if (primary > this.thrInflection + this.hysteresis && this.stateFrameCount >= this.framesReq) {
        this.changeState(ECCENTRIC);
      }
    } else if (this.state === ECCENTRIC) {
      if (primary >= this.thrStanding) {
        if (this.stateFrameCount >= this.framesReq) {
          this.repCount += 1;
          event = "rep_completed";
          this.changeState(IDLE);
        }
      } else if (primary <= this.thrInflection) {
        // Re-descend: back at depth without standing, so the rep in flight is banked.
        this.redescendFrames += 1;
        if (this.redescendFrames >= this.framesReq) {
          this.repCount += 1;
          event = "rep_completed";
          this.onRedescendBank();
          this.changeState(IDLE);
        }
      } else {
        this.redescendFrames = 0;
      }
    }

    return { repCount: this.repCount, state: this.state, event };
  }
}

class SquatFsm extends BaseFsm {
  primary(angles: Angles) {
    return (angleOr180(angles, "left_knee") + angleOr180(angles, "right_knee")) / 2;
  }
}

// Counts on the two-hand floor bar in arm lengths (section 9a), not an angle.
class PushUpFsm extends BaseFsm {
  primary(angles: Angles) {
    return angles.floor_bar as number;
  }
  update(angles: Angles, jointScores: JointScores | null, trunkTilt: number | null): FsmStep {
    // No world 3D this frame: nothing happens, not even the counters.
    if (angles.floor_bar === null || angles.floor_bar === undefined) {
      return { repCount: this.repCount, state: this.state, event: "none" };
    }
    return super.update(angles, jointScores, trunkTilt);
  }
  leftExercise(angles: Angles, primary: number) {
    const tilt = this.trunkTilt;
    return primary < 0 || (tilt !== null && tilt < LEFT_TILT_MAX);
  }
  startGateOk(angles: Angles, primary: number) {
    return !this.leftExercise(angles, primary);
  }
}

class BicepCurlFsm extends BaseFsm {
  startDescentDelta: number;
  minSideScore: number;
  activeSide: "left" | "right" = "left";
  idlePeaks = { left: -Infinity, right: -Infinity };
  gateQualified = false;
  rearmExempt = { left: false, right: false };

  constructor(sm: StateMachine) {
    super(sm);
    this.startDescentDelta = bar(sm, "start_descent_delta");
    this.minSideScore = bar(sm, "min_side_score");
  }

  reset() {
    super.reset();
    this.activeSide = "left";
    this.idlePeaks = { left: -Infinity, right: -Infinity };
    this.gateQualified = false;
    this.rearmExempt = { left: false, right: false };
  }

  changeState(next: number) {
    if (next === CONCENTRIC && this.state === IDLE) this.rearmExempt[this.activeSide] = false;
    super.changeState(next);
    if (next === IDLE) this.idlePeaks = { left: -Infinity, right: -Infinity };
  }

  onRedescendBank() {
    this.rearmExempt[this.activeSide] = true;
  }

  sideConfident(side: "left" | "right") {
    const scores = this.jointScores;
    if (scores === null) return true;
    return SIDE_JOINTS.every((j) => (scores[`${side}_${j}`] ?? 0) >= this.minSideScore);
  }

  armQualifies(side: "left" | "right", angle: number) {
    if (!this.sideConfident(side)) return false;
    if (this.rearmExempt[side] && angle <= this.thrInflection + this.hysteresis) return true;
    const peak = this.idlePeaks[side];
    const armed = peak >= this.thrDescending || this.rearmExempt[side];
    const contracting = angle <= Math.min(this.thrDescending, peak - this.startDescentDelta);
    return armed && contracting;
  }

  // Sets gateQualified, which startGateOk reads in the same update.
  primary(angles: Angles) {
    const left = angleOr180(angles, "left_elbow");
    const right = angleOr180(angles, "right_elbow");
    if (this.state === IDLE) {
      this.idlePeaks.left = Math.max(this.idlePeaks.left, left);
      this.idlePeaks.right = Math.max(this.idlePeaks.right, right);
      for (const side of ["left", "right"] as const) {
        if (this.idlePeaks[side] >= this.thrDescending) this.rearmExempt[side] = false;
      }
      const leftQ = this.armQualifies("left", left);
      const rightQ = this.armQualifies("right", right);
      if (leftQ && rightQ) this.activeSide = pickMoreBentSide(angles, "left_elbow", "right_elbow");
      else if (leftQ) this.activeSide = "left";
      else if (rightQ) this.activeSide = "right";
      this.gateQualified = leftQ || rightQ;
    }
    return this.activeSide === "left" ? left : right;
  }

  startGateOk() {
    return this.gateQualified;
  }

  get activeSideHint() {
    return this.activeSide;
  }
}

// Tracks the deeper knee each frame; exposes no active side, so lunge rules get null.
class LungeFsm extends BaseFsm {
  startSplitMin: number;

  constructor(sm: StateMachine) {
    super(sm);
    this.startSplitMin = bar(sm, "lunge_start_split_min");
    this.disarmOnExtendedAngle = false;
  }

  primary(angles: Angles) {
    return Math.min(angleOr180(angles, "left_knee"), angleOr180(angles, "right_knee"));
  }

  startGateOk(angles: Angles) {
    const split = angles.thigh_split;
    if (split === null || split === undefined) {
      return Math.max(angleOr180(angles, "left_knee"), angleOr180(angles, "right_knee")) < this.thrStanding;
    }
    return split > this.startSplitMin;
  }
}

const FSMS: Record<string, new (sm: StateMachine) => BaseFsm> = {
  squat: SquatFsm,
  pushup: PushUpFsm,
  lunge: LungeFsm,
  dumbbell_biceps_curls: BicepCurlFsm,
};

export function createFsm(engineKey: string, sm: StateMachine): BaseFsm {
  const Fsm = FSMS[engineKey];
  if (!Fsm) throw new Error(`no state machine for engine key ${engineKey}`);
  return new Fsm(sm);
}
