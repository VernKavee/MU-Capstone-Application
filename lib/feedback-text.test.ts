// Run with `npm run test:unit`. Fails if a v16 summary stops parsing, a strayed or older text
// loses a line, the counts start trusting anything but the attempt records, or the Markdown
// of feedback saved before v16 (the 2026-11-03 phone run) stops rendering.
import assert from "node:assert/strict";
import { test } from "node:test";
import { faultName, isLayered, isMarkdown, parseFeedback, plainFeedback, readFeedback, ruleCounts, spans } from "./feedback-text.ts";

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

// Prompt v17 as the RAG service builds it (rag_core/feedback_format.py), shortened from a squat set
// on Gemini, 2026-11-07.
const V17 = `Fault knee_varus: Your knees bowed outward past your feet.
Fix: Keep your kneecaps over your second toe.
Fault partial_squat: The attempt was cut short above parallel.
Fix: Sink until your thighs are level with the floor.

Health: With your right knee history, keep every squat pain-free.

Progress: Score dropped to 62.8 from 68.3 in set 1.

Details knee_varus:
What it is: Your knees bow out away from the midline.
Drill: Bodyweight squats tracking over the toes, 3 sets of 8.
In this set: Attempts 1, 3, 5-9, 11, 15 and 16.

Details partial_squat:
Setup change: Squat to a box set at parallel height.

Next Session Plan:
1. Stop the set before your knees drift.
2. Film one set from the side.`;

test("a v17 answer: the list, the health note, progress, details per fault, then the plan", () => {
  const read = readFeedback(V17);
  assert.equal(read.summary?.kind === "faults" && read.summary.faults.length, 2);
  assert.equal(read.health, "With your right knee history, keep every squat pain-free.");
  assert.equal(read.progress, "Score dropped to 62.8 from 68.3 in set 1.");
  assert.deepEqual(read.details, {
    knee_varus: [
      { label: "What it is", text: "Your knees bow out away from the midline." },
      { label: "Drill", text: "Bodyweight squats tracking over the toes, 3 sets of 8." },
      { label: "In this set", text: "Attempts 1, 3, 5-9, 11, 15 and 16." },
    ],
    partial_squat: [{ label: "Setup change", text: "Squat to a box set at parallel height." }],
  });
  assert.deepEqual(read.blocks, [{ heading: "Next Session Plan", lines: ["Stop the set before your knees drift.", "Film one set from the side."], numbered: true }]);
  assert.equal(isLayered(read), true);
});

test("v17 labels are read only after a summary, and a v16 text is not layered", () => {
  const stray = "Health: Fine.\n\nDetails knee_varus:\nDrill: Squats.";
  assert.equal(readFeedback(stray).summary, null);
  assert.equal(readFeedback(stray).health, null);
  assert.equal(readFeedback(stray).blocks.length, 2, "every paragraph kept as written");
  assert.equal(isLayered(readFeedback(V16)), false);
  const clean = readFeedback("Keep: Smooth reps.\n\nProgress: First set on record.\n\nNext Session Plan:\n1. Same again.");
  assert.deepEqual([clean.summary, clean.progress, clean.blocks.length], [{ kind: "keep", text: "Smooth reps." }, "First set on record.", 1]);
});

test("a details block with a line that is not labelled stays a paragraph", () => {
  const read = readFeedback("Keep: Good.\n\nDetails knee_varus:\nWhat it is: Knees out.\njust a sentence");
  assert.deepEqual(read.details, {});
  assert.equal(read.blocks[0].heading, "Details knee_varus");
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

const sample = `### Error Breakdown

#### Elbow Flare

* **What it is:** Your upper arms drifted.
* **How to fix it:**
  * **Cue:** Keep your upper arms glued to your ribs.

---

1. **Pin your elbows:** from rep 1.
2) Breathe.
Plain line with a lone * star.`;

test("feedback text: headings, nested bullets, numbers, rules, and paragraphs", () => {
  assert.deepEqual(parseFeedback(sample), [
    { kind: "heading", level: 3, spans: [{ text: "Error Breakdown", bold: false }] },
    { kind: "heading", level: 4, spans: [{ text: "Elbow Flare", bold: false }] },
    { kind: "item", depth: 0, marker: "•", spans: [{ text: "What it is:", bold: true }, { text: " Your upper arms drifted.", bold: false }] },
    { kind: "item", depth: 0, marker: "•", spans: [{ text: "How to fix it:", bold: true }] },
    { kind: "item", depth: 1, marker: "•", spans: [{ text: "Cue:", bold: true }, { text: " Keep your upper arms glued to your ribs.", bold: false }] },
    { kind: "rule" },
    { kind: "item", depth: 0, marker: "1.", spans: [{ text: "Pin your elbows:", bold: true }, { text: " from rep 1.", bold: false }] },
    { kind: "item", depth: 0, marker: "2.", spans: [{ text: "Breathe.", bold: false }] },
    { kind: "para", spans: [{ text: "Plain line with a lone * star.", bold: false }] },
  ]);
});

test("feedback text: plain prose without Markdown passes through as one paragraph", () => {
  assert.deepEqual(parseFeedback("Set 1 of 3. Slow down."), [{ kind: "para", spans: [{ text: "Set 1 of 3. Slow down.", bold: false }] }]);
  assert.deepEqual(spans("no **close"), [{ text: "no **close", bold: false }]);
});

test("feedback text: the preview drops the markup", () => {
  assert.equal(plainFeedback("### Progress\n\n* **Target:** hit.\n---\nDone."), "Target: hit. Done.");
});

test("only feedback with Markdown marks goes to the Markdown reader", () => {
  assert.equal(isMarkdown(sample), true);
  assert.equal(isMarkdown("Plain line with **bold** in it."), true);
  assert.equal(isMarkdown(V16), false);
  assert.equal(isMarkdown("You hit 8 of 8.\n\nNext Session Plan:\n1. Keep still."), false, "v15");
  assert.equal(isMarkdown("One paragraph, as the stub writes. 3 - 2 = 1."), false);
});
