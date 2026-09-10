"use server";

import { redirect } from "next/navigation";
import { CONSENT_KINDS, CONSENT_VERSION } from "@/lib/consent";
import { createClient } from "@/lib/supabase/server";

export async function grantConsents(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");

  const missing = CONSENT_KINDS.filter(({ kind }) => formData.get(kind) !== "on");
  if (missing.length > 0) redirect("/consent?error=All+three+consents+are+required");

  const rows = CONSENT_KINDS.map(({ kind }) => ({ user_id: userId, kind, version: CONSENT_VERSION }));
  const { error } = await supabase.from("consents").upsert(rows, { ignoreDuplicates: true });
  if (error) redirect(`/consent?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}
