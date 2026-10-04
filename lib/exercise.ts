import type { Database } from "./supabase/database.types";
import type { Side } from "./engine/rules.ts";

export type Exercise = Database["public"]["Tables"]["exercises"]["Row"];

// The shape of exercises.rule_based_logic (ADR-0006). The database constraint
// exercise_logic_valid enforces it on insert, so the cast below is safe.
export type Rule = {
  name: string;
  check: string;
  priority: number;
  scope: "frame" | "rep";
  debounce_frames: number;
  threshold: Record<string, number>;
  messages: Record<string, string>;
  highlight_joints: string[];
};

export type RuleBasedLogic = {
  source: string;
  state_machine: {
    states: string[];
    thresholds: Record<string, number | null>;
    arming: { joints: string[]; ready_tilt_min: number | null; ready_tilt_max: number | null } | null;
    // The low-confidence guard: at least one side must see every one of these joints.
    confidence_joints: string[];
    // The user chooses the working side before the workout (the curl's arm).
    chooses_side: boolean;
  };
  // The yaw the placement gate wants, in the engine's units, not camera degrees.
  placement: { yaw_center: number; yaw_tol: number };
  rules: Rule[];
};

export const ruleBasedLogic = (exercise: Pick<Exercise, "rule_based_logic">) =>
  exercise.rule_based_logic as unknown as RuleBasedLogic;

// The setup screen's three numbers, and the arm for an exercise whose row says
// state_machine.chooses_side, carried to the guide screen in the query string.
// A workout row is only created when its first set is saved (ADR-0004).
export const SETUP_LIMITS = {
  reps: { min: 1, max: 100, default: 10 },
  sets: { min: 1, max: 10, default: 3 },
  rest: { min: 0, max: 600, default: 60 },
} as const;

export type Setup = { reps: number; sets: number; rest: number; side: Side | null };

// null when a number is out of range, or the arm is missing where the row asks for one,
// or present where it does not.
export function parseSetup(params: Record<string, string | string[] | undefined>, logic: RuleBasedLogic): Setup | null {
  const read = (key: keyof typeof SETUP_LIMITS) => {
    const n = Number(params[key]);
    const { min, max } = SETUP_LIMITS[key];
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const reps = read("reps");
  const sets = read("sets");
  const rest = read("rest");
  const side = params.side === "left" || params.side === "right" ? params.side : null;
  const sideOk = logic.state_machine.chooses_side ? side !== null : params.side === undefined;
  return reps !== null && sets !== null && rest !== null && sideOk ? { reps, sets, rest, side } : null;
}

export const setupQuery = (setup: Setup) =>
  `reps=${setup.reps}&sets=${setup.sets}&rest=${setup.rest}${setup.side ? `&side=${setup.side}` : ""}`;

export const setupError = (logic: RuleBasedLogic) =>
  encodeURIComponent(logic.state_machine.chooses_side ? "Check the reps, sets, and rest values, and choose an arm." : "Check the reps, sets, and rest values.");
