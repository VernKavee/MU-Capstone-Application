"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createStubEngine, ENGINE_VERSION } from "@/lib/engine/stub";
import type { RuleBasedLogic } from "@/lib/exercise";
import type { PoseModel } from "@/lib/live/pose";
import { CameraError, LiveSession, type SetCapture, type Snapshot } from "@/lib/live/session";
import { sound } from "@/lib/live/sound";
import { buildAttempts, totalsOf } from "@/lib/set";
import { endWorkout } from "./actions";
import { createJob, type Job } from "./pipeline";
import { pill, SetComplete, setLabel, type Progress, type SetEntry } from "./set-complete";

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

// One workout per visit (ADR-0004): its sets, each repair set, and the rest between them.
export function LiveScreen({ exercise, setup }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "preflight" });
  const [model, setModel] = useState<PoseModel>("full");
  const [muted, setMuted] = useState(false);
  const [run, setRun] = useState(0); // bumps to start the next set
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [progress, setProgress] = useState<Progress>({ setNo: 1, kind: "initial" });
  const [entries, setEntries] = useState<SetEntry[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  // Across sets: each set's saving job, the last save (the next save waits for it so every
  // set lands in the same workout row), and the workout id once the first save returns it.
  const jobs = useRef(new Map<number, Job>());
  const lastSave = useRef<Promise<unknown>>(Promise.resolve());
  const workoutId = useRef<string | null>(null);
  const attemptCap = 2 * setup.reps;
  const guideHref = `/workout/${exercise.id}/guide?reps=${setup.reps}&sets=${setup.sets}&rest=${setup.rest}`;

  // Save first, then analyse (ADR-0007), started the moment the set ends.
  const onSetEnded = useEffectEvent((capture: SetCapture) => {
    const key = jobs.current.size + 1;
    const attempts = buildAttempts(capture.frames, capture.report, exercise.logic.rules);
    setEntries((list) => [...list, { key, ...progress, capture, attempts, status: "saving", similarity: null, feedback: null, error: null }]);
    const job = createJob({
      input: {
        exerciseId: exercise.id,
        setup,
        setNo: progress.setNo,
        kind: progress.kind,
        endedBy: capture.endedBy,
        startedAt: capture.startedAt.toISOString(),
        endedAt: capture.endedAt.toISOString(),
        totals: totalsOf(capture.report),
        attempts,
        engineReport: capture.report,
        engineVersion: ENGINE_VERSION,
      },
      capture,
      after: lastSave.current,
      workoutId: () => workoutId.current,
      onSaved: (id) => {
        workoutId.current = id;
      },
      onUpdate: (update) => setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...update } : e))),
    });
    jobs.current.set(key, job);
    lastSave.current = job.saveSettled;
    void job.run();
  });

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
      onChange: (next) => {
        setSnap(next);
        if (next.status === "ended" && next.capture) onSetEnded(next.capture);
      },
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

  function startSet(next: Progress) {
    setProgress(next);
    setSnap(null);
    setRun((n) => n + 1);
  }

  async function finish() {
    await lastSave.current;
    const id = workoutId.current;
    if (!id) return router.push("/"); // nothing was saved
    await endWorkout(id);
    router.push(`/workout/${exercise.id}/done/${id}`);
  }

  if (stage.kind === "preflight" || stage.kind === "error") {
    return (
      <main className="fixed inset-0 z-20 flex flex-col justify-center gap-6 bg-background p-8 text-foreground">
        <div className="mx-auto w-full max-w-md space-y-5">
          <p className="text-sm opacity-60">
            {exercise.name}, {setLabel(progress, setup.sets)}, {setup.reps} correct reps
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
  const entry = capture ? entries.find((e) => e.capture === capture) : undefined;
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
        entry && (
          <SetComplete
            key={entry.key}
            entry={entry}
            earlierFailures={entries.filter((e) => e !== entry && e.status === "failed")}
            exerciseName={exercise.name}
            setup={setup}
            attemptCap={attemptCap}
            onRetry={(key) => void jobs.current.get(key)?.run()}
            onRepair={() => startSet({ setNo: entry.setNo, kind: "repair" })}
            onDecline={() => jobs.current.get(entry.key)?.decline() ?? Promise.resolve(null)}
            onNext={() => startSet({ setNo: entry.setNo + 1, kind: "initial" })}
            onFinish={finish}
          />
        )
      ) : (
        <>
          <header className="absolute inset-x-0 top-0 flex items-center gap-2 p-3 text-sm">
            <Link href={guideHref} className={pill}>Back</Link>
            <span className={`${pill} truncate`}>
              {exercise.name}, {setLabel(progress, setup.sets)}
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
              {warning ?? " "}
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
