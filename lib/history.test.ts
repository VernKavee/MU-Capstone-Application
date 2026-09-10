// Run with `npm run test:unit`. Fails if a set lands on the wrong local day, the seven
// days stop ending today, or the mean starts counting unscored sets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeDays, lastSevenDays, localDate, meanSimilarity, timeZone, WEEK_FETCH_MS, weeklySummary } from "./history.ts";
import type { Similarity } from "./set.ts";

const BKK = "Asia/Bangkok";
const THURSDAY = new Date("2026-09-10T05:00:00Z");
const sim = (overall: number): Similarity => ({ overall, head_neck: overall, back_core: overall, hips_pelvis: overall, knees: overall, ankles_feet: overall });

test("the seven days end today in the given zone", () => {
  assert.deepEqual(lastSevenDays(THURSDAY, BKK), ["2026-09-04", "2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"]);
  // 00:20 on Monday in Bangkok is still Sunday in UTC.
  const mondayEarly = new Date("2026-09-06T17:20:00Z");
  assert.equal(localDate(mondayEarly, BKK), "2026-09-07");
  assert.equal(localDate(mondayEarly, "UTC"), "2026-09-06");
  assert.equal(lastSevenDays(mondayEarly, BKK)[6], "2026-09-07");
  assert.equal(lastSevenDays(mondayEarly, "UTC")[6], "2026-09-06");
});

test("a DST change moves neither the day nor the window", () => {
  const ny = "America/New_York"; // clocks go back at 02:00 on Sunday 1 November 2026
  assert.equal(localDate("2026-11-02T04:30:00Z", ny), "2026-11-01", "23:30 EST is still Sunday");
  const sundayLate = new Date("2026-11-02T04:59:00Z");
  assert.deepEqual(lastSevenDays(sundayLate, ny), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  const firstMidnight = Date.parse("2026-10-26T04:00:00Z"); // 00:00 EDT
  assert.ok(sundayLate.getTime() - WEEK_FETCH_MS < firstMidnight, "the fetch window reaches the first day's midnight");
});

test("a day's mean covers its scored sets, initial and repair alike", () => {
  const summary = weeklySummary(lastSevenDays(THURSDAY, BKK), [
    { started_at: "2026-09-06T17:20:00Z", similarity: sim(80) }, // Monday 00:20 local
    { started_at: "2026-09-07T01:00:00Z", similarity: sim(91) }, // Monday, the repair set
    { started_at: "2026-09-10T00:10:00Z", similarity: null }, // today, not scored yet
    { started_at: "2026-09-02T10:00:00Z", similarity: sim(50) }, // eight days ago
  ], BKK);
  assert.deepEqual(summary[3], { date: "2026-09-07", mean: 86, sets: 2 });
  assert.deepEqual(summary[6], { date: "2026-09-10", mean: null, sets: 1 });
  assert.equal(summary.reduce((n, d) => n + d.sets, 0), 3, "eight days ago is outside");
  assert.equal(meanSimilarity([sim(90), null, sim(85)]), 88);
  assert.equal(meanSimilarity([null]), null);
});

test("active days count each local day once per exercise", () => {
  const active = activeDays(lastSevenDays(THURSDAY, BKK), [
    { exercise_id: "squat", started_at: "2026-09-07T01:00:00Z" },
    { exercise_id: "squat", started_at: "2026-09-07T11:00:00Z" },
    { exercise_id: "squat", started_at: "2026-09-09T11:00:00Z" },
    { exercise_id: "lunge", started_at: "2026-09-02T10:00:00Z" }, // eight days ago
  ], BKK);
  assert.deepEqual([...(active.get("squat") ?? [])], ["2026-09-07", "2026-09-09"]);
  assert.equal(active.has("lunge"), false);
});

test("an unknown zone in the cookie falls back to the server's", () => {
  assert.equal(timeZone(BKK), BKK);
  assert.equal(timeZone("Not/AZone"), Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(timeZone(undefined), Intl.DateTimeFormat().resolvedOptions().timeZone);
});
