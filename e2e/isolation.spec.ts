// Per-user access control (NFR2, Phase 0 reminder): user A gets a workout, a set, and a
// file; user B tries to read all three through the app's pages, the database, and
// storage, and gets nothing back from any of them.
import { expect, test } from "@playwright/test";
import { fillProfile, grantConsent, signIn } from "./support/onboarding";
import { adminClient, anonClient, deleteTestUser, testEmail } from "./support/users";

test("user B cannot reach user A's workout, its set, or its files", async ({ page }) => {
  const admin = adminClient();
  const emailA = testEmail("iso-a");
  const emailB = testEmail("iso-b");
  const password = "correct horse battery staple";

  const { data: userA } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
  const { data: userB } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
  const aId = userA.user!.id;
  const bId = userB.user!.id;

  try {
    // Seed A's data directly, standing in for what the completion flow writes (already
    // proven by lib/save-and-analyse.ts and its unit tests): a finished workout, one set,
    // and a file in A's storage folder. started_at is set explicitly and equal to
    // ended_at: the table's check constraint requires ended_at >= started_at, and the
    // column's own default (now()) would otherwise land a moment after this ended_at.
    const now = new Date().toISOString();
    const { data: workout } = await admin
      .from("workouts")
      .insert({ user_id: aId, exercise_id: "squat", target_reps: 1, target_sets: 1, rest_seconds: 0, started_at: now, ended_at: now })
      .select("id")
      .single();
    const { data: set } = await admin
      .from("sets")
      .insert({
        workout_id: workout!.id,
        set_no: 1,
        kind: "initial",
        ended_by: "target_reached",
        started_at: now,
        ended_at: now,
        totals: { attempts: 1, completed_reps: 1, correct_reps: 1, abandoned_attempts: 0 },
        attempts: [],
        engine_report: { schema_version: 4 },
        engine_version: "e2e",
        similarity: { overall: 90, head_neck: 90, back_core: 90, hips_pelvis: 90, knees: 90, ankles_feet: 90 },
        llm_feedback: "A's feedback, not B's to read.",
      })
      .select("id")
      .single();
    const videoPath = `${aId}/${set!.id}/video.webm`;
    await admin.storage.from("sets").upload(videoPath, new Blob(["not a real video"]), { contentType: "video/webm" });
    await admin.from("sets").update({ video_url: videoPath }).eq("id", set!.id);

    // B already exists (created above through the admin API, not the register form), so
    // sign in rather than onboard() registering the same email again.
    await signIn(page, emailB, password);
    await grantConsent(page);
    await fillProfile(page, "none");
    for (const url of [
      `/workout/squat/done/${workout!.id}`,
      `/history/squat/${workout!.id}`,
      `/history/squat/${workout!.id}/feedback?set=${set!.id}`,
    ]) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(404);
    }

    // B, through the database and storage APIs directly, with the same key the app uses.
    const bClient = anonClient();
    const { error: signInError } = await bClient.auth.signInWithPassword({ email: emailB, password });
    expect(signInError).toBeNull();
    const { data: rows } = await bClient.from("sets").select("id").eq("id", set!.id);
    expect(rows).toEqual([]);
    const { data: workoutRows } = await bClient.from("workouts").select("id").eq("id", workout!.id);
    expect(workoutRows).toEqual([]);
    const { error: signedUrlError } = await bClient.storage.from("sets").createSignedUrl(videoPath, 60);
    expect(signedUrlError).toBeTruthy();
    const { error: downloadError } = await bClient.storage.from("sets").download(videoPath);
    expect(downloadError).toBeTruthy();
  } finally {
    await deleteTestUser(aId);
    await deleteTestUser(bId);
  }
});
