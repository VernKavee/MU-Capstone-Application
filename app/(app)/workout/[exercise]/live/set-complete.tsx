"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { Setup } from "@/lib/exercise";
import { plainFeedback, readFeedback } from "@/lib/feedback-text";
import type { SetCapture } from "@/lib/live/session";
import { sound } from "@/lib/live/sound";
import { afterSet, BODY_PARTS, type Attempt, type SetSimilarity } from "@/lib/set";
import { SetFeedback, WhatToFix } from "../../../set-feedback";
import type { JobStatus } from "./pipeline";
import { Close, Spark } from "../../../icons";

export type Progress = { setNo: number; kind: "initial" | "repair" };

export type SetEntry = Progress & {
  key: number;
  capture: SetCapture;
  attempts: Attempt[];
  status: JobStatus;
  similarity: SetSimilarity | null;
  feedback: string | null;
  error: string | null;
};

export const setLabel = ({ setNo, kind }: Progress, sets: number) => `${kind === "repair" ? "repair set" : "set"} ${setNo} of ${sets}`;

// Over video: a text pill and a round 44 px icon button, both on a dark wash.
export const pill = "rounded-full bg-black/45 px-4 py-2.5 font-semibold text-ink backdrop-blur-sm hover:bg-black/65";
export const round = "flex size-11 shrink-0 items-center justify-center rounded-full bg-black/45 text-ink backdrop-blur-sm hover:bg-black/65";

const STATUS_TEXT: Partial<Record<JobStatus, string>> = {
  saving: "Saving the set",
  uploading: "Uploading the video and the keypoint file",
};

// Section 4.5 after one set, as a light page over the stage (2026-11-05, Vern's mockup): the
// rest timer, the set's numbers, similarity by body part, the rules broken, the coach's
// feedback last, then exactly one next step: the repair offer, Start now, or Finish workout.
export function SetComplete({
  entry,
  earlierFailures,
  exerciseName,
  setup,
  attemptCap,
  onRetry,
  onRepair,
  onDecline,
  onNext,
  onFinish,
}: {
  entry: SetEntry;
  earlierFailures: SetEntry[];
  exerciseName: string;
  setup: Setup;
  attemptCap: number;
  onRetry: (key: number) => void;
  onRepair: () => void;
  onDecline: () => Promise<string | null>;
  onNext: () => void;
  onFinish: () => Promise<string | null>;
}) {
  const [declined, setDeclined] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null); // of Skip it, End or Finish workout
  const [busy, setBusy] = useState(false);
  const { capture, attempts } = entry;
  const { report } = capture;
  const target = setup.reps;
  const reason = {
    target_reached: `You reached ${target} correct ${target === 1 ? "rep" : "reps"}.`,
    user_ended: "You ended the set.",
    attempt_cap: `The set ended at ${attemptCap} attempts, twice the target.`,
  }[capture.endedBy];
  const counts = new Map<string, number>();
  for (const attempt of attempts) for (const v of attempt.violations) counts.set(v.message, (counts.get(v.message) ?? 0) + 1);
  // The rule messages stand until feedback with its own list of what to fix arrives.
  const fixList = entry.feedback !== null && readFeedback(entry.feedback).summary !== null;
  // ADR-0004: the repair offer, the rest before the next set, or the end of the workout.
  const next = afterSet(entry, setup.sets, declined);
  const offerRepair = next === "repair";
  const hasNext = next === "rest";
  const analysing = entry.status !== "done" && entry.status !== "failed";

  async function decline() {
    setBusy(true);
    setActionError(null);
    const error = await onDecline();
    setBusy(false);
    if (error) setActionError(error);
    else setDeclined(true);
  }

  // Finish workout and End workout are one path: wait for the saves, write ended_at, open
  // the summary. On success the page moves on, so busy stays set until it does.
  async function finish() {
    setBusy(true);
    setActionError(null);
    const error = await onFinish();
    if (!error) return;
    setBusy(false);
    setActionError(error);
  }

  // Ending the workout while the repair set is on offer skips it (Vern, 2026-11-05), so
  // repair_declined is written as by Skip it, then the workout ends the same way.
  async function end() {
    if (offerRepair) {
      setBusy(true);
      setActionError(null);
      const error = await onDecline();
      if (error) {
        setBusy(false);
        setActionError(error);
        return;
      }
    }
    await finish();
  }

  return (
    <section className="on-page absolute inset-0 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 p-5 pb-6">
        {(offerRepair || hasNext) && (
          <button
            type="button"
            onClick={end}
            disabled={busy}
            className="-ml-1 inline-flex items-center gap-2 self-start rounded-full pr-3 font-medium text-muted hover:text-foreground disabled:opacity-60"
          >
            <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-foreground">
              <Close />
            </span>
            {busy ? "Ending the workout" : "End workout"}
          </button>
        )}

        <header>
          <p className="text-sm text-muted">
            {exerciseName}, {setLabel(entry, setup.sets)} complete
          </p>
          <p className="text-xl leading-snug">{reason}</p>
        </header>

        {/* Gone while End workout runs, so the timer cannot start the next set meanwhile. */}
        {hasNext && !busy && <RestTimer seconds={setup.rest} next={`Set ${entry.setNo + 1} of ${setup.sets}`} onDone={onNext} />}

        <dl className="card grid grid-cols-3 divide-x divide-line py-3 text-center">
          <Stat label="correct" value={report.total_reps_correct} className="text-ok" />
          <Stat label="attempts" value={report.total_attempts} />
          <Stat label="similarity" value={entry.similarity ? `${Math.round(entry.similarity.mean_score)}%` : "–"} />
        </dl>
        <p className="-mt-2 text-sm text-muted">
          {report.total_reps_completed} completed, {report.total_attempts_abandoned} abandoned
        </p>

        <div aria-live="polite" className="space-y-4">
          {STATUS_TEXT[entry.status] && <p className="text-sm text-muted motion-safe:animate-pulse">{STATUS_TEXT[entry.status]}</p>}
          <BodyParts similarity={entry.similarity} pending={analysing} />
          {counts.size > 0 && !fixList && (
            <section className="space-y-1.5">
              <h2 className="font-semibold">What broke a rule</h2>
              <ul className="card divide-y divide-line px-4">
                {[...counts].map(([message, n]) => (
                  <li key={message} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-tape" />
                      {message}
                    </span>
                    <span className="shrink-0 text-sm text-muted">
                      {n} {n === 1 ? "attempt" : "attempts"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Feedback text={entry.feedback} attempts={attempts} pending={analysing} />
          {entry.status === "failed" && (
            <p role="alert" className="alert">
              {entry.error}{" "}
              <button type="button" onClick={() => onRetry(entry.key)} className="underline">
                Retry
              </button>
            </p>
          )}
          {earlierFailures.map((e) => (
            <p key={e.key} role="alert" className="alert">
              {capitalise(setLabel(e, setup.sets))}: {e.error}{" "}
              <button type="button" onClick={() => onRetry(e.key)} className="underline">
                Retry
              </button>
            </p>
          ))}
        </div>

        <div className="mt-auto space-y-3 pt-2">
          {actionError && (
            <p role="alert" className="alert">
              {actionError}
            </p>
          )}
          {offerRepair ? (
            <>
              <p className="leading-snug">At least one attempt broke a rule, so you get one repair set at the same target. It is offered once.</p>
              <div className="grid grid-cols-[auto_1fr] gap-3">
                <button type="button" onClick={decline} disabled={busy} className="btn-quiet">
                  Skip it
                </button>
                <button type="button" onClick={onRepair} disabled={busy} className="btn">
                  Start the repair set
                </button>
              </div>
            </>
          ) : hasNext ? (
            <button type="button" onClick={onNext} disabled={busy} className="btn w-full">
              Start now
            </button>
          ) : (
            <button type="button" onClick={finish} disabled={busy} className="btn w-full">
              {busy ? "Finishing" : "Finish workout"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// Rest between sets (ADR-0004), then the next set starts on its own with the ready gate.
// Start now sits with the other actions at the foot and calls the same onDone.
function RestTimer({ seconds, next, onDone }: { seconds: number; next: string; onDone: () => void }) {
  const [left, setLeft] = useState(seconds);
  const done = useEffectEvent(() => {
    sound.beep(0.3, 880);
    onDone();
  });
  useEffect(() => {
    const end = Date.now() + seconds * 1000;
    const id = setInterval(() => {
      const remaining = Math.ceil((end - Date.now()) / 1000);
      if (remaining > 0) return setLeft(remaining);
      clearInterval(id);
      done();
    }, 250);
    return () => clearInterval(id);
  }, [seconds]);

  return (
    <p role="timer" className="flex items-baseline justify-between gap-3">
      <span className="text-lg text-muted">{next} starts in</span>
      <span className="font-display text-5xl leading-none text-accent tabular-nums">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
      </span>
    </p>
  );
}

// Each body part the exercise scores, as a bar and a percentage, the lowest marked.
function BodyParts({ similarity, pending }: { similarity: SetSimilarity | null; pending: boolean }) {
  if (!similarity) {
    return pending ? (
      <p className="text-sm text-muted motion-safe:animate-pulse">Scoring similarity to the expert motion</p>
    ) : (
      <p className="text-sm text-muted">Similarity was not scored for this set.</p>
    );
  }
  const parts = BODY_PARTS.filter((part) => similarity.body_parts[part] !== undefined);
  const lowest = similarity.weakest_body_part ?? parts.reduce((lo, p) => (similarity.body_parts[p]! < similarity.body_parts[lo]! ? p : lo), parts[0]);
  return (
    <section className="space-y-1.5">
      <h2 className="font-semibold">Similarity by body part</h2>
      <dl className="card divide-y divide-line px-4">
        {parts.map((part) => (
          <div key={part} className="grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 py-2">
            <dt className="leading-tight first-letter:uppercase">
              {part.replace("_", " ")}
              {part === lowest && parts.length > 1 && <span className="block text-xs text-muted">lowest</span>}
            </dt>
            <dd aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${similarity.body_parts[part]}%` }} />
            </dd>
            <dd className="text-right font-display text-2xl leading-none tabular-nums">{Math.round(similarity.body_parts[part]!)}%</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// The coach's feedback last: what to fix when the text has v16's list (lib/feedback-text.ts),
// else four lines of it, and the whole text in place on Read all, so the workout visit is
// never left mid-rest.
function Feedback({ text, attempts, pending }: { text: string | null; attempts: Attempt[]; pending: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text) return pending ? <p className="text-sm text-muted motion-safe:animate-pulse">Writing feedback</p> : null;
  const { summary } = readFeedback(text);
  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-accent">
        <Spark className="size-4" />
        Coach feedback
      </h2>
      {open ? (
        <SetFeedback text={text} attempts={attempts} />
      ) : summary ? (
        <WhatToFix summary={summary} attempts={attempts} />
      ) : (
        <p className="line-clamp-4 leading-relaxed">{plainFeedback(text)}</p>
      )}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="text-sm font-semibold text-accent">
        {open ? "Show less" : "Read all feedback"}
      </button>
    </section>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: number | string; className?: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-sm text-muted">{label}</dt>
      <dd className={`font-display text-4xl leading-none tabular-nums ${className}`}>{value}</dd>
    </div>
  );
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
