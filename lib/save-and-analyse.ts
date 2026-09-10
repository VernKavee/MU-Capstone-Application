// Save first, then analyse (ADR-0007), on the server. The server actions in
// app/(app)/workout/[exercise]/live/actions.ts call these with the request's Supabase
// client, so row-level security scopes every query to the signed-in user. Kept apart
// from the actions so a script can run the same code against the local stack under
// Node's type stripping, which is why the imports carry .ts extensions.
import { gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HISTORY_WORKOUTS, type FeedbackInput, type SetSummary } from "./analysis/contracts.ts";
import { writeFeedback } from "./analysis/feedback.ts";
import { scoreSimilarity } from "./analysis/similarity.ts";
import type { SessionReport } from "./engine/types.ts";
import { ruleBasedLogic } from "./exercise.ts";
import { SETS_BUCKET, type Attempt, type KeypointFile, type Similarity, type Totals } from "./set.ts";
import type { Database, Json } from "./supabase/database.types.ts";

type Client = SupabaseClient<Database>;

export type SaveSetInput = {
  workoutId: string | null; // null saves the workout first (ADR-0004)
  exerciseId: string;
  setup: { reps: number; sets: number; rest: number };
  setNo: number;
  kind: "initial" | "repair";
  endedBy: "target_reached" | "user_ended" | "attempt_cap";
  startedAt: string;
  endedAt: string;
  totals: Totals;
  attempts: Attempt[];
  engineReport: SessionReport;
  engineVersion: string;
  videoExt: string | null; // null when the browser could not record
  keypointsExt: "json.gz" | "json";
};

export type Upload = { path: string; token: string };
export type SaveSetResult = { workoutId: string; setId: string; uploads: { video: Upload | null; keypoints: Upload } };
export type SetFiles = { video: string | null; keypoints: string | null };
export type AnalyseResult = { similarity: Similarity | null; feedback: string | null; error: string | null };

// The row exists before any file moves and before any analysis. Returns signed upload
// URLs for the two files, which the browser uses directly against storage (NFR3).
export async function saveSet(supabase: Client, input: SaveSetInput): Promise<SaveSetResult | { error: string }> {
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { error: "Signed out." };

  let workoutId = input.workoutId;
  if (!workoutId) {
    const { data, error } = await supabase
      .from("workouts")
      .insert({ user_id: userId, exercise_id: input.exerciseId, target_reps: input.setup.reps, target_sets: input.setup.sets, rest_seconds: input.setup.rest, started_at: input.startedAt })
      .select("id")
      .single();
    if (error) return { error: error.message };
    workoutId = data.id;
  }

  const { data: set, error } = await supabase
    .from("sets")
    .insert({
      workout_id: workoutId,
      set_no: input.setNo,
      kind: input.kind,
      ended_by: input.endedBy,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      totals: input.totals,
      attempts: input.attempts as unknown as Json,
      engine_report: input.engineReport as unknown as Json,
      engine_version: input.engineVersion,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const folder = `${userId}/${set.id}`;
  const sign = async (name: string) => {
    const { data, error } = await supabase.storage.from(SETS_BUCKET).createSignedUploadUrl(`${folder}/${name}`, { upsert: true });
    if (error) throw error;
    return { path: data.path, token: data.token };
  };
  try {
    return {
      workoutId,
      setId: set.id,
      uploads: {
        video: input.videoExt ? await sign(`video.${input.videoExt}`) : null,
        keypoints: await sign(`keypoints.${input.keypointsExt}`),
      },
    };
  } catch (e) {
    return { error: message(e) };
  }
}

// Record which files arrived, score similarity from the keypoint file in storage, then
// write feedback with the workout's earlier sets and the user's past workouts of the
// exercise as context. Whatever step fails, what came before it stays written.
export async function analyseSet(supabase: Client, setId: string, files: SetFiles): Promise<AnalyseResult> {
  // Only paths that arrived are written, so a retry never erases one an earlier call stored.
  const paths = { ...(files.video && { video_url: files.video }), ...(files.keypoints && { keypoints_url: files.keypoints }) };
  if (Object.keys(paths).length) {
    const { error } = await supabase.from("sets").update(paths).eq("id", setId);
    if (error) return { similarity: null, feedback: null, error: error.message };
  }
  const { data: set, error: setError } = await supabase
    .from("sets")
    .select("*, workouts!inner(*, exercises!inner(*))")
    .eq("id", setId)
    .single();
  if (setError) return { similarity: null, feedback: null, error: setError.message };
  const workout = set.workouts;
  const exercise = workout.exercises;
  let attempts = set.attempts as unknown as Attempt[];
  let similarity = set.similarity as Similarity | null;

  if (set.keypoints_url && !similarity) {
    try {
      const landmarks = await readKeypointFile(supabase, set.keypoints_url);
      const scored = await scoreSimilarity({
        exercise_key: exercise.engine_key,
        landmarks,
        attempts: attempts.map(({ attempt_no, frame_start, frame_end, outcome }) => ({ attempt_no, frame_start, frame_end, outcome })),
      });
      const byNo = new Map(scored.attempts.map((a) => [a.attempt_no, a.similarity]));
      attempts = attempts.map((a) => ({ ...a, similarity: byNo.get(a.attempt_no) ?? null }));
      similarity = scored.set;
      const { error } = await supabase.from("sets").update({ similarity, attempts: attempts as unknown as Json }).eq("id", setId);
      if (error) throw error;
    } catch (e) {
      return { similarity: null, feedback: null, error: `Similarity failed: ${message(e)}` };
    }
  }

  try {
    const [{ data: profile }, { data: earlier }, { data: history }] = await Promise.all([
      supabase.from("profiles").select("display_name, age, gender, weight_kg, height_cm, medical_history").single(),
      supabase.from("sets").select("*").eq("workout_id", workout.id).lt("created_at", set.created_at).order("created_at"),
      supabase
        .from("workouts")
        .select("started_at, target_reps, target_sets, sets(*)")
        .eq("exercise_id", exercise.id)
        .neq("id", workout.id)
        .order("started_at", { ascending: false })
        .limit(HISTORY_WORKOUTS),
    ]);
    if (!profile) return { similarity, feedback: null, error: "The profile could not be read." };
    const input: FeedbackInput = {
      profile,
      exercise: { id: exercise.id, name: exercise.name, rules: ruleBasedLogic(exercise).rules },
      workout: { target_reps: workout.target_reps, target_sets: workout.target_sets, rest_seconds: workout.rest_seconds, earlier_sets: (earlier ?? []).map(summary) },
      set: { ...summary(set), similarity, attempts },
      history: (history ?? []).map((w) => ({ started_at: w.started_at, target_reps: w.target_reps, target_sets: w.target_sets, sets: w.sets.map(summary) })),
    };
    const { feedback } = await writeFeedback(input);
    const { error } = await supabase.from("sets").update({ llm_feedback: feedback }).eq("id", setId);
    if (error) throw error;
    return { similarity, feedback, error: null };
  } catch (e) {
    return { similarity, feedback: null, error: `Feedback failed: ${message(e)}` };
  }
}

// Recorded on the set whose repair set was skipped (ADR-0004).
export async function declineRepair(supabase: Client, setId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("sets").update({ repair_declined: true }).eq("id", setId);
  return { error: error?.message ?? null };
}

export async function endWorkout(supabase: Client, workoutId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("workouts").update({ ended_at: new Date().toISOString() }).eq("id", workoutId);
  return { error: error?.message ?? null };
}

type SetRow = { set_no: number; kind: string; ended_by: string; totals: Json; similarity: Json; llm_feedback: string | null };
const summary = (row: SetRow): SetSummary => ({
  set_no: row.set_no,
  kind: row.kind as SetSummary["kind"],
  ended_by: row.ended_by,
  totals: row.totals as Totals,
  similarity: row.similarity as Similarity | null,
  feedback: row.llm_feedback,
});

async function readKeypointFile(supabase: Client, path: string): Promise<KeypointFile> {
  const { data, error } = await supabase.storage.from(SETS_BUCKET).download(path);
  if (error) throw error;
  const bytes = Buffer.from(await data.arrayBuffer());
  return JSON.parse((path.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8"));
}

const message = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e));
