// Run with `npm run test:unit`. The Markdown subset of the coaching feedback, on the shape
// Gemini answered in the 2026-11-03 phone run.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFeedback, plainFeedback, spans } from "./feedback-text.ts";

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
  assert.equal(plainFeedback("### Progress\n\n* **Target:** hit.\n---\nDone."), "Progress Target: hit. Done.");
});
