import { faultName, readFeedback, ruleCounts, type FeedbackBlock, type FeedbackSummary } from "@/lib/feedback-text";
import type { Attempt } from "@/lib/set";

type Attempts = Pick<Attempt, "violations">[];

// One set's coaching text (lib/feedback-text.ts): what went wrong and how to fix it, from the
// summary lines with the counts from the attempt records, then the full text. Rendered on the
// server for the finished summary and History, and inside the live screen's set-complete.
export function SetFeedback({ text, attempts }: { text: string; attempts: Attempts }) {
  const { summary, blocks } = readFeedback(text);
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
        <h3 className="text-sm opacity-70">What went well</h3>
        <p className="leading-relaxed">{summary.text}</p>
      </section>
    );
  const counts = ruleCounts(attempts);
  const priority = (rule: string) => counts.get(rule)?.priority ?? Number.MAX_SAFE_INTEGER;
  // The rules' own order, as on the live screen; a rule the set does not carry goes last.
  const faults = [...summary.faults].sort((a, b) => priority(a.rule) - priority(b.rule));
  return (
    <section className="space-y-3">
      <h3 className="text-sm opacity-70">What went wrong, and how to fix it</h3>
      <ol className="space-y-4">
        {faults.map(({ rule, fault, fix }, i) => {
          const n = counts.get(rule)?.attempts;
          return (
            <li key={i} className="space-y-1.5">
              <h4 className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="font-semibold">{faultName(rule)}</span>
                {n !== undefined && (
                  <span className="text-sm opacity-70">
                    {n} of {attempts.length} {attempts.length === 1 ? "attempt" : "attempts"}
                  </span>
                )}
              </h4>
              <p className="leading-snug">{fault}</p>
              <p className="rounded-md bg-tape px-3 py-1.5 font-semibold leading-snug text-tape-ink">
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
      {titled && <h3 className="border-t pt-4 text-sm opacity-70">Full feedback</h3>}
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
