"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createEngine, ENGINE_VERSION } from "@/lib/engine/engine";
import { setupQuery, type RuleBasedLogic, type Setup } from "@/lib/exercise";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseModel } from "@/lib/live/pose";
import { CameraError, LiveSession, TURN_CUE, type SetCapture, type Snapshot } from "@/lib/live/session";
import { sound } from "@/lib/live/sound";
import { buildAttempts, totalsOf } from "@/lib/set";
import { endWorkout } from "./actions";
import { createJob, type Job } from "./pipeline";
import { pill, round, SetComplete, setLabel, type Progress, type SetEntry } from "./set-complete";
import { ChevronLeft, Speaker, SpeakerOff, Warning } from "../../../icons";
import { BackLink } from "@/app/(app)/back-link";

type Props = {
  exercise: { id: string; name: string; engineKey: string; landscape: boolean; logic: RuleBasedLogic };
  setup: Setup;
  resume: { workoutId: string; setNo: number } | null; // a reload picked up this workout
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
export function LiveScreen({ exercise, setup, resume }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "preflight" });
  const [model, setModel] = useState<PoseModel>("full");
  const [muted, setMuted] = useState(false);
  const [run, setRun] = useState(0); // bumps to start the next set
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [progress, setProgress] = useState<Progress>({ setNo: resume?.setNo ?? 1, kind: "initial" });
  const [entries, setEntries] = useState<SetEntry[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  // Across sets: each set's saving job, the last save (the next save waits for it so sets
  // are saved in order), and the workout id, made here so every set and every retry names
  // the same workout row (ADR-0004).
  const jobs = useRef(new Map<number, Job>());
  const lastSave = useRef<Promise<unknown>>(Promise.resolve());
  const workoutId = useRef(resume?.workoutId ?? crypto.randomUUID());
  const savedAny = useRef(Boolean(resume));
  // The pose model, loaded once per model for the whole visit rather than once per set. The
  // download starts on the preflight screen, while the user reads it.
  const landmarkers = useRef(new Map<PoseModel, Promise<PoseLandmarker>>());
  const attemptCap = 2 * setup.reps;
  const guideHref = `/workout/${exercise.id}/guide?${setupQuery(setup)}`;

  // Save first, then analyse (ADR-0007), started the moment the set ends.
  const onSetEnded = useEffectEvent((capture: SetCapture) => {
    const key = jobs.current.size + 1;
    const attempts = buildAttempts(capture.frames, capture.report, exercise.logic.rules);
    setEntries((list) => [...list, { key, ...progress, capture, attempts, status: "saving", similarity: null, feedback: null, error: null }]);
    const job = createJob({
      input: {
        workoutId: workoutId.current,
        setId: crypto.randomUUID(),
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
      onSaved: () => {
        if (savedAny.current) return;
        savedAny.current = true;
        // So a reload within five minutes picks this workout up (page.tsx).
        window.history.replaceState(null, "", `?${setupQuery(setup)}&workout=${workoutId.current}`);
      },
      onUpdate: (update) => setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...update } : e))),
    });
    jobs.current.set(key, job);
    lastSave.current = job.saveSettled;
    void job.run();
  });

  function landmarker(which: PoseModel) {
    let loading = landmarkers.current.get(which);
    if (!loading) {
      const begun = performance.now();
      loading = import("@/lib/live/pose").then((pose) => pose.loadPoseLandmarker(which));
      loading.then(
        () => console.info(`[live] pose model ${which} loaded in ${Math.round(performance.now() - begun)} ms`),
        () => landmarkers.current.delete(which), // so Try again downloads it afresh
      );
      landmarkers.current.set(which, loading);
    }
    return loading;
  }

  // Start the download at once, and close what was loaded when the visit ends.
  useEffect(() => {
    const loaded = landmarkers.current;
    void landmarker(localStorage.getItem(MODEL_KEY) === "lite" ? "lite" : "full").catch(() => {});
    return () => {
      for (const loading of loaded.values()) loading.then((l) => l.close(), () => {});
      loaded.clear();
    };
  }, []);

  useEffect(() => {
    if (stage.kind !== "live" || !videoRef.current || !canvasRef.current) return;
    const session = new LiveSession({
      engine: createEngine(exercise.logic, exercise.engineKey, { side: setup.side }),
      rules: exercise.logic.rules,
      target: setup.reps,
      attemptCap,
      landmarker: () => landmarker(model),
      landscape: exercise.landscape,
      readyCue: READY_SPOKEN[exercise.logic.state_machine.ready_pose],
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
  }, [stage.kind, model, run, exercise, setup.reps, setup.side, attemptCap]);

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

  // Writes ended_at, then opens the finished summary. A failure, returned or a dropped
  // connection, comes back as text for the set-complete screen, whose Finish button stays
  // for another go.
  async function finish(): Promise<string | null> {
    await lastSave.current;
    const id = workoutId.current;
    if (!savedAny.current) {
      router.push("/"); // nothing was saved
      return null;
    }
    const { error } = await endWorkout(id).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
    if (error) return `The workout was not finished: ${error}`;
    router.push(`/workout/${exercise.id}/done/${id}`);
    return null;
  }

  // A resumed workout whose every set was saved before the reload: only Finish is left.
  if (progress.setNo > setup.sets) return <AllSaved name={exercise.name} onFinish={finish} />;

  if (stage.kind === "preflight" || stage.kind === "error") {
    return (
      <main className="fixed inset-0 z-20 flex flex-col justify-center gap-6 bg-background p-8 text-foreground">
        <div className="mx-auto w-full max-w-md space-y-5">
          <BackLink href={guideHref}>Guide</BackLink>
          <p className="text-sm text-muted">
            {exercise.name}, {setLabel(progress, setup.sets)}, {setup.reps} correct reps
          </p>
          {stage.kind === "error" ? (
            <p role="alert" className="text-lg leading-snug">{ERROR_TEXT[stage.error]}</p>
          ) : (
            <p className="text-lg leading-snug">
              The camera and the pose model run on this device; frames never leave it. From the end of the countdown the set is
              recorded, so you can review it later.{exercise.landscape && " Hold your phone sideways for this exercise."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={startCamera} className="btn">
              {stage.kind === "error" ? "Try again" : "Start camera"}
            </button>
          </div>
          <ModelChoice model={model} onChange={chooseModel} />
        </div>
      </main>
    );
  }

  const frame = snap?.frame ?? null;
  const capture = snap?.status === "ended" ? snap.capture : null;
  const entry = capture ? entries.find((e) => e.capture === capture) : undefined;
  // The ready gate leads: the T pose facing the camera, framed, then placement during the
  // countdown, which holds at 0 until placed. While the gate waits for the T pose,
  // placement reports guiding with the stand check's cues (distance, framing, centring).
  // A plank start is placed while waiting, facing included, so it shows no turn cue here.
  const phase = frame?.ready_phase ?? "starting";
  const turnCue = phase === "countdown" && frame?.placement_phase === "guiding" ? (frame.placement_cues[0] ?? null) : null;
  const warning = frame?.warning_display[0] ?? null;
  const centre = snap?.turn ? TURN_CUE : centreText(phase, frame, exercise.logic.state_machine.ready_pose);

  return (
    <main className="stage fixed inset-0 z-20 overflow-hidden bg-black text-ink">
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
          <header className="absolute inset-x-0 top-0 flex items-center gap-2 p-3">
            <Link href={guideHref} aria-label="Back to the guide" className={round}>
              <ChevronLeft />
            </Link>
            <span className="outlined truncate font-semibold [--stroke:4px]">
              {exercise.name}, {setLabel(progress, setup.sets)}
            </span>
            <span className="flex-1" />
            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} className={round}>
              {muted ? <SpeakerOff /> : <Speaker />}
            </button>
          </header>

          {/* The count and the target as one outlined number in the top corner (2026-11-05,
              Vern): nothing solid in front of the body, and the outline reads on a light wall. */}
          <div className={`pointer-events-none absolute right-4 top-16 text-right transition-opacity ${phase === "active" ? "" : "opacity-60"}`}>
            <p className="outlined font-display leading-[0.85] tabular-nums">
              <span key={frame?.correct_rep_count ?? 0} className="inline-block text-[clamp(72px,14vh,128px)] text-live motion-safe:animate-pop">
                {frame?.correct_rep_count ?? 0}
              </span>
              <span className="text-[clamp(44px,8.5vh,76px)]">/{setup.reps}</span>
            </p>
            <p className="outlined mt-1 text-lg font-semibold [--stroke:4px]">
              {frame?.attempt_count ?? 0} {frame?.attempt_count === 1 ? "attempt" : "attempts"}
            </p>
            <p className="outlined text-sm [--stroke:3px]">
              {phase === "active" ? frame?.state : phaseLabel(phase)}
              {snap?.status === "running" && `, ${snap.fps} fps ${model}`}
            </p>
          </div>

          {/* The centre text covers the whole stage and the HUD its bottom. Neither takes
              clicks, so the header and the Lagging button stay usable in every phase. */}
          {centre && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
              {phase === "countdown" ? (
                <>
                  {/* The number is hidden at 0, where the countdown waits for placement. */}
                  {centre !== "0" && (
                    <p className="font-display text-[min(45vh,45vw)] leading-none tabular-nums" aria-live="assertive">
                      {centre}
                    </p>
                  )}
                  {turnCue && (
                    <p className="max-w-md rounded-md bg-black/55 px-5 py-3 text-xl leading-snug backdrop-blur-sm" aria-live="polite">
                      {turnCue}
                    </p>
                  )}
                </>
              ) : (
                <p className="max-w-md rounded-md bg-black/55 px-5 py-3 text-xl leading-snug backdrop-blur-sm" aria-live="polite">
                  {centre}
                </p>
              )}
              {phase !== "countdown" && phase !== "active" && (snap?.fps ?? LAG_FPS) < LAG_FPS && model === "full" && snap?.status === "running" && (
                <button type="button" onClick={() => chooseModel("lite")} className={`${pill} pointer-events-auto`}>
                  Lagging? Use the lighter model
                </button>
              )}
            </div>
          )}

          {/* A slim warning band at the foot, End set beside it. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 p-3 pb-5">
            <p
              role="status"
              aria-live="assertive"
              className={`flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-3.5 py-2 text-lg font-semibold leading-snug ${warning ? "bg-tape text-tape-ink" : "invisible"}`}
            >
              {warning && <Warning className="size-5 shrink-0" />}
              {warning ?? " "}
            </p>
            <span className="flex-1" />
            {phase === "active" && (
              <button type="button" onClick={() => sessionRef.current?.endSet()} className={`${pill} pointer-events-auto shrink-0`}>
                End set
              </button>
            )}
          </div>
        </>
      )}
    </main>
  );
}

// What to do while the gate waits, by the row's ready pose, never by exercise.
const READY_TEXT: Record<RuleBasedLogic["state_machine"]["ready_pose"], string> = {
  t_pose: "Stand facing the camera with your whole body in view, then hold your arms straight out to the sides",
  plank: "Get into a plank at the top, arms straight, side-on to the camera, with your whole body in view",
};

// Spoken while the gate waits; the T pose is shown only.
const READY_SPOKEN: Record<RuleBasedLogic["state_machine"]["ready_pose"], string | null> = {
  t_pose: null,
  plank: "Plank down to start the exercise",
};

function centreText(phase: string, frame: Snapshot["frame"], readyPose: RuleBasedLogic["state_machine"]["ready_pose"]): string | null {
  switch (phase) {
    case "starting":
      return "Starting the camera and loading the pose model";
    case "waiting":
      // The placement cue (distance, framing, centring, and facing for a plank) leads: the
      // pose counts only once it clears.
      return frame?.placement_cues[0] ?? (frame?.ready_pose ? "Hold it" : READY_TEXT[readyPose]);
    case "countdown":
      return String(Math.ceil(frame?.countdown_s ?? 0));
    case "active":
      return frame?.low_confidence ? "Step back into view" : null;
    default:
      return null;
  }
}

function phaseLabel(phase: string) {
  return { starting: "starting", waiting: "ready pose", countdown: "countdown", ended: "ended" }[phase] ?? phase;
}

function AllSaved({ name, onFinish }: { name: string; onFinish: () => Promise<string | null> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="fixed inset-0 z-20 flex flex-col justify-center gap-6 bg-background p-8 text-foreground">
      <div className="mx-auto w-full max-w-md space-y-5">
        <p className="text-sm text-muted">{name}</p>
        <p className="text-lg leading-snug">Every set of this workout is saved.</p>
        {error && <p role="alert" className="alert">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(await onFinish());
            setBusy(false);
          }}
          className="btn"
        >
          {busy ? "Finishing" : "Finish workout"}
        </button>
      </div>
    </main>
  );
}

function ModelChoice({ model, onChange }: { model: PoseModel; onChange: (model: PoseModel) => void }) {
  return (
    <p className="text-sm text-muted">
      Pose model: {model === "full" ? "full" : "lite"}.{" "}
      <button type="button" onClick={() => onChange(model === "full" ? "lite" : "full")} className="underline">
        {model === "full" ? "Use the lighter model on a slow phone" : "Use the full model"}
      </button>
    </p>
  );
}
