import { faultName, isMarkdown, readFeedback, ruleCounts, type FeedbackBlock, type FeedbackSummary } from "@/lib/feedback-text";
import type { Attempt } from "@/lib/set";
import { FeedbackText } from "./feedback-text";

type Attempts = Pick<Attempt, "violations">[];

// One set's coaching text (lib/feedback-text.ts): what went wrong and how to fix it, from the
// summary lines with the counts from the attempt records, then the full text. Daylight: the
// fault's dot is amber, the warning colour, and its fix an indigo band, the accent. Rendered on the
// server for the finished summary and History, and inside the live screen's set-complete.
// Feedback saved before v16 as Markdown (the 2026-11-03 phone run) goes to the Markdown reader.
export function SetFeedback({ text, attempts }: { text: string; attempts: Attempts }) {
  const { summary, blocks } = readFeedback(text);
  if (!summary && isMarkdown(text)) return <FeedbackText text={text} />;
  return (
    <div className="space-y-5">
      {summary && <WhatToFix summary={summary} attempts={attempts} />}
      <FullFeedback blocks={blocks} titled={summary !== null} />
    </div>
  );
}

export function WhatToFix({ summary, attempts }: { summary: FeedbackSummary; attempts: Attempts }) {
  if (summary.kind === "keep")
    return (
      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-muted">What went well</h3>
        <p className="leading-relaxed">{summary.text}</p>
      </section>
    );
  const counts = ruleCounts(attempts);
  const priority = (rule: string) => counts.get(rule)?.priority ?? Number.MAX_SAFE_INTEGER;
  // The rules' own order, as on the live screen; a rule the set does not carry goes last.
  const faults = [...summary.faults].sort((a, b) => priority(a.rule) - priority(b.rule));
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted">What went wrong, and how to fix it</h3>
      <ol className="divide-y divide-line">
        {faults.map(({ rule, fault, fix }, i) => {
          const n = counts.get(rule)?.attempts;
          return (
            <li key={i} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
              <h4 className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-tape" />
                  {faultName(rule)}
                </span>
                {n !== undefined && (
                  <span className="text-sm text-muted">
                    {n} of {attempts.length} {attempts.length === 1 ? "attempt" : "attempts"}
                  </span>
                )}
              </h4>
              <p className="leading-snug">{fault}</p>
              <p className="rounded-lg bg-accent/10 px-3 py-2 font-semibold leading-snug">
                <span className="sr-only">Fix: </span>
                {fix}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function FullFeedback({ blocks, titled }: { blocks: FeedbackBlock[]; titled: boolean }) {
  return (
    <section className="space-y-3 leading-relaxed">
      {titled && <h3 className="border-t border-line pt-4 text-sm font-semibold text-muted">Full feedback</h3>}
      {blocks.map((block, i) => (
        <div key={i} className="space-y-1">
          {block.heading && <h4 className="font-semibold">{block.heading}</h4>}
          {block.numbered ? (
            <ol className="list-decimal space-y-1 pl-5">
              {block.lines.map((line, j) => (
                <li key={j}>{line}</li>
              ))}
            </ol>
          ) : (
            <p className="whitespace-pre-line">{block.lines.join("\n")}</p>
          )}
        </div>
      ))}
    </section>
  );
}
