// What a set stores, built from the SetCapture the frame loop leaves behind. Node-testable:
// no browser API here, and every import that is not a type carries a .ts extension.
import { LANDMARK_NAMES, type LandmarkName, type RepStats, type SessionReport } from "./engine/types.ts";
import type { Rule } from "./exercise";
import type { KeypointFrame } from "./live/session.ts";

export const ATTEMPT_SCHEMA_VERSION = 1;
export const REGIONS = ["head_neck", "back_core", "hips_pelvis", "knees", "ankles_feet"] as const;
export type Region = (typeof REGIONS)[number];

// Six numbers, per attempt and per set (the report's similarity_scores_percent).
export type Similarity = { overall: number } & Record<Region, number>;

export type Outcome = "correct" | "incorrect" | "abandoned";

export type Violation = {
  rule: string;
  message: string;
  priority: number;
  scope: Rule["scope"];
  state: string | null; // the engine state on the first frame the rule fired in
  value: number | null; // the rep_stats entry named after the rule, when there is one
  threshold: Rule["threshold"]; // the rule's threshold object, copied from the row
};

// ADR-0003. frame_start and frame_end index the keypoint file and, through t, the video.
export type Attempt = {
  attempt_no: number;
  outcome: Outcome;
  rep_number: number | null;
  frame_start: number | null;
  frame_end: number | null;
  state_durations_s: Record<string, number>; // keyed by the row's state names, lower case
  violations: Violation[];
  rep_stats: RepStats;
  similarity: Similarity | null;
};

export type Totals = { attempts: number; completed_reps: number; correct_reps: number; abandoned_attempts: number };

export const totalsOf = (report: SessionReport): Totals => ({
  attempts: report.total_attempts,
  completed_reps: report.total_reps_completed,
  correct_reps: report.total_reps_correct,
  abandoned_attempts: report.total_attempts_abandoned,
});

// One record per attempt, in order. The engine's report says what each attempt was; the
// frames say where it is in the files and how long each state lasted. Nothing is judged
// here: outcomes, counts, and violations are the engine's.
export function buildAttempts(frames: KeypointFrame[], report: SessionReport, rules: Rule[]): Attempt[] {
  const ruleByName = new Map(rules.map((r) => [r.name, r]));
  const reps = [...report.reps];
  const abandoned = [...report.abandoned_attempts];
  const attempts: Attempt[] = [];
  let start: number | null = null;

  const record = (outcomeFrames: [number | null, number | null], rec: { violations: string[]; rep_stats: RepStats }, repNumber: number | null, outcome: Outcome) => {
    const [i, j] = outcomeFrames;
    const durations: Record<string, number> = {};
    if (i !== null && j !== null) {
      for (let n = i; n < j; n++) {
        const key = frames[n].state.toLowerCase();
        durations[key] = (durations[key] ?? 0) + (frames[n + 1].t - frames[n].t) / 1000;
      }
      for (const key of Object.keys(durations)) durations[key] = Math.round(durations[key] * 1000) / 1000;
    }
    const violations: Violation[] = rec.violations.map((name) => {
      const rule = ruleByName.get(name);
      const firedOn = i === null || j === null ? undefined : frames.slice(i, j + 1).find((f) => f.violations.includes(name));
      return {
        rule: name,
        message: rule?.messages.en ?? name,
        priority: rule?.priority ?? 99,
        scope: rule?.scope ?? "rep",
        state: firedOn ? firedOn.state.toLowerCase() : null,
        value: rec.rep_stats[name] ?? null,
        threshold: rule?.threshold ?? {},
      };
    });
    attempts.push({
      attempt_no: attempts.length + 1,
      outcome,
      rep_number: repNumber,
      frame_start: i,
      frame_end: j,
      state_durations_s: durations,
      violations,
      rep_stats: rec.rep_stats,
      similarity: null,
    });
  };

  frames.forEach((frame, n) => {
    if (frame.event === "rep_started") start = n;
    else if (frame.event === "rep_completed" && reps.length) {
      const rep = reps.shift()!;
      record([start, n], rep, rep.rep_number, rep.correct ? "correct" : "incorrect");
      start = null;
    } else if (frame.event === "rep_abandoned" && abandoned.length) {
      record([start, n], abandoned.shift()!, null, "abandoned");
      start = null;
    }
  });
  // Records the frames never showed an event for (a low-confidence pause can swallow one)
  // are kept without a frame range rather than dropped: every attempt has a record.
  for (const rep of reps) record([null, null], rep, rep.rep_number, rep.correct ? "correct" : "incorrect");
  for (const rec of abandoned) record([null, null], rec, null, "abandoned");
  return attempts;
}

export const hasViolation = (attempts: Attempt[]) => attempts.some((a) => a.violations.length > 0);

// The keypoint file (ADR-0005): JSON, gzipped on upload. Every frame's 33 landmarks at
// capture rate as one flat row of numbers, joints then fields, so the file is the
// `landmarks` object the similarity contract takes (ADR-0007) and what replay draws.
export const KEYPOINT_FILE_VERSION = 1;
export const KEYPOINT_FIELDS = ["x", "y", "z", "x_3d", "y_3d", "z_3d", "score"] as const;
export type KeypointFile = {
  schema_version: typeof KEYPOINT_FILE_VERSION;
  joints: readonly LandmarkName[];
  fields: typeof KEYPOINT_FIELDS;
  fps: number;
  frames: { t: number; state: string; event: KeypointFrame["event"]; points: number[] }[];
};

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function toKeypointFile(frames: KeypointFrame[]): KeypointFile {
  const span = frames.length > 1 ? (frames[frames.length - 1].t - frames[0].t) / 1000 : 0;
  return {
    schema_version: KEYPOINT_FILE_VERSION,
    joints: LANDMARK_NAMES,
    fields: KEYPOINT_FIELDS,
    fps: span > 0 ? Math.round((frames.length - 1) / span) : 0,
    frames: frames.map((f) => ({
      t: Math.round(f.t),
      state: f.state,
      event: f.event,
      points: LANDMARK_NAMES.flatMap((name) => KEYPOINT_FIELDS.map((field) => round4(f.keypoints[name][field]))),
    })),
  };
}
