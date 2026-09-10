"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { SetCapture } from "@/lib/live/session";
import { sound } from "@/lib/live/sound";
import { hasViolation, REGIONS, type Attempt, type Similarity } from "@/lib/set";
import type { JobStatus } from "./pipeline";

export type Progress = { setNo: number; kind: "initial" | "repair" };

export type SetEntry = Progress & {
  key: number;
  capture: SetCapture;
  attempts: Attempt[];
  status: JobStatus;
  similarity: Similarity | null;
  feedback: string | null;
  error: string | null;
};

export const setLabel = ({ setNo, kind }: Progress, sets: number) => `${kind === "repair" ? "repair set" : "set"} ${setNo} of ${sets}`;

export const pill =
  "rounded-full bg-black/55 px-3 py-1.5 text-sm text-ink backdrop-blur-sm hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tape";
const primary = "rounded bg-ink px-5 py-2.5 font-medium text-tape-ink disabled:opacity-60";

const STATUS_TEXT: Partial<Record<JobStatus, string>> = {
  saving: "Saving the set",
  uploading: "Uploading the video and the keypoint file",
  analysing: "Scoring similarity and writing feedback",
};

// Section 4.5 after one set: what happened, the analysis as it arrives with a retry, then
// exactly one next step: the repair offer, the rest timer, or finishing the workout.
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
  setup: { reps: number; sets: number; rest: number };
  attemptCap: number;
  onRetry: (key: number) => void;
  onRepair: () => void;
  onDecline: () => Promise<string | null>;
  onNext: () => void;
  onFinish: () => Promise<void>;
}) {
  const [declined, setDeclined] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
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
  // ADR-0004: any violation on any attempt, abandoned ones included, offers one repair set.
  const offerRepair = entry.kind === "initial" && hasViolation(attempts) && !declined;
  const hasNext = entry.setNo < setup.sets;

  async function decline() {
    setBusy(true);
    setDeclineError(null);
    const error = await onDecline();
    setBusy(false);
    if (error) setDeclineError(error);
    else setDeclined(true);
  }

  async function finish() {
    setBusy(true);
    await onFinish();
  }

  return (
    <section className="absolute inset-0 overflow-y-auto bg-black/75 backdrop-blur-sm">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-end gap-5 p-6 pb-8">
        <p className="text-sm opacity-70">
          {exerciseName}, {setLabel(entry, setup.sets)} complete
        </p>
        <p className="text-xl leading-snug">{reason}</p>
        <dl className="grid grid-cols-4 gap-3">
          <Stat label="correct" value={report.total_reps_correct} />
          <Stat label="completed" value={report.total_reps_completed} />
          <Stat label="attempts" value={report.total_attempts} />
          <Stat label="abandoned" value={report.total_attempts_abandoned} />
        </dl>
        {counts.size > 0 && (
          <ul className="space-y-1 text-sm">
            {[...counts].map(([message, n]) => (
              <li key={message} className="flex justify-between gap-4">
                <span>{message}</span>
                <span className="opacity-70">
                  {n} {n === 1 ? "attempt" : "attempts"}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div aria-live="polite" className="space-y-3 border-t border-ink/20 pt-4">
          {entry.similarity && <SimilarityRow similarity={entry.similarity} />}
          {entry.feedback && <p className="leading-relaxed">{entry.feedback}</p>}
          {STATUS_TEXT[entry.status] && <p className="text-sm opacity-70 motion-safe:animate-pulse">{STATUS_TEXT[entry.status]}</p>}
          {entry.status === "failed" && (
            <p role="alert" className="text-sm">
              {entry.error}{" "}
              <button type="button" onClick={() => onRetry(entry.key)} className="underline">
                Retry
              </button>
            </p>
          )}
          {earlierFailures.map((e) => (
            <p key={e.key} role="alert" className="text-sm">
              {capitalise(setLabel(e, setup.sets))}: {e.error}{" "}
              <button type="button" onClick={() => onRetry(e.key)} className="underline">
                Retry
              </button>
            </p>
          ))}
        </div>

        {offerRepair ? (
          <div className="space-y-3 border-t border-ink/20 pt-4">
            <p className="leading-snug">
              At least one attempt broke a rule, so you get one repair set at the same target. It is offered once.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={onRepair} disabled={busy} className={primary}>
                Start the repair set
              </button>
              <button type="button" onClick={decline} disabled={busy} className={pill}>
                Skip it
              </button>
            </div>
            {declineError && (
              <p role="alert" className="text-sm">
                {declineError}
              </p>
            )}
          </div>
        ) : hasNext ? (
          <RestTimer seconds={setup.rest} next={`Set ${entry.setNo + 1} of ${setup.sets}`} onDone={onNext} />
        ) : (
          <div className="border-t border-ink/20 pt-4">
            <button type="button" onClick={finish} disabled={busy} className={primary}>
              {busy ? "Finishing" : "Finish workout"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// Rest between sets (ADR-0004), then the next set starts on its own with the ready gate.
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
    <div className="flex flex-wrap items-center gap-4 border-t border-ink/20 pt-4">
      <p className="text-lg" role="timer">
        Rest. {next} starts in{" "}
        <span className="tabular-nums">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </span>
      </p>
      <button type="button" onClick={onDone} className={primary}>
        Start now
      </button>
    </div>
  );
}

function SimilarityRow({ similarity }: { similarity: Similarity }) {
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <span className="text-2xl font-semibold tabular-nums">{similarity.overall}%</span>{" "}
        <span className="opacity-70">similar to the expert motion</span>
      </p>
      <dl className="grid grid-cols-5 gap-2 text-xs">
        {REGIONS.map((region) => (
          <div key={region}>
            <dt className="opacity-70">{region.replace("_", " and ")}</dt>
            <dd className="text-sm tabular-nums">{similarity[region]}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs opacity-70">{label}</dt>
      <dd className="font-display text-4xl leading-none tabular-nums">{value}</dd>
    </div>
  );
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
