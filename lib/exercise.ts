import type { Database } from "./supabase/database.types";

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
  };
  rules: Rule[];
};

export const ruleBasedLogic = (exercise: Pick<Exercise, "rule_based_logic">) =>
  exercise.rule_based_logic as unknown as RuleBasedLogic;

// The setup screen's three numbers, carried to the guide screen in the query string.
// A workout row is only created when its first set is saved (ADR-0004).
export const SETUP_LIMITS = {
  reps: { min: 1, max: 100, default: 10 },
  sets: { min: 1, max: 10, default: 3 },
  rest: { min: 0, max: 600, default: 60 },
} as const;

export function parseSetup(params: Record<string, string | string[] | undefined>) {
  const read = (key: keyof typeof SETUP_LIMITS) => {
    const n = Number(params[key]);
    const { min, max } = SETUP_LIMITS[key];
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const reps = read("reps");
  const sets = read("sets");
  const rest = read("rest");
  return reps !== null && sets !== null && rest !== null ? { reps, sets, rest } : null;
}
