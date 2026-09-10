// The engine seam (ADR-0002): the research repo's contract, mirrored. The stub in
// stub.ts and Vern's future TypeScript port both satisfy Engine. The UI reads counters,
// states, and warnings from FrameResult and never re-derives them.

// MediaPipe's 33 landmarks in index order, named as the research repo names them
// (src/frame_processing/mediapipe_hpe.py, _MP_MAPPING).
export const LANDMARK_NAMES = [
  "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner", "right_eye",
  "right_eye_outer", "left_ear", "right_ear", "left_mouth", "right_mouth",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
  "left_pinky", "right_pinky", "left_index", "right_index", "left_thumb", "right_thumb",
  "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
  "left_heel", "right_heel", "left_foot_index", "right_foot_index",
] as const;

export type LandmarkName = (typeof LANDMARK_NAMES)[number];

// x, y, z are image-normalised; x_3d, y_3d, z_3d are world metres; score is MediaPipe's
// visibility.
export type Keypoint = { x: number; y: number; z: number; x_3d: number; y_3d: number; z_3d: number; score: number };
export type Keypoints = Record<LandmarkName, Keypoint>;

export const emptyKeypoints = (): Keypoints =>
  Object.fromEntries(
    LANDMARK_NAMES.map((name) => [name, { x: 0, y: 0, z: 0, x_3d: 0, y_3d: 0, z_3d: 0, score: 0 }]),
  ) as Keypoints;

// Python enum names in lower case. `state` is one of the row's state_machine.states.
export type RepEvent = "none" | "rep_started" | "rep_abandoned" | "rep_completed";
export type ReadyPhase = "disabled" | "waiting" | "countdown" | "active" | "ended";
export type PlacementPhase = "disabled" | "guiding" | "placed";
export type DistanceState = "too_far" | "too_close" | "ok" | "not_detected";
export type RuleRef = { name: string; message: string };

// src/pipeline/frame_processor.py FrameResult, minus inference_ms which the wrapper adds.
export type FrameResult = {
  keypoints: Keypoints;
  angles: Record<string, number>;
  rep_count: number;
  correct_rep_count: number;
  attempt_count: number;
  state: string;
  event: RepEvent;
  warning: string[]; // zero or one item: the show-one message this frame
  warnings_all: RuleRef[]; // every violated rule this frame, priority order
  warning_display: string[]; // warnings held about a second so a one-frame rule stays readable
  warning_display_rules: RuleRef[];
  low_confidence: boolean;
  filter_active: boolean;
  armed: boolean;
  ready_phase: ReadyPhase;
  ready_pose: string | null;
  countdown_s: number | null;
  placement_phase: PlacementPhase;
  placement_ok: boolean;
  placement_cues: string[]; // priority order; show cues[0]
  body_yaw_deg: number | null;
  target_yaw_deg: number | null;
  distance_state: DistanceState;
};

export type RepStats = Record<string, number | null>;
export type RepRecord = { rep_number: number; correct: boolean; warnings: string[]; violations: string[]; rep_stats: RepStats };
export type AbandonedRecord = { attempt_number: number; counted: false; warnings: string[]; violations: string[]; rep_stats: RepStats };

// src/pipeline/session_report.py, SCHEMA_VERSION 4. Stored verbatim on the set (ADR-0003).
export type SessionReport = {
  schema_version: 4;
  generated_at: string;
  exercise_name: string;
  engine: string;
  filter: { active: boolean; stage: string | null; name: string | null; params: Record<string, unknown> | null };
  ready_gate: { enabled: boolean; phase: string | null; countdown_s: number | null; ended_by_pose: boolean };
  total_attempts: number;
  total_reps_completed: number;
  total_reps_correct: number;
  total_attempts_abandoned: number;
  reps: RepRecord[];
  abandoned_attempts: AbandonedRecord[];
};

export interface Engine {
  process(keypoints: Keypoints, timestampMs: number): FrameResult;
  getSessionReport(): SessionReport;
  reset(): void;
}
