// Run with `npm run test:unit`. The setup in the query string: three numbers in range,
// and the arm exactly where the row asks for one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSetup, setupQuery, type RuleBasedLogic } from "./exercise.ts";

const logic = (chooses_side: boolean) => ({ state_machine: { chooses_side } }) as RuleBasedLogic;
const numbers = { reps: "10", sets: "3", rest: "60" };

test("setup: the arm is required where the row asks for one, refused elsewhere", () => {
  assert.deepEqual(parseSetup({ ...numbers, side: "left" }, logic(true)), { reps: 10, sets: 3, rest: 60, side: "left" });
  assert.equal(parseSetup(numbers, logic(true)), null);
  assert.equal(parseSetup({ ...numbers, side: "both" }, logic(true)), null);
  assert.equal(parseSetup({ ...numbers, side: ["left", "right"] }, logic(true)), null);
  assert.deepEqual(parseSetup(numbers, logic(false)), { reps: 10, sets: 3, rest: 60, side: null });
  assert.equal(parseSetup({ ...numbers, side: "left" }, logic(false)), null);
  assert.equal(parseSetup({ ...numbers, reps: "0", side: "left" }, logic(true)), null);
});

test("setup: the query string round-trips", () => {
  for (const [side, chooses] of [["right", true], [null, false]] as const) {
    const setup = { reps: 12, sets: 2, rest: 30, side };
    const params = Object.fromEntries(new URLSearchParams(setupQuery(setup)));
    assert.deepEqual(parseSetup(params, logic(chooses)), setup);
  }
});
