// Port of src/pipeline/frame_processor.py and session_report.py: the Engine of
// types.ts (ADR-0002). Per frame (WEB_APP_PORT.md section 3): placement, the ready gate,
// the confidence guard, angles, one step of the state machine and the rules, and the
// one-second warning hold. Configured from the row, chosen by engine key.

import type { RuleBasedLogic } from "../exercise";
import { extractAngles, hasWorld3d } from "./angles.ts";
import { ExerciseSession } from "./evaluator.ts";
import { COUNTDOWN_S, PlacementGuide, placementStatus, ReadyPoseGate, type PlacementStatus, type ReadyStatus } from "./gates.ts";
import { MIN_LM_SCORE } from "./rules.ts";
import type { Engine, FrameResult, Keypoints, LandmarkName, RuleRef, SessionReport } from "./types.ts";

// The SeniorProject commit the port was made from; equals the commit in the rows' source.
export const ENGINE_VERSION = "2695984";

const WARNING_HOLD_MS = 1000;

export type EngineOptions = { placement: boolean; ready: boolean; armed: boolean };

// placement and ready are the live gates. armed force-arms the state machine before
// the first frame, as the parity harness does with both gates off.
export function createEngine(
  logic: RuleBasedLogic,
  engineKey: string,
  { placement = true, ready = true, armed = false }: Partial<EngineOptions> = {},
): Engine {
  const states = logic.state_machine.states;
  const confidenceJoints = logic.state_machine.confidence_joints;
  const session = new ExerciseSession(logic, engineKey);
  const guide = placement ? new PlacementGuide(logic.placement) : null;
  const gate = ready ? new ReadyPoseGate() : null;
  let lastAngles: Record<string, number> = {};
  let held: RuleRef[] = [];
  let heldUntilMs: number | null = null;

  function reset() {
    session.reset();
    guide?.reset();
    gate?.reset();
    lastAngles = {};
    held = [];
    heldUntilMs = null;
    if (armed) session.fsm.forceArm();
  }
  reset();

  // At least one side has every confidence joint at MIN_LM_SCORE or more.
  const lowConfidence = (kp: Keypoints) =>
    !(["left", "right"] as const).some((side) => confidenceJoints.every((j) => kp[`${side}_${j}` as LandmarkName].score >= MIN_LM_SCORE));

  function display(nowMs: number) {
    return held.length && heldUntilMs !== null && nowMs <= heldUntilMs ? held.map((w) => ({ ...w })) : [];
  }

  function result(kp: Keypoints, nowMs: number, place: PlacementStatus, readyStatus: ReadyStatus | null, low: boolean): FrameResult {
    const shown = display(nowMs);
    return {
      keypoints: kp,
      angles: lastAngles,
      rep_count: session.fsm.repCount,
      correct_rep_count: session.evaluator.correctRepCount,
      attempt_count: session.fsm.attemptCount,
      state: states[session.fsm.state],
      event: "none",
      warning: [],
      warnings_all: [],
      warning_display: shown.map((w) => w.message),
      warning_display_rules: shown,
      low_confidence: low,
      filter_active: false,
      armed: session.fsm.isArmed,
      ready_phase: readyStatus?.phase ?? "disabled",
      ready_pose: readyStatus?.pose ?? null,
      countdown_s: readyStatus?.countdownS ?? null,
      placement_phase: place.phase,
      placement_ok: place.ok,
      placement_cues: place.cues,
      body_yaw_deg: place.bodyYaw,
      target_yaw_deg: place.targetYaw,
      distance_state: place.distance,
    };
  }

  function process(kp: Keypoints, timestampMs: number): FrameResult {
    // Placement is not ticked while the ready gate waits for the T pose facing the
    // camera; it reports guiding with no cues. From the countdown on it runs every frame.
    let place: PlacementStatus;
    if (gate && gate.phase === "waiting") place = guide ? placementStatus(guide.phase, false) : placementStatus("disabled", true);
    else place = guide ? guide.update(kp) : placementStatus("disabled", true);
    const placed = place.phase !== "guiding";
    if (!gate && !placed) return result(kp, timestampMs, place, null, false);

    let readyStatus: ReadyStatus | null = null;
    if (gate) {
      readyStatus = gate.update(kp, timestampMs, placed);
      if (readyStatus.justActivated) session.fsm.forceArm();
      else if (readyStatus.justEnded) session.fsm.forceDisarm();
    }
    const counting = !readyStatus || readyStatus.phase === "active";
    // Missing world 3D is low confidence here; the Python raises (section 9).
    const low = lowConfidence(kp) || !hasWorld3d(kp);
    if (!counting || low) return result(kp, timestampMs, place, readyStatus, low);

    const angles = extractAngles(kp);
    const step = session.update(angles, kp);
    const warningsAll = session.evaluator.lastViolations();
    lastAngles = angles;
    if (warningsAll.length) {
      held = warningsAll.map((w) => ({ ...w }));
      heldUntilMs = timestampMs + WARNING_HOLD_MS;
    }
    return {
      ...result(kp, timestampMs, place, readyStatus, false),
      state: states[step.state],
      event: step.event,
      warning: step.warning,
      warnings_all: warningsAll,
    };
  }

  function getSessionReport(): SessionReport {
    return {
      schema_version: 4,
      generated_at: new Date().toISOString(),
      exercise_name: engineKey,
      engine: "mediapipe",
      filter: { active: false, stage: null, name: null, params: null },
      ready_gate: {
        enabled: gate !== null,
        phase: gate ? gate.phase.toUpperCase() : null,
        countdown_s: gate ? COUNTDOWN_S : null,
        ended_by_pose: gate?.endedByPose ?? false,
      },
      total_attempts: session.fsm.attemptCount,
      total_reps_completed: session.fsm.repCount,
      total_reps_correct: session.evaluator.correctRepCount,
      total_attempts_abandoned: session.fsm.abandonedCount,
      reps: session.evaluator.reps,
      abandoned_attempts: session.evaluator.abandoned,
    };
  }

  return { process, getSessionReport, reset };
}
