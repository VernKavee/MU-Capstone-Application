"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function credentials(formData: FormData) {
  return { email: String(formData.get("email") ?? ""), password: String(formData.get("password") ?? "") };
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(formData));
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp(credentials(formData));
  if (error) redirect(`/register?error=${encodeURIComponent(error.message)}`);
  // Email confirmation is off (ADR-0001), so the user is signed in now.
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
