// Reading a set's coaching text for display. Prompt v16 (RAG_SYSTEM rag_core/prompt.py) opens
// with labelled summary lines before the first blank line: "Fault <rule>: ..." then "Fix: ..."
// per fault, or one "Keep: ..." line on a clean set. The rest is paragraphs, one of them headed
// "Next Session Plan:" over numbered lines. The text is only cut where it says, never reworded,
// and anything that does not parse (older prompts, the stub, a model that strayed) comes back
// with no summary and every paragraph as written.

export type FeedbackSummary =
  | { kind: "faults"; faults: { rule: string; fault: string; fix: string }[] }
  | { kind: "keep"; text: string };

// A paragraph: an optional "Heading:" first line, then its lines, numbered ones as a list.
export type FeedbackBlock = { heading: string | null; lines: string[]; numbered: boolean };

const FAULT = /^Fault ([a-z0-9_]+):\s*(.+)$/;
const FIX = /^Fix:\s*(.+)$/;
const KEEP = /^Keep:\s*(.+)$/;
const NUMBERED = /^\d+\.\s+/;
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

export function readFeedback(text: string): { summary: FeedbackSummary | null; blocks: FeedbackBlock[] } {
  const paragraphs = text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length);
  const summary = paragraphs.length ? summaryOf(paragraphs[0]) : null;
  return { summary, blocks: (summary ? paragraphs.slice(1) : paragraphs).map(blockOf) };
}

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

// Feedback saved before prompt v16 (the 2026-11-03 phone run) is Markdown: `###` headings, `*`
// and `1.` lists nested by indent, `---` rules, `**bold**`. readFeedback finds no summary in it,
// so it is rendered by this reader instead of showing its marks raw. Only that subset is read;
// anything else stays text, and nothing renders as HTML.

// A heading, a bullet, a rule line, or bold anywhere: a v15 or v16 answer has none of these.
const MARKDOWN = /^\s*(#{1,6}\s|[*+-]\s|([-*_])(\s*\2){2,}\s*$)|\*\*.+?\*\*/m;
export const isMarkdown = (text: string) => MARKDOWN.test(text);
export type Span = { text: string; bold: boolean };
export type Block =
  | { kind: "heading"; level: number; spans: Span[] }
  | { kind: "item"; depth: number; marker: string; spans: Span[] }
  | { kind: "rule" }
  | { kind: "para"; spans: Span[] };

export function parseFeedback(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    let m: RegExpMatchArray | null;
    if (/^([-*_])(\s*\1){2,}$/.test(body)) blocks.push({ kind: "rule" });
    else if ((m = body.match(/^(#{1,6})\s+(.*)$/))) blocks.push({ kind: "heading", level: m[1].length, spans: spans(m[2]) });
    else if ((m = body.match(/^([*+-]|\d+[.)])\s+(.*)$/)))
      blocks.push({ kind: "item", depth: Math.floor(indent / 2), marker: /\d/.test(m[1]) ? m[1].replace(")", ".") : "•", spans: spans(m[2]) });
    else blocks.push({ kind: "para", spans: spans(body) });
  }
  return blocks;
}

// `**bold**` (or `__bold__`) only; a lone `*` stays as typed.
export function spans(text: string): Span[] {
  const out: Span[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1] ?? m[2], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

// One line of plain prose for a clamped preview: list items and paragraphs joined by spaces,
// the markup dropped. Headings are left out, so a preview never opens on a label such as
// "Error Breakdown" (2026-11-05).
export function plainFeedback(text: string): string {
  return parseFeedback(text)
    .flatMap((b) => (b.kind === "para" || b.kind === "item" ? [b.spans.map((s) => s.text).join("")] : []))
    .join(" ");
}
