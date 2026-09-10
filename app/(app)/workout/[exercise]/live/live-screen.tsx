"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createStubEngine } from "@/lib/engine/stub";
import type { RuleBasedLogic } from "@/lib/exercise";
import type { PoseModel } from "@/lib/live/pose";
import { CameraError, LiveSession, type SetCapture, type Snapshot } from "@/lib/live/session";
import { sound } from "@/lib/live/sound";

type Props = {
  exercise: { id: string; name: string; engineKey: string; logic: RuleBasedLogic };
  setup: { reps: number; sets: number; rest: number };
};

type Stage = { kind: "preflight" } | { kind: "live" } | { kind: "error"; error: CameraError["kind"] };

const ERROR_TEXT: Record<CameraError["kind"], string> = {
  denied: "Camera access is blocked. Allow the camera for this site from the address bar, then try again.",
  "no-camera": "No camera was found. Connect one, or open this page on a device with a camera, then try again.",
  insecure: "The camera needs a secure connection. Open this page over https, or on localhost.",
  model: "The pose model could not be downloaded. Check the connection, then try again.",
};

const MODEL_KEY = "poseModel";
const LAG_FPS = 15;

export function LiveScreen({ exercise, setup }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "preflight" });
  const [model, setModel] = useState<PoseModel>("full");
  const [muted, setMuted] = useState(false);
  const [run, setRun] = useState(0); // bumps to start the set again
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const attemptCap = 2 * setup.reps;
  const guideHref = `/workout/${exercise.id}/guide?reps=${setup.reps}&sets=${setup.sets}&rest=${setup.rest}`;

  useEffect(() => {
    if (stage.kind !== "live" || !videoRef.current || !canvasRef.current) return;
    const session = new LiveSession({
      engine: createStubEngine(exercise.logic, exercise.engineKey),
      rules: exercise.logic.rules,
      target: setup.reps,
      attemptCap,
      model,
      video: videoRef.current,
      canvas: canvasRef.current,
      onChange: setSnap,
    });
    sessionRef.current = session;
    session.start().catch((error) => {
      setStage({ kind: "error", error: error instanceof CameraError ? error.kind : "no-camera" });
    });
    return () => {
      session.stop();
      sessionRef.current = null;
    };
  }, [stage.kind, model, run, exercise, setup.reps, attemptCap]);

  // Inside the click so the browser lets audio and speech play later.
  function startCamera() {
    sound.unlock();
    setModel(localStorage.getItem(MODEL_KEY) === "lite" ? "lite" : "full");
    setSnap(null);
    setStage({ kind: "live" });
  }

  function chooseModel(next: PoseModel) {
    localStorage.setItem(MODEL_KEY, next);
    setSnap(null);
    setModel(next);
  }

  function toggleMute() {
    sound.setMuted(!muted);
    setMuted(!muted);
  }

  if (stage.kind === "preflight" || stage.kind === "error") {
    return (
      <main className="fixed inset-0 z-20 flex flex-col justify-center gap-6 bg-background p-8 text-foreground">
        <div className="mx-auto w-full max-w-md space-y-5">
          <p className="text-sm opacity-60">
            {exercise.name}, set 1 of {setup.sets}, {setup.reps} correct reps
          </p>
          {stage.kind === "error" ? (
            <p role="alert" className="text-lg leading-snug">{ERROR_TEXT[stage.error]}</p>
          ) : (
            <p className="text-lg leading-snug">
              The camera and the pose model run on this device; frames never leave it. From the end of the countdown the set is
              recorded, so you can review it later.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startCamera}
              className="rounded bg-black px-5 py-2.5 font-medium text-white dark:bg-white dark:text-black"
            >
              {stage.kind === "error" ? "Try again" : "Start camera"}
            </button>
            <Link href={guideHref} className="text-sm underline">Back to the guide</Link>
          </div>
          <ModelChoice model={model} onChange={chooseModel} />
        </div>
      </main>
    );
  }

  const frame = snap?.frame ?? null;
  const capture = snap?.status === "ended" ? snap.capture : null;
  const phase = !frame ? "starting" : frame.placement_phase === "guiding" ? "placement" : frame.ready_phase;
  const warning = frame?.warning_display[0] ?? null;
  const centre = centreText(phase, frame);

  return (
    <main className="fixed inset-0 z-20 overflow-hidden bg-black text-ink">
      {/* Mirrored, like a mirror in a gym. The recording itself is not mirrored. */}
      <div className="absolute inset-0 -scale-x-100">
        <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full object-cover" />
      </div>

      {capture ? (
        <Ended
          capture={capture}
          exercise={exercise}
          target={setup.reps}
          attemptCap={attemptCap}
          onAgain={() => {
            setSnap(null);
            setRun((n) => n + 1);
          }}
        />
      ) : (
        <>
          <header className="absolute inset-x-0 top-0 flex items-center gap-2 p-3 text-sm">
            <Link href={guideHref} className={pill}>Back</Link>
            <span className={`${pill} truncate`}>
              {exercise.name}, set 1 of {setup.sets}
            </span>
            <span className="flex-1" />
            <button type="button" onClick={toggleMute} className={pill} aria-pressed={muted}>
              {muted ? "Unmute" : "Mute"}
            </button>
            {phase === "active" && (
              <button type="button" onClick={() => sessionRef.current?.endSet()} className={pill}>
                End set
              </button>
            )}
          </header>

          {centre && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
              {phase === "countdown" ? (
                <p className="font-display text-[min(45vh,45vw)] leading-none tabular-nums" aria-live="assertive">
                  {centre}
                </p>
              ) : (
                <p className="max-w-md rounded-md bg-black/55 px-5 py-3 text-xl leading-snug backdrop-blur-sm" aria-live="polite">
                  {centre}
                </p>
              )}
              {phase !== "countdown" && phase !== "active" && (snap?.fps ?? LAG_FPS) < LAG_FPS && model === "full" && snap?.status === "running" && (
                <button type="button" onClick={() => chooseModel("lite")} className={pill}>
                  Lagging? Use the lighter model
                </button>
              )}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 p-4 pb-6">
            <p role="status" aria-live="assertive" className={`min-h-12 max-w-md rounded-md px-4 py-2.5 text-lg font-semibold leading-snug ${warning ? "bg-tape text-tape-ink" : "invisible"}`}>
              {warning ?? " "}
            </p>
            <div className={`flex items-end gap-3 transition-opacity ${phase === "active" ? "" : "opacity-50"}`}>
              <span
                key={frame?.correct_rep_count ?? 0}
                className="font-display text-[clamp(96px,22vh,180px)] leading-[0.85] tabular-nums motion-safe:animate-pop"
              >
                {frame?.correct_rep_count ?? 0}
              </span>
              <span className="pb-2 text-2xl leading-none">of {setup.reps}</span>
            </div>
            <p className="flex gap-4 text-sm">
              <span>
                {frame?.attempt_count ?? 0} {frame?.attempt_count === 1 ? "attempt" : "attempts"}
              </span>
              <span className="opacity-70">{phase === "active" ? frame?.state : phaseLabel(phase)}</span>
              {snap?.status === "running" && (
                <span className="opacity-40">
                  {snap.fps} fps, {model}
                </span>
              )}
            </p>
          </div>
        </>
      )}
    </main>
  );
}

const pill = "rounded-full bg-black/55 px-3 py-1.5 text-sm text-ink backdrop-blur-sm hover:bg-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tape";

function centreText(phase: string, frame: Snapshot["frame"]): string | null {
  switch (phase) {
    case "starting":
      return "Starting the camera and loading the pose model";
    case "placement":
      return frame?.placement_cues[0] ?? "Hold still";
    case "waiting":
      return frame?.ready_pose
        ? "Hold it"
        : "Stand facing the camera with your whole body in view, then hold your arms straight out to the sides";
    case "countdown":
      return String(Math.ceil(frame?.countdown_s ?? 0));
    case "active":
      return frame?.low_confidence ? "Step back into view" : null;
    default:
      return null;
  }
}

function phaseLabel(phase: string) {
  return { starting: "starting", placement: "placing", waiting: "ready pose", countdown: "countdown", ended: "ended" }[phase] ?? phase;
}

function ModelChoice({ model, onChange }: { model: PoseModel; onChange: (model: PoseModel) => void }) {
  return (
    <p className="text-sm opacity-70">
      Pose model: {model === "full" ? "full" : "lite"}.{" "}
      <button type="button" onClick={() => onChange(model === "full" ? "lite" : "full")} className="underline">
        {model === "full" ? "Use the lighter model on a slow phone" : "Use the full model"}
      </button>
    </p>
  );
}

function Ended({
  capture,
  exercise,
  target,
  attemptCap,
  onAgain,
}: {
  capture: SetCapture;
  exercise: Props["exercise"];
  target: number;
  attemptCap: number;
  onAgain: () => void;
}) {
  const { report } = capture;
  const reason = {
    target_reached: `You reached ${target} correct ${target === 1 ? "rep" : "reps"}.`,
    user_ended: "You ended the set.",
    attempt_cap: `The set ended at ${attemptCap} attempts, twice the target.`,
  }[capture.endedBy];
  const counts = new Map<string, number>();
  for (const record of [...report.reps, ...report.abandoned_attempts]) {
    for (const message of record.warnings) counts.set(message, (counts.get(message) ?? 0) + 1);
  }
  const seconds = Math.round((capture.endedAt.getTime() - capture.startedAt.getTime()) / 1000);

  return (
    <section className="absolute inset-0 flex flex-col justify-end bg-black/70 p-6 pb-8 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-md space-y-5">
        <p className="text-sm opacity-70">{exercise.name}, set ended</p>
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
        <p className="text-sm opacity-70">
          Held on this device for saving: {capture.frames.length} frames of landmarks
          {capture.video ? ` and ${seconds} s of video (${(capture.video.size / 1e6).toFixed(1)} MB)` : ", no video (this browser cannot record)"}.
          Saving, similarity, and feedback arrive in Phase 4.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onAgain} className="rounded bg-ink px-5 py-2.5 font-medium text-tape-ink">
            Do this set again
          </button>
          <Link href="/" className={pill}>Home</Link>
        </div>
      </div>
    </section>
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
