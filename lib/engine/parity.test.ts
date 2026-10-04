// Run with `npm run test:unit`. Parity with the research repo's Python engine
// (WEB_APP_PORT.md section 14): recordings of the exam sitting, converted to the
// keypoint-file format by SeniorProject's scratch/eval/eval_web_parity.py, with the
// golden output Python produced from the same file. Events, states, counters, and rule
// names must match on every frame, and the report's numbers within 1e-9, ignoring the
// rule-named rep_stats keys the port adds (section 8).
//
// lib/engine/fixtures holds one trimmed recording per exercise. PARITY_DIR, when set,
// adds every file there (scratch_output/web_parity in SeniorProject, all 25 recordings).
// The settings are the four rows of the latest rule_logic migration, as the database has
// them. Also the seam checks the stub's test made: the counter moves only on a correct
// rep, at most one warning per frame, every warning from the row, the totals add up.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import type { RuleBasedLogic } from "../exercise";
import { createEngine, ENGINE_VERSION } from "./engine.ts";
import { LANDMARK_NAMES, type FrameResult, type Keypoint, type Keypoints } from "./types.ts";

type GoldenFrame = {
  state: string;
  event: string;
  rep_count: number;
  correct_rep_count: number;
  attempt_count: number;
  warning: string[];
  warnings_all: string[];
  warning_display: string[];
  low_confidence: boolean;
};
type Recording = {
  engine_key: string;
  armed: boolean;
  source: string;
  keypoints: { joints: string[]; fields: string[]; frames: { t: number; points: number[] }[] };
  golden: { frames: GoldenFrame[]; report: Record<string, unknown> };
};

const MIGRATIONS = path.join(import.meta.dirname, "../../supabase/migrations");
const FIXTURES = path.join(import.meta.dirname, "fixtures");

// engine_key -> rule_based_logic, from the export pasted into the migration.
function rowsFromMigration(): Record<string, RuleBasedLogic> {
  const file = fs.readdirSync(MIGRATIONS).filter((f) => f.includes("_rule_logic_")).sort().at(-1)!;
  const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
  const rows: Record<string, RuleBasedLogic> = {};
  for (const m of sql.matchAll(/\$logic\$([\s\S]*?)\$logic\$::jsonb\s*where engine_key = '([^']+)'/g)) rows[m[2]] = JSON.parse(m[1]);
  return rows;
}
const ROWS = rowsFromMigration();

const recordings = (dir: string) =>
  fs.readdirSync(dir).filter((f) => f.endsWith(".json.gz")).sort().map((f) => path.join(dir, f));
const read = (file: string): Recording => JSON.parse(gunzipSync(fs.readFileSync(file)).toString("utf8"));

function keypoints(rec: Recording, points: number[]): Keypoints {
  const { joints, fields } = rec.keypoints;
  const kp = {} as Keypoints;
  joints.forEach((name, j) => {
    kp[name as (typeof LANDMARK_NAMES)[number]] = Object.fromEntries(fields.map((f, k) => [f, points[j * fields.length + k]])) as Keypoint;
  });
  return kp;
}

// Deep equality with numbers within 1e-9, strings case-insensitively (Python enum names
// are upper case), and the rule-named rep_stats keys skipped.
function same(actual: unknown, expected: unknown, ruleNames: Set<string>, at: string): string | null {
  if (typeof expected === "number" && typeof actual === "number") return Math.abs(actual - expected) <= 1e-9 ? null : `${at}: ${actual} != ${expected}`;
  if (typeof expected === "string" && typeof actual === "string") return actual.toLowerCase() === expected.toLowerCase() ? null : `${at}: ${actual} != ${expected}`;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (actual.length !== expected.length) return `${at}: length ${actual.length} != ${expected.length}`;
    for (let i = 0; i < expected.length; i++) {
      const diff = same(actual[i], expected[i], ruleNames, `${at}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }
  if (expected && actual && typeof expected === "object" && typeof actual === "object") {
    const skip = at.endsWith(".rep_stats") ? ruleNames : new Set<string>();
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(e)].filter((k) => !skip.has(k)));
    for (const k of keys) {
      if (!(k in a) || !(k in e)) return `${at}.${k}: present on one side only`;
      const diff = same(a[k], e[k], ruleNames, `${at}.${k}`);
      if (diff) return diff;
    }
    return null;
  }
  return actual === expected ? null : `${at}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`;
}

function frameView(r: FrameResult): GoldenFrame {
  return {
    state: r.state,
    event: r.event,
    rep_count: r.rep_count,
    correct_rep_count: r.correct_rep_count,
    attempt_count: r.attempt_count,
    warning: r.warning,
    warnings_all: r.warnings_all.map((w) => w.name),
    warning_display: r.warning_display_rules.map((w) => w.name),
    low_confidence: r.low_confidence,
  };
}

function replay(file: string) {
  const rec = read(file);
  const logic = ROWS[rec.engine_key];
  assert.ok(logic, `no row for ${rec.engine_key}`);
  const ruleNames = new Set(logic.rules.map((r) => r.name));
  const messages = new Set(logic.rules.map((r) => r.messages.en));
  const engine = createEngine(logic, rec.engine_key, { placement: false, ready: false, armed: rec.armed });
  let prev: FrameResult | null = null;
  rec.keypoints.frames.forEach((row, i) => {
    const r = engine.process(keypoints(rec, row.points), row.t);
    const diff = same(frameView(r), rec.golden.frames[i], ruleNames, `${path.basename(file)} frame ${i}`);
    assert.equal(diff, null, diff ?? "");

    // The seam.
    assert.ok(logic.state_machine.states.includes(r.state));
    assert.ok(r.warning.length <= 1);
    for (const w of [...r.warning, ...r.warning_display]) assert.ok(messages.has(w), w);
    for (const w of [...r.warnings_all, ...r.warning_display_rules]) assert.ok(ruleNames.has(w.name), w.name);
    if (prev) {
      const dCorrect = r.correct_rep_count - prev.correct_rep_count;
      const dReps = r.rep_count - prev.rep_count;
      const dAttempts = r.attempt_count - prev.attempt_count;
      if (r.event === "rep_completed") {
        assert.deepEqual([dReps, dAttempts], [1, 1]);
        assert.equal(dCorrect, engine.getSessionReport().reps[r.rep_count - 1].correct ? 1 : 0);
      } else {
        assert.equal(dCorrect, 0);
        assert.equal(dReps, 0);
        assert.equal(dAttempts, r.event === "rep_abandoned" ? 1 : 0);
      }
    }
    prev = r;
  });

  const report = engine.getSessionReport();
  const { generated_at, ...rest } = report;
  assert.ok(generated_at);
  const diff = same(rest, rec.golden.report, ruleNames, `${path.basename(file)} report`);
  assert.equal(diff, null, diff ?? "");
  assert.equal(report.total_attempts, report.total_reps_completed + report.total_attempts_abandoned);
  assert.equal(report.total_reps_correct, report.reps.filter((r) => r.correct).length);
  assert.equal(report.reps.length, report.total_reps_completed);
  for (const r of [...report.reps, ...report.abandoned_attempts]) {
    for (const name of ruleNames) assert.ok(name in r.rep_stats, `${name} missing from rep_stats`);
  }
  return rec;
}

test("the rows are the export the engine was ported from", () => {
  assert.deepEqual(Object.keys(ROWS).sort(), ["dumbbell_biceps_curls", "lunge", "pushup", "squat"]);
  for (const logic of Object.values(ROWS)) assert.ok(logic.source.endsWith(` ${ENGINE_VERSION}`), logic.source);
});

for (const file of recordings(FIXTURES)) {
  test(`parity: fixture ${path.basename(file)}`, () => {
    const rec = replay(file);
    assert.ok(rec.source.endsWith(`SeniorProject src at ${ENGINE_VERSION}`), rec.source);
  });
}

const PARITY_DIR = process.env.PARITY_DIR;
for (const file of PARITY_DIR ? recordings(PARITY_DIR) : []) {
  test(`parity: ${path.basename(file)}`, () => void replay(file));
}
test("parity: the full exam set", { skip: PARITY_DIR ? false : "PARITY_DIR is not set" }, () => {});
