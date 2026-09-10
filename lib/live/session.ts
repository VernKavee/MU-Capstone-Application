// The frame loop for one set, outside React. Owns the camera stream, the pose landmarker,
// the engine, the skeleton overlay, the recording, and the keypoint capture. React only
// receives Snapshots through onChange, and only when something it shows has changed.
//
// Everything here runs on the user's device (NFR1). Nothing is sent per frame.
import type { Rule } from "@/lib/exercise";
import { LANDMARK_NAMES, type Engine, type FrameResult, type Keypoints, type SessionReport } from "@/lib/engine/types";
import { loadPoseLandmarker, toKeypoints, type PoseModel } from "./pose";
import { drawSkeleton, jointIndices } from "./skeleton";
import { sound } from "./sound";

export type EndedBy = "target_reached" | "user_ended" | "attempt_cap";

// One captured frame. t is milliseconds since the recording started, so it indexes the
// video as well; state, event, and the rules violated on the frame let lib/set.ts build
// the attempt records of ADR-0003 (frame ranges, state durations, the state a violation
// fired in) without re-deriving anything.
export type KeypointFrame = { t: number; state: string; event: FrameResult["event"]; violations: string[]; keypoints: Keypoints };

// What the set leaves behind, held in memory for Phase 4 to save and upload (ADR-0005).
export type SetCapture = {
  endedBy: EndedBy;
  startedAt: Date; // the end of the countdown
  endedAt: Date;
  report: SessionReport;
  frames: KeypointFrame[];
  video: Blob | null; // null when MediaRecorder is unavailable
  videoMimeType: string | null;
};

export type Snapshot = {
  status: "starting" | "running" | "ended";
  frame: FrameResult | null;
  fps: number;
  capture: SetCapture | null;
};

export class CameraError extends Error {
  constructor(public kind: "denied" | "no-camera" | "insecure" | "model") {
    super(kind);
  }
}

const VIDEO_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];

export class LiveSession {
  private stream: MediaStream | null = null;
  private landmarker: Awaited<ReturnType<typeof loadPoseLandmarker>> | null = null;
  private raf = 0;
  private running = false;
  private lastVideoTime = -1;
  private lastFrame: FrameResult | null = null;
  private lastKey = "";
  private fpsWindow: number[] = [];
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private frames: KeypointFrame[] = [];
  private startedAt: Date | null = null;
  private t0 = 0;
  private ended: EndedBy | null = null;
  private stopped = false;
  private highlight = new Map<string, number[]>();

  constructor(
    private readonly opts: {
      engine: Engine;
      rules: Rule[];
      target: number;
      attemptCap: number;
      model: PoseModel;
      video: HTMLVideoElement;
      canvas: HTMLCanvasElement;
      onChange: (snapshot: Snapshot) => void;
    },
  ) {
    for (const rule of opts.rules) this.highlight.set(rule.name, jointIndices(rule.highlight_joints));
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("insecure");
    this.opts.onChange({ status: "starting", frame: null, fps: 0, capture: null });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      throw new CameraError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "no-camera");
    }
    if (this.stopped) return this.stop(); // unmounted while the permission prompt was open
    try {
      this.landmarker = await loadPoseLandmarker(this.opts.model);
    } catch {
      this.stop();
      throw new CameraError("model");
    }
    if (this.stopped) return this.stop();
    const { video } = this.opts;
    video.srcObject = this.stream;
    await video.play();
    this.opts.engine.reset();
    this.running = true;
    this.raf = requestAnimationFrame(this.tick);
  }

  endSet() {
    if (this.running && this.ended === null) this.finish("user_ended");
  }

  stop() {
    this.stopped = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.landmarker?.close();
    this.landmarker = null;
    this.stream = null;
  }

  private tick = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const { video, engine } = this.opts;
    if (video.readyState < 2 || video.currentTime === this.lastVideoTime || !this.landmarker) return;
    this.lastVideoTime = video.currentTime;
    const now = performance.now();
    const keypoints = toKeypoints(this.landmarker.detectForVideo(video, now));
    const frame = engine.process(keypoints, now);
    this.draw(frame);
    this.capture(frame, now);
    this.announce(frame);
    this.lastFrame = frame;
    this.emit({ status: "running", frame, fps: this.fps(now), capture: null });

    if (frame.ready_phase === "active") {
      if (frame.correct_rep_count >= this.opts.target) this.finish("target_reached");
      else if (frame.attempt_count >= this.opts.attemptCap) this.finish("attempt_cap");
    } else if (frame.ready_phase === "ended") {
      this.finish("user_ended");
    }
  };

  private fps(now: number) {
    this.fpsWindow.push(now);
    while (this.fpsWindow.length && this.fpsWindow[0] < now - 1000) this.fpsWindow.shift();
    return this.fpsWindow.length;
  }

  private draw(frame: FrameResult) {
    const { canvas, video } = this.opts;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const lit = new Set(frame.warning_display_rules.flatMap((r) => this.highlight.get(r.name) ?? []));
    drawSkeleton(ctx, (i) => frame.keypoints[LANDMARK_NAMES[i]], lit);
  }

  // Recording and keypoint capture both run from the end of the countdown to the end of
  // the set (ADR-0005), so t indexes both files.
  private capture(frame: FrameResult, now: number) {
    if (frame.ready_phase !== "active") return;
    if (!this.startedAt) {
      this.startedAt = new Date();
      this.t0 = now;
      this.startRecorder();
    }
    this.frames.push({
      t: now - this.t0,
      state: frame.state,
      event: frame.event,
      violations: frame.warnings_all.map((r) => r.name),
      keypoints: frame.keypoints,
    });
  }

  private startRecorder() {
    if (typeof MediaRecorder === "undefined" || !this.stream) return;
    const mimeType = VIDEO_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) return;
    this.recorder = new MediaRecorder(new MediaStream(this.stream.getVideoTracks()), { mimeType });
    this.recorder.ondataavailable = (event) => {
      if (event.data.size) this.chunks.push(event.data);
    };
    this.recorder.start(1000);
  }

  private announce(frame: FrameResult) {
    const prev = this.lastFrame;
    if (frame.correct_rep_count > (prev?.correct_rep_count ?? 0)) sound.beep();
    const second = frame.countdown_s === null ? null : Math.ceil(frame.countdown_s);
    const prevSecond = prev?.countdown_s == null ? null : Math.ceil(prev.countdown_s);
    if (second !== null && second !== prevSecond) sound.beep(0.08, 660);
    if (frame.ready_phase === "active" && prev?.ready_phase === "countdown") sound.beep(0.3, 880);
    const warning = frame.warning_display[0] ?? null;
    if (warning && warning !== (prev?.warning_display[0] ?? null)) sound.say(warning);
    const cue = frame.placement_phase === "guiding" ? (frame.placement_cues[0] ?? null) : null;
    const prevCue = prev?.placement_phase === "guiding" ? (prev.placement_cues[0] ?? null) : null;
    if (cue && cue !== prevCue) sound.say(cue);
  }

  // Only what the HUD shows; identical frames do not reach React.
  private emit(snapshot: Snapshot) {
    const f = snapshot.frame;
    const key = f
      ? [snapshot.status, f.rep_count, f.correct_rep_count, f.attempt_count, f.state, f.event === "rep_completed" || f.event === "rep_abandoned" ? f.event : "", f.warning_display[0] ?? "", f.ready_phase, f.countdown_s === null ? "" : Math.ceil(f.countdown_s), f.placement_phase, f.placement_cues[0] ?? "", f.low_confidence, Math.round(snapshot.fps / 5)].join("|")
      : snapshot.status;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.opts.onChange(snapshot);
  }

  private finish(endedBy: EndedBy) {
    this.ended = endedBy;
    this.running = false;
    cancelAnimationFrame(this.raf);
    const done = (video: Blob | null, videoMimeType: string | null) => {
      this.stream?.getTracks().forEach((track) => track.stop());
      const capture: SetCapture = {
        endedBy,
        startedAt: this.startedAt ?? new Date(),
        endedAt: new Date(),
        report: this.opts.engine.getSessionReport(),
        frames: this.frames,
        video,
        videoMimeType,
      };
      this.opts.onChange({ status: "ended", frame: this.lastFrame, fps: 0, capture });
    };
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") return done(null, null);
    recorder.onstop = () => done(new Blob(this.chunks, { type: recorder.mimeType }), recorder.mimeType);
    recorder.stop();
  }
}
