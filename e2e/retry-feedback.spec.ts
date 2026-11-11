// A set left without feedback, once its set-complete screen is gone: the finished summary
// offers to write it, and History shows what was written. With FEEDBACK_URL unset the stub
// writes it; with the service down the error is shown and the button stays. The test holds
// the page to whichever of the two the database records.
import { expect, test } from "@playwright/test";
import { fillProfile, grantConsent, signIn } from "./support/onboarding";
import { adminClient, deleteTestUser, testEmail } from "./support/users";

// The zone cookie set up front, so app/(app)/time-zone.tsx never refreshes the page, which
// otherwise races the test's own navigation.
const ZONE = "Asia/Bangkok";
test.use({ timezoneId: ZONE });
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "tz", value: ZONE, url: "http://localhost:3000" }]);
});

test("a set without feedback can have it written from the finished summary", async ({ page }) => {
  // The service alone may take up to its 60 s timeout.
  test.setTimeout(180_000);
  const admin = adminClient();
  const password = "correct horse battery staple";
  const { data: user } = await admin.auth.admin.createUser({ email: testEmail("retry"), password, email_confirm: true });
  const userId = user.user!.id;

  try {
    // A finished workout with one set saved and never analysed: no files, so no similarity.
    const now = new Date().toISOString();
    const { data: workout } = await admin
      .from("workouts")
      .insert({ user_id: userId, exercise_id: "squat", target_reps: 1, target_sets: 1, rest_seconds: 0, started_at: now, ended_at: now })
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
        engine_report: { schema_version: 4, reps: [], abandoned_attempts: [] },
        engine_version: "e2e",
      })
      .select("id")
      .single();

    await signIn(page, user.user!.email!, password);
    await grantConsent(page);
    await fillProfile(page);

    await page.goto(`/workout/squat/done/${workout!.id}`);
    const button = page.getByRole("button", { name: "Write feedback now" });
    await button.click();
    // The action redirects back to the summary when it finishes, either way.
    await expect(page.getByRole("button", { name: /Writing feedback/ })).toHaveCount(0, { timeout: 70_000 });

    const { data: row } = await admin.from("sets").select("llm_feedback").eq("id", set!.id).single();
    if (row!.llm_feedback) {
      await expect(button).toHaveCount(0);
      await page.goto(`/history/squat/${workout!.id}?set=${set!.id}`);
      await expect(page.getByRole("button", { name: "Write feedback now" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Read the full feedback" })).toBeVisible();
    } else {
      // Next's route announcer is an alert too, so the error is found by its text.
      await expect(page.getByRole("alert").filter({ hasText: "Feedback failed:" })).toBeVisible();
      await expect(button).toBeVisible();
      await page.goto(`/history/squat/${workout!.id}?set=${set!.id}`);
      await expect(page.getByRole("button", { name: "Write feedback now" })).toBeVisible();
    }
  } finally {
    await deleteTestUser(userId);
  }
});
