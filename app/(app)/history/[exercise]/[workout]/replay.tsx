"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { attemptAt, frameAt } from "@/lib/history";
import { drawSkeleton } from "@/lib/live/skeleton";
import { SETS_BUCKET, type Attempt, type KeypointFile, type Violation } from "@/lib/set";
import { createClient } from "@/lib/supabase/client";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "empty" } | { kind: "error"; message: string } | { kind: "ready"; src: string; file: KeypointFile };

const OUTCOME = { correct: "Correct", incorrect: "Incorrect", abandoned: "Abandoned" } as const;
// Tape yellow means a rule fired, as on the live screen: on the black stage's strip and on
// the page's attempt markers alike.
const SEGMENT = { correct: "bg-ink/70", incorrect: "bg-tape", abandoned: "bg-ink/25" } as const;
const MARKER = { correct: "bg-foreground", incorrect: "bg-tape", abandoned: "bg-foreground/25" } as const;
const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tape";

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

// Level 4's player and attempt list for one set. The video plays as recorded, not mirrored,
// with the skeleton drawn over it from the keypoint file. Both start at the end of the
// countdown, so a frame's t is the video's time (ADR-0005). The file holds no violations
// per frame, so an attempt's violations light their joints for the whole attempt. Both
// files are fetched from storage by the browser, and only when Play is pressed.
export function Replay({
  video,
  keypoints,
  attempts,
  highlight,
  regions,
  feedback,
}: {
  video: string | null; // object paths in the sets bucket
  keypoints: string | null;
  attempts: Attempt[];
  highlight: Record<string, number[]>; // rule name to landmark indices
  regions: ReactNode;
  feedback: ReactNode;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState<number | null>(null); // the attempt under the playhead
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const pending = useRef(0); // the frame to start from once the files are in
  const file = state.kind === "ready" ? state.file : null;
  const end = file ? file.frames[file.frames.length - 1].t : 0;
  const canPlay = Boolean(video && keypoints) && state.kind !== "empty";

  async function load() {
    if (!video || !keypoints || state.kind === "loading") return;
    setState({ kind: "loading" });
    try {
      const storage = createClient().storage.from(SETS_BUCKET);
      const [signed, download] = await Promise.all([storage.createSignedUrl(video, 60 * 60), storage.download(keypoints)]);
      if (signed.error) throw signed.error;
      if (download.error) throw download.error;
      const body = download.data.stream();
      const file = (await new Response(keypoints.endsWith(".gz") ? body.pipeThrough(new DecompressionStream("gzip")) : body).json()) as KeypointFile;
      // Fewer than two frames give nothing to time the strip by or draw.
      setState(file.frames.length < 2 ? { kind: "empty" } : { kind: "ready", src: signed.data.signedUrl, file });
    } catch (e) {
      setState({ kind: "error", message: `The recording could not be loaded: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  function playFrame(frame: number) {
    const v = videoRef.current;
    if (!file || !v) {
      pending.current = frame;
      void load();
      return;
    }
    v.currentTime = (file.frames[frame]?.t ?? 0) / 1000;
    void v.play();
  }

  // Draws the frame under the video's time. The playhead and the clock are written straight
  // to the DOM, so React renders only when the attempt under the playhead changes.
  useEffect(() => {
    const v = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!file || !v || !canvas || !ctx) return;
    const n = file.fields.length;
    const [fx, fy, fs] = (["x", "y", "score"] as const).map((f) => file.fields.indexOf(f));
    let raf = 0;
    let last = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ms = v.currentTime * 1000;
      if (ms === last || !v.videoWidth) return;
      last = ms;
      if (canvas.width !== v.videoWidth || canvas.height !== v.videoHeight) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
      }
      const i = frameAt(file.frames, ms);
      const attempt = attemptAt(attempts, i);
      const p = file.frames[i].points;
      const lit = new Set(attempt?.violations.flatMap((x) => highlight[x.rule] ?? []));
      drawSkeleton(ctx, (j) => ({ x: p[j * n + fx], y: p[j * n + fy], score: p[j * n + fs] }), lit);
      if (headRef.current) headRef.current.style.left = `${Math.min(100, (ms / end) * 100)}%`;
      if (clockRef.current) clockRef.current.textContent = clock(ms);
      setCurrent(attempt?.attempt_no ?? null);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [file, end, attempts, highlight]);

  const shown = attempts.find((a) => a.attempt_no === current);
  const at = (frame: number) => (file ? ((file.frames[frame]?.t ?? 0) / end) * 100 : 0);
  const counts = (["correct", "incorrect", "abandoned"] as const).map((o) => `${attempts.filter((a) => a.outcome === o).length} ${o}`).join(", ");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
      <div className="overflow-hidden rounded-xl bg-black text-ink lg:sticky lg:top-6">
        <div className="relative aspect-video">
          {state.kind === "ready" ? (
            <>
              <video
                ref={videoRef}
                src={state.src}
                muted
                playsInline
                preload="auto"
                className="absolute inset-0 h-full w-full object-contain"
                onLoadedMetadata={(e) => {
                  e.currentTarget.currentTime = (state.file.frames[pending.current]?.t ?? 0) / 1000;
                  void e.currentTarget.play();
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
              {shown && (
                <div className="pointer-events-none absolute left-3 top-3 flex max-w-[85%] flex-col items-start gap-1.5">
                  <span className="rounded-full bg-black/55 px-3 py-1 text-sm backdrop-blur-sm">
                    Attempt {shown.attempt_no}, {OUTCOME[shown.outcome].toLowerCase()}
                  </span>
                  {shown.violations.map((v) => (
                    <span key={v.rule} className="rounded-md bg-tape px-3 py-1 text-sm font-semibold text-tape-ink">
                      {v.message}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              {/* ponytail: a set missing one file is not replayed at all; draw the skeleton
                  alone, or play the video alone, if failed uploads turn out to be common. */}
              {!video && !keypoints ? (
                <p className="text-sm text-ink/70">No recording for this set.</p>
              ) : state.kind === "empty" ? (
                <p className="text-sm text-ink/70">The keypoint file holds no frames, so this set cannot be replayed.</p>
              ) : !canPlay ? (
                <p className="text-sm text-ink/70">{video ? "The keypoint file" : "The video"} did not upload, so this set cannot be replayed.</p>
              ) : state.kind === "loading" ? (
                <p className="text-sm text-ink/70 motion-safe:animate-pulse">Loading the video and the keypoint file</p>
              ) : (
                <>
                  {state.kind === "error" && (
                    <p role="alert" className="max-w-sm text-sm">
                      {state.message}
                    </p>
                  )}
                  <button type="button" onClick={() => playFrame(0)} className={`rounded-full bg-ink px-5 py-2.5 font-medium text-tape-ink ${focus}`}>
                    {state.kind === "error" ? "Try again" : "Play the set with the skeleton"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {file && (
          <div className="space-y-2 px-3 pb-3 pt-2">
            {/* The attempt strip: one segment per attempt at its place in the set. Press a
                segment, or anywhere on the strip, to play from there. */}
            <div
              className="relative h-8 cursor-pointer"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                playFrame(frameAt(file.frames, ((e.clientX - r.left) / r.width) * end));
              }}
            >
              <div aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-ink/20" />
              {attempts.map((a) =>
                a.frame_start === null || a.frame_end === null ? null : (
                  <button
                    key={a.attempt_no}
                    type="button"
                    aria-label={`Attempt ${a.attempt_no}, ${OUTCOME[a.outcome].toLowerCase()}`}
                    title={`Attempt ${a.attempt_no}, ${OUTCOME[a.outcome].toLowerCase()}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      playFrame(a.frame_start!);
                    }}
                    className={`absolute inset-y-1.5 min-w-0.5 rounded-sm ${SEGMENT[a.outcome]} ${a.attempt_no === current ? "ring-2 ring-ink ring-offset-2 ring-offset-black" : ""} ${focus}`}
                    style={{ left: `${at(a.frame_start)}%`, width: `${at(a.frame_end) - at(a.frame_start)}%` }}
                  />
                ),
              )}
              <div ref={headRef} aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-ink" />
            </div>
            <div className="flex items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  const v = videoRef.current;
                  if (v) void (v.paused ? v.play() : v.pause());
                }}
                className={`rounded-full bg-ink/10 px-3 py-1.5 hover:bg-ink/20 ${focus}`}
              >
                {playing ? "Pause" : "Play"}
              </button>
              <span className="tabular-nums">
                <span ref={clockRef}>0:00</span> / {clock(end)}
              </span>
              <span className="ml-auto text-ink/70">{shown ? `Attempt ${shown.attempt_no} of ${attempts.length}` : "Between attempts"}</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-8">
        {regions}
        <section aria-labelledby="attempts-title" className="space-y-3">
          <div className="space-y-0.5">
            <h2 id="attempts-title" className="font-medium">
              Attempts
            </h2>
            <p className="text-sm opacity-70">
              {counts}. Every violation is listed{canPlay && "; press an attempt to watch it"}.
            </p>
          </div>
          <ol className="divide-y border-y">
            {attempts.map((a) => (
              <li key={a.attempt_no} aria-current={a.attempt_no === current ? "step" : undefined} className={a.attempt_no === current ? "bg-foreground/5" : undefined}>
                {canPlay && a.frame_start !== null ? (
                  <button type="button" onClick={() => playFrame(a.frame_start!)} className={`block w-full text-left hover:bg-foreground/5 ${focus}`}>
                    <AttemptRow attempt={a} />
                  </button>
                ) : (
                  <AttemptRow attempt={a} />
                )}
              </li>
            ))}
          </ol>
        </section>
        {feedback}
      </div>
    </div>
  );
}

function AttemptRow({ attempt: a }: { attempt: Attempt }) {
  const seconds = Object.values(a.state_durations_s).reduce((s, x) => s + x, 0);
  return (
    <span className="flex gap-3 px-1 py-2.5">
      <span aria-hidden className={`mt-1.5 h-3.5 w-1 shrink-0 rounded-full ${MARKER[a.outcome]}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-medium">Attempt {a.attempt_no}</span>
          {a.similarity && <span className="text-sm tabular-nums">{a.similarity.overall}%</span>}
        </span>
        <span className="block text-sm opacity-70">
          {OUTCOME[a.outcome]}
          {seconds > 0 && `, ${seconds.toFixed(1)} s`}
        </span>
        {a.violations.map((v) => (
          <span key={v.rule} className="mt-1 block text-sm">
            {v.message} <span className="opacity-60">({detail(v)})</span>
          </span>
        ))}
      </span>
    </span>
  );
}

// Where and how the engine judged the rule: the state or the whole rep, the measured value,
// and the rule's threshold (ADR-0003).
const detail = (v: Violation) =>
  [
    v.scope === "rep" ? "judged over the rep" : v.state && `in ${v.state}`,
    v.value !== null && `measured ${v.value}`,
    ...Object.entries(v.threshold).map(([key, n]) => `${key.replaceAll("_", " ")} ${n}`),
  ]
    .filter(Boolean)
    .join(", ");
