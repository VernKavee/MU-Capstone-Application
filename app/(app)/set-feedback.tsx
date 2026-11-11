import { faultName, isLayered, isMarkdown, readFeedback, ruleCounts, type Feedback, type FeedbackBlock, type FeedbackDetail } from "@/lib/feedback-text";
import type { Attempt } from "@/lib/set";
import { FeedbackText } from "./feedback-text";

type Attempts = Pick<Attempt, "violations">[];

// One set's coaching text (lib/feedback-text.ts): what went wrong and how to fix it, from the
// summary lines with the counts from the attempt records, then the full text. Daylight: the
// fault's dot is amber, the warning colour, and its fix an indigo band, the accent. Rendered on the
// server for the finished summary and History, and inside the live screen's set-complete.
// Prompt v17's text has no full text below the list: each fault's details fold under it,
// closed unless `open` (the feedback detail page), and the plan follows untitled. Feedback saved
// before v16 as Markdown (the 2026-11-03 phone run) goes to the Markdown reader.
export function SetFeedback({ text, attempts, open = false }: { text: string; attempts: Attempts; open?: boolean }) {
  const feedback = readFeedback(text);
  const { summary, blocks } = feedback;
  if (!summary && isMarkdown(text)) return <FeedbackText text={text} />;
  return (
    <div className="space-y-5">
      {summary && <WhatToFix feedback={feedback} attempts={attempts} open={open} />}
      {blocks.length > 0 && <FullFeedback blocks={blocks} titled={summary !== null && !isLayered(feedback)} />}
    </div>
  );
}

// Shows nothing unless `feedback.summary` parsed; callers show something else then.
export function WhatToFix({ feedback, attempts, open = false }: { feedback: Feedback; attempts: Attempts; open?: boolean }) {
  const { summary, details } = feedback;
  if (!summary) return null;
  if (summary.kind === "keep")
    return (
      <section className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-muted">What went well</h3>
          <p className="leading-relaxed">{summary.text}</p>
        </div>
        <HealthNote text={feedback.health} />
        <Progress text={feedback.progress} />
      </section>
    );
  const counts = ruleCounts(attempts);
  const priority = (rule: string) => counts.get(rule)?.priority ?? Number.MAX_SAFE_INTEGER;
  // The rules' own order, as on the live screen; a rule the set does not carry goes last.
  const faults = [...summary.faults].sort((a, b) => priority(a.rule) - priority(b.rule));
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted">What went wrong, and how to fix it</h3>
      <HealthNote text={feedback.health} />
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
              {details[rule] && <FaultDetails details={details[rule]} open={open} />}
            </li>
          );
        })}
      </ol>
      <Progress text={feedback.progress} />
    </section>
  );
}

// Prompt v17's labelled lines for one fault (what it is, likely cause, setup change, drill,
// check, in this set; v18 adds why it matters), folded so the list stays one screen.
function FaultDetails({ details, open }: { details: FeedbackDetail[]; open: boolean }) {
  return (
    <details open={open} className="pt-1">
      <summary className="cursor-pointer text-sm font-semibold text-accent">Details</summary>
      <dl className="mt-2 space-y-2">
        {details.map(({ label, text }, i) => (
          <div key={i} className="space-y-0.5">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="leading-snug">{text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// The caution from the medical history: above the list, since every fix is meant within it, and
// never folded away.
function HealthNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="space-y-0.5 rounded-lg border border-tape px-3 py-2">
      <h4 className="text-sm font-semibold text-muted">Health note</h4>
      <p className="leading-snug">{text}</p>
    </div>
  );
}

// How the set compares with the earlier sets or the last workout.
function Progress({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="space-y-0.5">
      <h4 className="text-sm font-semibold text-muted">Progress</h4>
      <p className="leading-snug">{text}</p>
    </div>
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
