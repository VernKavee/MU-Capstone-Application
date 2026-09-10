// The stub engine (ADR-0002). Believable fake output so the live screen is built against
// the seam; Vern's TypeScript port of the research repo replaces this one file. It is
// configured from the exercise row's rule_based_logic and never sees the exercise name.
//
// Real: the placement guide and the ready gate look at the actual landmarks (whole body
// in view, arms out to the sides for the ready pose), and the low-confidence guard pauses
// the set when the required joints are not visible.
// Fake: once the set is active, attempts run on a clock, about one every two and a half
// seconds, and each outcome is drawn at random from the rules. No angle is computed and
// every rep_stats number is invented.

import type { Rule, RuleBasedLogic } from "../exercise";
import {
  LANDMARK_NAMES,
  type AbandonedRecord,
  type DistanceState,
  type Engine,
  type FrameResult,
  type Keypoints,
  type LandmarkName,
  type PlacementPhase,
  type ReadyPhase,
  type RepEvent,
  type RepRecord,
  type RuleRef,
  type SessionReport,
} from "./types.ts";

// Constants named after their research repo counterparts.
const READY_MIN_SCORE = 0.5; // ready_pose.py
const MIN_LM_SCORE = 0.3; // form_rules.py
const HOLD_FRAMES = 8; // READY_HOLD_FRAMES and PLACED_HOLD_FRAMES
const COUNTDOWN_S = 3;
const WARNING_HOLD_MS = 1000;
const READY_REQUIRED_JOINTS: LandmarkName[] = [
  "nose", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
  "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
];
// placement_guide.py _CUE_TEXT, the subset the stub can judge from a bounding box.
const CUE = {
  none: "Move into frame so the camera can see your whole body",
  head_cut: "Step back -- your head is out of frame",
  feet_cut: "Step back -- your feet are out of frame",
  too_far: "Move closer to the camera",
  move_left: "Move left to center yourself in frame",
  move_right: "Move right to center yourself in frame",
};

// The scripted attempt, milliseconds per state in the row's state order:
// idle, concentric, inflection, eccentric.
const STATE_MS = [500, 800, 400, 800];
const ABANDON_AT_MS = 600; // an abandoned attempt turns back mid-concentric
const FRAME_RULE_WINDOW_MS: [number, number] = [250, 800]; // when a frame-scope violation shows
const ODDS = { abandoned: 0.12, incorrect: 0.2 };
// ponytail: a body under this share of the frame height reads as too far; the real
// guide judges distance from the research repo's calibrated bounding box thresholds.
const TOO_FAR_HEIGHT = 0.3;

type Plan = { outcome: "correct" | "incorrect" | "abandoned"; frameRules: Rule[]; repRules: Rule[] };

const byPriority = (rules: Rule[]) => [...rules].sort((a, b) => a.priority - b.priority);
const ref = (rule: Rule): RuleRef => ({ name: rule.name, message: rule.messages.en });
const showOne = (rules: Rule[]) => (rules.length ? [byPriority(rules)[0].messages.en] : []);

export function createStubEngine(logic: RuleBasedLogic, engineKey: string, random: () => number = Math.random): Engine {
  const states = logic.state_machine.states;
  const rules = logic.rules;
  // The joints the confidence guard needs, at least one side fully visible. The research
  // repo keys this by exercise name; the row's arming joints are the same list.
  const guardJoints = logic.state_machine.arming?.joints ?? ["shoulder", "elbow", "wrist"];

  let placementPhase: PlacementPhase;
  let placedStreak: number; // consecutive frames with every placement check ok
  let readyPhase: ReadyPhase;
  let readyStreak: number; // consecutive frames with the ready pose held
  let countdownEndMs: number | null;
  let stateIdx: number;
  let elapsedMs: number; // time in the current state, paused while low confidence
  let lastTs: number | null;
  let plan: Plan | null;
  let repCount: number;
  let attemptCount: number;
  let abandonedCount: number;
  let reps: RepRecord[];
  let abandoned: AbandonedRecord[];
  let held: RuleRef[];
  let heldUntilMs: number;

  function reset() {
    placementPhase = "guiding";
    placedStreak = 0;
    readyPhase = "waiting";
    readyStreak = 0;
    countdownEndMs = null;
    stateIdx = 0;
    elapsedMs = 0;
    lastTs = null;
    plan = null;
    repCount = 0;
    attemptCount = 0;
    abandonedCount = 0;
    reps = [];
    abandoned = [];
    held = [];
    heldUntilMs = 0;
  }
  reset();

  const seen = (kp: Keypoints, name: LandmarkName, min = READY_MIN_SCORE) => kp[name].score >= min;

  function placement(kp: Keypoints): { ok: boolean; cues: string[]; distance: DistanceState } {
    const visible = LANDMARK_NAMES.filter((n) => seen(kp, n)).map((n) => kp[n]);
    if (visible.length < 4) return { ok: false, cues: [CUE.none], distance: "not_detected" };
    const xs = visible.map((p) => p.x);
    const ys = visible.map((p) => p.y);
    const height = Math.max(...ys) - Math.min(...ys);
    const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
    const hips = seen(kp, "left_hip") || seen(kp, "right_hip");
    const cues: string[] = [];
    if (hips && !seen(kp, "nose")) cues.push(CUE.head_cut);
    if (hips && !seen(kp, "left_ankle") && !seen(kp, "right_ankle")) cues.push(CUE.feet_cut);
    const distance: DistanceState = height < TOO_FAR_HEIGHT ? "too_far" : "ok";
    if (distance === "too_far") cues.push(CUE.too_far);
    // The cue is in the user's own frame: a body on the left of the image is on the
    // user's right, so they move to their left.
    if (centre < 0.3) cues.push(CUE.move_left);
    if (centre > 0.7) cues.push(CUE.move_right);
    return { ok: cues.length === 0, cues, distance };
  }

  // Arms out to the sides at shoulder height, judged in image coordinates.
  function readyPose(kp: Keypoints): string | null {
    if (!READY_REQUIRED_JOINTS.every((n) => seen(kp, n))) return null;
    const out = (side: "left" | "right") => {
      const s = kp[`${side}_shoulder`];
      const w = kp[`${side}_wrist`];
      return Math.abs(w.y - s.y) < 0.15 && Math.abs(w.x - s.x) > 0.1;
    };
    return out("left") && out("right") ? "t_pose" : null;
  }

  function lowConfidence(kp: Keypoints) {
    return !(["left", "right"] as const).some((side) =>
      guardJoints.every((joint) => seen(kp, `${side}_${joint}` as LandmarkName, MIN_LM_SCORE)),
    );
  }

  function drawPlan(): Plan {
    const r = random();
    const outcome = r < ODDS.abandoned ? "abandoned" : r < ODDS.abandoned + ODDS.incorrect ? "incorrect" : "correct";
    let picked: Rule[] = [];
    if (outcome === "incorrect") {
      picked = [rules[Math.floor(random() * rules.length)]];
      if (random() < 0.3) picked.push(rules[Math.floor(random() * rules.length)]);
      picked = picked.filter((rule, i) => picked.indexOf(rule) === i);
    } else if (outcome === "abandoned") {
      // Turning back before depth is what the rep-scope range-of-motion rule exists for.
      picked = byPriority(rules.filter((rule) => rule.scope === "rep")).slice(0, 1);
    }
    return {
      outcome,
      frameRules: picked.filter((rule) => rule.scope === "frame"),
      repRules: picked.filter((rule) => rule.scope === "rep"),
    };
  }

  // Invented numbers keyed by rule name; the real engine snapshots its accumulated stats.
  function fakeStats(violated: Rule[]): Record<string, number> {
    return Object.fromEntries(
      rules.map((rule) => {
        const bar = Object.values(rule.threshold)[0] ?? 0;
        const off = (violated.includes(rule) ? 1 : -1) * (5 + Math.round(random() * 10));
        return [rule.name, bar + off];
      }),
    );
  }

  function hold(now: number, violated: Rule[]) {
    if (violated.length) {
      held = byPriority(violated).map(ref);
      heldUntilMs = now + WARNING_HOLD_MS;
    }
    return now <= heldUntilMs ? held : [];
  }

  // Advances the scripted attempt by dt and returns the frame's event and violations. Time
  // left over after a transition carries into the next state, so a slow frame rate does
  // not stretch the script; at most one event is emitted per frame.
  function step(dt: number): { event: RepEvent; violated: Rule[] } {
    elapsedMs += dt;
    for (;;) {
      if (stateIdx === 0) {
        if (elapsedMs < STATE_MS[0]) return { event: "none", violated: [] };
        elapsedMs -= STATE_MS[0];
        plan = drawPlan();
        stateIdx = 1;
        return { event: "rep_started", violated: [] };
      }
      const current = plan!;
      if (stateIdx === 1 && current.outcome === "abandoned" && elapsedMs >= ABANDON_AT_MS) {
        elapsedMs -= ABANDON_AT_MS;
        attemptCount += 1;
        abandonedCount += 1;
        abandoned.push({
          attempt_number: abandonedCount,
          counted: false,
          warnings: byPriority(current.repRules).map((r) => r.messages.en),
          violations: byPriority(current.repRules).map((r) => r.name),
          rep_stats: fakeStats(current.repRules),
        });
        stateIdx = 0;
        return { event: "rep_abandoned", violated: current.repRules };
      }
      if (elapsedMs < STATE_MS[stateIdx]) {
        const inWindow = stateIdx === 1 && elapsedMs >= FRAME_RULE_WINDOW_MS[0] && elapsedMs <= FRAME_RULE_WINDOW_MS[1];
        return { event: "none", violated: inWindow ? current.frameRules : [] };
      }
      elapsedMs -= STATE_MS[stateIdx];
      stateIdx += 1;
      if (stateIdx < states.length) continue;
      // Back to idle: the rep completed.
      stateIdx = 0;
      const all = byPriority([...current.frameRules, ...current.repRules]);
      repCount += 1;
      attemptCount += 1;
      reps.push({
        rep_number: repCount,
        correct: all.length === 0,
        warnings: all.map((r) => r.messages.en),
        violations: all.map((r) => r.name),
        rep_stats: fakeStats(all),
      });
      return { event: "rep_completed", violated: current.repRules };
    }
  }

  function process(keypoints: Keypoints, timestampMs: number): FrameResult {
    const dt = lastTs === null ? 0 : Math.max(0, timestampMs - lastTs);
    lastTs = timestampMs;

    const place = placement(keypoints);
    if (placementPhase === "guiding") {
      placedStreak = place.ok ? placedStreak + 1 : 0;
      if (placedStreak >= HOLD_FRAMES) placementPhase = "placed";
    }

    let pose: string | null = null;
    let countdown: number | null = null;
    if (placementPhase === "placed") {
      pose = readyPose(keypoints);
      if (readyPhase === "waiting") {
        readyStreak = pose ? readyStreak + 1 : 0;
        if (readyStreak >= HOLD_FRAMES) {
          readyPhase = "countdown";
          countdownEndMs = timestampMs + COUNTDOWN_S * 1000;
        }
      }
      if (readyPhase === "countdown") {
        countdown = Math.max(0, (countdownEndMs! - timestampMs) / 1000);
        if (countdown === 0) {
          readyPhase = "active";
          countdown = null;
          elapsedMs = 0;
        }
      }
    }

    const low = readyPhase === "active" && lowConfidence(keypoints);
    const counting = placementPhase === "placed" && readyPhase === "active" && !low;
    const { event, violated } = counting ? step(dt) : { event: "none" as RepEvent, violated: [] as Rule[] };
    const display = hold(timestampMs, violated);
    const violatedRefs = byPriority(violated).map(ref);

    return {
      keypoints,
      angles: {},
      rep_count: repCount,
      correct_rep_count: reps.filter((r) => r.correct).length,
      attempt_count: attemptCount,
      state: states[stateIdx],
      event,
      warning: showOne(violated),
      warnings_all: violatedRefs,
      warning_display: display.map((w) => w.message),
      warning_display_rules: display,
      low_confidence: low,
      filter_active: false,
      armed: readyPhase === "active",
      ready_phase: readyPhase,
      ready_pose: pose,
      countdown_s: countdown,
      placement_phase: placementPhase,
      placement_ok: place.ok,
      placement_cues: place.cues,
      body_yaw_deg: null,
      target_yaw_deg: null,
      distance_state: place.distance,
    };
  }

  function getSessionReport(): SessionReport {
    return {
      schema_version: 4,
      generated_at: new Date().toISOString(),
      exercise_name: engineKey,
      engine: "mediapipe",
      filter: { active: false, stage: null, name: null, params: null },
      ready_gate: { enabled: true, phase: readyPhase, countdown_s: COUNTDOWN_S, ended_by_pose: false },
      total_attempts: attemptCount,
      total_reps_completed: repCount,
      total_reps_correct: reps.filter((r) => r.correct).length,
      total_attempts_abandoned: abandonedCount,
      reps,
      abandoned_attempts: abandoned,
    };
  }

  return { process, getSessionReport, reset };
}
