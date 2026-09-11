// Register, consent, and profile: the path every gated page sits behind (app/(app)/layout.tsx).
import type { Page } from "@playwright/test";

export async function register(page: Page, email: string, password: string) {
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function grantConsent(page: Page) {
  await page.waitForURL("/consent");
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Continue" }).click();
}

// medicalHistory is the seam the feedback stub is meant to prove it received (ADR-0007):
// callers pass a marker string unique to that test run and look for it again in feedback.
export async function fillProfile(page: Page, medicalHistory: string) {
  await page.waitForURL("/profile/setup");
  await page.getByLabel("Display name").fill("E2E Tester");
  await page.getByLabel("Age").fill("30");
  await page.getByLabel("Gender").selectOption("other");
  await page.getByLabel("Weight (kg)").fill("70");
  await page.getByLabel("Height (cm)").fill("170");
  await page.getByLabel("Medical history").fill(medicalHistory);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL("/");
}

export async function onboard(page: Page, opts: { email: string; password: string; medicalHistory: string }) {
  await register(page, opts.email, opts.password);
  await grantConsent(page);
  await fillProfile(page, opts.medicalHistory);
}
