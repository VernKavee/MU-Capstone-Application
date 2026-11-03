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

export async function analyseSet(setId: string, files: SetFiles) {
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { similarity: null, feedback: null, error: e instanceof Error ? e.message : String(e) };
  }
  return store.analyseSet(await createClient(), admin, setId, files);
}

export async function declineRepair(setId: string) {
  return store.declineRepair(await createClient(), setId);
}

export async function endWorkout(workoutId: string) {
  return store.endWorkout(await createClient(), workoutId);
}
