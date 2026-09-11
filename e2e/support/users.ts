// Admin access to the local Supabase stack for e2e setup and cleanup, and unique test
// identities so runs never collide. The keys are read from the running stack
// (`npx supabase status`), so no secret is kept on disk for the tests.
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let status: Record<string, string> | null = null;
function supabaseStatus() {
  if (!status) {
    // The CLI sometimes prints a "Stopped services: [...]" line (auto-paused idle
    // containers) before the JSON on the same stdout; the object always starts at the
    // first brace.
    const out = execSync("npx supabase status -o json", { encoding: "utf8" });
    status = JSON.parse(out.slice(out.indexOf("{")));
  }
  return status!;
}

export function adminClient(): SupabaseClient {
  const { API_URL, SERVICE_ROLE_KEY } = supabaseStatus();
  return createClient(API_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

// A client with the same key the app itself uses, for proving RLS from outside the app.
export function anonClient(): SupabaseClient {
  const { API_URL, PUBLISHABLE_KEY } = supabaseStatus();
  return createClient(API_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

// e2e.test is not a real domain; every account this suite creates uses it, so cleanup
// never has to guess which accounts were its own.
export const testEmail = (tag: string) => `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;

// Deletes an e2e-created user: the two files of every set the tests know about, then the
// auth user, whose delete cascades to profiles, consents, workouts, and sets (the
// migrations' `on delete cascade`). Storage objects carry no such cascade.
export async function deleteTestUser(userId: string) {
  const admin = adminClient();
  const { data: folders } = await admin.storage.from("sets").list(userId);
  for (const folder of folders ?? []) {
    const { data: files } = await admin.storage.from("sets").list(`${userId}/${folder.name}`);
    const paths = (files ?? []).map((f) => `${userId}/${folder.name}/${f.name}`);
    if (paths.length) await admin.storage.from("sets").remove(paths);
  }
  await admin.auth.admin.deleteUser(userId);
}
