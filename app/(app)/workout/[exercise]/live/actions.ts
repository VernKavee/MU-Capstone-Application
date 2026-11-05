"use server";

import * as store from "@/lib/save-and-analyse";
import type { SaveSetInput, SetFiles } from "@/lib/save-and-analyse";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// The completion flow's server side (ADR-0007), with the request's Supabase client so
// row-level security applies. Called from the live screen, not from forms, so errors
// come back as values rather than an ?error= query string.

export async function saveSet(input: SaveSetInput) {
  return store.saveSet(await createClient(), input);
}

// The error also goes to the server log: the screen that shows it is gone once the
// workout is finished, and the finished summary cannot tell a failure from a wait.
export async function analyseSet(setId: string, files: SetFiles) {
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`analyseSet ${setId}: ${error}`);
    return { similarity: null, feedback: null, error };
  }
  const result = await store.analyseSet(await createClient(), admin, setId, files);
  if (result.error) console.error(`analyseSet ${setId}: ${result.error}`);
  return result;
}

export async function declineRepair(setId: string) {
  return store.declineRepair(await createClient(), setId);
}

export async function endWorkout(workoutId: string) {
  return store.endWorkout(await createClient(), workoutId);
}
