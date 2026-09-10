"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Used by first-time setup and by Settings. The database constraints are the validation.
export async function saveProfile(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");

  const returnTo = formData.get("mode") === "settings" ? "/settings" : "/profile/setup";
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const { error } = await supabase.from("profiles").upsert({
    user_id: userId,
    display_name: text("display_name"),
    age: Number(formData.get("age")),
    gender: text("gender"),
    weight_kg: Number(formData.get("weight_kg")),
    height_cm: Number(formData.get("height_cm")),
    medical_history: text("medical_history"),
    updated_at: new Date().toISOString(),
  });
  if (error) redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  redirect(returnTo === "/settings" ? "/settings?saved=1" : "/");
}
