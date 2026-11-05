// The coaching feedback, its Markdown subset rendered (lib/feedback-text.ts). No hooks, so
// server pages and the set-complete client component both use it.
import { parseFeedback, type Block, type Span } from "@/lib/feedback-text";

export function FeedbackText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseFeedback(text);
  // Consecutive list items become one list, each item indented by its depth.
  const groups: (Block | Extract<Block, { kind: "item" }>[])[] = [];
  for (const b of blocks) {
    const prev = groups.at(-1);
    if (b.kind === "item" && Array.isArray(prev)) prev.push(b);
    else groups.push(b.kind === "item" ? [b] : b);
  }
  return (
    <div className={`max-w-prose space-y-3 leading-relaxed ${className}`}>
      {groups.map((g, i) =>
        Array.isArray(g) ? (
          <ul key={i} className="space-y-1.5">
            {g.map((item, j) => (
              <li key={j} className="flex gap-2" style={{ paddingLeft: `${item.depth * 1.25}rem` }}>
                <span aria-hidden="true" className="shrink-0 text-muted">
                  {item.marker}
                </span>
                <span>
                  <Spans spans={item.spans} />
                </span>
              </li>
            ))}
          </ul>
        ) : g.kind === "heading" ? (
          g.level <= 3 ? (
            <h3 key={i} className="pt-1 text-lg font-semibold">
              <Spans spans={g.spans} />
            </h3>
          ) : (
            <h4 key={i} className="font-semibold">
              <Spans spans={g.spans} />
            </h4>
          )
        ) : g.kind === "rule" ? (
          <hr key={i} className="border-line" />
        ) : (
          <p key={i}>
            <Spans spans={g.spans} />
          </p>
        ),
      )}
    </div>
  );
}

function Spans({ spans }: { spans: Span[] }) {
  return spans.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : s.text));
}
