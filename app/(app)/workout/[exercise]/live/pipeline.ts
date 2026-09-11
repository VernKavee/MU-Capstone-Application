// The browser's side of one set's job (lib/set-job.ts): the server actions it calls and
// the upload it makes. Both files go from here straight to storage with the signed upload
// URLs the save returned (NFR3).
import { SETS_BUCKET } from "@/lib/set";
import { createJob as createSetJob, type JobApi } from "@/lib/set-job";
import { createClient } from "@/lib/supabase/client";
import { analyseSet, declineRepair, saveSet } from "./actions";

export type { Job, JobStatus } from "@/lib/set-job";

const api: JobApi = {
  saveSet,
  analyseSet,
  declineRepair,
  upload: (to, body, contentType) =>
    createClient().storage.from(SETS_BUCKET).uploadToSignedUrl(to.path, to.token, body, { contentType, upsert: true }),
};

export const createJob = (opts: Parameters<typeof createSetJob>[1]) => createSetJob(api, opts);
