// Run with `npm run test:unit`. Fails if a v16 summary stops parsing, a strayed or older text
// loses a line, or the counts start trusting anything but the attempt records.
import assert from "node:assert/strict";
import { test } from "node:test";
import { faultName, readFeedback, ruleCounts } from "./feedback-text.ts";

const V16 = `Fault partial_squat: You stopped above parallel on most reps.
Fix: Sit your hips back until your thighs are level.
Fault rounded_back: Your back rounded on the way down.
Fix: Brace and keep your chest up.

You hit 1 of 8 target reps with a score of 63.
That is down from set 1.
Next set, slow the descent.

Stopping above parallel leaves the glutes underworked.

Next Session Plan:
1. Slow the descent.
2. Film one set from the side.`;

test("a v16 answer: the faults in order, then the rest as written", () => {
  const { summary, blocks } = readFeedback(V16);
  assert.deepEqual(summary, {
    kind: "faults",
    faults: [
      { rule: "partial_squat", fault: "You stopped above parallel on most reps.", fix: "Sit your hips back until your thighs are level." },
      { rule: "rounded_back", fault: "Your back rounded on the way down.", fix: "Brace and keep your chest up." },
    ],
  });
  assert.deepEqual(blocks, [
    { heading: null, lines: ["You hit 1 of 8 target reps with a score of 63.", "That is down from set 1.", "Next set, slow the descent."], numbered: false },
    { heading: null, lines: ["Stopping above parallel leaves the glutes underworked."], numbered: false },
    { heading: "Next Session Plan", lines: ["Slow the descent.", "Film one set from the side."], numbered: true },
  ]);
});

test("a clean set's Keep line", () => {
  const { summary, blocks } = readFeedback("Keep: Every rep was controlled.\n\nYou hit 8 of 8.");
  assert.deepEqual(summary, { kind: "keep", text: "Every rep was controlled." });
  assert.equal(blocks.length, 1);
});

test("anything that strays from the form keeps every paragraph and has no summary", () => {
  const v15 = "You hit 8 of 8.\nNo faults.\nBetter than set 1.\nKeep it up.\n\nNext Session Plan:\n1. Keep still.";
  assert.equal(readFeedback(v15).summary, null);
  assert.equal(readFeedback(v15).blocks[0].lines.length, 4, "v15's four lines stay one paragraph");
  for (const strayed of [
    "Fault partial_squat: Too shallow.\n\nRest.", // a fault without its fix
    "Fault Partial Squat: Too shallow.\nFix: Go lower.", // not a key
    "**Fault partial_squat:** Too shallow.\nFix: Go lower.", // markdown
    "Keep: Good.\nFix: Nothing.",
    "One paragraph, as the stub writes.",
  ])
    assert.equal(readFeedback(strayed).summary, null, strayed);
  assert.deepEqual(readFeedback("  \n\n  ").blocks, []);
});

test("a line ending in a colon heads its paragraph only when more lines follow", () => {
  assert.deepEqual(readFeedback("Note:").blocks, [{ heading: null, lines: ["Note:"], numbered: false }]);
  assert.deepEqual(readFeedback("Plan:\n1. One.\nTwo.").blocks, [{ heading: "Plan", lines: ["1. One.", "Two."], numbered: false }]);
});

test("a fault's name is its rule key in words", () => {
  assert.equal(faultName("elbow_flare"), "Elbow flare");
  assert.equal(faultName("hip_sag_or_pike"), "Hip sag or pike");
});

test("counts are attempts carrying the rule, from the records", () => {
  const v = (rule: string, priority: number) => ({ rule, priority });
  const counts = ruleCounts([
    { violations: [v("knee_valgus", 2), v("rounded_back", 4)] },
    { violations: [v("knee_valgus", 2), v("knee_valgus", 2)] }, // one attempt, counted once
    { violations: [] },
  ]);
  assert.deepEqual([...counts], [
    ["knee_valgus", { attempts: 2, priority: 2 }],
    ["rounded_back", { attempts: 1, priority: 4 }],
  ]);
});
