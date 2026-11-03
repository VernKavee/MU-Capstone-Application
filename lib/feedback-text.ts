// The coaching feedback arrives as Markdown (2026-11-03 phone run: `###` headings, `*` and
// `1.` lists nested by indent, `---` rules, `**bold**`). Only that subset is read; anything
// else stays text, so an odd answer still reads as plain prose and nothing renders as HTML.

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

// One line of plain prose for a clamped preview: headings, list items, and paragraphs joined
// by spaces, the markup dropped.
export function plainFeedback(text: string): string {
  return parseFeedback(text)
    .flatMap((b) => (b.kind === "rule" ? [] : [b.spans.map((s) => s.text).join("")]))
    .join(" ");
}
