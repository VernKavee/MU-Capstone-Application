// Save first, then analyse (ADR-0007), for one set, in the browser and outside React.
// The row is saved by a server action that returns signed upload URLs; both files go from
// here straight to storage with them (NFR3); then the analyse action scores similarity
// and writes feedback. Each step remembers what it finished, so a retry picks up where
// the last run stopped and nothing is saved twice.
import type { SetCapture } from "@/lib/live/session";
import { SETS_BUCKET, toKeypointFile, type Similarity } from "@/lib/set";
import { createClient } from "@/lib/supabase/client";
import type { SaveSetInput, SaveSetResult, Upload } from "@/lib/save-and-analyse";
import { analyseSet, declineRepair, saveSet } from "./actions";

export type JobStatus = "saving" | "uploading" | "analysing" | "done" | "failed";
export type JobUpdate = { status: JobStatus; error?: string | null; similarity?: Similarity | null; feedback?: string | null };
export type Job = ReturnType<typeof createJob>;

export function createJob(opts: {
  input: Omit<SaveSetInput, "workoutId" | "videoExt" | "keypointsExt">;
  capture: SetCapture;
  after: Promise<unknown>; // the previous set's save, so every set joins the same workout
  workoutId: () => string | null;
  onSaved: (workoutId: string) => void;
  onUpdate: (update: JobUpdate) => void;
}) {
  const { capture } = opts;
  const keypoints = encodeKeypoints(capture);
  const videoType = capture.videoMimeType?.split(";")[0] ?? null;
  const uploaded: { video: string | null; keypoints: string | null } = { video: null, keypoints: null };
  let saved: SaveSetResult | null = null;
  let declined = false;
  let declineRecorded = false;
  let settleSave = () => {};
  const saveSettled = new Promise<void>((resolve) => (settleSave = resolve));

  async function save(): Promise<SaveSetResult> {
    try {
      await opts.after;
      const { ext } = await keypoints;
      const result = await saveSet({
        ...opts.input,
        workoutId: opts.workoutId(),
        videoExt: capture.video && videoType ? videoType.split("/")[1] : null,
        keypointsExt: ext,
      }).catch((e: unknown) => ({ error: message(e) }));
      if ("error" in result) throw new Error(`The set was not saved: ${result.error}`);
      opts.onSaved(result.workoutId);
      return result;
    } finally {
      settleSave();
    }
  }

  async function recordDecline(setId: string) {
    const { error } = await declineRepair(setId);
    if (error) throw new Error(`Skipping the repair set was not recorded: ${error}`);
    declineRecorded = true;
  }

  async function upload(target: SaveSetResult) {
    const storage = createClient().storage.from(SETS_BUCKET);
    const kp = await keypoints;
    const put = async (name: keyof typeof uploaded, to: Upload | null, body: Blob | null, contentType: string | null) => {
      if (!to || !body || !contentType || uploaded[name]) return;
      const { error } = await storage.uploadToSignedUrl(to.path, to.token, body, { contentType, upsert: true });
      if (!error) uploaded[name] = to.path;
    };
    // ponytail: analysis waits for the video as well as the keypoint file; analyse after
    // the keypoint file alone if the wait shows over the tunnel in the evaluation.
    await Promise.all([
      put("video", target.uploads.video, capture.video, videoType),
      put("keypoints", target.uploads.keypoints, kp.body, kp.type),
    ]);
  }

  async function run() {
    try {
      if (!saved) {
        opts.onUpdate({ status: "saving", error: null });
        saved = await save();
      }
      const target = saved;
      if (declined && !declineRecorded) await recordDecline(target.setId);
      opts.onUpdate({ status: "uploading", error: null });
      await upload(target);
      opts.onUpdate({ status: "analysing" });
      const result = await analyseSet(target.setId, uploaded);
      const missing = [capture.video && !uploaded.video ? "the video" : null, uploaded.keypoints ? null : "the keypoint file"].filter(Boolean);
      const error = result.error ?? (missing.length ? `${capitalise(missing.join(" and "))} did not upload.` : null);
      opts.onUpdate({ status: error ? "failed" : "done", error, similarity: result.similarity, feedback: result.feedback });
    } catch (e) {
      opts.onUpdate({ status: "failed", error: message(e) });
    }
  }

  // The decline is recorded on this set's row (ADR-0004). Before the row exists it is
  // remembered and written as soon as the save lands, never dropped.
  async function decline(): Promise<string | null> {
    declined = true;
    if (!saved || declineRecorded) return null;
    try {
      await recordDecline(saved.setId);
      return null;
    } catch (e) {
      return message(e);
    }
  }

  return { run, decline, saveSettled };
}

// The keypoint file (ADR-0005), gzipped where the browser has CompressionStream.
async function encodeKeypoints(capture: SetCapture) {
  const json = new Blob([JSON.stringify(toKeypointFile(capture.frames))], { type: "application/json" });
  if (typeof CompressionStream === "undefined") return { body: json, ext: "json" as const, type: "application/json" };
  const body = await new Response(json.stream().pipeThrough(new CompressionStream("gzip"))).blob();
  return { body, ext: "json.gz" as const, type: "application/gzip" };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
