// Run with `npm run test:unit`. One set's job (ADR-0007) against a fake API: save, both
// uploads, then analysis; a retry redoes only what is missing; the save waits for the
// previous set's save; and a skipped repair set is recorded once, even when the skip comes
// before the save lands.
import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyKeypoints, type SessionReport } from "./engine/types.ts";
import type { SetCapture } from "./live/session.ts";
import type { SaveSetInput, SaveSetResult, SetFiles } from "./save-and-analyse.ts";
import { createJob, type JobApi, type JobUpdate } from "./set-job.ts";

const report: SessionReport = {
  schema_version: 4, generated_at: "", exercise_name: "squat", engine: "mediapipe",
  filter: { active: false, stage: null, name: null, params: null },
  ready_gate: { enabled: true, phase: "active", countdown_s: 3, ended_by_pose: false },
  total_attempts: 0, total_reps_completed: 0, total_reps_correct: 0, total_attempts_abandoned: 0, reps: [], abandoned_attempts: [],
};
const capture: SetCapture = {
  endedBy: "target_reached",
  startedAt: new Date(0),
  endedAt: new Date(66),
  report,
  frames: [0, 33, 66].map((t) => ({ t, state: "Idle", event: "none", violations: [], keypoints: emptyKeypoints() })),
  video: new Blob(["video bytes"], { type: "video/webm" }),
  videoMimeType: "video/webm;codecs=vp9",
};
const saved: SaveSetResult = {
  workoutId: "w1",
  setId: "s1",
  uploads: { video: { path: "u/s1/video.webm", token: "t1" }, keypoints: { path: "u/s1/keypoints.json.gz", token: "t2" } },
};

// Records every call. `save` and `uploadError` change what the save and an upload return.
function fakeApi(opts: { save?: () => Promise<SaveSetResult | { error: string }>; uploadError?: (path: string) => string | null } = {}) {
  const calls = { save: [] as SaveSetInput[], upload: [] as string[], analyse: [] as SetFiles[], decline: [] as string[] };
  const api: JobApi = {
    saveSet: (input) => {
      calls.save.push(input);
      return opts.save?.() ?? Promise.resolve(saved);
    },
    upload: async (to) => {
      calls.upload.push(to.path);
      return { error: opts.uploadError?.(to.path) ?? null };
    },
    analyseSet: async (_setId, files) => {
      calls.analyse.push(files);
      return { similarity: null, feedback: "Good set.", error: null };
    },
    declineRepair: async (setId) => {
      calls.decline.push(setId);
      return { error: null };
    },
  };
  return { api, calls };
}

function job(api: JobApi, after: Promise<unknown> = Promise.resolve()) {
  const updates: JobUpdate[] = [];
  const handle = createJob(api, {
    input: {
      exerciseId: "squat", setup: { reps: 10, sets: 3, rest: 60 }, setNo: 1, kind: "initial", endedBy: "target_reached",
      startedAt: "", endedAt: "", totals: { attempts: 0, completed_reps: 0, correct_reps: 0, abandoned_attempts: 0 },
      attempts: [], engineReport: report, engineVersion: "stub-1",
    },
    capture,
    after,
    workoutId: () => "w0",
    onSaved: () => {},
    onUpdate: (update) => updates.push(update),
  });
  return { ...handle, updates };
}

const until = async (done: () => boolean) => {
  while (!done()) await new Promise((resolve) => setTimeout(resolve, 1));
};

test("a set is saved, both files uploaded, then analysed", async () => {
  const { api, calls } = fakeApi();
  const j = job(api);
  await j.run();
  assert.deepEqual(j.updates.map((u) => u.status), ["saving", "uploading", "analysing", "done"]);
  assert.deepEqual([calls.save[0].workoutId, calls.save[0].videoExt, calls.save[0].keypointsExt], ["w0", "webm", "json.gz"]);
  assert.deepEqual(calls.upload, ["u/s1/video.webm", "u/s1/keypoints.json.gz"]);
  assert.deepEqual(calls.analyse, [{ video: "u/s1/video.webm", keypoints: "u/s1/keypoints.json.gz" }]);
  assert.equal(j.updates.at(-1)!.feedback, "Good set.");
});

test("a retry redoes only what is missing", async () => {
  let videoFails = true;
  const { api, calls } = fakeApi({ uploadError: (path) => (path.endsWith("video.webm") && videoFails ? "network down" : null) });
  const j = job(api);
  await j.run();
  assert.deepEqual(j.updates.at(-1), { status: "failed", error: "The video did not upload.", similarity: null, feedback: "Good set." });
  assert.deepEqual(calls.analyse[0], { video: null, keypoints: "u/s1/keypoints.json.gz" }, "the analysis runs on what arrived");
  videoFails = false;
  await j.run();
  assert.equal(calls.save.length, 1, "the set is not saved twice");
  assert.deepEqual(calls.upload, ["u/s1/video.webm", "u/s1/keypoints.json.gz", "u/s1/video.webm"], "only the video is sent again");
  assert.deepEqual(calls.analyse[1], { video: "u/s1/video.webm", keypoints: "u/s1/keypoints.json.gz" });
  assert.equal(j.updates.at(-1)!.status, "done");
});

test("the save waits for the previous set's save, and a failed save is retried", async () => {
  let release = () => {};
  const previous = new Promise<void>((resolve) => (release = resolve));
  let offline = true;
  const { api, calls } = fakeApi({ save: async () => (offline ? { error: "offline" } : saved) });
  const j = job(api, previous);
  const running = j.run();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls.save.length, 0, "nothing is saved before the previous set's save settles");
  release();
  await running;
  assert.deepEqual(j.updates.at(-1), { status: "failed", error: "The set was not saved: offline" });
  await j.saveSettled; // settles on a failure too, so the next set is never stuck behind it
  offline = false;
  await j.run();
  assert.equal(calls.save.length, 2);
  assert.equal(j.updates.at(-1)!.status, "done");
});

test("a skipped repair set is recorded once, even when the skip comes before the save lands", async () => {
  let land = () => {};
  const { api, calls } = fakeApi({ save: () => new Promise((resolve) => (land = () => resolve(saved))) });
  const j = job(api);
  const running = j.run();
  await until(() => calls.save.length === 1);
  assert.equal(await j.decline(), null, "the skip is accepted before the row exists");
  assert.deepEqual(calls.decline, []);
  land();
  await running;
  assert.deepEqual(calls.decline, ["s1"], "and written as soon as the save lands");
  assert.equal(await j.decline(), null);
  assert.deepEqual(calls.decline, ["s1"], "never twice");
});
