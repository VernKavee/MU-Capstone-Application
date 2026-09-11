// Sign in, a whole workout with the repair branch, then History levels 1 to 4 and the
// replay. Skips itself if the camera fixture has not been generated (e2e/fixtures/README.md).
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { untilSetComplete } from "./support/camera";
import { onboard } from "./support/onboarding";
import { adminClient, deleteTestUser, testEmail } from "./support/users";

const T_POSE = "e2e/fixtures/t-pose.y4m";
const MEDICAL_HISTORY = `e2e marker: previous ACL surgery ${Date.now()}`;

test.skip(!fs.existsSync(T_POSE), `${T_POSE} is missing; see e2e/fixtures/README.md`);

test("a workout with a taken and a declined repair set, then history and the replay", async ({ page }) => {
  test.setTimeout(300_000); // real wall-clock time: the stub scripts attempts on a clock

  const email = testEmail("workout");
  const password = "correct horse battery staple";
  await onboard(page, { email, password, medicalHistory: MEDICAL_HISTORY });

  try {
    await test.step("start a squat workout of 1 rep, 2 sets, 3 s rest", async () => {
      await page.getByRole("link", { name: "Squat" }).click();
      await page.getByLabel("Reps per set").fill("1");
      await page.getByLabel("Number of sets").fill("2");
      await page.getByLabel("Rest between sets (seconds)").fill("3");
      await page.getByRole("button", { name: "Continue to the guide" }).click();
      await page.getByRole("link", { name: "Open camera" }).click();
      await page.waitForURL(/\/workout\/squat\/live/);
      // The stub draws each attempt's outcome from Math.random (lib/engine/stub.ts): below
      // 0.12 abandoned, below 0.32 incorrect. Keeping every draw in that band makes every
      // attempt incorrect, so both sets end at the attempt cap with a violation and offer
      // a repair set. The draws stay random and start only after the page is up: pinning
      // Math.random to a constant before load stops Next and React hydrating, silently.
      await page.evaluate(() => {
        const real = Math.random;
        Math.random = () => 0.12 + real() * 0.2;
      });
      await page.getByRole("button", { name: "Start camera" }).click();
    });

    await test.step("set 1 hits the attempt cap with a violation; take the repair set", async () => {
      await untilSetComplete(page, "Squat, set 1 of 2 complete");
      await expect(page.getByText("The set ended at 2 attempts, twice the target.")).toBeVisible();
      await page.getByRole("button", { name: "Start the repair set" }).click();
    });

    await test.step("the repair set also hits the cap; the rest timer follows it, not another repair offer", async () => {
      await untilSetComplete(page, "Squat, repair set 1 of 2 complete");
      await expect(page.getByText("Rest. Set 2 of 2 starts in")).toBeVisible();
      await page.getByRole("button", { name: "Start now" }).click();
    });

    await test.step("set 2 hits the cap too; decline its repair set and finish", async () => {
      await untilSetComplete(page, "Squat, set 2 of 2 complete");
      await page.getByRole("button", { name: "Skip it" }).click();
      await expect(page.getByRole("button", { name: "Finish workout" })).toBeVisible();
      await page.getByRole("button", { name: "Finish workout" }).click();
    });

    await test.step("the finished summary shows all three sets", async () => {
      await page.waitForURL(/\/workout\/squat\/done\//);
      await expect(page.getByRole("heading", { name: "0 correct reps in 6 attempts" })).toBeVisible();
      await expect(page.getByText("2 of 2 sets of 1 reps")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Set 1", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Repair set 1" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Set 2", exact: true })).toBeVisible();
    });

    // The finished summary has its own Home button; go through the tab bar.
    const tabs = page.getByRole("navigation", { name: "Primary" });

    await test.step("history level 1: today's column on Home carries the three sets", async () => {
      await tabs.getByRole("link", { name: "Home" }).click();
      // The column's screen-reader description, e.g. "Friday 11 September, today: 74% over 3 sets."
      await expect(page.getByText(/today: \d+% over 3 sets\./)).toBeAttached();
    });

    await test.step("history level 2: squat has one active day", async () => {
      await tabs.getByRole("link", { name: "History" }).click();
      await expect(page.getByText("1 active day")).toBeVisible();
      await page.getByRole("link", { name: /Squat/ }).click();
    });

    await test.step("history level 3: the one finished workout is listed", async () => {
      await expect(page.getByText("1 finished workout, newest first")).toBeVisible();
      await page.getByRole("link").filter({ hasText: "similarity" }).click();
    });

    await test.step("history level 4: every set is a tile, and the chosen set replays", async () => {
      await expect(page.getByText("Set 1", { exact: true })).toBeVisible();
      await expect(page.getByText("Repair set 1")).toBeVisible();
      await expect(page.getByText("Set 2", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Play the set with the skeleton" }).click();
      await expect(page.getByRole("button", { name: "Pause" })).toBeVisible({ timeout: 15_000 });
    });

    await test.step("the feedback detail page quotes the medical history", async () => {
      await page.getByRole("link", { name: "Read the full feedback" }).click();
      await expect(page.getByText(MEDICAL_HISTORY)).toBeVisible();
    });
  } finally {
    const { data } = await adminClient().auth.admin.listUsers({ perPage: 200 });
    const created = data?.users.find((u) => u.email === email);
    if (created) await deleteTestUser(created.id);
  }
});
