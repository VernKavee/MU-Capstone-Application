---
status: accepted
---

# Rule engine runs client-side in TypeScript behind the research repo's contract

NFR1 requires angle math and rule checking on the user's device with no per-frame server round trip, which rules out keeping the research repo's Python engine on a server. The engine will be a TypeScript port of the research repo's portable core, ported by Vern after the Python settles and outside the phases of this build. Until then the app runs a stub. The seam between app and engine is the research repo's contract, mirrored verbatim, so the port drops in without touching the app.

## The seam

Input per frame: the research repo's 33-entry keypoints dict, one entry per MediaPipe landmark name, each with `x`, `y`, `z` (image-normalised), `x_3d`, `y_3d`, `z_3d` (world metres), and `score`, which is MediaPipe's visibility. The app's MediaPipe adapter produces exactly this from the Tasks Vision pose landmarker; the research repo's `src/frame_processing/mediapipe_hpe.py` is the reference.

`process(keypoints, timestampMs)` returns the `FrameResult` of `src/pipeline/frame_processor.py`: `rep_count`, `correct_rep_count`, `attempt_count`, `state`, `event`, `warning` (zero or one message), `warnings_all`, `warning_display`, `warning_display_rules`, `low_confidence`, `armed`, `ready_phase`, `ready_pose`, `countdown_s`, `placement_phase`, `placement_ok`, `placement_cues`, `body_yaw_deg`, `target_yaw_deg`, `distance_state`, `filter_active`, `angles`, `keypoints`.

`getSessionReport()` returns the schema version 4 report of `src/pipeline/session_report.py`: totals for attempts, completed reps, correct reps, and abandoned attempts, plus the `reps` and `abandoned_attempts` lists with their `rep_stats`.

`reset()` clears everything for the next set.

The UI reads counters, states, and warnings from the frame result and never re-derives them. The ready gate (held T or A pose, then a three-second countdown) and the placement guide are part of the core and come with the port. Vern expects the gate logic to change, and that change stays inside the seam.

## Considered options

- **Pyodide, the Python core in the browser.** One code path, byte-identical to what was validated against the motion-capture data. Rejected: roughly 6 MB of runtime plus numpy on first load, several seconds of startup, a Web Worker and a wheel build, and the data-driven configuration of ADR-0006 would need the Python refactored to accept injected config.
- **Python on a server over a WebSocket.** Rejected by NFR1.

## Consequences

- The port is about 4,100 lines of Python across 18 files, numpy geometry included. It is real work and it is not scheduled inside these phases.
- Exercises carry an engine key (`squat`, `pushup`, `lunge`, `dumbbell_biceps_curls`) matching the research repo's registry.
- Thresholds, messages, priorities, state names, and highlight joints will be exported from the Python into the exercises seed by a script, so the numbers have one source. Until the port, the seed is typed from the Python by hand and marked as such.
- A parity harness that replays a recorded keypoint stream through both engines needs recordings with raw landmarks per frame. The research repo's live recordings hold angles and joint scores but not landmarks; adding that dump is a request to the research repo.
- The browser runs MediaPipe's full pose model everywhere, the variant the thresholds were calibrated on. Lite is offered as a manual fallback for a phone that cannot hold fifteen frames per second.

## As built in Phase 6

- The live screen builds a new engine for every set, for every "Try again" after a camera or model failure, and when the pose model is switched; the frame loop calls `reset()` once the camera and the model are up. The port's construction must be cheap and must not fetch anything.
- The workout end-to-end test gets its attempts from the stub's clock while Chrome's fake camera shows a still T pose. The port produces no attempts from a still frame, so that test will need a recorded clip of real reps as its camera.
- `docs/HANDOVER.md` lists what the app reads from each frame result beyond the types, and what the stub returns today.
