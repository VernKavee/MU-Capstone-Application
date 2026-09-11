// Run with `npm run test:unit`. Fails if a set lands on the wrong local day, the seven
// days stop ending today, or the mean starts counting unscored sets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeDays, attemptAt, formatWhen, frameAt, isUuid, lastSevenDays, localDate, meanSimilarity, setOrder, timeZone, WEEK_FETCH_MS, weeklySummary } from "./history.ts";
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

test("replay finds the frame for a video time and the attempt it belongs to", () => {
  const frames = [0, 33, 67, 100, 133].map((t) => ({ t }));
  assert.deepEqual([frameAt(frames, -5), frameAt(frames, 0), frameAt(frames, 66), frameAt(frames, 67), frameAt(frames, 9999)], [0, 0, 1, 2, 4]);
  const attempts = [{ attempt_no: 1, frame_start: 1, frame_end: 2 }, { attempt_no: 2, frame_start: null, frame_end: null }, { attempt_no: 3, frame_start: 4, frame_end: 4 }];
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => attemptAt(attempts, i)?.attempt_no ?? null), [null, 1, 1, null, 3]);
  const sets = [{ set_no: 2, kind: "initial" }, { set_no: 1, kind: "repair" }, { set_no: 1, kind: "initial" }];
  assert.deepEqual([...sets].sort(setOrder).map((s) => `${s.kind} ${s.set_no}`), ["initial 1", "repair 1", "initial 2"]);
});

test("dates show the local time, and the year only when it is another one there", () => {
  assert.match(formatWhen("2026-09-10T14:35:13Z", BKK, THURSDAY), /21:35$/);
  assert.ok(!formatWhen("2025-12-31T20:00:00Z", BKK, THURSDAY).includes("202"), "1 January 2026 in Bangkok is this year");
  assert.ok(formatWhen("2025-06-01T00:00:00Z", BKK, THURSDAY).includes("2025"));
});

test("a mistyped id in the address is not found, never sent to the database", () => {
  assert.ok(isUuid("0b6c3f5e-8f1a-4c2d-9e7b-1a2b3c4d5e6f"));
  for (const id of ["not-a-uuid", "0b6c3f5e-8f1a-4c2d-9e7b-1a2b3c4d5e6", " 0b6c3f5e-8f1a-4c2d-9e7b-1a2b3c4d5e6f", undefined, ["0b6c3f5e-8f1a-4c2d-9e7b-1a2b3c4d5e6f"]]) {
    assert.equal(isUuid(id), false, String(id));
  }
});

test("an unknown zone in the cookie falls back to the server's", () => {
  assert.equal(timeZone(BKK), BKK);
  assert.equal(timeZone("Not/AZone"), Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(timeZone(undefined), Intl.DateTimeFormat().resolvedOptions().timeZone);
});
