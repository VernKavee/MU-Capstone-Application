// This test network sometimes drops the pose model's download (Chrome's fetch fails where
// curl against the same URL does not), and every set downloads the model again. The live
// screen already recovers from that with its own "Try again" button, so the test presses
// it rather than the app carrying retry logic it would not otherwise need.
import { expect, type Page } from "@playwright/test";

// Waits for a set's complete screen, pressing "Try again" each time the model fails to load.
export async function untilSetComplete(page: Page, text: string, attempts = 6) {
  const complete = page.getByText(text);
  const tryAgain = page.getByRole("button", { name: "Try again" });
  for (let i = 0; i < attempts; i++) {
    await expect(complete.or(tryAgain)).toBeVisible({ timeout: 60_000 });
    if (await complete.isVisible()) return;
    await tryAgain.click();
  }
  throw new Error(`"${text}" did not appear after ${attempts} camera starts`);
}
