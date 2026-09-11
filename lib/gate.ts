import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_KINDS, CONSENT_VERSION } from "./consent";
import type { Database } from "./supabase/database.types";

// What a signed-in user still has to do before Home: consent, then profile.
// Row-level security scopes both queries to the current user. A failed query throws to
// the error screen (app/error.tsx); read as "no rows" it would send a user who has
// consented back to the consent screen.
export async function gateState(supabase: SupabaseClient<Database>) {
  const [{ count }, { data: profile }] = await Promise.all([
    supabase.from("consents").select("kind", { count: "exact", head: true }).eq("version", CONSENT_VERSION).throwOnError(),
    supabase.from("profiles").select("user_id").maybeSingle().throwOnError(),
  ]);
  return { consented: (count ?? 0) >= CONSENT_KINDS.length, hasProfile: profile !== null };
}
