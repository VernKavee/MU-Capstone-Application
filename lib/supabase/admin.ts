import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// The server's own client, past row-level security, for the analyse step's writes only
// (ADR-0007, 2026-11-03): similarity, the scores merged into the attempt records, and the
// feedback, which the API no longer lets a user update. Every caller first reads the row
// with the request's client, so ownership is proven before this client writes. The key is
// not NEXT_PUBLIC_, so it never reaches a browser bundle.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set, so the analysis cannot be written.");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
