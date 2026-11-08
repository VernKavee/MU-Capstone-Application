// Reading a set's coaching text for display. Prompt v16 (RAG_SYSTEM rag_core/prompt.py) opens
// with labelled summary lines before the first blank line: "Fault <rule>: ..." then "Fix: ..."
// per fault, or one "Keep: ..." line on a clean set. The rest is paragraphs, one of them headed
// "Next Session Plan:" over numbered lines. The text is only cut where it says, never reworded,
// and anything that does not parse (older prompts, the stub, a model that strayed) comes back
// with no summary and every paragraph as written.
//
// Prompt v17 keeps that opening and adds, after it, a "Health: ..." paragraph when the medical
// history bears on the exercise, a "Progress: ..." paragraph, and per fault a block headed
// "Details <rule>:" of labelled lines ("What it is: ...", "Drill: ..."), which the screens fold
// under the fault. The RAG service builds this text from the model's JSON
// (rag_core/feedback_format.py, pinned by tests/test_feedback_format.py), so its shape is fixed;
// change both together. These are read only after a summary that parsed.

export type FeedbackSummary =
  | { kind: "faults"; faults: { rule: string; fault: string; fix: string }[] }
  | { kind: "keep"; text: string };

// A paragraph: an optional "Heading:" first line, then its lines, numbered ones as a list.
export type FeedbackBlock = { heading: string | null; lines: string[]; numbered: boolean };

// One labelled line of a fault's details (prompt v17), e.g. { label: "Drill", text: "..." }.
export type FeedbackDetail = { label: string; text: string };

export type Feedback = {
  summary: FeedbackSummary | null;
  blocks: FeedbackBlock[];
  health: string | null;
  progress: string | null;
  details: Record<string, FeedbackDetail[]>;
};

const FAULT = /^Fault ([a-z0-9_]+):\s*(.+)$/;
const FIX = /^Fix:\s*(.+)$/;
const KEEP = /^Keep:\s*(.+)$/;
const NUMBERED = /^\d+\.\s+/;
const HEALTH = /^Health:\s*(.+)$/;
const PROGRESS = /^Progress:\s*(.+)$/;
const DETAILS = /^Details ([a-z0-9_]+):$/;
const LABELLED = /^([A-Z][A-Za-z ]{1,30}):\s*(.+)$/;
const HEADING_MAX = 60;

function summaryOf(lines: string[]): FeedbackSummary | null {
  const keep = lines.length === 1 ? KEEP.exec(lines[0]) : null;
  if (keep) return { kind: "keep", text: keep[1] };
  if (lines.length === 0 || lines.length % 2) return null;
  const faults = [];
  for (let i = 0; i < lines.length; i += 2) {
    const fault = FAULT.exec(lines[i]);
    const fix = FIX.exec(lines[i + 1]);
    if (!fault || !fix) return null;
    faults.push({ rule: fault[1], fault: fault[2], fix: fix[1] });
  }
  return { kind: "faults", faults };
}

function blockOf(lines: string[]): FeedbackBlock {
  const headed = lines.length > 1 && lines[0].endsWith(":") && lines[0].length <= HEADING_MAX;
  const body = headed ? lines.slice(1) : lines;
  const numbered = body.every((line) => NUMBERED.test(line));
  return {
    heading: headed ? lines[0].slice(0, -1) : null,
    lines: numbered ? body.map((line) => line.replace(NUMBERED, "")) : body,
    numbered,
  };
}

export function readFeedback(text: string): Feedback {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length);
  const summary = paragraphs.length ? summaryOf(paragraphs[0]) : null;
  const read: Feedback = { summary, blocks: [], health: null, progress: null, details: {} };
  if (!summary) {
    read.blocks = paragraphs.map(blockOf);
    return read;
  }
  for (const lines of paragraphs.slice(1)) {
    const health = lines.length === 1 ? HEALTH.exec(lines[0]) : null;
    const progress = lines.length === 1 ? PROGRESS.exec(lines[0]) : null;
    const details = DETAILS.exec(lines[0]);
    const labelled = lines.slice(1).map((line) => LABELLED.exec(line));
    if (health && read.health === null) read.health = health[1];
    else if (progress && read.progress === null) read.progress = progress[1];
    else if (details && labelled.length && !(details[1] in read.details) && labelled.every((m) => m !== null))
      read.details[details[1]] = labelled.map((m) => ({ label: m![1], text: m![2] }));
    else read.blocks.push(blockOf(lines));
  }
  return read;
}

// Prompt v17's layers: the short list first, the rest folded under each fault.
export const isLayered = ({ health, progress, details }: Feedback) => health !== null || progress !== null || Object.keys(details).length > 0;

// A fault's name from its rule key, the same on every set: "elbow_flare" is "Elbow flare".
export const faultName = (rule: string) => rule.charAt(0).toUpperCase() + rule.slice(1).replaceAll("_", " ");

// How many attempts of the set carry each rule, and the rule's priority, from the attempt
// records: the counts the summary shows, never the model's.
export function ruleCounts(attempts: { violations: { rule: string; priority: number }[] }[]): Map<string, { attempts: number; priority: number }> {
  const counts = new Map<string, { attempts: number; priority: number }>();
  for (const attempt of attempts)
    for (const rule of new Set(attempt.violations.map((v) => v.rule))) {
      const priority = attempt.violations.find((v) => v.rule === rule)!.priority;
      counts.set(rule, { attempts: (counts.get(rule)?.attempts ?? 0) + 1, priority });
    }
  return counts;
}
