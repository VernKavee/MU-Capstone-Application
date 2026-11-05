"use server";

import { redirect } from "next/navigation";
import { isUuid } from "@/lib/history";
import { analyseSet } from "@/lib/save-and-analyse";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Writes the feedback of a set that has none, from the finished summary or History, once
// the set-complete screen and its retry are gone. analyseSet with no new files redoes only
// what is missing: similarity when the set has a keypoint file and no score, then feedback.
// The analysis is written by the server's service-role client only (migration
// analysis_server_only), after the user's client has read the set.
export async function retryFeedback(formData: FormData) {
  const field = (name: string) => String(formData.get(name) ?? "");
  const [exercise, workout, set] = [field("exercise"), field("workout"), field("set")];
  if (!/^[a-z-]+$/.test(exercise) || !isUuid(workout) || !isUuid(set)) redirect("/history");
  const back = field("from") === "done" ? `/workout/${exercise}/done/${workout}?set=${set}` : `/history/${exercise}/${workout}?set=${set}`;

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`retryFeedback ${set}: ${message}`);
    redirect(`${back}&error=${encodeURIComponent(message)}`);
  }
  const result = await analyseSet(await createClient(), admin, set, { video: null, keypoints: null });
  // A similarity error beside written feedback is not shown: the feedback was what was asked.
  if (!result.feedback) {
    console.error(`retryFeedback ${set}: ${result.error}`);
    redirect(`${back}&error=${encodeURIComponent(result.error ?? "Feedback was not written.")}`);
  }
  redirect(back);
}
